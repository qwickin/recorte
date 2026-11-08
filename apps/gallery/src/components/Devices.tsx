import { Button } from "@heroui/react";
import { compareVersions, type Device } from "@recorte/shared";
import { useFormat, useT } from "../i18n";

type Props = { devices: Device[] | null; latest?: string; onRevoke?: (d: Device) => void; busyId?: string | null };

/** Connected extensions, with the installed version and an "out of date" notice against the current build. */
export function Devices({ devices, latest, onRevoke, busyId }: Props) {
  const t = useT();
  const fmt = useFormat();
  if (devices === null) return <p className="text-[13.5px] text-[var(--ink-3)]">{t("common.loading")}</p>;
  if (!devices.length) return <p className="text-[13.5px] text-[var(--ink-3)]">{t("devices.none")}</p>;
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
                  <span className="badge-outdated" title={t("devices.latest", { version: latest ?? "" })}>
                    {t("devices.outdated")}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[12.5px] text-[var(--ink-3)]">
                {d.extensionVersion ? t("common.version", { version: d.extensionVersion }) : t("devices.unknownVersion")} ·{" "}
                <span title={d.lastSeenAt ? fmt.date(d.lastSeenAt) : undefined}>
                  {d.lastSeenAt ? t("devices.seen", { when: fmt.relative(d.lastSeenAt) }) : t("devices.neverUsed")}
                </span>
                {" · "}
                {t("devices.connected", { when: fmt.relative(d.createdAt) })}
              </p>
            </div>
            {onRevoke && (
              <Button size="sm" variant="danger-soft" isDisabled={busyId === d.id} onPress={() => onRevoke(d)}>
                {t("devices.revoke")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
