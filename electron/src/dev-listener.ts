/**
 * Loaded only into the app-launched Node toolchain (NODE_OPTIONS --require).
 * A listening HTTP server reports its actual bound address. This avoids
 * mistaking an unrelated listener's HTTP response for our child's readiness.
 * No Project Folder contents or served responses are modified.
 */
export {};
const http = require('node:http');
const fs = require('node:fs');
const output = process.env.CRUX_PREVIEW_READY_FILE;
const token = process.env.CRUX_PREVIEW_READY_TOKEN;
if (output && token) {
  const original = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event: string, ...args: unknown[]) {
    if (event === 'listening') {
      const address = this.address();
      if (address && typeof address === 'object' && address.address === '127.0.0.1') {
        const temp = `${output}.${process.pid}.tmp`;
        fs.writeFileSync(temp, JSON.stringify({ token, port: address.port, pid: process.pid }));
        fs.renameSync(temp, output);
      }
    }
    return original.call(this, event, ...args);
  };
}
