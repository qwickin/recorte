import { Button } from "@heroui/react";
import type { ServerSettings, SettingKey, SettingsPatch } from "@recorte/shared";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../api";
import { inputClass } from "./Page";

const ENV_NAME: Record<SettingKey, string> = {
  publicUrl: "PUBLIC_URL",
  aiCloudUrl: "AI_CLOUD_URL",
  aiCloudKey: "AI_CLOUD_KEY",
  aiCloudModel: "AI_CLOUD_MODEL",
};

const LABEL: Record<SettingKey, string> = {
  publicUrl: "Endereço público",
  aiCloudUrl: "URL do serviço",
  aiCloudKey: "Chave",
  aiCloudModel: "Modelo",
};

function Field({ label, hint, envName, ...p }: { label: string; hint?: ReactNode; envName?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--ink-3)]">
      {label}
      <input {...p} disabled={!!envName || p.disabled} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`} />
      {envName ? (
        <span className="text-[12px] text-[var(--ink-3)]">
          Definido no servidor pela variável <code>{envName}</code>.
        </span>
      ) : (
        hint && <span className="text-[12px] leading-relaxed text-[var(--ink-3)]">{hint}</span>
      )}
    </label>
  );
}

/** Builds the PUT body: only keys not set by the environment; the key only when typed or removed. */
export function settingsPatch(
  s: ServerSettings,
  v: { publicUrl: string; aiCloudUrl: string; aiCloudModel: string; aiCloudKey: string; removeKey: boolean },
): SettingsPatch {
  const p: SettingsPatch = {};
  if (s.publicUrl.source === "db") p.publicUrl = v.publicUrl.trim() || null;
  if (s.aiCloudUrl.source === "db") p.aiCloudUrl = v.aiCloudUrl.trim() || null;
  if (s.aiCloudModel.source === "db") p.aiCloudModel = v.aiCloudModel.trim() || null;
  if (s.aiCloudKey.source === "db") {
    if (v.aiCloudKey.trim()) p.aiCloudKey = v.aiCloudKey.trim();
    else if (v.removeKey) p.aiCloudKey = null;
  }
  return p;
}

/**
 * Public address + optional cloud AI, bound to /api/settings. Fields set by environment variables are read-only.
 * `prefillOrigin`: an empty public address starts as this page's origin (setup wizard).
 */
export function ServerSettingsForm({
  submitLabel = "Guardar",
  prefillOrigin = false,
  onSaved,
  extraActions,
}: {
  submitLabel?: string;
  prefillOrigin?: boolean;
  onSaved?: () => void;
  extraActions?: ReactNode;
}) {
  const [s, setS] = useState<ServerSettings | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [aiCloudUrl, setAiCloudUrl] = useState("");
  const [aiCloudModel, setAiCloudModel] = useState("");
  const [aiCloudKey, setAiCloudKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (r: ServerSettings) => {
    setS(r);
    setPublicUrl(r.publicUrl.value ?? (prefillOrigin ? window.location.origin : ""));
    setAiCloudUrl(r.aiCloudUrl.value ?? "");
    setAiCloudModel(r.aiCloudModel.value ?? "");
    setAiCloudKey("");
    setRemoveKey(false);
  };

  useEffect(() => {
    api.getSettings().then(apply, () => setLoadError(true));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      apply(await api.updateSettings(settingsPatch(s, { publicUrl, aiCloudUrl, aiCloudModel, aiCloudKey, removeKey })));
      setMsg({ text: "Guardado." });
      onSaved?.();
    } catch (err) {
      const keys = err instanceof ApiError && Array.isArray(err.body.keys) ? (err.body.keys as SettingKey[]) : [];
      const names = keys.map((k) => LABEL[k]).join(", ");
      setMsg({
        error: true,
        text:
          err instanceof ApiError && err.code === "invalid_url"
            ? `${names}: escreve um endereço http:// ou https://${keys.includes("publicUrl") ? ", sem caminho (p. ex. http://192.168.1.20:8080)" : ""}.`
            : err instanceof ApiError && err.code === "overridden_by_env"
              ? `${names}: definido por variável de ambiente no servidor.`
              : "Não foi possível guardar. Tenta de novo.",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p className="text-[13px] text-[#ff8a8a]">Não foi possível ler as definições do servidor.</p>;
  if (!s) return <p className="text-[13px] text-[var(--ink-3)]">A carregar…</p>;
  const env = (k: SettingKey) => (s[k].source === "env" ? ENV_NAME[k] : undefined);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field
        label={LABEL.publicUrl}
        type="url"
        inputMode="url"
        placeholder={window.location.origin}
        value={publicUrl}
        onChange={(e) => setPublicUrl(e.target.value)}
        envName={env("publicUrl")}
        hint="O endereço com que abres o Recorte no browser (e que vais pôr na extensão)."
      />
      <fieldset className="flex flex-col gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <legend className="px-1 text-[13px] text-white">IA na cloud (opcional)</legend>
        <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          Serviço compatível com a API da OpenAI, para títulos e descrições. Se o ligares, uma versão reduzida de cada captura e o seu texto são enviados
          a esse serviço de terceiros. Sem isto, a IA corre só neste servidor.
        </p>
        <Field
          label={LABEL.aiCloudUrl}
          type="url"
          inputMode="url"
          placeholder="https://api.openai.com/v1"
          value={aiCloudUrl}
          onChange={(e) => setAiCloudUrl(e.target.value)}
          envName={env("aiCloudUrl")}
          autoComplete="off"
        />
        <Field
          label={LABEL.aiCloudKey}
          type="password"
          autoComplete="off"
          placeholder={s.aiCloudKey.set ? `Definida (${s.aiCloudKey.value}). Escreve para a trocar.` : "sk-…"}
          value={aiCloudKey}
          onChange={(e) => setAiCloudKey(e.target.value)}
          envName={env("aiCloudKey")}
        />
        {s.aiCloudKey.set && s.aiCloudKey.source === "db" && (
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--ink-3)]">
            <input type="checkbox" checked={removeKey} onChange={(e) => setRemoveKey(e.target.checked)} /> Remover a chave guardada
          </label>
        )}
        <Field
          label={LABEL.aiCloudModel}
          placeholder="gpt-4o-mini"
          value={aiCloudModel}
          onChange={(e) => setAiCloudModel(e.target.value)}
          envName={env("aiCloudModel")}
          autoComplete="off"
        />
      </fieldset>
      <p className={`min-h-5 text-[13px] ${msg?.error ? "text-[#ff8a8a]" : "text-[var(--ink-3)]"}`} role={msg?.error ? "alert" : undefined} aria-live="polite">
        {msg?.text}
      </p>
      <div className="flex flex-wrap justify-end gap-2.5">
        {extraActions}
        <Button type="submit" variant="primary" isDisabled={busy} className="h-11">
          {busy ? "A guardar…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
