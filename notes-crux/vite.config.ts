import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Crux Garden: relative paths so the built app serves from the Crux's runtime/ folder.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: process.env.OUT_DIR || "dist", emptyOutDir: true },
  clearScreen: false,
  // Vitest runs upstream's suites; the Garden edition script has its own node:test file.
  test: { exclude: ["node_modules/**", "scripts/**", "runtime/**", "dist/**"] },
  server: {
    port: 1422,
    strictPort: true,
  },
});
