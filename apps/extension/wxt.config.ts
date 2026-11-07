import { defineConfig } from "wxt";

/**
 * One generic build for every server: the server URL is configured at runtime in the options page.
 * The version comes from EXTENSION_VERSION (computed from git in CI, Task 8); local builds default to 0.0.0.
 * Chrome builds MV3; Firefox builds MV2 (WXT default) so host permissions are granted at install time.
 */
const version = process.env.EXTENSION_VERSION?.trim() || "0.0.0";
if (!/^\d+(\.\d+){0,3}$/.test(version)) throw new Error(`EXTENSION_VERSION must be numeric (got "${version}")`);

export default defineConfig({
  manifest: ({ browser }) => ({
    name: "Recorte",
    description: "Guarda capturas de ecrã, com texto e etiquetas, no teu servidor Recorte.",
    version,
    permissions: [
      "activeTab",
      "tabs",
      "scripting",
      "storage",
      "unlimitedStorage",
      "contextMenus",
      "notifications",
      "alarms",
    ],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Recorte" },
    commands: {
      "capture-area": { suggested_key: { default: "Alt+Shift+S" }, description: "Capturar área" },
      "capture-visible": { suggested_key: { default: "Alt+Shift+V" }, description: "Capturar parte visível" },
      "capture-full": { suggested_key: { default: "Alt+Shift+F" }, description: "Capturar página inteira" },
    },
    web_accessible_resources: [{ resources: ["fonts/*.woff2"], matches: ["<all_urls>"] }],
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "recorte@recorte.local",
              strict_min_version: "115.0",
              // Data goes only to the user's own server; nothing is collected by the developer.
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
  zip: {
    // Task 8 copies these as-is: .output/recorte-chrome.zip and .output/recorte-firefox.zip
    artifactTemplate: "recorte-{{browser}}.zip",
    zipSources: false,
  },
});
