import type { Locale } from "./locale";

/**
 * A tiny ICU MessageFormat subset:
 *   "{name}"                                        interpolation
 *   "{count, plural, =0 {none} one {# item} other {# items}}"   plurals (Intl.PluralRules; `#` = the number)
 *   "{kind, select, link {a link} other {a capture}}"           select
 * A plural category the message does not list falls back to `other` (fr/es/it/pt have `many` for 1 000 000).
 */
type Node = string | { k: "var"; name: string } | { k: "hash" } | { k: "plural" | "select"; name: string; options: Record<string, Node[]> };

const cache = new Map<string, Node[]>();

export class MessageSyntaxError extends Error {}

function parse(msg: string): Node[] {
  let cached = cache.get(msg);
  if (cached) return cached;
  let i = 0;
  const fail = (why: string): never => {
    throw new MessageSyntaxError(`${why} at ${i} in "${msg}"`);
  };
  const ws = () => {
    while (i < msg.length && /\s/.test(msg[i]!)) i++;
  };
  const word = (stop: RegExp) => {
    const s = i;
    while (i < msg.length && !stop.test(msg[i]!)) i++;
    return msg.slice(s, i).trim();
  };
  // Reads nodes until an unmatched "}" (inside an option) or the end. `hash`: "#" is the plural number.
  const nodes = (inOption: boolean, hash: boolean): Node[] => {
    const out: Node[] = [];
    let text = "";
    const flush = () => text && (out.push(text), (text = ""));
    while (i < msg.length) {
      const ch = msg[i]!;
      if (ch === "}") {
        if (!inOption) fail("unexpected }");
        break;
      }
      if (ch === "#" && hash) {
        flush();
        out.push({ k: "hash" });
        i++;
        continue;
      }
      if (ch !== "{") {
        text += ch;
        i++;
        continue;
      }
      flush();
      i++;
      const name = word(/[,}]/);
      if (!name) fail("empty argument");
      if (msg[i] === "}") {
        i++;
        out.push({ k: "var", name });
        continue;
      }
      i++; // ","
      const type = word(/[,}]/);
      if (type !== "plural" && type !== "select") fail(`unknown argument type "${type}"`);
      if (msg[i] !== ",") fail("expected ,");
      i++;
      const options: Record<string, Node[]> = {};
      for (;;) {
        ws();
        if (msg[i] === "}") {
          i++;
          break;
        }
        const sel = word(/[\s{]/);
        ws();
        if (!sel || msg[i] !== "{") fail("expected an option");
        i++;
        options[sel] = nodes(true, type === "plural" || hash);
        if (msg[i] !== "}") fail("unclosed option");
        i++;
      }
      if (!options.other) fail(`"${name}" needs an "other" option`);
      out.push({ k: type as "plural" | "select", name, options });
    }
    flush();
    return out;
  };
  cached = nodes(false, false);
  if (i < msg.length) fail("unexpected }");
  cache.set(msg, cached);
  return cached;
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
const numbers = new Map<Locale, Intl.NumberFormat>();
const rulesFor = (l: Locale) => pluralRules.get(l) ?? (pluralRules.set(l, new Intl.PluralRules(l)), pluralRules.get(l)!);
const numberFor = (l: Locale) => numbers.get(l) ?? (numbers.set(l, new Intl.NumberFormat(l)), numbers.get(l)!);

export type Primitive = string | number;

/** Formats into parts: strings, plus any non-primitive value passed in `vars` (e.g. a React element) as is. */
export function formatParts<V = never>(locale: Locale, msg: string, vars: Record<string, Primitive | V> = {}): (string | V)[] {
  const out: (string | V)[] = [];
  const push = (v: string | V) => {
    if (typeof v === "string" && typeof out.at(-1) === "string") out[out.length - 1] += v;
    else if (v !== "") out.push(v);
  };
  const walk = (ns: Node[], n: number | null) => {
    for (const node of ns) {
      if (typeof node === "string") push(node);
      else if (node.k === "hash") push(n === null ? "#" : numberFor(locale).format(n));
      else if (node.k === "var") {
        const v = vars[node.name];
        if (v === undefined) push(`{${node.name}}`);
        else push(typeof v === "number" ? numberFor(locale).format(v) : (v as string | V));
      } else {
        const raw = vars[node.name];
        if (node.k === "plural") {
          const count = typeof raw === "number" ? raw : Number(raw);
          const opt = node.options[`=${count}`] ?? node.options[rulesFor(locale).select(count)] ?? node.options.other!;
          walk(opt, count);
        } else walk(node.options[String(raw)] ?? node.options.other!, n);
      }
    }
  };
  walk(parse(msg), null);
  return out;
}

export function formatMessage(locale: Locale, msg: string, vars?: Record<string, Primitive>): string {
  return formatParts(locale, msg, vars).join("");
}

/** The argument names a message uses (plural/select names included), for dictionary checks. */
export function messageArgs(msg: string): string[] {
  const names = new Set<string>();
  const walk = (ns: Node[]) => {
    for (const n of ns) {
      if (typeof n === "string" || n.k === "hash") continue;
      names.add(n.name);
      if (n.k !== "var") Object.values(n.options).forEach(walk);
    }
  };
  walk(parse(msg));
  return [...names].sort();
}
