import { buttonVariants } from "@heroui/styles";
import type { Device, ExtensionInfo } from "@recorte/shared";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Devices } from "../components/Devices";
import { Page, Section } from "../components/Page";
import { useT } from "../i18n";

export function ExtensionPage() {
  const t = useT();
  const [info, setInfo] = useState<ExtensionInfo | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);

  useEffect(() => {
    api.extensionInfo().then(setInfo, () => {});
    api.listDevices().then(setDevices, () => setDevices([]));
  }, []);

  const v = info ? ` ${info.version}` : "";
  const server = window.location.origin;

  return (
    <Page title={t("extension.title")} intro={t("extension.intro")}>
      <Section title={t("extension.download")} description={info ? t("common.version", { version: info.version }) : undefined}>
        <div className="flex flex-wrap gap-3">
          <a href={info?.chromeZip ?? "/downloads/recorte-chrome.zip"} download className={buttonVariants({ variant: "primary" })}>
            {t("extension.downloadChrome", { version: v })}
          </a>
          <a href={info?.firefoxZip ?? "/downloads/recorte-firefox.zip"} download className={buttonVariants({ variant: "outline" })}>
            {t("extension.downloadFirefox", { version: v })}
          </a>
        </div>
      </Section>

      <Section title={t("extension.install")}>
        <div className="grid gap-6 sm:grid-cols-2">
          <ol className="steps">
            <li className="text-white">{t("install.chromeTitle")}</li>
            <li>{t("install.unzip")}</li>
            <li>{t.node("install.chromeOpen", { url: <code>chrome://extensions</code>, devMode: <em>{t("install.devMode")}</em> })}</li>
            <li>{t.node("install.chromeLoad", { loadUnpacked: <em>{t("install.loadUnpacked")}</em> })}</li>
          </ol>
          <ol className="steps">
            <li className="text-white">Firefox</li>
            <li>{t.node("install.firefoxOpen", { url: <code>about:debugging#/runtime/this-firefox</code> })}</li>
            <li>{t.node("install.firefoxLoad", { loadTemporary: <em>{t("install.loadTemporary")}</em> })}</li>
            <li className="text-[var(--ink-3)]">{t("install.firefoxTemporary")}</li>
          </ol>
        </div>
        <p className="text-[13.5px] leading-relaxed text-[var(--ink-3)]">{t.node("extension.optionsHint", { server: <code>{server}</code> })}</p>
      </Section>

      <Section title={t("extension.devices")} description={t("extension.devicesDescription")}>
        <Devices devices={devices} latest={info?.version} />
      </Section>
    </Page>
  );
}
