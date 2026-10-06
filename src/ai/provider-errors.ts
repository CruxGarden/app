import { PROVIDERS, getProviderForModel } from './providers';

/**
 * What a failed provider call means to the person, and what to do next.
 *
 * `message` is the plain sentence the Collaboration shows; `detail` is the
 * provider's own wording, kept short and secondary for whoever needs it. The
 * engine never switches providers or models by itself: every message names
 * the step the person can take.
 */
export interface ProviderFailure {
  kind: 'included' | 'key' | 'billing' | 'model' | 'offline' | 'busy' | 'other';
  message: string;
  detail?: string;
}

interface ErrorShape {
  name?: string;
  message?: string;
  statusCode?: number;
  status?: number;
  responseBody?: unknown;
  data?: unknown;
  lastError?: unknown;
  cause?: unknown;
  code?: string;
}

const DETAIL_LIMIT = 300;

/** The SDK wraps the provider's answer after retries; the last attempt is the one that explains it. */
function unwrap(error: unknown): ErrorShape {
  let e = (error ?? {}) as ErrorShape;
  for (let depth = 0; depth < 4 && e.lastError && typeof e.lastError === 'object'; depth++)
    e = e.lastError as ErrorShape;
  return e;
}

function bodyText(e: ErrorShape): string {
  const parts: string[] = [];
  for (const value of [e.responseBody, e.data]) {
    if (typeof value === 'string') parts.push(value);
    else if (value && typeof value === 'object') {
      try {
        parts.push(JSON.stringify(value));
      } catch {
        // An unserialisable body tells us nothing more than the message does.
      }
    }
  }
  return parts.join(' ');
}

const BILLING =
  /insufficient_quota|billing_not_active|billing_hard_limit|credit balance|exceeded your current quota|payment required|check your plan and billing/i;
const MODEL_MISSING =
  /model_not_found|not_found_error|does not exist|is not found for api version|do not have access to (the )?model|is not supported for generateContent/i;
const OFFLINE =
  /failed to fetch|fetch failed|networkerror|network error|load failed|err_internet_disconnected|err_network|econnrefused|enotfound|eai_again|cannot connect to api/i;

function isOffline(e: ErrorShape, status: number | undefined): boolean {
  if (status !== undefined) return false;
  const cause = (e.cause ?? {}) as ErrorShape;
  const text = `${e.message ?? ''} ${cause.message ?? ''} ${e.code ?? ''} ${cause.code ?? ''}`;
  if (OFFLINE.test(text)) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Classify an SDK/provider error for the model that was asked. */
export function describeProviderError(error: unknown, model?: string): ProviderFailure {
  const e = unwrap(error);
  const raw = e.message || (typeof error === 'string' ? error : '') || String(error ?? '');
  // The included collaborator's route already answers in the person's terms.
  if (raw.includes('Included collaboration:')) return { kind: 'included', message: raw };

  const status = e.statusCode ?? e.status;
  const text = `${raw} ${bodyText(e)}`;
  const providerId = model ? getProviderForModel(model) : undefined;
  const provider = (providerId && PROVIDERS[providerId]?.name) || 'the provider';
  const local = providerId === 'ollama' || providerId === 'lmstudio';
  const detail = raw ? raw.slice(0, DETAIL_LIMIT) : undefined;
  const failure = (kind: ProviderFailure['kind'], message: string): ProviderFailure => ({
    kind,
    message,
    ...(detail && detail !== message ? { detail } : {}),
  });

  // Out of credit arrives as 402, and from some providers as a 429 or 400
  // carrying a quota code — so it is read before "busy".
  if (status === 402 || BILLING.test(text))
    return failure(
      'billing',
      `Your ${provider} account is out of credit or over its quota. Add credit or check billing with ${provider}, or choose another model.`,
    );
  if (status === 401 || status === 403)
    return failure(
      'key',
      `${provider === 'the provider' ? 'The provider' : provider} refused this key. Open Settings to check or replace the key, then try again.`,
    );
  if (status === 404 || MODEL_MISSING.test(text))
    return failure(
      'model',
      local
        ? `${provider} does not have this model on this machine. Choose another model, or download it in ${provider}.`
        : 'This model is not available to your key. Choose another model, or check the key in Settings.',
    );
  if (status === 429 || status === 529 || status === 503)
    return failure('busy', 'The provider is temporarily overloaded. Try again in a moment.');
  if (isOffline(e, status))
    return failure(
      'offline',
      local
        ? `Could not reach ${provider} on this machine. Start it, then try again.`
        : `Could not reach ${provider}. Check your connection, then try again.`,
    );
  return { kind: 'other', message: raw };
}
