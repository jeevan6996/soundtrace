import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkbench } from './useWorkbench';

const recording = (id: string, indexed = true) => ({
  id, filename: `${id}.wav`, duration_seconds: 30, sample_rate: 48000,
  channels: 1, indexed, windows: 5, waveform: [0.2, 0.8],
  audio_url: `/api/recordings/${id}/audio`, sha256: id,
});
const health = { status: 'ok', model: { id: 'clap', ready: true, loaded: false, reason: null },
  limits: { max_bytes: 25000000, max_duration_seconds: 300, max_recordings: 4 } };
const result = { query: 'bell', recording_sha256: 'a', model_id: 'clap', model_revision: 'local',
  latency_ms: 12, matches: [{ rank: 1, start_seconds: 5, end_seconds: 15, score: 0.6 }], limitations: ['Coarse boundaries'] };
let pending: (value: Response) => void;
let requests: { url: string; options?: RequestInit }[];

beforeEach(() => {
  requests = [];
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    requests.push({ url, options });
    if (url.endsWith('/health')) return Promise.resolve(Response.json(health));
    if (url === '/api/recordings') return Promise.resolve(Response.json({ recordings: [recording('a'), recording('b', false)] }));
    if (url.endsWith('/search')) return new Promise<Response>((resolve) => { pending = resolve; });
    if (url.endsWith('/index')) return Promise.resolve(Response.json(recording('b')));
    return Promise.resolve(new Response(null, { status: 204 }));
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function ready() {
  const view = renderHook(useWorkbench);
  await waitFor(() => expect(view.result.current.recordings).toHaveLength(2));
  return view;
}

describe('workbench state', () => {
  it('blocks queries over the backend 300-character limit before sending a request', async () => {
    const { result: hook } = await ready();
    act(() => hook.current.setQuery('x'.repeat(301)));
    expect(hook.current.canSearch).toBe(false);
    await act(() => hook.current.search());
    expect(hook.current.error).toBe('Use 300 characters or fewer.');
    expect(requests.some(({ url }) => url.endsWith('/search'))).toBe(false);
    act(() => hook.current.setQuery('x'.repeat(300)));
    expect(hook.current.canSearch).toBe(true);
  });
  it('indexes an available but not yet loaded model explicitly', async () => {
    const { result: hook } = await ready();
    act(() => hook.current.selectRecording('b'));
    expect(hook.current.canIndex).toBe(true);
    expect(requests.some(({ url }) => url.endsWith('/index'))).toBe(false);
    await act(() => hook.current.indexRecording());
    expect(hook.current.selected?.indexed).toBe(true);
  });
  it('ignores stale search results after changing the recording', async () => {
    const { result: hook } = await ready();
    act(() => hook.current.setQuery('bell'));
    let task: Promise<void>;
    act(() => { task = hook.current.search(); });
    act(() => hook.current.selectRecording('b'));
    await act(async () => { pending(Response.json(result)); await task; });
    expect(hook.current.response).toBeNull();
    expect(hook.current.selectedMatch).toBeNull();
    expect(hook.current.searching).toBe(false);
  });
  it('clears selection and results immediately when the query changes', async () => {
    const { result: hook } = await ready();
    act(() => hook.current.setQuery('bell'));
    let task: Promise<void>;
    act(() => { task = hook.current.search(); });
    await act(async () => { pending(Response.json(result)); await task; });
    act(() => hook.current.selectMatch(result.matches[0]));
    expect(hook.current.selectedMatch?.start_seconds).toBe(5);
    act(() => hook.current.setQuery('rain'));
    expect(hook.current.response).toBeNull();
    expect(hook.current.selectedMatch).toBeNull();
  });
  it('does not show a stale error from a previous query', async () => {
    const { result: hook } = await ready();
    act(() => hook.current.setQuery('bell'));
    let task: Promise<void>;
    act(() => { task = hook.current.search(); });
    act(() => hook.current.setQuery('rain'));
    await act(async () => { pending(Response.json({ detail: 'Old failure' }, { status: 503 })); await task; });
    expect(hook.current.error).toBeNull();
    expect(hook.current.searching).toBe(false);
  });
  it('reports current JSON errors and leaves a retryable state', async () => {
    const { result: hook } = await ready();
    act(() => hook.current.setQuery('bell'));
    let task: Promise<void>;
    act(() => { task = hook.current.search(); });
    await act(async () => { pending(Response.json({ detail: 'Search unavailable' }, { status: 503 })); await task; });
    expect(hook.current.error).toBe('Search unavailable');
    expect(hook.current.searching).toBe(false);
    expect(hook.current.response).toBeNull();
  });
  it('deletes a recording and clears its selected evidence', async () => {
    const { result: hook } = await ready();
    await act(() => hook.current.deleteRecording('a'));
    expect(hook.current.recordings.map(({ id }) => id)).toEqual(['b']);
    expect(hook.current.selected?.id).toBe('b');
    expect(hook.current.selectedMatch).toBeNull();
  });
  it('keeps the newer search when the older response arrives last', async () => {
    const { result: hook } = await ready();
    act(() => hook.current.setQuery('bell'));
    let first: Promise<void>;
    act(() => { first = hook.current.search(); });
    const completeFirst = pending;
    act(() => hook.current.setQuery('rain'));
    let second: Promise<void>;
    act(() => { second = hook.current.search(); });
    await act(async () => { pending(Response.json({ ...result, query: 'rain' })); await second; });
    await act(async () => { completeFirst(Response.json(result)); await first; });
    expect(hook.current.response?.query).toBe('rain');
  });
});
