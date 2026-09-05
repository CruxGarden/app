/**
 * 5Ws correctness harness (ADR 0016, 5WS-PLAN W0).
 *
 * N entries × the fixed adversarial script; per transcript: no leaked name,
 * alias or most-famous term, no out-of-character refusal, and a judge call
 * for contradictions and false facts. Exits non-zero on any failure. Tests
 * correctness, not fun.
 *
 *   npm run 5ws:harness -- --mock --entries 3           # CI: the scripted mock model
 *   FIVE_WS_MODEL=claude-sonnet-5 ANTHROPIC_API_KEY=… \
 *     npm run 5ws:harness -- --entries 20               # live, any configured provider
 *
 * Flags
 *   --mock                use the e2e mock model (no key, deterministic)
 *   --entries N           how many entries to run (default: all on the shelf)
 *   --seed S              choose the N entries by seed instead of the first N
 *   --shelf PATH          a shelf JSON (default: src/templates/shelves/history.json — the
 *                         starter shelf; src/templates/shelves/things.json is the other;
 *                         falls back to the built-in mock shelf when the default is missing)
 *   --leak-probe          make the mock voice say its name — proves the checker fires (exits 1)
 *   --provider-defaults   send no temperature (for reasoning models that reject it)
 *   --verbose             print every question and answer as they arrive
 *   --json PATH           also write the full report as JSON
 *
 * Environment (live mode)
 *   FIVE_WS_MODEL               model id, as in the app's model picker (default claude-sonnet-5)
 *   ANTHROPIC_API_KEY             Anthropic
 *   OPENAI_API_KEY                OpenAI
 *   GOOGLE_GENERATIVE_AI_API_KEY  Google
 *   OLLAMA_BASE_URL / LMSTUDIO_BASE_URL   local inference (no key), e.g. http://127.0.0.1:11434/v1
 *
 * These are the AI SDK providers' own env names (the same ones scripts/ai-smoke.mjs
 * reads). The app itself keeps keys in the platform secret store, not env.
 *
 * Runs through esbuild (see package.json) so it can share `src/` with the app.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { getProviderForModel, resolveModel } from '../src/ai/providers';
import { getMockLanguageModel } from '../src/ai/mock-model';
import { parseShelf, type Shelf } from '../src/game/shelf';
import {
  harnessFailed,
  renderReportDetails,
  renderReportTable,
  runHarness,
} from '../src/game/harness';
import { MOCK_SHELF } from '../src/game/fixtures/mock-shelf';

// ── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const mock = flag('--mock');
const entries = opt('--entries') ? Number(opt('--entries')) : undefined;
const seed = opt('--seed');
const verbose = flag('--verbose');
const leakProbe = flag('--leak-probe');
const providerDefaults = flag('--provider-defaults');
const jsonOut = opt('--json');
const shelfPath = opt('--shelf') ?? 'src/templates/shelves/history.json';

if (entries !== undefined && (!Number.isInteger(entries) || entries < 1)) {
  console.error('--entries must be a positive integer');
  process.exit(2);
}

// ── Shelf ───────────────────────────────────────────────────────────────────

function loadShelf(): Shelf {
  const abs = resolve(process.cwd(), shelfPath);
  if (existsSync(abs)) return parseShelf(readFileSync(abs, 'utf8'));
  if (opt('--shelf')) {
    console.error(`shelf not found: ${abs}`);
    process.exit(2);
  }
  console.error(`(no shelf at ${shelfPath} — using the built-in mock shelf)`);
  return MOCK_SHELF;
}

// ── Model ───────────────────────────────────────────────────────────────────

function liveModel(): { model: LanguageModel; name: string } {
  const id = resolveModel(process.env.FIVE_WS_MODEL);
  const provider = getProviderForModel(id);
  const need = (env: string): string => {
    const v = process.env[env];
    if (!v) {
      console.error(`${env} is not set (needed for ${id}). Use --mock for the scripted model.`);
      process.exit(2);
    }
    return v;
  };
  switch (provider) {
    case 'openai':
      return { model: createOpenAI({ apiKey: need('OPENAI_API_KEY') })(id), name: id };
    case 'google':
      return {
        model: createGoogleGenerativeAI({ apiKey: need('GOOGLE_GENERATIVE_AI_API_KEY') })(id),
        name: id,
      };
    case 'ollama':
    case 'lmstudio': {
      const baseURL =
        process.env[provider === 'ollama' ? 'OLLAMA_BASE_URL' : 'LMSTUDIO_BASE_URL'] ??
        (provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1');
      const modelName = id.replace(/^(ollama|lmstudio):/, '');
      return {
        model: createOpenAICompatible({ name: provider, baseURL })(modelName),
        name: id,
      };
    }
    default:
      return { model: createAnthropic({ apiKey: need('ANTHROPIC_API_KEY') })(id), name: id };
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

const shelf = loadShelf();
const { model, name } = mock ? { model: getMockLanguageModel(), name: 'mock' } : liveModel();

const report = await runHarness({
  model,
  modelName: name,
  shelf,
  entries,
  seed,
  mock,
  leakProbe,
  providerDefaults,
  log: verbose ? (line) => console.error(line) : undefined,
});

console.log(renderReportTable(report));
const details = renderReportDetails(report);
if (details) console.log(details);
if (jsonOut) {
  writeFileSync(resolve(process.cwd(), jsonOut), JSON.stringify(report, null, 2));
  console.error(`(report written to ${jsonOut})`);
}
process.exit(harnessFailed(report) ? 1 : 0);
