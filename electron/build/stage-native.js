// Runs for direct electron-builder invocations as well as npm dist scripts.
exports.default = async function stageNative(context) {
  const arch = { 1: 'x64', 3: 'arm64' }[context.arch];
  if (!arch) throw new Error('Unsupported desktop native architecture');
  const { stageBinaries } = await import('../scripts/stage-binaries.mjs');
  stageBinaries(context.electronPlatformName, arch);
};
