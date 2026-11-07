import "@/assets/base.css";
import "./style.css";
import { browser } from "wxt/browser";
import { isHttpUrl } from "@/lib/api";
import { formatShortcut, isMacPlatform } from "@/lib/shortcuts";
import type { BackgroundMessage, Status } from "@/lib/messages";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T>(m: BackgroundMessage) => browser.runtime.sendMessage(m) as Promise<T>;

async function shortcuts(): Promise<void> {
  try {
    for (const c of await browser.commands.getAll()) {
      const el = document.querySelector<HTMLElement>(`kbd[data-cmd="${c.name}"]`);
      if (el) el.textContent = formatShortcut(c.shortcut, isMacPlatform());
    }
  } catch {
    // not supported
  }
}

function render(s: Status, tabOk: boolean): void {
  $("server").textContent = s.server ? s.server.replace(/^https?:\/\//, "") : "";
  $("setup").hidden = s.configured;
  $("auth").hidden = !s.configured || !s.authNeeded;
  const up = $<HTMLAnchorElement>("update");
  up.hidden = !s.update;
  if (s.update) {
    up.href = s.update.url;
    $("update-version").textContent = `${s.version} → ${s.update.version}`;
  }
  $("unsupported").hidden = tabOk;
  for (const b of document.querySelectorAll<HTMLButtonElement>(".mode")) b.disabled = !tabOk || !s.configured;
  $<HTMLButtonElement>("gallery").disabled = !s.configured;
  $("queue").textContent =
    (s.pending === 0 ? "Fila vazia" : s.pending === 1 ? "1 captura por enviar" : `${s.pending} capturas por enviar`) +
    (s.parked ? ` · ${s.parked} de outra ligação` : "");
  $("retry").hidden = s.pending === 0 || s.authNeeded;
  const discard = $<HTMLButtonElement>("discard");
  discard.hidden = s.pending === 0;
  discard.textContent = "Descartar";
  delete discard.dataset.armed;
}

async function main(): Promise<void> {
  void shortcuts();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tabOk = isHttpUrl(tab?.url);
  const status = await send<Status>({ type: "recorte:status" });
  render(status, tabOk);

  for (const b of document.querySelectorAll<HTMLButtonElement>(".mode")) {
    b.addEventListener("click", async () => {
      await send({ type: "recorte:capture", kind: b.dataset.kind as "area" | "visible" | "full" });
      window.close();
    });
  }
  $("gallery").addEventListener("click", async () => {
    await send({ type: "recorte:open-gallery" });
    window.close();
  });
  const openOptions = () => {
    void browser.runtime.openOptionsPage();
    window.close();
  };
  $("options").addEventListener("click", openOptions);
  $("auth").addEventListener("click", openOptions);
  $("setup").addEventListener("click", openOptions);
  $("retry").addEventListener("click", async () => {
    $("queue").textContent = "A enviar…";
    await send({ type: "recorte:retry-queue" });
    render(await send<Status>({ type: "recorte:status" }), tabOk);
  });
  // Two clicks instead of confirm(): dialogs are unreliable inside a Firefox action popup.
  $("discard").addEventListener("click", async () => {
    const b = $<HTMLButtonElement>("discard");
    if (!b.dataset.armed) {
      b.dataset.armed = "1";
      b.textContent = "Confirmar descarte";
      return;
    }
    await send({ type: "recorte:discard-pending" });
    render(await send<Status>({ type: "recorte:status" }), tabOk);
  });
}

void main();
