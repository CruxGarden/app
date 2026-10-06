import * as path from 'node:path';
import type { ElectronBridge } from './bridge';

/** Profile isolation chooses storage, never privileges. Only a development
 * process with an explicit isolated profile can enable fixtures and mocks.
 * Main passes the resolved public settings to preload; preload never reads env.
 */
export function readLaunchSettings(packaged: boolean, env: NodeJS.ProcessEnv = process.env) {
  const profile = env.CRUX_TEST_PROFILE || undefined;
  if (profile && !path.isAbsolute(profile))
    throw new Error('CRUX_TEST_PROFILE must be an absolute path.');
  const testing = !packaged && !!profile;
  const test = testing ? env : {};
  const quiet = Number(test.CRUX_AUTOBACKUP_QUIET_MS);
  const renderer: Pick<ElectronBridge, 'config' | 'test'> = {
    config: {
      apiUrl: !packaged ? (env.CRUX_API_URL ?? null) : null,
      v2: !packaged && env.CRUX_V2 === '1',
    },
    test: {
      mediaApiBase: test.CRUX_MEDIA_API ?? null,
      aiMock: test.CRUX_AI_MOCK === '1',
      agentMock: test.CRUX_AGENT_MOCK === '1',
      silent: test.CRUX_SILENT === '1',
      ai: test.CRUX_AI === 'on' ? 'on' : test.CRUX_AI === 'off' ? 'off' : null,
      plainTitles: test.CRUX_PLAIN_TITLES === '1',
      autoBackupQuietMs: Number.isFinite(quiet) && quiet > 0 ? quiet : null,
    },
  };
  return {
    testing,
    userData: profile ? path.join(profile, 'userData') : undefined,
    gardenRoot: profile ? path.join(profile, 'garden') : undefined,
    devServer: !packaged ? env.CRUX_DEV_SERVER : undefined,
    fakeMedia: testing && test.CRUX_FAKE_MEDIA === '1',
    selfTest: testing && test.CRUX_SELFTEST === '1',
    // "The last session did not close cleanly" is for installed builds. A
    // development process is killed all day (Ctrl+C, a test's teardown), so it
    // stays quiet there unless a journey asks for it.
    crashNotice: packaged || (testing && test.CRUX_CRASH_NOTICE === '1'),
    // Only an installed build with the person's real profile claims
    // crux-garden:// from the OS (ADR 0085). A development process or any
    // isolated profile (tests, a packaged smoke run from /tmp) must never take
    // over the installed app's registration.
    registerProtocol: packaged && !profile,
    renderer,
  };
}
