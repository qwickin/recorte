import { Button } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { API } from "@recorte/shared";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../api";
import { CropMark } from "../components/icons";
import { LanguageSelect } from "../components/LanguageSelect";
import { inputClass } from "../components/Page";
import { ServerSettingsForm } from "../components/ServerSettingsForm";
import { type MessageKey, useT } from "../i18n";
import { navigate } from "../lib/router";

function AuthCard({ title, intro, children, wide }: { title: string; intro: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className="hero-light flex min-h-dvh items-center justify-center px-4 py-16">
      <div className={`fade-in w-full ${wide ? "max-w-[480px]" : "max-w-[380px]"}`}>
        <div className="mb-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[17px] font-light text-white">
            <CropMark width={18} height={18} className="text-white/80" /> Recorte
          </div>
          <LanguageSelect compact />
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
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.setupStatus().then((s) => s.needsSetup && navigate("/setup", { replace: true }), () => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login({ email: email.trim(), password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "login.wrong" : "login.failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t("login.title")} intro={t("login.intro")}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t("common.email")} type="email" name="email" autoComplete="username" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t("common.password")} type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="min-h-5 text-[13px] text-[#ff8a8a]" role="alert">
          {error && t(error)}
        </p>
        <Button type="submit" variant="primary" isDisabled={busy} className="h-11">
          {busy ? t("login.busy") : t("login.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

const STEPS: MessageKey[] = ["setup.stepAccount", "setup.stepServer", "setup.stepExtension"];

function StepDots({ step }: { step: number }) {
  const t = useT();
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-2" aria-label={t("setup.step", { step: step + 1, total: STEPS.length })}>
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
          <span className={`text-[12.5px] ${i === step ? "text-white" : "text-[var(--ink-3)]"}`}>{t(name)}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-white/15" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function AccountStep({ onDone, onClosed }: { onDone: () => void; onClosed: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("setup.invalidEmail");
    if (password.length < 8) return setError("setup.shortPassword");
    if (password !== confirm) return setError("setup.mismatch");
    setBusy(true);
    setError(null);
    try {
      await api.setup({ email: email.trim(), password });
      onDone();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "setup_closed") return onClosed();
      if (code === "already_set_up") return navigate("/login", { replace: true });
      setError(code === "invalid_request" ? "setup.invalidRequest" : "common.saveFailed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t("common.email")} type="email" name="email" autoComplete="username" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label={t("common.password")} type="password" name="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field label={t("setup.confirmPassword")} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <p className="text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        {t.node("setup.accountHelp", { command: <code>recorte reset-password &lt;email&gt;</code> })}
      </p>
      <p className="min-h-5 text-[13px] text-[#ff8a8a]" role="alert">
        {error && t(error)}
      </p>
      <Button type="submit" variant="primary" isDisabled={busy} className="h-11">
        {busy ? t("common.saving") : t("setup.continue")}
      </Button>
    </form>
  );
}

function ExtensionStep() {
  const t = useT();
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
        <li className="text-white">{t("install.chromeTitle")}</li>
        <li>{t("install.unzip")}</li>
        <li>
          {t.node("install.chromeSetupStep", {
            url: <code>chrome://extensions</code>,
            devMode: <em>{t("install.devMode")}</em>,
            loadUnpacked: <em>{t("install.loadUnpacked")}</em>,
          })}
        </li>
      </ol>
      <ol className="steps">
        <li className="text-white">Firefox</li>
        <li>{t.node("install.firefoxSetupStep", { url: <code>about:debugging#/runtime/this-firefox</code>, loadTemporary: <em>{t("install.loadTemporary")}</em> })}</li>
      </ol>
      <p className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[13px] leading-relaxed text-[var(--ink-2)]">
        {t.node("setup.extensionHint", { server: <code>{server}</code> })}
      </p>
      <Button variant="secondary" className="h-11" onPress={() => navigate("/", { replace: true })}>
        {t("setup.openGallery")}
      </Button>
    </div>
  );
}

function SetupClosed() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4 text-[14px] leading-relaxed text-[var(--ink-2)]" role="alert">
      <p>{t.node("setup.closedBody", { minutes: <b className="font-normal text-white">{t("setup.closedMinutes")}</b> })}</p>
      <p>{t.node("setup.closedRestart", { command: <code>docker restart recorte</code> })}</p>
    </div>
  );
}

const STEP_TEXT: { title: MessageKey; intro: MessageKey }[] = [
  { title: "setup.accountTitle", intro: "setup.accountIntro" },
  { title: "setup.serverTitle", intro: "setup.serverIntro" },
  { title: "setup.extensionTitle", intro: "setup.extensionIntro" },
];

export function SetupPage() {
  const t = useT();
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

  if (step === null) return <AuthCard title={t("setup.title")} intro={t("setup.checking")}>{null}</AuthCard>;
  if (closed)
    return (
      <AuthCard title={t("setup.closedTitle")} intro={t("setup.closedIntro")}>
        <SetupClosed />
      </AuthCard>
    );

  const text = STEP_TEXT[step]!;
  return (
    <AuthCard title={t(text.title)} intro={t(text.intro)} wide={step > 0}>
      <StepDots step={step} />
      {step === 0 && <AccountStep onDone={() => setStep(1)} onClosed={() => setClosed(true)} />}
      {step === 1 && (
        <ServerSettingsForm
          prefillOrigin
          submitLabel={t("setup.saveContinue")}
          onSaved={() => setStep(2)}
          extraActions={
            <Button variant="ghost" className="h-11 text-[var(--ink-3)]" onPress={() => setStep(2)}>
              {t("setup.skip")}
            </Button>
          }
        />
      )}
      {step === 2 && <ExtensionStep />}
    </AuthCard>
  );
}
