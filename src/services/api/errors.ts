import axios from 'axios';
import { NotFoundError, ServiceError } from '../types';

/**
 * Convert an API/network error into the appropriate ServiceError subclass.
 * Only maps 404 → NotFoundError; everything else re-throws with context.
 */
export function toServiceError(err: unknown, fallbackMessage: string): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 404) throw new NotFoundError(fallbackMessage);
    const serverMsg = err.response?.data?.message || err.message;
    throw new ServiceError(`API error (${status || 'network'}): ${serverMsg}`, 'API_ERROR');
  }
  if (err instanceof Error) throw err;
  throw new ServiceError(String(err), 'UNKNOWN');
}
