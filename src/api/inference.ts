import { useAuthStore } from '@/stores/authStore';
import client, { API_BASE_URL, getStoredTokens } from './client';
import { notifyUsageChanged } from '@/lib/usage-events';
export const INCLUDED_MODEL = 'garden-included';
export interface IncludedUsage {
  available: boolean;
  eligible: boolean;
  planId: string;
  model: string;
  asOf: string;
  windows: {
    durationHours: number;
    limitMicrodollars: number;
    usedMicrodollars: number;
    remainingMicrodollars: number;
    nextReleaseAt: string | null;
  }[];
  requests: number;
  recentRequests: {
    id: string;
    model: string;
    status: string;
    createdAt: string;
    allowancePercent: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  }[];
  uncertainRequests: number;
  activeRequests: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
}
export async function includedUsage(): Promise<IncludedUsage> {
  return (await client.get<IncludedUsage>('/inference/usage')).data;
}
/** JWT goes only to our API. Never forward an SDK API key or caller-supplied destination. */
export const includedFetch: typeof fetch = async (_input, init) => {
  const requestId = crypto.randomUUID();
  const accountId = useAuthStore.getState().account?.id;
  const accountToken = getStoredTokens().accessToken;
  if (!accountToken) throw new Error('Sign in to use your included collaborator.');
  const send = (token: string) =>
    fetch(`${API_BASE_URL}/inference/v1/messages`, {
      method: 'POST',
      body: init?.body,
      signal: init?.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': requestId,
      },
    });
  let response = await send(accountToken);
  // A rejected JWT never starts inference. Reuse the request ID after the existing
  // API client's deduplicated token refresh; never retry transport/allowance errors.
  if (response.status === 401 && getStoredTokens().refreshToken) {
    if (useAuthStore.getState().account?.id !== accountId)
      throw new Error('The connected account changed. Start a new turn.');
    await includedUsage();
    if (useAuthStore.getState().account?.id !== accountId)
      throw new Error('The connected account changed. Start a new turn.');
    const refreshed = getStoredTokens().accessToken;
    if (refreshed) response = await send(refreshed);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(problem?.message) ? problem.message.join(' ') : problem?.message;
    notifyUsageChanged();
    return new Response(
      JSON.stringify({
        type: 'error',
        error: {
          type: 'included_error',
          message: `Included collaboration: ${message || 'request unavailable'}`,
        },
      }),
      { status: response.status, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return response;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          notifyUsageChanged();
        } else controller.enqueue(value);
      } catch (e) {
        controller.error(e);
        notifyUsageChanged();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      notifyUsageChanged();
    },
  });
  return new Response(body, { status: response.status, headers: response.headers });
};
