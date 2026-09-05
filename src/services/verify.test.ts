import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModel } from 'ai';
import {
  buildInspectionText,
  checkFoundMessage,
  inspectWithModel,
  isVisualCrux,
  modelHasVision,
  parseVerdict,
  runCheck,
  type CheckDeps,
  type CheckInput,
} from './verify';

const input: CheckInput = {
  cruxId: 'crux-1',
  prompt: 'Make a landing page with a big heading',
  plan: ['Write index.html', 'Style it'],
  reply: 'Done — the landing page is ready.',
  siteCrux: false,
  vision: true,
};

const shot = { bytes: new Uint8Array([1, 2, 3]), fingerprint: 'sha-shot' };

function verdictModel(text: string): { model: LanguageModel; calls: () => number } {
  const mock = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  return { model: mock as unknown as LanguageModel, calls: () => mock.doGenerateCalls.length };
}

describe('isVisualCrux / modelHasVision', () => {
  it('is visual for a root index.html or an Astro config, not for loose files', () => {
    expect(isVisualCrux([{ meta: { path: 'index.html' } }])).toBe(true);
    expect(isVisualCrux([{ meta: { path: 'astro.config.mjs' } }, { filename: 'x' }])).toBe(true);
    expect(isVisualCrux([{ meta: { path: 'docs/index.html' } }])).toBe(false);
    expect(isVisualCrux([{ meta: { path: 'hello.txt' } }])).toBe(false);
    expect(isVisualCrux([])).toBe(false);
  });

  it('trusts the cloud providers with images and skips local models', () => {
    expect(modelHasVision('claude-sonnet-5')).toBe(true);
    expect(modelHasVision('gpt-5.6-terra')).toBe(true);
    expect(modelHasVision('gemini-3.6-flash')).toBe(true);
    expect(modelHasVision('ollama/llama3')).toBe(false);
  });
});

describe('parseVerdict', () => {
  it('reads the first JSON object out of prose and normalizes it', () => {
    expect(
      parseVerdict('Sure: {"ok": false, "problems": ["Heading missing"], "fix": "Add h1"}'),
    ).toEqual({ ok: false, problems: ['Heading missing'], fix: 'Add h1' });
    expect(parseVerdict('{"ok":true,"problems":[]} trailing')).toEqual({ ok: true, problems: [] });
  });

  it('returns null for no JSON, broken JSON, or no boolean ok', () => {
    expect(parseVerdict('looks fine to me')).toBeNull();
    expect(parseVerdict('{"ok": tru')).toBeNull();
    expect(parseVerdict('{"problems": ["x"]}')).toBeNull();
    expect(parseVerdict(undefined)).toBeNull();
  });

  it('treats "not ok" with nothing named as ok — there is nothing to fix', () => {
    expect(parseVerdict('{"ok": false, "problems": []}')).toEqual({ ok: true, problems: [] });
    expect(parseVerdict('{"ok": false, "problems": ["", "  "]}')).toEqual({
      ok: true,
      problems: [],
    });
  });
});

describe('buildInspectionText / checkFoundMessage', () => {
  it('carries the prompt, plan, reply and build tail', () => {
    const text = buildInspectionText(input, 'warning: unused import\nbuild ok');
    expect(text).toContain('Make a landing page with a big heading');
    expect(text).toContain('1. Write index.html');
    expect(text).toContain('Done — the landing page is ready.');
    expect(text).toContain('build ok');
    expect(text).toMatch(/screenshot .* attached/);
  });

  it('phrases the findings as the check, one line or a list', () => {
    expect(checkFoundMessage(['Heading missing'])).toBe('Check found: Heading missing');
    expect(checkFoundMessage(['A', 'B'], 'Do C')).toBe(
      'Check found: - A\n- B\n\nSuggested fix: Do C',
    );
  });
});

describe('inspectWithModel', () => {
  it('returns the structured verdict the model produced', async () => {
    const { model } = verdictModel('{"ok": false, "problems": ["Heading missing"]}');
    await expect(inspectWithModel(model, shot.bytes, 'text')).resolves.toEqual({
      ok: false,
      problems: ['Heading missing'],
    });
  });

  it('never throws on an unreadable answer — null, so the check falls back to ok', async () => {
    const { model } = verdictModel('I cannot tell.');
    await expect(inspectWithModel(model, shot.bytes, 'text')).resolves.toBeNull();
  });
});

describe('runCheck', () => {
  it('passes when the inspection says ok, keeping the screenshot fingerprint', async () => {
    const deps: CheckDeps = {
      screenshot: async () => shot,
      inspect: async () => ({ ok: true, problems: [] }),
    };
    const out = await runCheck(input, deps);
    expect(out).toMatchObject({ ok: true, problems: [], shotFingerprint: 'sha-shot' });
    expect(out.note).toBeUndefined();
  });

  it('reports the inspection problems and hands the inspection the right text', async () => {
    let seen = '';
    const deps: CheckDeps = {
      screenshot: async () => shot,
      inspect: async (_img, text) => {
        seen = text;
        return { ok: false, problems: ['Heading missing'], fix: 'Add an <h1>' };
      },
    };
    const out = await runCheck(input, deps);
    expect(out).toMatchObject({ ok: false, problems: ['Heading missing'], fix: 'Add an <h1>' });
    expect(seen).toContain('Make a landing page');
  });

  it('a failed build is a problem in itself — no screenshot, no inspection', async () => {
    let inspected = 0;
    const deps: CheckDeps = {
      build: async () => ({ ok: false, log: 'x'.repeat(10) + '\nerror: bad frontmatter' }),
      screenshot: async () => shot,
      inspect: async () => {
        inspected++;
        return { ok: true, problems: [] };
      },
    };
    const out = await runCheck({ ...input, siteCrux: true }, deps);
    expect(out.ok).toBe(false);
    expect(out.problems[0]).toMatch(/^Build failed:/);
    expect(out.problems[0]).toContain('error: bad frontmatter');
    expect(inspected).toBe(0);
  });

  it('a passing build feeds its log to the inspection', async () => {
    let seen = '';
    const deps: CheckDeps = {
      build: async () => ({ ok: true, log: '4 pages built' }),
      screenshot: async () => shot,
      inspect: async (_img, text) => {
        seen = text;
        return { ok: true, problems: [] };
      },
    };
    const out = await runCheck({ ...input, siteCrux: true }, deps);
    expect(out.ok).toBe(true);
    expect(seen).toContain('4 pages built');
  });

  it('skips the inspection without vision or without a screenshot, and says so', async () => {
    let inspected = 0;
    const inspect = async () => {
      inspected++;
      return { ok: false, problems: ['would fail'] };
    };
    const noVision = await runCheck(
      { ...input, vision: false },
      { screenshot: async () => shot, inspect },
    );
    expect(noVision).toMatchObject({ ok: true, problems: [], shotFingerprint: 'sha-shot' });
    expect(noVision.note).toMatch(/no vision/);

    const noShot = await runCheck(input, { screenshot: async () => null, inspect });
    expect(noShot).toMatchObject({ ok: true, problems: [] });
    expect(noShot.note).toMatch(/No preview/);
    expect(inspected).toBe(0);
  });

  it('an unreadable or throwing verdict never blocks — ok with a note', async () => {
    const nullVerdict = await runCheck(input, {
      screenshot: async () => shot,
      inspect: async () => null,
    });
    expect(nullVerdict.ok).toBe(true);
    expect(nullVerdict.note).toMatch(/Verdict unavailable/);

    const thrown = await runCheck(input, {
      screenshot: async () => shot,
      inspect: async () => {
        throw new Error('provider down');
      },
    });
    expect(thrown.ok).toBe(true);
  });

  it('a screenshot failure is a note, not a failure', async () => {
    const out = await runCheck(input, {
      screenshot: async () => {
        throw new Error('capture timed out');
      },
      inspect: async () => ({ ok: false, problems: ['x'] }),
    });
    expect(out.ok).toBe(true);
    expect(out.note).toMatch(/Screenshot failed/);
  });

  it('stops when aborted (Stop on the job card)', async () => {
    const controller = new AbortController();
    const deps: CheckDeps = {
      screenshot: () =>
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
          setTimeout(() => controller.abort(), 5);
        }),
    };
    await expect(runCheck(input, deps, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
