#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes('--dev')) env.CRUX_DEV_SERVER = 'http://localhost:8080';
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env });
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
