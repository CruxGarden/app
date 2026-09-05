// electron-builder `afterSign` hook.
//
// When no Developer ID certificate is configured (dry runs, local unsigned
// builds) electron-builder skips signing entirely. On Apple silicon that
// produces an app that dies at launch: the main executable carries no Team ID
// while the bundled Electron Framework keeps Electron's signature, and dyld
// refuses to map a framework whose Team ID differs from the process
// ("Library not loaded ... different Team IDs"). An ad-hoc signature over the
// whole bundle makes every Mach-O agree, and Gatekeeper treats the result as an
// ordinary unsigned app (right-click → Open). Real signed builds never reach
// the ad-hoc branch.
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { existsSync } = require('node:fs');

exports.default = async function adHocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const signed =
    !!process.env.CSC_LINK ||
    !!process.env.CSC_NAME ||
    process.env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false';
  if (signed) return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!existsSync(app)) return;
  console.log(`  • ad-hoc signing (no certificate configured)  app=${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
