import "@/assets/base.css";
import "./style.css";
import { browser } from "wxt/browser";
import { ApiError, normalizeServerUrl, registerDevice, revokeDevice } from "@/lib/api";
import type { BackgroundMessage } from "@/lib/messages";
import { type Settings, connectionOf, extensionVersion, getSettings, setSettings } from "@/lib/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = (m: BackgroundMessage) => browser.runtime.sendMessage(m);
const isFirefox = import.meta.env.FIREFOX;

const COMMAND_LABELS: Record<string, string> = {
  "capture-area": "Capturar área",
  "capture-visible": "Capturar parte visível",
  "capture-full": "Capturar página inteira",
};

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  const b = isFirefox ? "Firefox" : /Edg\//.test(ua) ? "Edge" : "Chrome";
  return os ? `${b} em ${os}` : b;
}

let forceLogin = false;

function render(s: Settings): void {
  const connected = !!connectionOf(s);
  $("connected").hidden = !connected;
  $("login").hidden = connected && !forceLogin;
  $("cancel-login").hidden = !connected;
  $("who-email").textContent = s.email ?? "";
  $("who-server").textContent = s.server ?? "";
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
        .filter((c) => c.name && COMMAND_LABELS[c.name])
        .map((c) => {
          const li = document.createElement("li");
          const k = document.createElement("kbd");
          k.textContent = c.shortcut || "—";
          li.append(COMMAND_LABELS[c.name!]!, k);
          return li;
        }),
    );
  } catch {
    list.replaceChildren();
  }
  const hint = $("shortcuts-hint");
  if (isFirefox) hint.textContent = "Para mudar: about:addons → engrenagem → Gerir atalhos de extensões.";
  else {
    hint.textContent = "";
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = "Mudar atalhos";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      void browser.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
    hint.append(a);
  }
}

async function main(): Promise<void> {
  $<HTMLInputElement>("device").value = defaultDeviceName();
  $("version").textContent = `Versão ${extensionVersion()}`;
  render(await getSettings());
  void renderShortcuts();

  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("login-error");
    err.hidden = true;
    const server = normalizeServerUrl($<HTMLInputElement>("server").value);
    const email = $<HTMLInputElement>("email").value.trim();
    const passwordInput = $<HTMLInputElement>("password");
    const name = $<HTMLInputElement>("device").value.trim() || defaultDeviceName();
    if (!server) {
      err.textContent = "URL do servidor inválido.";
      err.hidden = false;
      return;
    }
    const btn = $<HTMLButtonElement>("connect");
    btn.disabled = true;
    btn.textContent = "A ligar…";
    try {
      const { token, id } = await registerDevice(server, email, passwordInput.value, name);
      await setSettings({ server, token, deviceId: id, email, authNeeded: false });
      passwordInput.value = "";
      forceLogin = false;
      await send({ type: "recorte:connected" });
      render(await getSettings());
    } catch (e2) {
      err.textContent =
        e2 instanceof ApiError
          ? e2.status === 401
            ? "Email ou password errados."
            : e2.status === 429
              ? "Demasiadas tentativas. Espera um pouco."
              : `O servidor respondeu ${e2.status}.`
          : "Não foi possível contactar o servidor. Confirma o URL.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Ligar";
    }
  });

  $("reconnect").addEventListener("click", async () => {
    forceLogin = true;
    render(await getSettings());
    $<HTMLInputElement>("password").focus();
  });
  $("cancel-login").addEventListener("click", async () => {
    forceLogin = false;
    render(await getSettings());
  });
  $("disconnect").addEventListener("click", async () => {
    const s = await getSettings();
    const conn = connectionOf(s);
    if (conn && s.deviceId && !s.authNeeded) await revokeDevice(conn, extensionVersion(), s.deviceId).catch(() => {});
    await setSettings({ token: null, deviceId: null, authNeeded: false });
    await send({ type: "recorte:connected" });
    render(await getSettings());
  });
  $<HTMLInputElement>("save-without-asking").addEventListener("change", (e) => {
    void setSettings({ saveWithoutAsking: (e.target as HTMLInputElement).checked });
  });
  browser.storage.onChanged.addListener(async () => render(await getSettings()));
}

void main();
