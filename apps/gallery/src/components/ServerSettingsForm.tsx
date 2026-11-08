import { Button } from "@heroui/react";
import { formatList, type Locale, type ServerSettings, type SettingKey, type SettingsPatch } from "@recorte/shared";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../api";
import { type MessageKey, type Msg, msgText, useT } from "../i18n";
import { inputClass } from "./Page";

const ENV_NAME: Record<SettingKey, string> = {
  publicUrl: "PUBLIC_URL",
  aiCloudUrl: "AI_CLOUD_URL",
  aiCloudKey: "AI_CLOUD_KEY",
  aiCloudModel: "AI_CLOUD_MODEL",
};

const LABEL: Record<SettingKey, MessageKey> = {
  publicUrl: "server.publicUrl",
  aiCloudUrl: "server.aiCloudUrl",
  aiCloudKey: "server.aiCloudKey",
  aiCloudModel: "server.aiCloudModel",
};

function Field({ label, hint, envName, ...p }: { label: string; hint?: ReactNode; envName?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const t = useT();
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--ink-3)]">
      {label}
      <input {...p} disabled={!!envName || p.disabled} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`} />
      {envName ? (
        <span className="text-[12px] text-[var(--ink-3)]">
          {t.node("server.envSet", { name: <code>{envName}</code> })}
        </span>
      ) : (
        hint && <span className="text-[12px] leading-relaxed text-[var(--ink-3)]">{hint}</span>
      )}
    </label>
  );
}

const fmtFields = (keys: SettingKey[], label: (k: SettingKey) => string, locale: Locale) => formatList(keys.map(label), locale);

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
  submitLabel,
  prefillOrigin = false,
  onSaved,
  extraActions,
}: {
  submitLabel?: string;
  prefillOrigin?: boolean;
  onSaved?: () => void;
  extraActions?: ReactNode;
}) {
  const t = useT();
  const [s, setS] = useState<ServerSettings | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [aiCloudUrl, setAiCloudUrl] = useState("");
  const [aiCloudModel, setAiCloudModel] = useState("");
  const [aiCloudKey, setAiCloudKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  // Field names are kept as setting keys, so the message follows a language switch.
  const [msg, setMsg] = useState<(Msg & { keys?: SettingKey[] }) | null>(null);
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
      setMsg({ key: "common.saved" });
      onSaved?.();
    } catch (err) {
      const keys = err instanceof ApiError && Array.isArray(err.body.keys) ? (err.body.keys as SettingKey[]) : [];
      setMsg({
        error: true,
        keys,
        key:
          err instanceof ApiError && err.code === "invalid_url"
            ? keys.includes("publicUrl")
              ? "server.invalidPublicUrl"
              : "server.invalidUrl"
            : err instanceof ApiError && err.code === "overridden_by_env"
              ? "server.overridden"
              : "common.saveFailed",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p className="text-[13px] text-[#ff8a8a]">{t("server.loadFailed")}</p>;
  if (!s) return <p className="text-[13px] text-[var(--ink-3)]">{t("common.loading")}</p>;
  const fields = fmtFields(msg?.keys ?? [], (k) => t(LABEL[k]), t.locale);
  const env = (k: SettingKey) => (s[k].source === "env" ? ENV_NAME[k] : undefined);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field
        label={t(LABEL.publicUrl)}
        type="url"
        inputMode="url"
        placeholder={window.location.origin}
        value={publicUrl}
        onChange={(e) => setPublicUrl(e.target.value)}
        envName={env("publicUrl")}
        hint={t("server.publicUrlHint")}
      />
      <fieldset className="flex flex-col gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <legend className="px-1 text-[13px] text-white">{t("server.cloudLegend")}</legend>
        <p className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          {t("server.cloudHelp")}
        </p>
        <Field
          label={t(LABEL.aiCloudUrl)}
          type="url"
          inputMode="url"
          placeholder="https://api.openai.com/v1"
          value={aiCloudUrl}
          onChange={(e) => setAiCloudUrl(e.target.value)}
          envName={env("aiCloudUrl")}
          autoComplete="off"
        />
        <Field
          label={t(LABEL.aiCloudKey)}
          type="password"
          autoComplete="off"
          placeholder={s.aiCloudKey.set ? t("server.keySet", { key: s.aiCloudKey.value ?? "" }) : "sk-…"}
          value={aiCloudKey}
          onChange={(e) => setAiCloudKey(e.target.value)}
          envName={env("aiCloudKey")}
        />
        {s.aiCloudKey.set && s.aiCloudKey.source === "db" && (
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--ink-3)]">
            <input type="checkbox" checked={removeKey} onChange={(e) => setRemoveKey(e.target.checked)} /> {t("server.removeKey")}
          </label>
        )}
        <Field
          label={t(LABEL.aiCloudModel)}
          placeholder="gpt-4o-mini"
          value={aiCloudModel}
          onChange={(e) => setAiCloudModel(e.target.value)}
          envName={env("aiCloudModel")}
          autoComplete="off"
        />
      </fieldset>
      <p className={`min-h-5 text-[13px] ${msg?.error ? "text-[#ff8a8a]" : "text-[var(--ink-3)]"}`} role={msg?.error ? "alert" : undefined} aria-live="polite">
        {msg && msgText(t, { ...msg, vars: { fields } })}
      </p>
      <div className="flex flex-wrap justify-end gap-2.5">
        {extraActions}
        <Button type="submit" variant="primary" isDisabled={busy} className="h-11">
          {busy ? t("common.saving") : (submitLabel ?? t("common.save"))}
        </Button>
      </div>
    </form>
  );
}
