import { Button } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { API, type Category, type Device, type ExtensionInfo } from "@recorte/shared";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import { Devices } from "../components/Devices";
import { inputClass, Page, Section } from "../components/Page";
import { LanguageSelect } from "../components/LanguageSelect";
import { ServerSettingsForm } from "../components/ServerSettingsForm";
import { type Msg, msgText, useT } from "../i18n";
import { navigate } from "../lib/router";

function Status({ msg }: { msg: Msg | null }) {
  const t = useT();
  return (
    <p className={`min-h-5 text-[13px] ${msg?.error ? "text-[#ff8a8a]" : "text-[var(--ink-3)]"}`} aria-live="polite">
      {msgText(t, msg)}
    </p>
  );
}

function PasswordForm() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setMsg({ key: "settings.passwordChanged" });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setMsg({
        error: true,
        key: code === "invalid_credentials" ? "settings.passwordWrong" : code === "invalid_request" ? "settings.passwordShort" : "settings.passwordFailed",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-1.5 text-[13px] text-[var(--ink-3)]">
        {t("settings.passwordCurrent")}
        <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-[var(--ink-3)]">
        {t("settings.passwordNew")}
        <input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </label>
      <Button type="submit" variant="secondary" isDisabled={busy} className="h-[46px]">
        {t("settings.passwordChange")}
      </Button>
      <div className="sm:col-span-3">
        <Status msg={msg} />
      </div>
    </form>
  );
}

function Categories() {
  const t = useT();
  const [list, setList] = useState<Category[] | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const load = () => api.listCategories().then(setList, () => setList([]));
  useEffect(() => void load(), []);

  const fail = (e: unknown) => setMsg({ error: true, key: e instanceof ApiError && e.code === "name_taken" ? "common.categoryTaken" : "common.saveFailed" });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createCategory({ name: name.trim() });
      setName("");
      setMsg(null);
      await load();
    } catch (err) {
      fail(err);
    }
  };
  const rename = async () => {
    if (!editing) return;
    try {
      if (editing.name.trim()) await api.updateCategory(editing.id, { name: editing.name.trim() });
      setEditing(null);
      setMsg(null);
      await load();
    } catch (err) {
      fail(err);
    }
  };
  const remove = async (c: Category) => {
    if (!window.confirm(t("settings.deleteCategory", { name: c.name }))) return;
    try {
      await api.deleteCategory(c.id);
      await load();
    } catch {
      setMsg({ error: true, key: "common.deleteFailed" });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {list && list.length > 0 && (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07]">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              {editing?.id === c.id ? (
                <input
                  autoFocus
                  aria-label={t("settings.categoryName")}
                  value={editing.name}
                  maxLength={60}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  onBlur={rename}
                  onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" && setEditing(null))}
                  className={`${inputClass} py-1.5`}
                />
              ) : (
                <button type="button" className="min-w-0 flex-1 truncate text-left text-[14.5px] text-white" onClick={() => setEditing({ id: c.id, name: c.name })} title={t("settings.rename")}>
                  {c.name}
                </button>
              )}
              <Button size="sm" variant="ghost" className="text-[var(--ink-3)]" onPress={() => remove(c)}>
                {t("common.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {list?.length === 0 && <p className="text-[13.5px] text-[var(--ink-3)]">{t("settings.noCategories")}</p>}
      <form onSubmit={create} className="flex gap-2">
        <input placeholder={t("settings.newCategory")} aria-label={t("settings.newCategory")} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <Button type="submit" variant="secondary" className="h-[46px]">
          {t("common.create")}
        </Button>
      </form>
      <Status msg={msg} />
    </div>
  );
}

function DeviceList() {
  const t = useT();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [info, setInfo] = useState<ExtensionInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Msg | null>(null);
  useEffect(() => {
    api.listDevices().then(setDevices, () => setDevices([]));
    api.extensionInfo().then(setInfo, () => {});
  }, []);
  const revoke = async (d: Device) => {
    if (!window.confirm(t("settings.revokeConfirm", { name: d.name }))) return;
    setBusy(d.id);
    setError(null);
    try {
      await api.revokeDevice(d.id);
      setDevices((ds) => ds?.filter((x) => x.id !== d.id) ?? null);
    } catch {
      setError({ error: true, key: "settings.revokeFailed", vars: { name: d.name } });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Devices devices={devices} latest={info?.version} onRevoke={revoke} busyId={busy} />
      <Status msg={error} />
    </div>
  );
}

/** Reindex result: the main line plus an optional note about unreadable files. */
type Result = Msg & { extra?: Msg };

function Maintenance() {
  const t = useT();
  const [msg, setMsg] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Result>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch {
      setMsg({ key: "settings.actionFailed", error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="outline"
          isDisabled={busy}
          onPress={() =>
            run(async () => {
              const r = await api.reprocess();
              return { key: "settings.reprocessDone", vars: { count: r.queued } };
            })
          }
        >
          {t("settings.reprocess")}
        </Button>
        <Button
          variant="outline"
          isDisabled={busy}
          onPress={() =>
            run(async () => {
              const r = await api.reindex();
              return {
                key: r.indexed ? "settings.reindexDone" : "settings.reindexPartial",
                vars: { count: r.items },
                ...(r.unreadable ? { extra: { key: "settings.reindexUnreadable", vars: { count: r.unreadable } } } : {}),
              };
            })
          }
        >
          {t("settings.reindex")}
        </Button>
      </div>
      <p className={`min-h-5 text-[13px] ${msg?.error ? "text-[#ff8a8a]" : "text-[var(--ink-3)]"}`} aria-live="polite">
        {msgText(t, msg)}
        {msg?.extra && ` ${msgText(t, msg.extra)}`}
      </p>
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const logout = async () => {
    await api.logout().catch(() => {});
    navigate("/login", { replace: true });
  };
  return (
    <Page title={t("settings.title")}>
      <Section title={t("language.label")} description={t("language.description")}>
        <div>
          <LanguageSelect className={`${inputClass} max-w-[320px] [color-scheme:dark]`} />
        </div>
      </Section>

      <Section title={t("settings.server")} description={t("settings.serverDescription")}>
        <ServerSettingsForm />
      </Section>

      <Section title={t("settings.password")} description={t("settings.passwordDescription")}>
        <PasswordForm />
      </Section>

      <Section title={t("settings.categories")} description={t("settings.categoriesDescription")}>
        <Categories />
      </Section>

      <Section title={t("settings.devices")} description={t("settings.devicesDescription")}>
        <DeviceList />
      </Section>

      <Section title={t("settings.export")} description={t("settings.exportDescription")}>
        <div>
          <a href={API.export} download className={buttonVariants({ variant: "outline" })}>
            {t("settings.exportZip")}
          </a>
        </div>
      </Section>

      <Section title={t("settings.ai")} description={t("settings.aiDescription")}>
        <Maintenance />
        <p className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
          {t.node("settings.privacy", { server: <em>{t("settings.server")}</em> })}
        </p>
      </Section>

      <Section title={t("settings.session")}>
        <div>
          <Button variant="ghost" onPress={logout} className="text-[var(--ink-2)]">
            {t("settings.signOut")}
          </Button>
        </div>
      </Section>
    </Page>
  );
}
