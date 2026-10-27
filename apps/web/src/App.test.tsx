import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('wavesurfer.js', () => ({ default: { create: () => { throw new Error('No canvas'); } } }));
afterEach(() => vi.unstubAllGlobals());

function serve(available: boolean, withRecording: boolean) {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const fetcher = vi.fn((url: string) => Promise.resolve(Response.json(url.endsWith('/health') ? {
    status: 'ok', model: { id: 'local-clap', ready: available, loaded: false, reason: available ? null : 'Local weights missing' },
    limits: { max_bytes: 25000000, max_duration_seconds: 300, max_recordings: 4 },
  } : { recordings: withRecording ? [{ id: 'a', filename: 'Field.wav', duration_seconds: 30, sample_rate: 48000,
    channels: 1, indexed: false, windows: 5, waveform: [0.1, 0.5], audio_url: '/api/recordings/a/audio', sha256: 'abc' }] : [] })));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('opens directly in a blank workbench without invented recordings or matches', async () => {
  serve(true, false);
  render(<App />);
  expect(screen.getByText('SoundTrace')).toBeInTheDocument();
  expect(await screen.findByText('No recording selected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
  expect(screen.getByLabelText('Upload WAV file')).toBeEnabled();
});

it('keeps upload enabled while the model is unavailable and reports its reason', async () => {
  serve(false, true);
  render(<App />);
  expect(await screen.findByText('Local weights missing')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Index recording' })).toBeDisabled();
  expect(screen.getByLabelText('Upload WAV file')).toBeEnabled();
});

it('offers explicit indexing for ready but unloaded weights without starting it automatically', async () => {
  const fetcher = serve(true, true);
  render(<App />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Index recording' })).toBeEnabled());
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/index'))).toBe(false);
  expect(screen.getByRole('searchbox', { name: 'Sound query' })).toHaveAttribute('maxlength', '300');
});

it('shows a connection failure with a retry control', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the local API');
  expect(screen.getByRole('button', { name: 'Refresh session' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
