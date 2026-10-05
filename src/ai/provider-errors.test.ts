import { describe, expect, it } from 'vitest';
import { describeProviderError } from './provider-errors';

const api = (statusCode: number, message: string, responseBody?: string) =>
  Object.assign(new Error(message), { name: 'AI_APICallError', statusCode, responseBody });

describe('describeProviderError', () => {
  it.each([
    // [name, error, model, kind, what the message must say]
    [
      'an invalid key',
      api(401, 'invalid x-api-key'),
      'claude-opus-5-5',
      'key',
      /Anthropic refused this key\. Open Settings/,
    ],
    [
      'a revoked key',
      api(401, 'Incorrect API key provided'),
      'gpt-6.1-sol',
      'key',
      /OpenAI refused this key/,
    ],
    [
      'a forbidden key',
      api(403, 'permission denied'),
      'gemini-3.8-flash',
      'key',
      /Google Gemini refused this key/,
    ],
    [
      'payment required',
      api(402, 'Payment Required'),
      'claude-opus-5-5',
      'billing',
      /out of credit or over its quota.*choose another model/,
    ],
    [
      "OpenAI's exhausted quota (a 429)",
      api(429, 'You exceeded your current quota', '{"error":{"code":"insufficient_quota"}}'),
      'gpt-6.1-sol',
      'billing',
      /Your OpenAI account is out of credit/,
    ],
    [
      "Anthropic's empty balance (a 400)",
      api(400, 'Your credit balance is too low to access the Anthropic API.'),
      'claude-opus-5-5',
      'billing',
      /check billing with Anthropic/,
    ],
    [
      'a model the key cannot use',
      api(404, 'model: claude-x'),
      'claude-opus-5-5',
      'model',
      /not available to your key\. Choose another model/,
    ],
    [
      'a model_not_found body',
      api(400, 'Bad request', '{"error":{"code":"model_not_found"}}'),
      'gpt-6.1-sol',
      'model',
      /Choose another model/,
    ],
    [
      'a missing local model',
      api(404, 'model "llama3" not found'),
      'ollama/llama3',
      'model',
      /Ollama does not have this model/,
    ],
    [
      'rate limiting',
      api(429, 'rate limited'),
      'claude-opus-5-5',
      'busy',
      /temporarily overloaded/,
    ],
    [
      'an overloaded provider',
      api(529, 'Overloaded'),
      'claude-opus-5-5',
      'busy',
      /Try again in a moment/,
    ],
    ['a 503', api(503, 'unavailable'), 'gpt-6.1-sol', 'busy', /temporarily overloaded/],
    [
      'no network',
      new TypeError('Failed to fetch'),
      'claude-opus-5-5',
      'offline',
      /Could not reach Anthropic\. Check your connection/,
    ],
    [
      'a refused local connection',
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      'ollama/llama3',
      'offline',
      /Could not reach Ollama on this machine\. Start it/,
    ],
  ] as const)('%s', (_name, error, model, kind, says) => {
    const failure = describeProviderError(error, model);
    expect(failure.kind).toBe(kind);
    expect(failure.message).toMatch(says);
    expect(failure.message).not.toMatch(/\bAI\b/);
    // The provider's own words stay available, second to ours.
    expect(failure.detail).toBe((error as Error).message);
  });

  it('reads the last attempt out of a retry wrapper', () => {
    const wrapped = Object.assign(new Error('Failed after 3 attempts. Last error: Overloaded'), {
      name: 'AI_RetryError',
      lastError: api(401, 'invalid x-api-key'),
    });
    expect(describeProviderError(wrapped, 'claude-opus-5-5').kind).toBe('key');
  });

  it('passes the included collaborator and unknown errors through unchanged', () => {
    const included = api(402, 'Included collaboration: this month is used up');
    expect(describeProviderError(included, 'garden-included')).toEqual({
      kind: 'included',
      message: 'Included collaboration: this month is used up',
    });
    expect(describeProviderError(new Error('connection refused'), 'claude-opus-5-5')).toEqual({
      kind: 'other',
      message: 'connection refused',
    });
    expect(describeProviderError('plain words').message).toBe('plain words');
  });

  it('keeps the detail short', () => {
    const failure = describeProviderError(api(401, 'x'.repeat(2000)), 'claude-opus-5-5');
    expect(failure.detail).toHaveLength(300);
  });
});
