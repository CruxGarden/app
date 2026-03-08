import type { ProviderAdapter, StreamOptions, StreamResponse, ToolUseBlock } from './types';
import type { ContentBlock } from '@/services/types';

/**
 * Anthropic adapter using @anthropic-ai/sdk.
 * The SDK is dynamically imported to avoid loading it when using other providers.
 */
export class AnthropicAdapter implements ProviderAdapter {
  async stream(opts: StreamOptions): Promise<StreamResponse> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');

    const client = new Anthropic({
      apiKey: opts.apiKey,
      dangerouslyAllowBrowser: true,
    });

    const textParts: string[] = [];
    const toolCalls: ToolUseBlock[] = [];
    const fullContent: ContentBlock[] = [];
    let stopReason = 'end_turn';

    const stream = client.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16384,
      system: opts.systemPrompt,
      messages: opts.messages as any, // NormalizedMessage matches Anthropic's MessageParam
      tools: opts.tools as any,
    });

    // Handle abort
    if (opts.signal) {
      opts.signal.addEventListener('abort', () => stream.abort(), { once: true });
    }

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as any;
        if (delta.type === 'text_delta') {
          textParts.push(delta.text);
          opts.onText(delta.text);
        } else if (delta.type === 'input_json_delta') {
          // Tool input is accumulated by the SDK; we handle it in content_block_stop
        }
      } else if (event.type === 'content_block_stop') {
        // Finalize the block
        const snapshot = (stream as any).currentMessage;
        if (snapshot) {
          const block = snapshot.content?.[event.index];
          if (block?.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input,
            });
            fullContent.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
            });
          } else if (block?.type === 'text') {
            fullContent.push({ type: 'text', text: block.text });
          }
        }
      } else if (event.type === 'message_stop') {
        // Capture stop reason from the final message
      }
    }

    // Get the final message for stop reason
    const finalMessage = await stream.finalMessage();
    stopReason = finalMessage.stop_reason || 'end_turn';

    // If fullContent wasn't built from events, reconstruct from final message
    if (fullContent.length === 0 && finalMessage.content) {
      for (const block of finalMessage.content) {
        if (block.type === 'text') {
          fullContent.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          fullContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
          if (!toolCalls.find((tc) => tc.id === block.id)) {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }
      }
    }

    return {
      stopReason,
      toolCalls,
      textContent: textParts.join(''),
      fullContent,
    };
  }
}
