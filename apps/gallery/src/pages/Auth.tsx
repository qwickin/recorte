import { Button } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { API } from "@recorte/shared";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../api";
import { CropMark } from "../components/icons";
import { inputClass } from "../components/Page";
import { ServerSettingsForm } from "../components/ServerSettingsForm";
import { navigate } from "../lib/router";

function AuthCard({ title, intro, children, wide }: { title: string; intro: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className="hero-light flex min-h-dvh items-center justify-center px-4 py-16">
      <div className={`fade-in w-full ${wide ? "max-w-[480px]" : "max-w-[380px]"}`}>
        <div className="mb-10 flex items-center gap-2 text-[17px] font-light text-white">
          <CropMark width={18} height={18} className="text-white/80" /> Recorte
        </div>
        <h1 className="text-[30px] leading-tight font-extralight tracking-[-0.02em] text-white">{title}</h1>
        <p className="mt-2 mb-8 text-[14px] leading-relaxed text-[var(--ink-3)]">{intro}</p>
        {children}
      </div>
    </main>
  );
}

function Field({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-[var(--ink-3)]">
      {label}
      <input {...p} className={inputClass} />
    </label>
  );
}

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.setupStatus().then((s) => s.needsSetup && navigate("/setup", { replace: true }), () => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login({ password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Palavra-passe errada." : "Não foi possível entrar. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Entrar" intro="As tuas capturas ficam neste servidor. Entra com a palavra-passe de acesso.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {/* Hidden username: lets password managers file the password under this server. */}
        <input type="text" name="username" autoComplete="username" value="recorte" readOnly hidden />
        <Field label="Palavra-passe" type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="min-h-5 text-[13px] text-[#ff8a8a]" role="alert">
          {error}
        </p>
        <Button type="submit" variant="primary" isDisabled={busy} className="h-11">
          {busy ? "A entrar…" : "Entrar"}
        </Button>
      </form>
    </AuthCard>
  );
}

const STEPS = ["Palavra-passe", "Servidor", "Extensão"] as const;

function StepDots({ step }: { step: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label={`Passo ${step + 1} de ${STEPS.length}`}>
      {STEPS.map((name, i) => (
        <li key={name} className="flex items-center gap-2">
          <span
            aria-current={i === step ? "step" : undefined}
            className={`flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[11.5px] tabular-nums transition-colors ${
              i === step ? "border-white/70 bg-white text-black" : i < step ? "border-white/30 text-white/80" : "border-white/[0.12] text-white/35"
            }`}
          >
            {i + 1}
          </span>
          <span className={`text-[12.5px] ${i === step ? "text-white" : "text-[var(--ink-3)]"}`}>{name}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-white/15" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function PasswordStep({ onDone, onClosed }: { onDone: () => void; onClosed: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Usa pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As palavras-passe não coincidem.");
    setBusy(true);
    setError(null);
    try {
      await api.setup({ password });
      onDone();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "setup_closed") return onClosed();
      if (code === "already_set_up") return navigate("/login", { replace: true });
      setError(code === "invalid_request" ? "Usa uma palavra-passe com pelo menos 8 caracteres." : "Não foi possível guardar. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input type="text" name="username" autoComplete="username" value="recorte" readOnly hidden />
      <Field label="Palavra-passe de acesso" type="password" autoComplete="new-password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field label="Confirmar palavra-passe" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <p className="text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        Serve para entrar na galeria e para ligar a extensão. Se a esqueceres, repõe-na no servidor com <code>recorte reset-password</code>.
      </p>
      <p className="min-h-5 text-[13px] text-[#ff8a8a]" role="alert">
        {error}
      </p>
      <Button type="submit" variant="primary" isDisabled={busy} className="h-11">
        {busy ? "A guardar…" : "Continuar"}
      </Button>
    </form>
  );
}

function ExtensionStep() {
  const server = window.location.origin;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <a href={API.downloadChrome} download className={buttonVariants({ variant: "primary" })}>
          Chrome (ZIP)
        </a>
        <a href={API.downloadFirefox} download className={buttonVariants({ variant: "outline" })}>
          Firefox (ZIP)
        </a>
      </div>
      <ol className="steps">
        <li className="text-white">Chrome, Edge, Brave</li>
        <li>Descompacta o ZIP numa pasta que vais manter.</li>
        <li>
          Abre <code>chrome://extensions</code>, liga o <em>Modo de programador</em> e carrega em <em>Carregar expandida</em>.
        </li>
      </ol>
      <ol className="steps">
        <li className="text-white">Firefox</li>
        <li>
          Abre <code>about:debugging#/runtime/this-firefox</code> e carrega em <em>Carregar extra temporário</em>.
        </li>
      </ol>
      <p className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
        Na extensão: URL público <code>{server}</code> + palavra-passe.
      </p>
      <Button variant="secondary" className="h-11" onPress={() => navigate("/", { replace: true })}>
        Abrir a galeria
      </Button>
    </div>
  );
}

function SetupClosed() {
  return (
    <div className="flex flex-col gap-4 text-[14px] leading-relaxed text-[var(--ink-2)]" role="alert">
      <p>
        A configuração inicial só fica aberta durante <b className="font-normal text-white">15 minutos</b> depois de o servidor arrancar, e esse tempo
        já passou.
      </p>
      <p>
        Reinicia o container (<code>docker restart recorte</code>, ou o nome que lhe deste) e volta a abrir esta página nos 15 minutos seguintes.
      </p>
    </div>
  );
}

const STEP_TEXT: { title: string; intro: string }[] = [
  { title: "Bem-vindo ao Recorte", intro: "Escolhe a palavra-passe de acesso. É a única coisa de que precisas para entrar." },
  { title: "Servidor", intro: "Confirma o endereço com que abres o Recorte. A IA na cloud é opcional e podes mudá-la depois em Definições." },
  { title: "Extensão", intro: "Instala a extensão no browser para começares a guardar capturas." },
];

export function SetupPage() {
  const [step, setStep] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    api.setupStatus().then(
      (s) => {
        if (!s.needsSetup) return navigate("/login", { replace: true });
        if (!s.open) setClosed(true);
        setStep(0);
      },
      () => setStep(0),
    );
  }, []);

  if (step === null) return <AuthCard title="Configurar" intro="A verificar o servidor…">{null}</AuthCard>;
  if (closed) return <AuthCard title="Configuração fechada" intro="Por segurança, o servidor só aceita a configuração inicial logo depois de arrancar."><SetupClosed /></AuthCard>;

  const t = STEP_TEXT[step]!;
  return (
    <AuthCard title={t.title} intro={t.intro} wide={step > 0}>
      <StepDots step={step} />
      {step === 0 && <PasswordStep onDone={() => setStep(1)} onClosed={() => setClosed(true)} />}
      {step === 1 && (
        <ServerSettingsForm
          prefillOrigin
          submitLabel="Guardar e continuar"
          onSaved={() => setStep(2)}
          extraActions={
            <Button variant="ghost" className="h-11 text-[var(--ink-3)]" onPress={() => setStep(2)}>
              Saltar
            </Button>
          }
        />
      )}
      {step === 2 && <ExtensionStep />}
    </AuthCard>
  );
}
