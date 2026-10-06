// Run before creating a draft release. Never print credential values.
import { appendFileSync, readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const release =
  process.env.GITHUB_EVENT_NAME === 'push' &&
  process.env.GITHUB_REF_TYPE === 'tag' &&
  process.env.GITHUB_REF_NAME?.startsWith('v');
if (release) {
  if (process.env.GITHUB_REF_NAME !== `v${version}`)
    throw new Error(`Release tag must match electron/package.json: v${version}`);
  const required = [
    'MAC_CERT_P12',
    'MAC_CERT_PASSWORD',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length)
    throw new Error(`Release requires signing/notarization inputs: ${missing.join(', ')}`);
}
const outputs = `version=${version}\npublish=${release ? 'always' : 'never'}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputs);
else process.stdout.write(outputs);
