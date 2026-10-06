import { useAuthStore } from '@/stores/authStore';
import client from './client';
import { captureAuth, assertAuthCurrent, getStoredTokens } from './session';
import { notifyUsageChanged } from '@/lib/usage-events';
export const INCLUDED_MODEL = 'garden-included';
export interface IncludedUsage {
  available: boolean;
  imagesAvailable?: boolean;
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
    /** Absent on an older server. */
    kind?: 'chat' | 'image';
    status: string;
    createdAt: string;
    allowancePercent: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  }[];
  uncertainRequests: number;
  activeRequests: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /**
   * Whether the next request fits, for a conversation of `contextTokens`.
   * `fits` false: requests pause. `fullLengthFits` false: replies are shortened.
   * Absent on an older server.
   */
  nextRequest?: {
    contextTokens: number | null;
    minimumMicrodollars: number;
    fits: boolean;
    fullLengthFits: boolean;
  };
  /** Spend in the 30-day window by Crux and kind; a null cruxId is unattributed. */
  byCrux?: IncludedSpend[];
}
export interface IncludedSpend {
  cruxId: string | null;
  kind: 'chat' | 'image';
  microdollars: number;
  requests: number;
}
/** `contextTokens`: the current conversation's size, so the answer covers the next turn. */
export async function includedUsage(contextTokens?: number | null): Promise<IncludedUsage> {
  const params =
    typeof contextTokens === 'number' && contextTokens > 0
      ? { contextTokens: Math.round(contextTokens) }
      : undefined;
  return (await client.get<IncludedUsage>('/inference/usage', params ? { params } : undefined))
    .data;
}

/** Only a Crux id goes in the attribution header; anything else is dropped. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CRUX_ID_HEADER = 'x-crux-id';
export function cruxIdHeader(cruxId: string | null | undefined): Record<string, string> {
  return cruxId && UUID.test(cruxId) ? { [CRUX_ID_HEADER]: cruxId } : {};
}
/** JWT goes only to our API. Never forward an SDK API key or caller-supplied destination. */
export const includedFetch: typeof fetch = async (_input, init) => {
  const requestId = crypto.randomUUID();
  // The provider passes the Crux this conversation belongs to (languageModelFor);
  // every other caller header is dropped.
  const attribution = cruxIdHeader(new Headers(init?.headers).get(CRUX_ID_HEADER));
  const accountId = useAuthStore.getState().account?.id;
  const context = captureAuth();
  const accountToken = (await getStoredTokens(context)).accessToken;
  if (!accountToken) throw new Error('Sign in to use your included collaborator.');
  const send = (token: string) => {
    assertAuthCurrent(context);
    return fetch(`${context.endpoint}/inference/v1/messages`, {
      redirect: 'error',
      credentials: 'omit',
      method: 'POST',
      body: init?.body,
      signal: init?.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': requestId,
        ...attribution,
      },
    });
  };
  let response = await send(accountToken);
  assertAuthCurrent(context);
  // A rejected JWT never starts inference. Reuse the request ID after the existing
  // API client's deduplicated token refresh; never retry transport/allowance errors.
  if (response.status === 401 && (await getStoredTokens(context)).refreshToken) {
    if (useAuthStore.getState().account?.id !== accountId)
      throw new Error('The connected account changed. Start a new turn.');
    await client.get<IncludedUsage>('/inference/usage', { authContext: context });
    if (useAuthStore.getState().account?.id !== accountId)
      throw new Error('The connected account changed. Start a new turn.');
    const refreshed = (await getStoredTokens(context)).accessToken;
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

/** Included image calls use only the Garden session and never a personal provider key. */
export async function includedImage(
  prompt: string,
  size: string,
  reference?: Blob,
  signal?: AbortSignal,
  cruxId?: string,
) {
  const context = captureAuth();
  const accountId = useAuthStore.getState().account?.id;
  if (!accountId) throw new Error('Sign in to use included images.');
  let image: string | undefined;
  if (reference) {
    if (reference.size > 3_000_000)
      throw new Error('Use a PNG image up to 3 MB for included editing.');
    const bytes = new Uint8Array(await reference.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    image = btoa(binary);
  }
  const requestId = crypto.randomUUID();
  try {
    const response = await client.post<{ image: string; mimeType: string; requestId: string }>(
      '/inference/images',
      { prompt, size, ...(image ? { image } : {}) },
      {
        authContext: context,
        timeout: 310_000,
        signal,
        headers: { 'X-Request-Id': requestId, ...cruxIdHeader(cruxId) },
      },
    );
    assertAuthCurrent(context);
    if (accountId !== useAuthStore.getState().account?.id)
      throw new Error('The account changed. The image has not been added to this Garden.');
    const result = response.data;
    if (
      result.requestId !== requestId ||
      result.mimeType !== 'image/png' ||
      typeof result.image !== 'string' ||
      result.image.length > 4_000_000
    )
      throw new Error('The image service returned an invalid image.');
    const bytes = Uint8Array.from(atob(result.image), (c) => c.charCodeAt(0));
    return { blob: new Blob([bytes], { type: 'image/png' }), requestId };
  } catch (error) {
    const message = (error as { response?: { data?: { message?: unknown } } }).response?.data
      ?.message;
    throw new Error(
      typeof message === 'string'
        ? message
        : error instanceof Error
          ? error.message
          : 'Included images are unavailable. Please try again.',
      { cause: error },
    );
  } finally {
    notifyUsageChanged();
  }
}
