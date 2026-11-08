import { isLocale, LOCALE_NAMES, LOCALES } from "@recorte/shared";
import { useLocale, useT } from "../i18n";

/**
 * The gallery's language, saved in this browser. "Automatic" follows the browser's languages. Each language is
 * shown in its own name; `compact` is the small one on the sign-in and setup pages.
 */
export function LanguageSelect({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const t = useT();
  const { preference, browser, setPreference } = useLocale();
  return (
    <select
      aria-label={t("language.label")}
      value={preference ?? ""}
      onChange={(e) => setPreference(isLocale(e.target.value) ? e.target.value : null)}
      className={`${compact ? "language-compact" : ""} ${className}`}
    >
      <option value="">{t("language.auto", { language: LOCALE_NAMES[browser] })}</option>
      {LOCALES.map((l) => (
        <option key={l} value={l} lang={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
