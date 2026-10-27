import type { Health, Recording, SearchResponse } from './types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
        detail = body.detail;
      }
    } catch { /* A proxy response may not be JSON. */ }
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const itemPath = (id: string) => `/recordings/${encodeURIComponent(id)}`;

export const api = {
  health: (signal?: AbortSignal) => request<Health>('/health', { signal }),
  recordings: (signal?: AbortSignal) => request<{ recordings: Recording[] }>('/recordings', { signal }),
  upload: (file: File, signal?: AbortSignal) => request<Recording>('/recordings', {
    method: 'POST', signal, body: file,
    headers: {
      'Content-Type': 'audio/wav',
      'X-Filename': encodeURIComponent(file.name),
    },
  }),
  index: (id: string, signal?: AbortSignal) => request<Recording>(`${itemPath(id)}/index`, { method: 'POST', signal }),
  remove: (id: string, signal?: AbortSignal) => request<void>(itemPath(id), { method: 'DELETE', signal }),
  search: (id: string, query: string, signal?: AbortSignal) => request<SearchResponse>(`${itemPath(id)}/search`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: 5 }),
  }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof TypeError) return 'Cannot reach the local API. Check the backend connection and retry.';
  return error instanceof Error ? error.message : 'Something went wrong. Please retry.';
}
