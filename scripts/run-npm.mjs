import { spawnSync } from 'node:child_process';

/** npm supplies its JS entrypoint to lifecycle scripts. Running it with Node
 * avoids trying to execute npm.cmd as a binary on Windows, without a shell. */
export function runNpm(args, options = {}) {
  const entry = process.env.npm_execpath;
  if (!entry) throw new Error('Run this build through npm (for example: npm run build).');
  return spawnSync(process.execPath, [entry, ...args], options);
}
