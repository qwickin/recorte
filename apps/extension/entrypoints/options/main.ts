import "@/assets/base.css";
import "./style.css";
import { browser } from "wxt/browser";
import { ApiError, fetchMe, normalizeServerUrl, registerDevice, revokeDevice } from "@/lib/api";
import type { BackgroundMessage, Status } from "@/lib/messages";
import { type Settings, accountOf, connectionOf, extensionVersion, getSettings, setSettings } from "@/lib/settings";
import { COMMAND_LABELS, formatShortcut, isMacPlatform } from "@/lib/shortcuts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T = unknown>(m: BackgroundMessage) => browser.runtime.sendMessage(m) as Promise<T>;
const isFirefox = import.meta.env.FIREFOX;

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  const b = isFirefox ? "Firefox" : /Edg\//.test(ua) ? "Edge" : "Chrome";
  return os ? `${b} em ${os}` : b;
}

let forceLogin = false;

async function renderQueue(): Promise<void> {
  const st = await send<Status>({ type: "recorte:status" });
  $("parked").hidden = st.parked === 0;
  $("parked-text").textContent =
    st.parked === 1 ? "1 captura por enviar de outra ligação (servidor ou conta)." : `${st.parked} capturas por enviar de outra ligação (servidor ou conta).`;
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
        .filter((c) => c.name && COMMAND_LABELS[c.name])
        .map((c) => {
          const li = document.createElement("li");
          const k = document.createElement("kbd");
          k.textContent = formatShortcut(c.shortcut, isMacPlatform()) || "sem atalho";
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
    const passwordInput = $<HTMLInputElement>("password");
    const email = $<HTMLInputElement>("email").value.trim();
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
            ? "Email ou palavra-passe errados."
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
      confirm(
        `Há ${pending === 1 ? "1 captura" : `${pending} capturas`} por enviar para esta conta.\n\n` +
          "OK: descartar.\nCancelar: manter na fila (só será enviada se voltares a ligar esta conta neste servidor).",
      );
    const account = accountOf(s);
    const conn = connectionOf(s);
    if (conn && s.deviceId && !s.authNeeded) await revokeDevice(conn, extensionVersion(), s.deviceId).catch(() => {});
    await setSettings({ token: null, deviceId: null, userId: null, authNeeded: false });
    if (discard && account) await send({ type: "recorte:discard-parked", account });
    await send({ type: "recorte:connected" });
    render(await getSettings());
  });
  $("discard-parked").addEventListener("click", async () => {
    if (!confirm("Descartar as capturas de outras ligações? Não há forma de as recuperar.")) return;
    await send({ type: "recorte:discard-parked" });
    void renderQueue();
  });
  $<HTMLInputElement>("save-without-asking").addEventListener("change", (e) => {
    void setSettings({ saveWithoutAsking: (e.target as HTMLInputElement).checked });
  });
  browser.storage.onChanged.addListener(async () => render(await getSettings()));
}

void main();
