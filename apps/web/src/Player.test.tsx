import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Player } from './Player';

// jsdom has no audio decoder or canvas. Exercise our native-media fallback.
vi.mock('wavesurfer.js', () => ({ default: { create: () => { throw new Error('Canvas unavailable'); } } }));
const recording = { id: 'a', filename: 'a.wav', duration_seconds: 30, sample_rate: 48000,
  channels: 1, indexed: true, windows: 5, waveform: [0.2, 0.8],
  audio_url: '/api/recordings/a/audio', sha256: 'a' };
const match = { rank: 1, start_seconds: 5, end_seconds: 15, score: 0.6 };

beforeEach(() => {
  const active = new WeakSet<HTMLMediaElement>();
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (this: HTMLMediaElement) {
    return !active.has(this);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    active.add(this);
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    active.delete(this);
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

it('resets derived transport state when a refreshed waveform reinitializes the audio', async () => {
  const view = render(<Player recording={recording} match={null} onClearMatch={() => {}} />);
  const audio = view.container.querySelector('audio')!;
  fireEvent.loadedMetadata(audio);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  act(() => { audio.currentTime = 7; fireEvent.timeUpdate(audio); });
  expect(audio.paused).toBe(false);
  view.rerender(<Player recording={{ ...recording, waveform: [...recording.waveform] }} match={null} onClearMatch={() => {}} />);
  expect(audio.paused).toBe(true);
  expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  expect(screen.getByLabelText('Playback position')).toHaveValue('0');
  fireEvent.loadedMetadata(audio);
  expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
});

it('exposes only the custom transport when waveform rendering is unavailable', () => {
  const view = render(<Player recording={recording} match={null} onClearMatch={() => {}} />);
  expect(view.container.querySelector('audio')!.controls).toBe(false);
  expect(screen.getByText('Waveform unavailable')).toBeInTheDocument();
});

it('resumes, stops, and replays a selected interval through the fallback transport', async () => {
  const view = render(<Player recording={recording} match={null} onClearMatch={() => {}} />);
  const audio = view.container.querySelector('audio')!;
  fireEvent.loadedMetadata(audio);
  view.rerender(<Player recording={recording} match={match} onClearMatch={() => {}} />);
  await screen.findByRole('button', { name: 'Pause' });
  act(() => { audio.currentTime = 9; fireEvent.timeUpdate(audio); });
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(audio.paused).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(audio.currentTime).toBe(9);
  act(() => { audio.currentTime = 15.1; fireEvent.timeUpdate(audio); });
  expect(audio.currentTime).toBe(15);
  expect(audio.paused).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(audio.currentTime).toBe(5);
  act(() => { audio.currentTime = 15.2; fireEvent.timeUpdate(audio); });
  expect(audio.currentTime).toBe(15);
  expect(audio.paused).toBe(true);
});

it('clears interval selection on manual seek and permits full-recording playback afterward', async () => {
  function Harness() {
    const [selected, setSelected] = useState<typeof match | null>(null);
    return <><button onClick={() => setSelected({ ...match })}>Select match</button>
      <Player recording={recording} match={selected} onClearMatch={() => setSelected(null)} /></>;
  }
  const view = render(<Harness />);
  const audio = view.container.querySelector('audio')!;
  fireEvent.loadedMetadata(audio);
  fireEvent.click(screen.getByRole('button', { name: 'Select match' }));
  await screen.findByRole('button', { name: 'Pause' });
  fireEvent.change(screen.getByLabelText('Playback position'), { target: { value: '20' } });
  expect(screen.getByRole('status')).toHaveTextContent('Full recording');
  expect(audio.currentTime).toBe(20);
  expect(audio.paused).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  act(() => { audio.currentTime = 22; fireEvent.timeUpdate(audio); });
  expect(audio.currentTime).toBe(22);
  expect(audio.paused).toBe(false);
});

it('seeks to the exact selected start and stops at the segment end', async () => {
  const view = render(<Player recording={recording} match={null} onClearMatch={() => {}} />);
  const audio = view.container.querySelector('audio')!;
  fireEvent.loadedMetadata(audio);
  view.rerender(<Player recording={recording} match={match} onClearMatch={() => {}} />);
  await waitFor(() => expect(audio.currentTime).toBe(5));
  expect(await screen.findByRole('button', { name: 'Pause' })).toBeEnabled();
  act(() => { audio.currentTime = 15.1; fireEvent.timeUpdate(audio); });
  expect(audio.currentTime).toBe(15);
  expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
});

it('clears a playing segment when the result selection is cleared', async () => {
  const view = render(<Player recording={recording} match={null} onClearMatch={() => {}} />);
  const audio = view.container.querySelector('audio')!;
  fireEvent.loadedMetadata(audio);
  view.rerender(<Player recording={recording} match={match} onClearMatch={() => {}} />);
  await screen.findByRole('button', { name: 'Pause' });
  view.rerender(<Player recording={recording} match={null} onClearMatch={() => {}} />);
  expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
});

it('reports playback failure without claiming the audio is playing', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Playback blocked'));
  const view = render(<Player recording={recording} match={null} onClearMatch={() => {}} />);
  fireEvent.loadedMetadata(view.container.querySelector('audio')!);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Playback blocked');
  expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
});

it('handles repeated end events without repeatedly seeking an already stopped segment', async () => {
  const view = render(<Player recording={recording} match={null} onClearMatch={() => {}} />);
  const audio = view.container.querySelector('audio')!;
  fireEvent.loadedMetadata(audio);
  view.rerender(<Player recording={recording} match={match} onClearMatch={() => {}} />);
  await screen.findByRole('button', { name: 'Pause' });
  act(() => { audio.currentTime = 15.1; fireEvent.timeUpdate(audio); });
  fireEvent.timeUpdate(audio);
  expect(audio.currentTime).toBe(15);
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
});
