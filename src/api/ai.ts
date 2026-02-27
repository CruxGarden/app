import { API_BASE_URL, getStoredTokens } from './client';

export interface SSEEvent {
  event: 'text' | 'tool_start' | 'tool_result' | 'done' | 'error';
  data: any;
}

export type SSEHandler = (event: SSEEvent) => void;

export async function streamChat(
  cruxId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  onEvent: SSEHandler,
  model?: string,
  signal?: AbortSignal,
): Promise<void> {
  const tokens = getStoredTokens();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokens.accessToken}`,
    'api-version': '0.0.1',
  };

  const userApiKey = localStorage.getItem('cruxgarden:anthropicApiKey');
  if (userApiKey) {
    headers['X-Anthropic-Key'] = userApiKey;
  }

  const res = await fetch(`${API_BASE_URL}/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ cruxId, messages, model }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI chat failed: ${res.status} ${body}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        try {
          const data = JSON.parse(dataStr);
          onEvent({ event: currentEvent as SSEEvent['event'], data });
        } catch {
          // Skip malformed JSON
        }
        currentEvent = '';
      }
    }
  }
}
