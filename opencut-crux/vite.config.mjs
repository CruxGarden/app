import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import { fileURLToPath } from "node:url";
const path = (p) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
	base: "./",
	publicDir: "apps/web/public",
	plugins: [react(), tailwindcss(), wasm()],
	resolve: {
		alias: [
			{ find: "next/navigation", replacement: path("./garden/navigation.tsx") },
			{ find: "next/link", replacement: path("./garden/link.tsx") },
			{ find: "next/image", replacement: path("./garden/image.tsx") },
			{ find: "@", replacement: path("./apps/web/src") },
		],
	},
	define: { "process.env.NODE_ENV": JSON.stringify("production") },
	build: { target: "esnext", outDir: "runtime", sourcemap: true },
});
