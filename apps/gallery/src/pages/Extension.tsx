import { buttonVariants } from "@heroui/styles";
import type { Device, ExtensionInfo } from "@recorte/shared";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Devices } from "../components/Devices";
import { Page, Section } from "../components/Page";

export function ExtensionPage() {
  const [info, setInfo] = useState<ExtensionInfo | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);

  useEffect(() => {
    api.extensionInfo().then(setInfo, () => {});
    api.listDevices().then(setDevices, () => setDevices([]));
  }, []);

  const v = info ? ` ${info.version}` : "";
  const server = window.location.origin;

  return (
    <Page title="Extensão" intro="A extensão captura áreas, a parte visível ou a página inteira e envia tudo para este servidor.">
      <Section title="Descarregar" description={info ? `Versão ${info.version}` : undefined}>
        <div className="flex flex-wrap gap-3">
          <a href={info?.chromeZip ?? "/downloads/recorte-chrome.zip"} download className={buttonVariants({ variant: "primary" })}>
            Descarregar para Chrome (ZIP){v}
          </a>
          <a href={info?.firefoxZip ?? "/downloads/recorte-firefox.zip"} download className={buttonVariants({ variant: "outline" })}>
            Descarregar para Firefox (ZIP){v}
          </a>
        </div>
      </Section>

      <Section title="Instalar">
        <div className="grid gap-6 sm:grid-cols-2">
          <ol className="steps">
            <li className="text-white">Chrome, Edge, Brave</li>
            <li>Descompacta o ZIP numa pasta que vais manter.</li>
            <li>
              Abre <code>chrome://extensions</code> e liga o <em>Modo de programador</em>.
            </li>
            <li>
              Carrega em <em>Carregar expandida</em> e escolhe a pasta.
            </li>
          </ol>
          <ol className="steps">
            <li className="text-white">Firefox</li>
            <li>
              Abre <code>about:debugging#/runtime/this-firefox</code>.
            </li>
            <li>
              Carrega em <em>Carregar extra temporário</em> e escolhe o ZIP.
            </li>
            <li className="text-[var(--ink-3)]">
              Um extra temporário sai quando o Firefox fecha; repete este passo depois de reiniciar.
            </li>
          </ol>
        </div>
        <p className="text-[13.5px] leading-relaxed text-[var(--ink-3)]">
          Nas opções da extensão, indica o servidor <code>{server}</code> e a palavra-passe de acesso.
        </p>
      </Section>

      <Section title="Dispositivos ligados" description="Cada navegador com a extensão aparece aqui, com a versão instalada.">
        <Devices devices={devices} latest={info?.version} />
      </Section>
    </Page>
  );
}
