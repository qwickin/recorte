import "@/assets/base.css";
import "./style.css";
import { browser } from "wxt/browser";
import { ApiError, fetchMe, normalizeServerUrl, registerDevice, revokeDevice } from "@/lib/api";
import type { BackgroundMessage, Status } from "@/lib/messages";
import { type Settings, accountOf, connectionOf, extensionVersion, getSettings, setSettings } from "@/lib/settings";
import { COMMANDS, formatShortcut, isCommandName, isMacPlatform } from "@/lib/shortcuts";
import { DEFAULT_LOCALE, isLocale, LOCALE_NAMES, LOCALES } from "@recorte/shared";
import { localizeDom, makeT, resolveLocale, type T } from "@/lib/i18n";
import { getT, LOCALE_KEY, onLocaleChange, uiLanguage } from "@/lib/i18n/browser";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T = unknown>(m: BackgroundMessage) => browser.runtime.sendMessage(m) as Promise<T>;
const isFirefox = import.meta.env.FIREFOX;

let t: T = makeT(DEFAULT_LOCALE);

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  const b = isFirefox ? "Firefox" : /Edg\//.test(ua) ? "Edge" : "Chrome";
  return os ? t("options.deviceDefault", { browser: b, os }) : b;
}

let forceLogin = false;

async function renderQueue(): Promise<void> {
  const st = await send<Status>({ type: "recorte:status" });
  $("parked").hidden = st.parked === 0;
  $("parked-text").textContent = t("options.parked", { count: st.parked });
}

function renderLanguage(s: Settings): void {
  const select = $<HTMLSelectElement>("language");
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = t("options.languageAuto", { language: LOCALE_NAMES[resolveLocale(null, uiLanguage())] });
  select.replaceChildren(
    auto,
    ...LOCALES.map((l) => {
      const o = document.createElement("option");
      o.value = l;
      o.lang = l;
      o.textContent = LOCALE_NAMES[l];
      return o;
    }),
  );
  select.value = s.locale ?? "";
}

function render(s: Settings): void {
  void renderQueue();
  const connected = !!connectionOf(s);
  $("connected").hidden = !connected;
  $("login").hidden = connected && !forceLogin;
  $("cancel-login").hidden = !connected;
  $("who-server").textContent = s.server ?? "";
  $("who-email").textContent = s.email ?? "";
  $("who-email-row").hidden = !s.email;
  $("auth-needed").hidden = !s.authNeeded;
  $<HTMLInputElement>("save-without-asking").checked = s.saveWithoutAsking;
  const server = $<HTMLInputElement>("server");
  if (!server.value && s.server) server.value = s.server;
  const email = $<HTMLInputElement>("email");
  if (!email.value && s.email) email.value = s.email;
}

async function renderShortcuts(): Promise<void> {
  const list = $("shortcuts");
  try {
    const cmds = await browser.commands.getAll();
    list.replaceChildren(
      ...cmds
        .filter((c) => isCommandName(c.name))
        .map((c) => {
          const li = document.createElement("li");
          const k = document.createElement("kbd");
          k.textContent = formatShortcut(c.shortcut, isMacPlatform(), { space: t("key.space") }) || t("options.noShortcut");
          li.append(t(COMMANDS[c.name as keyof typeof COMMANDS].ui), k);
          return li;
        }),
    );
  } catch {
    list.replaceChildren();
  }
  const hint = $("shortcuts-hint");
  if (isFirefox) hint.textContent = t("options.shortcutsFirefox");
  else {
    hint.textContent = "";
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = t("options.shortcutsChange");
    a.addEventListener("click", (e) => {
      e.preventDefault();
      void browser.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
    hint.append(a);
  }
}

/** Static copy, the language list, the shortcuts and everything render() writes, in the current language. */
async function localize(): Promise<void> {
  const before = defaultDeviceName();
  t = await getT();
  localizeDom(document, t);
  const device = $<HTMLInputElement>("device");
  if (!device.value || device.value === before) device.value = defaultDeviceName();
  $("version").textContent = t("options.version", { version: extensionVersion() });
  const s = await getSettings();
  renderLanguage(s);
  render(s);
  void renderShortcuts();
}

async function main(): Promise<void> {
  await localize();
  onLocaleChange(() => void localize());
  $<HTMLSelectElement>("language").addEventListener("change", (e) => {
    const v = (e.target as HTMLSelectElement).value;
    void browser.storage.local.set({ [LOCALE_KEY]: isLocale(v) ? v : null });
  });

  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("login-error");
    err.hidden = true;
    const server = normalizeServerUrl($<HTMLInputElement>("server").value);
    const passwordInput = $<HTMLInputElement>("password");
    const email = $<HTMLInputElement>("email").value.trim();
    const name = $<HTMLInputElement>("device").value.trim() || defaultDeviceName();
    if (!server) {
      err.textContent = t("options.invalidServer");
      err.hidden = false;
      return;
    }
    const btn = $<HTMLButtonElement>("connect");
    btn.disabled = true;
    btn.textContent = t("options.connecting");
    try {
      const { token, id } = await registerDevice(server, email, passwordInput.value, name);
      // The account id scopes the offline queue: captures are only ever sent to the account they were made for.
      const me = await fetchMe({ server, token }, extensionVersion());
      await setSettings({ server, token, deviceId: id, userId: me.id, email: me.email ?? email.toLowerCase(), authNeeded: false });
      passwordInput.value = "";
      forceLogin = false;
      await send({ type: "recorte:connected" });
      render(await getSettings());
    } catch (e2) {
      err.textContent =
        e2 instanceof ApiError
          ? e2.status === 401
            ? t("options.wrongCredentials")
            : e2.status === 429
              ? t("options.tooMany")
              : t("options.serverStatus", { status: String(e2.status) })
          : t("options.unreachable");
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = t("options.connect");
    }
  });

  $("reconnect").addEventListener("click", async () => {
    forceLogin = true;
    render(await getSettings());
    ($<HTMLInputElement>("email").value ? $<HTMLInputElement>("password") : $<HTMLInputElement>("email")).focus();
  });
  $("cancel-login").addEventListener("click", async () => {
    forceLogin = false;
    render(await getSettings());
  });
  $("disconnect").addEventListener("click", async () => {
    const s = await getSettings();
    const { pending } = await send<Status>({ type: "recorte:status" });
    const discard =
      pending > 0 &&
      confirm(t("options.disconnectConfirm", { count: pending }));
    const account = accountOf(s);
    const conn = connectionOf(s);
    if (conn && s.deviceId && !s.authNeeded) await revokeDevice(conn, extensionVersion(), s.deviceId).catch(() => {});
    await setSettings({ token: null, deviceId: null, userId: null, authNeeded: false });
    if (discard && account) await send({ type: "recorte:discard-parked", account });
    await send({ type: "recorte:connected" });
    render(await getSettings());
  });
  $("discard-parked").addEventListener("click", async () => {
    if (!confirm(t("options.discardParkedConfirm"))) return;
    await send({ type: "recorte:discard-parked" });
    void renderQueue();
  });
  $<HTMLInputElement>("save-without-asking").addEventListener("change", (e) => {
    void setSettings({ saveWithoutAsking: (e.target as HTMLInputElement).checked });
  });
  browser.storage.onChanged.addListener(async () => render(await getSettings()));
}

void main();
