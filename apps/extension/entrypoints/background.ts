import { type CaptureKind, compareVersions } from "@recorte/shared";
import { type Browser, browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import {
  ApiError,
  absoluteUrl,
  buildUploadMeta,
  createCategory,
  createTicket,
  fetchCategories,
  fetchExtensionInfo,
  fetchMe,
  fetchTags,
  isHttpUrl,
  uploadItem,
} from "@/lib/api";
import {
  bitmapToCanvas,
  captureFullFirefox,
  captureFullStitched,
  captureVisible,
  cropToRect,
  encodeImage,
  previewDataUrl,
} from "@/lib/capture";
import type { Rect } from "@/lib/extract";
import { TabChangedError, makeTabGuard } from "@/lib/guard";
import type {
  BackgroundMessage,
  ContentMessage,
  DialogInput,
  DraftInfo,
  ExtractResult,
  LocatedImage,
  PageMetrics,
  Status,
} from "@/lib/messages";
import { type DrainResult, IdbQueueStore, countByAccount, drainQueue, newQueueItem } from "@/lib/queue";
import { type Settings, accountOf, connectionOf, extensionVersion, getSettings, setSettings } from "@/lib/settings";

const CONTENT_SCRIPT = "/content-scripts/content.js";
const MENU_IMAGE = "recorte-save-image";
const ALARM_RETRY = "recorte-retry";
const ALARM_TICK = "recorte-tick";
const UPDATE_TTL_MS = 60 * 60_000;

const store = new IdbQueueStore();
const isFirefox = import.meta.env.FIREFOX;
/** MV3 `action` (Chrome) / MV2 `browserAction` (Firefox build). */
const action = (browser.action ?? (browser as unknown as { browserAction: typeof browser.action }).browserAction) as typeof browser.action;

type Tab = Browser.tabs.Tab;

const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// ----------------------------------------------------------------------------------------------- notifications

async function notify(id: string, title: string, message: string, withOpenButton = false): Promise<void> {
  const opts: Browser.notifications.NotificationCreateOptions = {
    type: "basic",
    iconUrl: browser.runtime.getURL("/icon/128.png"),
    title,
    message,
  };
  if (withOpenButton && !isFirefox) opts.buttons = [{ title: "Abrir" }];
  try {
    await browser.notifications.clear(id);
    await browser.notifications.create(id, opts);
  } catch (e) {
    console.warn("[recorte] notification failed", e);
  }
}

// ----------------------------------------------------------------------------------------------- tab messaging

async function toTab<T>(tabId: number, msg: ContentMessage): Promise<T> {
  const r = (await browser.tabs.sendMessage(tabId, msg, { frameId: 0 })) as T & { error?: string };
  if (r && typeof r === "object" && "error" in r && r.error) throw new Error(r.error);
  return r;
}

/** Injects the content script once (it guards itself against double injection). */
async function ensureContent(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: "recorte:ping" } satisfies ContentMessage, { frameId: 0 });
    return;
  } catch {
    // not injected yet
  }
  await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
}

async function toastOrNotify(tabId: number | null | undefined, msg: Extract<ContentMessage, { type: "recorte:toast" }>, fallback: () => Promise<void>) {
  if (tabId != null) {
    try {
      await toTab(tabId, msg);
      return;
    } catch {
      // tab closed or navigated: fall back to a system notification
    }
  }
  await fallback();
}

// ----------------------------------------------------------------------------------------------- badge / queue

/** Settings with the account id filled in (older connections stored no userId: ask the server once). */
async function connectedSettings(): Promise<Settings> {
  const s = await getSettings();
  const conn = connectionOf(s);
  if (conn && !s.userId) {
    try {
      const me = await fetchMe(conn, extensionVersion());
      await setSettings({ userId: me.id });
      s.userId = me.id;
    } catch {
      // offline or revoked: the queue stays parked until the account is known
    }
  }
  return s;
}

async function pendingCounts(s: Settings): Promise<{ pending: number; parked: number }> {
  const byAccount = await countByAccount(store);
  const account = accountOf(s);
  let total = 0;
  for (const n of byAccount.values()) total += n;
  const pending = account ? (byAccount.get(account) ?? 0) : 0;
  return { pending, parked: total - pending };
}

async function updateBadge(): Promise<void> {
  const s = await getSettings();
  const { pending: count } = await pendingCounts(s);
  const text = count ? String(count) : s.authNeeded ? "!" : "";
  await action.setBadgeText({ text });
  await action.setBadgeBackgroundColor({ color: s.authNeeded ? "#d33" : "#fff" });
  if (!isFirefox || "setBadgeTextColor" in action) {
    await (action as unknown as { setBadgeTextColor?(o: { color: string }): Promise<void> }).setBadgeTextColor?.({
      color: s.authNeeded ? "#fff" : "#000",
    });
  }
}

let draining: Promise<DrainResult | null> | null = null;
let rerun: { force: boolean } | null = null;

/** Single-flight queue drain. `force` ignores backoff (user action, login, coming online). A request that
 *  arrives while a drain runs schedules one more pass (and awaits it), so an item saved mid-drain is not left
 *  waiting for the retry alarm. */
function drain(force = false): Promise<DrainResult | null> {
  if (draining) {
    rerun = { force: force || (rerun?.force ?? false) };
    return draining;
  }
  draining = (async () => {
    let r = await runDrain(force);
    while (rerun) {
      const next = rerun;
      rerun = null;
      r = await runDrain(next.force);
    }
    return r;
  })().finally(() => {
    draining = null;
  });
  return draining;
}

async function runDrain(force: boolean): Promise<DrainResult | null> {
  const s = await connectedSettings();
  const conn = connectionOf(s);
  const account = accountOf(s);
  // Paused after a 401 until the user re-connects; explicit actions (save, retry, login) still try.
  if (!conn || !account || (s.authNeeded && !force)) {
    await updateBadge();
    return null;
  }
  const version = extensionVersion();
  const r = await drainQueue(store, (item) => uploadItem(conn, version, item.image, item.mime, item.meta, item.id), { account, force });

  if (r.saved.length && s.authNeeded) await setSettings({ authNeeded: false });
  for (const { item } of r.saved) {
    await toastOrNotify(
      item.tabId,
      { type: "recorte:toast", text: "Guardado", tone: "ok", action: "open-gallery" },
      () => notify(`recorte-saved-${item.id}`, "Guardado", item.meta.title || item.meta.pageTitle || "Captura guardada no Recorte.", true),
    );
  }
  for (const { item, status, expired } of r.dropped) {
    const why = expired
      ? "Desisti de enviar depois de muitas tentativas falhadas."
      : status === 413
        ? "A imagem é demasiado grande para o servidor."
        : "O servidor recusou esta captura.";
    await notify(`recorte-dropped-${item.id}`, "Não foi possível guardar", `${why} (${item.meta.pageTitle || item.meta.url})`);
  }
  if (r.authNeeded) {
    const first = !(await getSettings()).authNeeded;
    await setSettings({ authNeeded: true });
    if (first) {
      await notify("recorte-auth", "Volta a ligar a extensão", "O servidor recusou o acesso. As capturas ficam guardadas na fila até voltares a ligar.");
    }
  }
  await browser.alarms.clear(ALARM_RETRY);
  if (r.remaining && r.nextAttemptAt && !r.authNeeded) {
    await browser.alarms.create(ALARM_RETRY, { when: Math.max(r.nextAttemptAt, Date.now() + 30_000) });
  }
  await updateBadge();
  return r;
}

// ----------------------------------------------------------------------------------------------- capture

interface Captured {
  canvas: OffscreenCanvas;
  rect?: Rect;
  truncated: boolean;
  image?: { alt: string; caption: string };
}

async function activeTab(): Promise<Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

/** Entry point for every trigger (popup, commands, context menu). */
async function startCapture(tab: Tab | undefined, kind: CaptureKind, srcUrl?: string): Promise<void> {
  if (!tab?.id || tab.windowId === undefined) return;
  if (!isHttpUrl(tab.url)) {
    await notify("recorte-unsupported", "Não é possível capturar esta página", "O Recorte só captura páginas http:// ou https://.");
    return;
  }
  const s = await getSettings();
  if (!connectionOf(s)) {
    await notify("recorte-setup", "Liga a extensão ao servidor", "Abre as opções do Recorte e entra com a tua conta.");
    await browser.runtime.openOptionsPage();
    return;
  }
  try {
    await ensureContent(tab.id);
    if (kind === "area") {
      // The overlay answers later with "recorte:area-selected".
      await toTab(tab.id, { type: "recorte:start-area" });
      return;
    }
    const captured = await captureKind(tab, kind, srcUrl);
    await finishCapture(tab, kind, captured);
  } catch (e) {
    await captureFailed(tab, e);
  }
}

/** Throws TabChangedError once `tab` is no longer the active tab at the same URL. */
function guardFor(tab: Tab): () => Promise<void> {
  return makeTabGuard({ tabId: tab.id!, windowId: tab.windowId!, url: tab.url! }, (id) => browser.tabs.get(id));
}

async function captureFailed(tab: Tab, e: unknown): Promise<void> {
  if (e instanceof TabChangedError) {
    // The user is on another tab now: a system notification, not an in-page toast.
    await notify("recorte-capture-error", "Recorte", e.message);
    return;
  }
  console.error("[recorte] capture failed", e);
  const message = e instanceof Error ? e.message : String(e);
  await toastOrNotify(tab.id, { type: "recorte:toast", text: `Não foi possível capturar: ${message}`, tone: "error" }, () =>
    notify("recorte-capture-error", "Não foi possível capturar", message),
  );
}

async function captureKind(tab: Tab, kind: Exclude<CaptureKind, "area">, srcUrl?: string): Promise<Captured> {
  const tabId = tab.id!;
  const windowId = tab.windowId!;
  const guard = guardFor(tab);
  if (kind === "visible") {
    const m = await toTab<PageMetrics>(tabId, { type: "recorte:metrics" });
    await toTab(tabId, { type: "recorte:prepare-capture" });
    const bmp = await captureVisible(windowId, guard);
    const rect = { x: 0, y: 0, width: m.clientWidth, height: m.innerHeight };
    const canvas = cropToRect(bmp, rect, m.innerWidth);
    bmp.close();
    return { canvas, rect, truncated: false };
  }
  if (kind === "full") {
    if (isFirefox) {
      await guard();
      const m = await toTab<PageMetrics>(tabId, { type: "recorte:metrics" });
      const full = await captureFullFirefox(tabId, m);
      await guard(); // navigated meanwhile?
      return full;
    }
    return captureFullStitched(windowId, {
      metrics: () => toTab<PageMetrics>(tabId, { type: "recorte:metrics" }),
      scrollTo: (y, hideFixed) => toTab<number>(tabId, { type: "recorte:scroll-to", y, hideFixed }),
      restore: (x, y) => toTab<void>(tabId, { type: "recorte:restore", x, y }),
    }, guard);
  }
  // "Guardar esta imagem": scroll to the element, capture, crop to its box. If the element cannot be found
  // (e.g. inside an iframe), fetch the image itself.
  const located = srcUrl ? await toTab<LocatedImage | null>(tabId, { type: "recorte:locate-image", srcUrl }) : null;
  if (located) {
    try {
      const m = await toTab<PageMetrics>(tabId, { type: "recorte:metrics" });
      const bmp = await captureVisible(windowId, guard);
      const canvas = cropToRect(bmp, located.rect, m.innerWidth);
      bmp.close();
      return { canvas, rect: located.rect, truncated: false, image: { alt: located.alt, caption: located.caption } };
    } finally {
      // locate-image scrolled the element into view: put the page back where the user had it.
      await toTab(tabId, { type: "recorte:restore", x: located.scroll.x, y: located.scroll.y }).catch(() => {});
    }
  }
  if (!srcUrl) throw new Error("imagem não encontrada");
  // No cookies: the page's ambient credentials must not be used by the extension.
  const res = await fetch(srcUrl, { credentials: "omit" });
  if (!res.ok) throw new Error(`imagem indisponível (HTTP ${res.status})`);
  const bmp = await createImageBitmap(await res.blob());
  const canvas = bitmapToCanvas(bmp);
  bmp.close();
  return { canvas, truncated: false, image: { alt: "", caption: "" } };
}

async function finishCapture(tab: Tab, kind: CaptureKind, c: Captured): Promise<void> {
  const tabId = tab.id!;
  const extract = await toTab<ExtractResult>(tabId, { type: "recorte:extract", kind, rect: c.rect, image: c.image });
  const meta = buildUploadMeta({
    kind,
    url: tab.url!,
    pageTitle: extract.pageTitle || tab.title || "",
    text: extract.text,
    truncated: c.truncated,
  });
  const encoded = await encodeImage(c.canvas);
  const s = await connectedSettings();
  const account = accountOf(s);
  if (!account) throw new Error("não foi possível identificar a conta no servidor");
  if (s.saveWithoutAsking) {
    await store.put({ ...newQueueItem(encoded.data, encoded.mime, meta, account), tabId });
    await updateBadge();
    await drain(true);
    return;
  }
  const draftId = crypto.randomUUID();
  await store.putDraft({
    id: draftId,
    account,
    image: encoded.data,
    mime: encoded.mime,
    meta,
    preview: await previewDataUrl(c.canvas),
    tabId,
    createdAt: Date.now(),
  });
  await toTab(tabId, { type: "recorte:dialog", draftId });
}

async function draftInfo(draftId: string): Promise<DraftInfo | null> {
  const d = await store.getDraft(draftId);
  return d ? { preview: d.preview, title: d.meta.pageTitle, site: siteOf(d.meta.url), truncated: !!d.meta.truncated } : null;
}

async function closeDialog(tabId: number | undefined): Promise<void> {
  if (tabId !== undefined) await toTab(tabId, { type: "recorte:close-dialog" }).catch(() => {});
}

async function onAreaSelected(tab: Tab | undefined, rect: Rect | null): Promise<void> {
  if (!tab?.id || !rect) return;
  try {
    const m = await toTab<PageMetrics>(tab.id, { type: "recorte:metrics" });
    const bmp = await captureVisible(tab.windowId!, guardFor(tab));
    const canvas = cropToRect(bmp, rect, m.innerWidth);
    bmp.close();
    await finishCapture(tab, "area", { canvas, rect, truncated: false });
  } catch (e) {
    await captureFailed(tab, e);
  }
}

async function saveDraft(draftId: string, input: DialogInput): Promise<void> {
  const d = await store.getDraft(draftId);
  if (!d) return;
  const title = input.title.trim();
  const meta = buildUploadMeta({
    ...d.meta,
    title: title && title !== d.meta.pageTitle ? title : undefined,
    note: input.note,
    tags: input.tags,
    categoryId: input.categoryId,
  });
  // The draft keeps the account it was captured for, even if the connection changed meanwhile.
  await store.put({ ...newQueueItem(d.image, d.mime, meta, d.account), tabId: d.tabId });
  await store.deleteDraft(draftId);
  await updateBadge();
  await drain(true);
}

// ----------------------------------------------------------------------------------------------- server helpers

async function openGallery(): Promise<void> {
  const s = await getSettings();
  const conn = connectionOf(s);
  if (!conn) {
    await browser.runtime.openOptionsPage();
    return;
  }
  try {
    const t = await createTicket(conn, extensionVersion());
    await browser.tabs.create({ url: absoluteUrl(conn.server, t.url) });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await setSettings({ authNeeded: true });
      await updateBadge();
      await browser.runtime.openOptionsPage();
      return;
    }
    // Server unreachable or other error: open the gallery anyway (it will ask for login).
    await browser.tabs.create({ url: `${conn.server}/` });
  }
}

async function getStatus(): Promise<Status> {
  const s = await getSettings();
  const conn = connectionOf(s);
  const version = extensionVersion();
  let update: Status["update"] = null;
  if (conn) {
    const cache = (await browser.storage.local.get("updateCheck")).updateCheck as { at: number; version: string; server: string } | undefined;
    let latest = cache && cache.server === conn.server && Date.now() - cache.at < UPDATE_TTL_MS ? cache.version : null;
    if (!latest) {
      try {
        latest = (await fetchExtensionInfo(conn, version)).version;
        await browser.storage.local.set({ updateCheck: { at: Date.now(), version: latest, server: conn.server } });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && !s.authNeeded) {
          await setSettings({ authNeeded: true });
          s.authNeeded = true;
          await updateBadge();
        }
      }
    }
    if (latest && compareVersions(latest, version) > 0) update = { version: latest, url: `${conn.server}/extensao` };
  }
  return {
    configured: !!conn,
    server: s.server,
    email: s.email,
    ...(await pendingCounts(s)),
    authNeeded: s.authNeeded,
    version,
    update,
  };
}

const errText = (e: unknown) =>
  e instanceof ApiError && e.status === 401 ? "Volta a ligar a extensão" : e instanceof Error ? e.message : String(e);

async function withConn<T>(f: (c: NonNullable<ReturnType<typeof connectionOf>>, v: string) => Promise<T>): Promise<T> {
  const conn = connectionOf(await getSettings());
  if (!conn) throw new Error("Extensão não ligada ao servidor");
  return f(conn, extensionVersion());
}

// ----------------------------------------------------------------------------------------------- messages

async function handleMessage(msg: BackgroundMessage, sender: Browser.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case "recorte:capture":
      void startCapture(await activeTab(), msg.kind);
      return { ok: true };
    case "recorte:area-selected":
      void onAreaSelected(sender.tab, msg.rect);
      return { ok: true };
    case "recorte:draft-info":
    case "recorte:draft-save":
    case "recorte:draft-cancel":
      // Only the dialog page may read or settle drafts.
      if (!sender.url?.startsWith(browser.runtime.getURL("/dialog.html"))) return { ok: false, error: "forbidden" };
      return handleDraft(msg, sender);
    default:
      return handleOther(msg, sender);
  }
}

async function handleDraft(
  msg: Extract<BackgroundMessage, { type: "recorte:draft-info" | "recorte:draft-save" | "recorte:draft-cancel" }>,
  sender: Browser.runtime.MessageSender,
): Promise<unknown> {
  switch (msg.type) {
    case "recorte:draft-info":
      return draftInfo(msg.draftId);
    case "recorte:draft-save":
      await closeDialog(sender.tab?.id);
      await saveDraft(msg.draftId, msg.input);
      return { ok: true };
    case "recorte:draft-cancel":
      await closeDialog(sender.tab?.id);
      await store.deleteDraft(msg.draftId);
      return { ok: true };
  }
}

async function handleOther(msg: BackgroundMessage, sender: Browser.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case "recorte:discard-parked": {
      // Drops every capture that is not for the current connection (or all of them when disconnected).
      const current = accountOf(await getSettings());
      for (const i of await store.all()) {
        if (msg.account ? i.account === msg.account : i.account !== current) await store.delete(i.id);
      }
      await updateBadge();
      return { ok: true };
    }
    case "recorte:tags":
      return withConn((c, v) => fetchTags(c, v)).then(
        (tags) => ({ ok: true, tags }),
        (e) => ({ ok: false, error: errText(e) }),
      );
    case "recorte:categories":
      return withConn((c, v) => fetchCategories(c, v)).then(
        (categories) => ({ ok: true, categories }),
        (e) => ({ ok: false, error: errText(e) }),
      );
    case "recorte:create-category":
      return withConn((c, v) => createCategory(c, v, msg.name)).then(
        (category) => ({ ok: true, category }),
        (e) => ({ ok: false, error: errText(e) }),
      );
    case "recorte:open-gallery":
      await openGallery();
      return { ok: true };
    case "recorte:open-options":
      await browser.runtime.openOptionsPage();
      return { ok: true };
    case "recorte:status":
      return getStatus();
    case "recorte:connected":
      await browser.storage.local.remove("updateCheck");
      await updateBadge();
      void drain(true);
      return { ok: true };
    case "recorte:retry-queue":
      return drain(true).then((r) => ({ ok: true, remaining: r?.remaining ?? null }));
  }
}

function setupMenus(): void {
  browser.contextMenus.removeAll().then(() =>
    browser.contextMenus.create({ id: MENU_IMAGE, title: "Guardar esta imagem", contexts: ["image"] }),
  );
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    setupMenus();
    void updateBadge();
  });
  browser.runtime.onStartup.addListener(() => {
    setupMenus();
    void drain();
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse: (r: unknown) => void) => {
    const msg = raw as BackgroundMessage;
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("recorte:")) return;
    if (sender.id !== browser.runtime.id) return;
    handleMessage(msg, sender).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: errText(e) }));
    return true;
  });

  browser.commands.onCommand.addListener((command, tab) => {
    const kind = ({ "capture-area": "area", "capture-visible": "visible", "capture-full": "full" } as const)[command as "capture-area"];
    if (!kind) return;
    void (async () => startCapture(tab?.id ? tab : await activeTab(), kind))();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_IMAGE) void startCapture(tab, "image", info.srcUrl);
  });

  const onNotification = (id: string) => {
    if (id.startsWith("recorte-saved-")) void openGallery();
    else if (id === "recorte-auth" || id === "recorte-setup") void browser.runtime.openOptionsPage();
    void browser.notifications.clear(id);
  };
  browser.notifications.onClicked.addListener(onNotification);
  browser.notifications.onButtonClicked?.addListener((id) => onNotification(id));

  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM_RETRY || a.name === ALARM_TICK) void drain();
  });
  void browser.alarms.create(ALARM_TICK, { periodInMinutes: 5 });

  void store.pruneDrafts(Date.now() - 24 * 60 * 60_000);
  void drain();

  // Debug/test hook (used by the Playwright smoke test through the service worker).
  (globalThis as unknown as { recorte: unknown }).recorte = {
    capture: async (kind: CaptureKind) => startCapture(await activeTab(), kind),
    captureImage: async (srcUrl: string) => startCapture(await activeTab(), "image", srcUrl),
    drain: () => drain(true),
    status: getStatus,
  };
});
