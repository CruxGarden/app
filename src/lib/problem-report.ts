import type { DesktopInfo } from './platform';
import { GITHUB_APP_URL } from './site';

/**
 * Report a problem (EF04, ADR 0008): nothing is sent by the app. The person
 * opens a GitHub issue in their own browser, prefilled with exactly what is
 * listed here — the app's version and the operating system — and an empty
 * template to write in. No logs, no paths, no content ride along; attaching
 * main.log is the person's own, visible step.
 */
const SYSTEMS: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

type ReportInfo = Pick<DesktopInfo, 'version' | 'platform' | 'arch' | 'packaged'> & {
  osVersion?: string;
};

/** The two lines shared with a report. Deliberately not the logs folder or any path. */
export function problemDetails(info: ReportInfo | null): string[] {
  if (!info) return ['Crux Garden (web)'];
  const system = SYSTEMS[info.platform] ?? info.platform;
  return [
    `Crux Garden ${info.version}${info.packaged ? '' : ' (development build)'}`,
    `${system}${info.osVersion ? ` ${info.osVersion}` : ''} (${info.arch})`,
  ];
}

export function problemTemplate(info: ReportInfo | null): string {
  return [
    '**What happened**',
    '',
    '',
    '**What you expected**',
    '',
    '',
    '**Steps to reproduce**',
    '',
    '1. ',
    '',
    '---',
    ...problemDetails(info),
    '',
  ].join('\n');
}

/** GitHub's new-issue page with the template in the body. */
export function problemIssueUrl(info: ReportInfo | null): string {
  return `${GITHUB_APP_URL}/issues/new?${new URLSearchParams({ body: problemTemplate(info) })}`;
}
