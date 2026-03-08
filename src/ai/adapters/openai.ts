import type { ProviderAdapter, StreamOptions, StreamResponse, ToolUseBlock } from './types';
import type { ContentBlock } from '@/services/types';

/**
 * OpenAI adapter using the openai SDK.
 * Converts between Anthropic-style messages/tools and OpenAI's format.
 */
export class OpenAIAdapter implements ProviderAdapter {
  async stream(opts: StreamOptions): Promise<StreamResponse> {
    const { default: OpenAI } = await import('openai');

    const client = new OpenAI({
      apiKey: opts.apiKey,
      dangerouslyAllowBrowser: true,
    });

    // Convert Anthropic-style tools to OpenAI function calling format
    const tools = opts.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    // Convert Anthropic-style messages to OpenAI format
    const messages = this.convertMessages(opts.systemPrompt, opts.messages);

    const textParts: string[] = [];
    const toolCalls: ToolUseBlock[] = [];
    const fullContent: ContentBlock[] = [];

    // Accumulate tool call arguments (streamed as deltas)
    const pendingToolCalls: Map<
      number,
      { id: string; name: string; args: string }
    > = new Map();

    const stream = await client.chat.completions.create(
      {
        model: opts.model,
        max_completion_tokens: opts.maxTokens ?? 16384,
        messages,
        tools,
        stream: true,
      },
      { signal: opts.signal },
    );

    let finishReason = 'stop';

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const delta = choice.delta;

      // Text content
      if (delta?.content) {
        textParts.push(delta.content);
        opts.onText(delta.content);
      }

      // Tool calls (streamed incrementally)
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!pendingToolCalls.has(tc.index)) {
            pendingToolCalls.set(tc.index, {
              id: tc.id || '',
              name: tc.function?.name || '',
              args: '',
            });
          }
          const pending = pendingToolCalls.get(tc.index)!;
          if (tc.id) pending.id = tc.id;
          if (tc.function?.name) pending.name = tc.function.name;
          if (tc.function?.arguments) pending.args += tc.function.arguments;
        }
      }
    }

    // Finalize tool calls
    for (const pending of pendingToolCalls.values()) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(pending.args);
      } catch {
        // Malformed JSON — leave input empty
      }
      toolCalls.push({ id: pending.id, name: pending.name, input });
      fullContent.push({
        type: 'tool_use',
        id: pending.id,
        name: pending.name,
        input,
      });
    }

    // Add text block if any
    const text = textParts.join('');
    if (text) {
      fullContent.unshift({ type: 'text', text });
    }

    // Map OpenAI finish_reason to our stopReason
    const stopReason = finishReason === 'tool_calls' ? 'tool_use' : 'end_turn';

    return { stopReason, toolCalls, textContent: text, fullContent };
  }

  private convertMessages(
    systemPrompt: string,
    messages: StreamOptions['messages'],
  ): any[] {
    const result: any[] = [{ role: 'system', content: systemPrompt }];

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'user', content: msg.content });
        } else {
          // Content blocks — may contain tool_result blocks
          const toolResults = msg.content.filter(
            (b) => b.type === 'tool_result',
          );
          const textBlocks = msg.content.filter((b) => b.type === 'text');

          // OpenAI expects tool results as separate 'tool' role messages
          for (const tr of toolResults) {
            if (tr.type === 'tool_result') {
              result.push({
                role: 'tool',
                tool_call_id: tr.tool_use_id,
                content: tr.content,
              });
            }
          }
          // Any text blocks become a user message
          if (textBlocks.length > 0) {
            result.push({
              role: 'user',
              content: textBlocks.map((b) => ('text' in b ? b.text : '')).join('\n'),
            });
          }
        }
      } else if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') {
          result.push({ role: 'assistant', content: msg.content });
        } else {
          // Assistant content with tool_use blocks
          const textParts = msg.content
            .filter((b) => b.type === 'text')
            .map((b) => ('text' in b ? b.text : ''));
          const toolUses = msg.content.filter((b) => b.type === 'tool_use');

          const assistantMsg: any = {
            role: 'assistant',
            content: textParts.join('') || null,
          };

          if (toolUses.length > 0) {
            assistantMsg.tool_calls = toolUses.map((tu) => {
              if (tu.type !== 'tool_use') return undefined;
              return {
                id: tu.id,
                type: 'function',
                function: {
                  name: tu.name,
                  arguments: JSON.stringify(tu.input),
                },
              };
            }).filter(Boolean);
          }
          result.push(assistantMsg);
        }
      }
    }

    return result;
  }
}
