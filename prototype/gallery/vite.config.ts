import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const SHOTS = fileURLToPath(new URL("./public/shots/", import.meta.url));

// Minimal stand-in for the server's tag normalisation step (the model sometimes tags UI chrome).
const TAG_STOPLIST = new Set(["botões de ação", "logotipos clientes", "marca stripe", "texto informativo", "pop up", "exemplo", "exemplos", "aberto", "links", "página inicial"]);

/** Adds image URLs to the mock data. In embed mode they are absolute file paths (inlined by the T3 preview). */
function capturesData(embed: boolean): Plugin {
  return {
    name: "captures-data",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/src/data/captures.json")) return;
      const data = JSON.parse(code).map((c: { id: string; tags?: string[] }) => ({
        ...c,
        tags: (c.tags ?? []).map((t) => t.replace(/-/g, " ")).filter((t) => !TAG_STOPLIST.has(t)),
        src: embed ? `${SHOTS}${c.id}-t.webp` : `/shots/${c.id}.webp`,
        thumb: embed ? `${SHOTS}${c.id}-t.webp` : `/shots/${c.id}-t.webp`,
      }));
      return { code: JSON.stringify(data), map: null };
    },
  };
}

// The embed build must stay under 512 KB, so React comes from a CDN through an import map.
const REACT = {
  react: "https://esm.sh/react@19.3.1",
  "react/jsx-runtime": "https://esm.sh/react@19.3.1/jsx-runtime",
  "react-dom": "https://esm.sh/react-dom@19.3.1?deps=react@19.3.1",
  "react-dom/client": "https://esm.sh/react-dom@19.3.1/client?deps=react@19.3.1",
};

function reactFromCdn(): Plugin {
  return {
    name: "react-from-cdn",
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "importmap" }, children: JSON.stringify({ imports: REACT }), injectTo: "head-prepend" },
    ],
  };
}

// `vite build --mode embed` -> dist-embed/index.html, one self-contained file for the inline preview.
export default defineConfig(({ mode }) => {
  const embed = mode === "embed";
  return {
    plugins: [capturesData(embed), react(), tailwindcss(), ...(embed ? [reactFromCdn(), viteSingleFile()] : [])],
    resolve: {
      // react-aria imports this CommonJS shim, which can't `require` an external React.
      alias: [{ find: /^use-sync-external-store\/shim(\/index\.js)?$/, replacement: fileURLToPath(new URL("./src/shims/use-sync-external-store-shim.ts", import.meta.url)) }],
    },
    build: embed ? { outDir: "dist-embed", assetsInlineLimit: 0, copyPublicDir: false, rollupOptions: { external: Object.keys(REACT) } } : undefined,
  };
});
