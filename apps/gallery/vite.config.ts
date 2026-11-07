import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev only: the server (default :8080) owns /api, /downloads and /auth; in production it also serves this build.
const target = process.env.RECORTE_API ?? "http://localhost:8080";
const proxy = Object.fromEntries(["/api", "/downloads", "/auth"].map((p) => [p, { target, changeOrigin: false }]));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // react-aria imports this CommonJS shim; React 19 ships useSyncExternalStore itself.
    alias: [
      { find: /^use-sync-external-store\/shim(\/index\.js)?$/, replacement: fileURLToPath(new URL("./src/shims/use-sync-external-store-shim.ts", import.meta.url)) },
      // Runtime helpers only (no zod in the bundle); the gallery imports nothing but types from the schemas.
      { find: /^@recorte\/shared$/, replacement: fileURLToPath(new URL("./src/shims/shared-runtime.ts", import.meta.url)) },
    ],
  },
  server: { proxy },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
