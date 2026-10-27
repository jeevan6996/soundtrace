import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';
import type { Health, Match, Recording, SearchResponse } from './types';

export function useWorkbench() {
  const [health, setHealth] = useState<Health | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, updateQuery] = useState('');
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [selectedMatch, selectMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [operation, setOperation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const searchVersion = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const bootController = useRef<AbortController | null>(null);
  const operationController = useRef<AbortController | null>(null);
  const operationLock = useRef(false);

  const invalidateSearch = useCallback(() => {
    searchVersion.current += 1;
    searchController.current?.abort();
    setResponse(null);
    selectMatch(null);
    setSearching(false);
  }, []);

  const refresh = useCallback(async () => {
    if (operationLock.current) return;
    bootController.current?.abort();
    const controller = new AbortController();
    bootController.current = controller;
    setLoading(true);
    setError(null);
    invalidateSearch();
    try {
      const [status, list] = await Promise.all([api.health(controller.signal), api.recordings(controller.signal)]);
      if (!alive.current || controller.signal.aborted) return;
      setHealth(status);
      setRecordings(list.recordings);
      setSelectedId((id) => list.recordings.some((item) => item.id === id) ? id : list.recordings[0]?.id ?? null);
    } catch (cause) {
      if (alive.current && !controller.signal.aborted) { setHealth(null); setError(errorMessage(cause)); }
    } finally {
      if (alive.current && !controller.signal.aborted) setLoading(false);
    }
  }, [invalidateSearch]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      searchVersion.current += 1;
      bootController.current?.abort();
      searchController.current?.abort();
      operationController.current?.abort();
    };
  }, [refresh]);

  const selected = recordings.find((item) => item.id === selectedId) ?? null;
  const busy = operation !== null;
  const canIndex = Boolean(selected && !selected.indexed && health?.model.ready && !busy && !loading);
  const canSearch = Boolean(selected?.indexed && health?.model.ready && query.trim() && query.trim().length <= 300 && !busy && !loading);

  function selectRecording(id: string) {
    if (id === selectedId) return;
    invalidateSearch();
    setError(null);
    setSelectedId(id);
  }

  function setQuery(value: string) {
    invalidateSearch();
    setError(null);
    updateQuery(value);
  }

  async function search() {
    if (query.trim().length > 300) { setError('Use 300 characters or fewer.'); return; }
    if (!canSearch || !selected || operationLock.current) return;
    invalidateSearch();
    const version = searchVersion.current;
    const controller = new AbortController();
    searchController.current = controller;
    setError(null);
    setSearching(true);
    try {
      const next = await api.search(selected.id, query.trim(), controller.signal);
      if (alive.current && version === searchVersion.current) setResponse(next);
    } catch (cause) {
      if (alive.current && version === searchVersion.current && !controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (alive.current && version === searchVersion.current) setSearching(false);
    }
  }

  async function mutate(name: string, action: (signal: AbortSignal) => Promise<void>) {
    if (operationLock.current || loading) return;
    operationLock.current = true;
    const controller = new AbortController();
    operationController.current = controller;
    setOperation(name);
    setError(null);
    try { await action(controller.signal); }
    catch (cause) {
      if (alive.current && !controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      operationLock.current = false;
      if (alive.current) setOperation(null);
    }
  }

  async function upload(file: File) {
    if (!/\.wav$/i.test(file.name)) { setError('Choose a WAV file.'); return; }
    if (health && file.size > health.limits.max_bytes) { setError('This WAV exceeds the upload size limit.'); return; }
    await mutate('upload', async (signal) => {
      const item = await api.upload(file, signal);
      if (!alive.current || signal.aborted) return;
      invalidateSearch();
      setRecordings((items) => [item, ...items.filter(({ id }) => id !== item.id)]);
      setSelectedId(item.id);
    });
  }

  async function indexRecording() {
    if (!canIndex || !selected) return;
    const id = selected.id;
    await mutate('index', async (signal) => {
      const item = await api.index(id, signal);
      if (!alive.current || signal.aborted) return;
      setRecordings((items) => items.map((previous) => previous.id === id ? item : previous));
      // Loading the provider is lazy; refresh health without blocking the indexed item.
      try {
        const status = await api.health(signal);
        if (alive.current && !signal.aborted) setHealth(status);
      } catch { /* The next explicit refresh can retry health. */ }
    });
  }

  async function deleteRecording(id: string) {
    if (id === selectedId) invalidateSearch();
    await mutate('delete', async (signal) => {
      await api.remove(id, signal);
      if (!alive.current || signal.aborted) return;
      const remaining = recordings.filter((item) => item.id !== id);
      setRecordings(remaining);
      setSelectedId((current) => current === id ? remaining[0]?.id ?? null : current);
    });
  }

  return { health, recordings, selected, query, response, selectedMatch, loading, searching,
    operation, busy, error, canIndex, canSearch, refresh, selectRecording, setQuery, search,
    upload, indexRecording, deleteRecording, selectMatch, dismissError: () => setError(null) };
}
