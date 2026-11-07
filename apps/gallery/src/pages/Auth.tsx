import { Button } from "@heroui/react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api } from "../api";
import { CropMark } from "../components/icons";
import { inputClass } from "../components/Page";
import { navigate } from "../lib/router";

function AuthCard({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="hero-light flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="fade-in w-full max-w-[380px]">
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
  const [email, setEmail] = useState("");
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
      await api.login({ email, password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Email ou palavra-passe errados." : "Não foi possível entrar. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Entrar" intro="As tuas capturas ficam neste servidor. Entra com a conta do dono.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Palavra-passe" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
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

export function SetupPage() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.setupStatus().then((s) => !s.needsSetup && navigate("/login", { replace: true }), () => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("As palavras-passe não coincidem.");
    setBusy(true);
    setError(null);
    try {
      await api.setup({ token: token.trim(), email, password });
      navigate("/", { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError(
        code === "invalid_setup_token"
          ? "O código de configuração não está certo. Vê-o nos registos do servidor."
          : code === "already_set_up"
            ? "Este servidor já está configurado."
            : code === "invalid_request"
              ? "Confirma o email e usa uma palavra-passe com pelo menos 8 caracteres."
              : "Não foi possível criar a conta.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Configurar" intro="Cria a conta do dono. O código de configuração aparece nos registos do servidor no primeiro arranque.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Código de configuração" required autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        <Field label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Palavra-passe" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Repete a palavra-passe" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="min-h-5 text-[13px] text-[#ff8a8a]" role="alert">
          {error}
        </p>
        <Button type="submit" variant="primary" isDisabled={busy} className="h-11">
          {busy ? "A criar…" : "Criar conta"}
        </Button>
      </form>
    </AuthCard>
  );
}
