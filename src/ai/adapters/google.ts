import type { ProviderAdapter, StreamOptions, StreamResponse, ToolUseBlock } from './types';
import type { ContentBlock } from '@/services/types';

/**
 * Google Gemini adapter using @google/genai SDK.
 * Converts between Anthropic-style messages/tools and Gemini's format.
 */
export class GoogleAdapter implements ProviderAdapter {
  async stream(opts: StreamOptions): Promise<StreamResponse> {
    const { GoogleGenAI } = await import('@google/genai');

    const client = new GoogleGenAI({ apiKey: opts.apiKey });

    // Convert tools to Gemini function declarations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type boundary
    const tools: any[] = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: 'OBJECT',
        properties: t.input_schema.properties,
        required: t.input_schema.required,
      },
    }));

    // Convert messages to Gemini format
    const contents = this.convertMessages(opts.messages);

    const textParts: string[] = [];
    const toolCalls: ToolUseBlock[] = [];
    const fullContent: ContentBlock[] = [];

    try {
      const response = await client.models.generateContentStream({
        model: opts.model,
        contents,
        config: {
          systemInstruction: opts.systemPrompt,
          tools: [{ functionDeclarations: tools }],
          maxOutputTokens: opts.maxTokens ?? 16384,
        },
      });

      let toolCallIndex = 0;

      for await (const chunk of response) {
        if (!chunk.candidates?.[0]?.content?.parts) continue;

        for (const part of chunk.candidates[0].content.parts) {
          if (part.text) {
            textParts.push(part.text);
            opts.onText(part.text);
          }

          if (part.functionCall) {
            const id = `toolu_gemini_${Date.now()}_${toolCallIndex++}`;
            const input = (part.functionCall.args || {}) as Record<string, unknown>;
            toolCalls.push({
              id,
              name: part.functionCall.name!,
              input,
            });
            fullContent.push({
              type: 'tool_use',
              id,
              name: part.functionCall.name!,
              input,
            });
          }
        }
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name === 'AbortError') throw e;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HTTP error status
      const status = (e as any).status || (e as any).httpStatusCode;
      if (status === 429 || status === 503) {
        throw Object.assign(new Error('The AI service is temporarily overloaded. Please try again in a moment.'), { status });
      }
      throw e;
    }

    // Add text block
    const text = textParts.join('');
    if (text) {
      fullContent.unshift({ type: 'text', text });
    }

    // Determine stop reason
    const stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';

    return { stopReason, toolCalls, textContent: text, fullContent };
  }

  private convertMessages(
    messages: StreamOptions['messages'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Gemini SDK content format
  ): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Gemini SDK content format
    const result: any[] = [];

    // Build a map of tool_use_id → tool name from all messages
    const toolNameMap = new Map<string, string>();
    for (const msg of messages) {
      if (typeof msg.content !== 'string') {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            toolNameMap.set(block.id!, block.name!);
          }
        }
      }
    }

    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';

      if (typeof msg.content === 'string') {
        result.push({ role, parts: [{ text: msg.content }] });
      } else {
        // Content blocks — handle tool_use, tool_result, and text
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Gemini SDK part format
        const parts: any[] = [];

        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'tool_use') {
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input,
              },
            });
          } else if (block.type === 'tool_result') {
            const name = toolNameMap.get(block.tool_use_id!) || 'unknown';
            parts.push({
              functionResponse: {
                name,
                response: { result: block.content },
              },
            });
          }
        }

        if (parts.length > 0) {
          // Gemini needs tool_use in 'model' role and tool_result in 'user' role
          // Our normalized format already has tool_use in assistant and tool_result in user
          result.push({ role, parts });
        }
      }
    }

    return result;
  }
}
