import type { Dictionaries } from "@recorte/shared";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { ptBR } from "./messages/pt-BR";

export type { MessageKey } from "./messages/en";

/** To add a language: a LOCALES entry in packages/shared/src/i18n/locale.ts, then a messages file here. */
export const DICTIONARIES: Dictionaries<typeof en> = { "en-US": en, "pt-BR": ptBR, es, fr, it };
