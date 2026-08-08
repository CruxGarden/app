/**
 * Live smoke test per AI provider (AI-COLLABORATION-PLAN Phase A6).
 *
 * One real streaming call with a tool round-trip per provider that has a key.
 * Run from app/ with keys in the environment:
 *
 *   ANTHROPIC_API_KEY=… OPENAI_API_KEY=… GOOGLE_GENERATIVE_AI_API_KEY=… \
 *     npm run ai:smoke
 *
 * Ollama is probed automatically at localhost:11434 (set OLLAMA_MODEL to
 * choose a model; defaults to the first tool-capable one installed).
 * Providers without keys are skipped. Exits non-zero if any attempted
 * provider fails.
 */
import { streamText, tool, jsonSchema, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const targets = [];

if (process.env.ANTHROPIC_API_KEY) {
  targets.push({
    name: 'anthropic',
    model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })('claude-sonnet-5'),
  });
}
if (process.env.OPENAI_API_KEY) {
  targets.push({
    name: 'openai',
    model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY })('gpt-5.6-terra'),
  });
}
if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  targets.push({
    name: 'google',
    model: createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(
      'gemini-3.6-flash',
    ),
  });
}

// Ollama: include when running locally
try {
  const res = await fetch('http://127.0.0.1:11434/api/tags', {
    signal: AbortSignal.timeout(1500),
  });
  if (res.ok) {
    const { models = [] } = await res.json();
    const names = models.map((m) => m.name).filter(Boolean);
    const pick =
      process.env.OLLAMA_MODEL ??
      names.find((n) => /qwen3|devstral|llama3\.[13]|mistral|gpt-oss/i.test(n)) ??
      names[0];
    if (pick) {
      targets.push({
        name: `ollama (${pick})`,
        model: createOpenAICompatible({
          name: 'ollama',
          baseURL: 'http://127.0.0.1:11434/v1',
        })(pick),
      });
    }
  }
} catch {
  /* not running — skip */
}

if (targets.length === 0) {
  console.log('No providers available — set API keys and/or start Ollama.');
  process.exit(0);
}

let failures = 0;

for (const target of targets) {
  process.stdout.write(`${target.name.padEnd(24)} … `);
  const started = Date.now();
  try {
    let toolCalled = false;
    let streamedText = '';

    const result = streamText({
      model: target.model,
      instructions: 'You are a smoke test. Follow instructions exactly and be terse.',
      messages: [
        {
          role: 'user',
          content: 'Call the echo tool with message "ping", then reply with just the word done.',
        },
      ],
      tools: {
        echo: tool({
          description: 'Echo a message back.',
          inputSchema: jsonSchema({
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
            additionalProperties: false,
          }),
          execute: async ({ message }) => {
            toolCalled = true;
            return `echo: ${message}`;
          },
        }),
      },
      stopWhen: stepCountIs(4),
      maxOutputTokens: 200,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') streamedText += part.text;
      if (part.type === 'error') throw part.error;
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (!toolCalled) throw new Error('tool was never called');
    if (!streamedText.trim()) throw new Error('no text streamed after tool round');
    console.log(`PASS (${elapsed}s) — "${streamedText.trim().slice(0, 40)}"`);
  } catch (err) {
    failures++;
    console.log(`FAIL — ${err?.message ?? err}`);
  }
}

process.exit(failures > 0 ? 1 : 0);
