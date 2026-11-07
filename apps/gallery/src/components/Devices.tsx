import { Button } from "@heroui/react";
import { compareVersions, type Device } from "@recorte/shared";
import { fullDate, timeAgo } from "../lib/text";

type Props = { devices: Device[] | null; latest?: string; onRevoke?: (d: Device) => void; busyId?: string | null };

/** Connected extensions, with the installed version and an "out of date" notice against the current build. */
export function Devices({ devices, latest, onRevoke, busyId }: Props) {
  if (devices === null) return <p className="text-[13.5px] text-[var(--ink-3)]">A carregar…</p>;
  if (!devices.length) return <p className="text-[13.5px] text-[var(--ink-3)]">Nenhuma extensão ligada ainda.</p>;
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07]">
      {devices.map((d) => {
        const outdated = !!(latest && d.extensionVersion && compareVersions(d.extensionVersion, latest) < 0);
        return (
          <li key={d.id} className="flex items-center gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-[14.5px] text-white">
                {d.name}
                {outdated && (
                  <span className="badge-outdated" title={`A versão atual é ${latest}`}>
                    desatualizada
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">
                {d.extensionVersion ? `Versão ${d.extensionVersion}` : "Versão desconhecida"} ·{" "}
                <span title={d.lastSeenAt ? fullDate(d.lastSeenAt) : undefined}>{d.lastSeenAt ? `vista ${timeAgo(d.lastSeenAt)}` : "nunca usada"}</span>
                {" · "}ligada {timeAgo(d.createdAt)}
              </p>
            </div>
            {onRevoke && (
              <Button size="sm" variant="danger-soft" isDisabled={busyId === d.id} onPress={() => onRevoke(d)}>
                Revogar
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
