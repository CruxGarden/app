import { describe, expect, it } from 'vitest';
import { problemDetails, problemIssueUrl, problemTemplate } from './problem-report';
import { GITHUB_APP_URL } from './site';

const info = {
  version: '1.2.3',
  electron: '44.4.5',
  platform: 'darwin',
  osVersion: '15.1.0',
  arch: 'arm64',
  packaged: true,
  logsDir: '/Users/someone/Library/Logs/Crux Garden',
  userDataDir: '/Users/someone/Library/Application Support/Crux Garden',
};

describe('report a problem', () => {
  it('shares the app version and the operating system, nothing else', () => {
    expect(problemDetails(info)).toEqual(['Crux Garden 1.2.3', 'macOS 15.1.0 (arm64)']);
    expect(
      problemDetails({ ...info, platform: 'win32', osVersion: undefined, packaged: false }),
    ).toEqual(['Crux Garden 1.2.3 (development build)', 'Windows (arm64)']);
    expect(problemDetails({ ...info, platform: 'freebsd' })[1]).toBe('freebsd 15.1.0 (arm64)');
    expect(problemDetails(null)).toEqual(['Crux Garden (web)']);
  });

  it('builds a GitHub new-issue link whose body is the empty template plus those lines', () => {
    const url = new URL(problemIssueUrl(info));
    expect(`${url.origin}${url.pathname}`).toBe(`${GITHUB_APP_URL}/issues/new`);
    expect([...url.searchParams.keys()]).toEqual(['body']);
    const body = url.searchParams.get('body')!;
    expect(body).toBe(problemTemplate(info));
    expect(body).toContain('**What happened**');
    expect(body).toContain('**Steps to reproduce**');
    expect(body.trimEnd().endsWith('Crux Garden 1.2.3\nmacOS 15.1.0 (arm64)')).toBe(true);
  });

  it('never carries a path, the account name or a log', () => {
    const text = decodeURIComponent(problemIssueUrl(info));
    expect(text).not.toContain('someone');
    expect(text).not.toContain('/Users/');
    expect(text).not.toContain('Logs');
    expect(text).not.toContain('main.log');
    expect(text).not.toContain('44.4.5');
  });
});
