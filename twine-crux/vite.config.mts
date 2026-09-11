import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import packageJson from './package.json';
export default defineConfig({
	base: './',
	build: {outDir: 'runtime', sourcemap: true},
	define: {
		global: 'globalThis',
		'process.env.VITE_APP_NAME': JSON.stringify(packageJson.name),
		'process.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
	},
	plugins: [react()]
});
