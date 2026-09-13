import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readEdition } from "./scripts/edition.mjs";

// Crux Garden: the Tauri modules resolve to stand-ins that talk to the Garden
// (src/garden), so upstream's App runs unchanged inside a Crux. `--mode edition`
// builds the public edition, with the selected wireframes baked into the page.
const garden = (name: string) => resolve(__dirname, `src/garden/${name}.ts`);

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "moqira-public-edition",
      transformIndexHtml(html) {
        if (mode !== "edition") return html;
        const data = JSON.stringify(readEdition(process.cwd())).replace(/</g, "\\u003c");
        return html.replace("<head>", `<head>\n    <script>window.__MOQIRA_EDITION__ = ${data};</script>`);
      },
    },
  ],
  base: "./",
  clearScreen: false,
  resolve: {
    alias: {
      "@tauri-apps/api/core": garden("tauri-core"),
      "@tauri-apps/api/event": garden("tauri-event"),
      "@tauri-apps/api/window": garden("tauri-window"),
      "@tauri-apps/plugin-dialog": garden("tauri-dialog"),
    },
  },
  build: {
    outDir: process.env.OUT_DIR || "dist",
    emptyOutDir: true,
  },
  server: {
    port: 1421,
    strictPort: true,
  },
}));
