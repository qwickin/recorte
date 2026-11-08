import { Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
import { api } from "./api";
import { LoginPage, SetupPage } from "./pages/Auth";
import { ExtensionPage } from "./pages/Extension";
import { GalleryPage } from "./pages/Gallery";
import { SettingsPage } from "./pages/Settings";
import { TrashPage } from "./pages/Trash";
import { type MessageKey, useT } from "./i18n";
import { navigate, usePath } from "./lib/router";

const PAGES: Record<string, () => React.JSX.Element> = {
  "/": GalleryPage,
  "/extensao": ExtensionPage,
  "/definicoes": SettingsPage,
  "/lixo": TrashPage,
};

// The URL slugs stay as they were: installed extensions link to /extensao.
const TITLES: Record<string, MessageKey> = {
  "/extensao": "title.extension",
  "/definicoes": "title.settings",
  "/lixo": "title.trash",
  "/login": "title.login",
  "/setup": "title.setup",
};

/** Signed-in pages: first-run goes to /setup, no session goes to /login (the client redirects on 401). */
function Private({ path }: { path: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const s = await api.setupStatus({ signal: ctrl.signal });
        if (s.needsSetup) return navigate("/setup", { replace: true });
        await api.me({ signal: ctrl.signal });
        setReady(true);
      } catch {
        /* 401 already redirected */
      }
    })();
    return () => ctrl.abort();
  }, []);
  if (!ready)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size="sm" color="current" className="text-white/40" />
      </div>
    );
  const P = PAGES[path] ?? NotFound;
  return <P />;
}

function NotFound() {
  const t = useT();
  return (
    <main className="hero-light flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <p className="text-[30px] font-extralight text-white">{t("notFound.title")}</p>
      <a href="/" className="text-[14px] text-[var(--ink-2)] underline decoration-white/30 underline-offset-4" onClick={(e) => (e.preventDefault(), navigate("/"))}>
        {t("notFound.back")}
      </a>
    </main>
  );
}

export default function App() {
  const path = usePath();
  const t = useT();
  const title = TITLES[path];
  useEffect(() => {
    document.title = title ? t(title) : "Recorte";
  }, [title, t]);
  if (path === "/login") return <LoginPage />;
  if (path === "/setup") return <SetupPage />;
  // Leaving /login or /setup mounts this afresh, so the session check runs again.
  return <Private path={path} />;
}
