import { Button } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { API, type Category, type Device, type ExtensionInfo } from "@recorte/shared";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import { Devices } from "../components/Devices";
import { inputClass, Page, Section } from "../components/Page";
import { navigate } from "../lib/router";

const Status = ({ text, error }: { text: string | null; error?: boolean }) => (
  <p className={`min-h-5 text-[13px] ${error ? "text-[#ff8a8a]" : "text-[var(--ink-3)]"}`} aria-live="polite">
    {text}
  </p>
);

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setMsg({ text: "Palavra-passe mudada. As outras sessões e extensões têm de voltar a entrar." });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setMsg({
        error: true,
        text: code === "invalid_credentials" ? "A palavra-passe atual não está certa." : code === "invalid_request" ? "A nova palavra-passe precisa de pelo menos 8 caracteres." : "Não foi possível mudar a palavra-passe.",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-1.5 text-[13px] text-[var(--ink-3)]">
        Atual
        <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-[var(--ink-3)]">
        Nova
        <input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </label>
      <Button type="submit" variant="secondary" isDisabled={busy} className="h-[46px]">
        Mudar
      </Button>
      <div className="sm:col-span-3">
        <Status text={msg?.text ?? null} error={msg?.error} />
      </div>
    </form>
  );
}

function Categories() {
  const [list, setList] = useState<Category[] | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.listCategories().then(setList, () => setList([]));
  useEffect(() => void load(), []);

  const fail = (e: unknown) => setMsg(e instanceof ApiError && e.code === "name_taken" ? "Já existe uma categoria com esse nome." : "Não foi possível guardar.");

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
    if (!window.confirm(`Apagar a categoria “${c.name}”? As capturas ficam sem categoria.`)) return;
    try {
      await api.deleteCategory(c.id);
      await load();
    } catch {
      setMsg("Não foi possível apagar.");
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
                  aria-label="Nome da categoria"
                  value={editing.name}
                  maxLength={60}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  onBlur={rename}
                  onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" && setEditing(null))}
                  className={`${inputClass} py-1.5`}
                />
              ) : (
                <button type="button" className="min-w-0 flex-1 truncate text-left text-[14.5px] text-white" onClick={() => setEditing({ id: c.id, name: c.name })} title="Mudar o nome">
                  {c.name}
                </button>
              )}
              <Button size="sm" variant="ghost" className="text-[var(--ink-3)]" onPress={() => remove(c)}>
                Apagar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {list?.length === 0 && <p className="text-[13.5px] text-[var(--ink-3)]">Ainda não tens categorias.</p>}
      <form onSubmit={create} className="flex gap-2">
        <input placeholder="Nova categoria" aria-label="Nova categoria" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        <Button type="submit" variant="secondary" className="h-[46px]">
          Criar
        </Button>
      </form>
      <Status text={msg} error />
    </div>
  );
}

function DeviceList() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [info, setInfo] = useState<ExtensionInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.listDevices().then(setDevices, () => setDevices([]));
    api.extensionInfo().then(setInfo, () => {});
  }, []);
  const revoke = async (d: Device) => {
    if (!window.confirm(`Revogar “${d.name}”? Essa extensão terá de voltar a entrar.`)) return;
    setBusy(d.id);
    setError(null);
    try {
      await api.revokeDevice(d.id);
      setDevices((ds) => ds?.filter((x) => x.id !== d.id) ?? null);
    } catch {
      setError(`Não foi possível revogar “${d.name}”. Tenta de novo.`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Devices devices={devices} latest={info?.version} onRevoke={revoke} busyId={busy} />
      <Status text={error} error />
    </div>
  );
}

function Maintenance() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ text: await fn() });
    } catch {
      setMsg({ text: "Não foi possível concluir.", error: true });
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
              return `${r.queued} ${r.queued === 1 ? "captura vai" : "capturas vão"} ser reprocessadas. As tuas etiquetas, títulos e notas não mudam.`;
            })
          }
        >
          Reprocessar com a IA
        </Button>
        <Button
          variant="outline"
          isDisabled={busy}
          onPress={() =>
            run(async () => {
              const r = await api.reindex();
              return r.indexed
                ? `Índice reconstruído com ${r.items} ${r.items === 1 ? "captura" : "capturas"}.`
                : `Lista reconstruída (${r.items}), mas a pesquisa não respondeu. Tenta de novo mais tarde.`;
            })
          }
        >
          Reconstruir índice
        </Button>
      </div>
      <Status text={msg?.text ?? null} error={msg?.error} />
    </div>
  );
}

export function SettingsPage() {
  const logout = async () => {
    await api.logout().catch(() => {});
    navigate("/login", { replace: true });
  };
  return (
    <Page title="Definições">
      <Section title="Palavra-passe">
        <PasswordForm />
      </Section>

      <Section title="Categorias" description="Agrupam capturas para lá das etiquetas. Clica num nome para o mudar.">
        <Categories />
      </Section>

      <Section title="Dispositivos" description="Revogar uma extensão obriga-a a entrar outra vez.">
        <DeviceList />
      </Section>

      <Section title="Exportar" description="Um ZIP com todas as imagens e o meta.json de cada captura.">
        <div>
          <a href={API.export} download className={buttonVariants({ variant: "outline" })}>
            Exportar ZIP
          </a>
        </div>
      </Section>

      <Section
        title="IA e pesquisa"
        description="Reprocessar volta a sugerir etiquetas a todas as capturas. Reconstruir o índice relê os ficheiros e refaz a pesquisa."
      >
        <Maintenance />
        <p className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
          A IA corre neste servidor e as imagens não saem dele. Se ligares a IA cloud (<code>AI_CLOUD_URL</code>), uma versão reduzida de cada captura e o
          seu texto são enviados a esse serviço de terceiros para gerar título e descrição.
        </p>
      </Section>

      <Section title="Sessão">
        <div>
          <Button variant="ghost" onPress={logout} className="text-[var(--ink-2)]">
            Sair
          </Button>
        </div>
      </Section>
    </Page>
  );
}
