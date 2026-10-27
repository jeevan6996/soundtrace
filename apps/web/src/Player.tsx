import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import { formatTime } from './format';
import type { Match, Recording } from './types';

interface Props {
  recording: Recording;
  match: Match | null;
  onClearMatch: () => void;
}

export function Player({ recording, match, onClearMatch }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const wave = useRef<WaveSurfer | null>(null);
  const endRef = useRef<number | null>(null);
  const previousMatch = useRef<Match | null>(null);
  const playingRef = useRef(false);
  const clearRef = useRef(onClearMatch);
  const playVersion = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [time, setTime] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  clearRef.current = onClearMatch;

  useEffect(() => {
    const audio = audioRef.current!;
    let frame = 0;
    let disposed = false;
    audio.src = recording.audio_url;
    audio.currentTime = 0;
    playingRef.current = false;
    endRef.current = null;
    setPlaying(false);
    setTime(0);
    setReady(false);
    setFallback(false);
    setError(null);
    const update = () => {
      if (endRef.current !== null && audio.currentTime >= endRef.current) {
        const end = endRef.current;
        endRef.current = null;
        audio.pause();
        audio.currentTime = end;
      }
      setTime(audio.currentTime);
    };
    const tick = () => {
      update();
      if (playingRef.current) frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      playingRef.current = true;
      setPlaying(true);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const onPause = () => {
      playingRef.current = false;
      setPlaying(false);
      cancelAnimationFrame(frame);
    };
    const onReady = () => setReady(true);
    const onError = () => {
      onPause();
      setReady(false);
      setError('Audio could not be loaded. Refresh the recordings and retry.');
    };
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onPause);
    audio.addEventListener('loadedmetadata', onReady);
    audio.addEventListener('canplay', onReady);
    audio.addEventListener('error', onError);
    try {
      const instance = WaveSurfer.create({
        container: container.current!, media: audio, url: recording.audio_url,
        peaks: [recording.waveform], duration: recording.duration_seconds,
        height: 144, waveColor: '#a3bcb5', progressColor: '#167967',
        cursorColor: '#c55749', cursorWidth: 2, barWidth: 2, barGap: 2,
        barRadius: 1, normalize: false, dragToSeek: true,
      });
      wave.current = instance;
      instance.on('error', () => { if (!disposed) setFallback(true); });
      instance.on('interaction', () => {
        endRef.current = null;
        clearRef.current();
      });
    } catch { setFallback(true); }

    return () => {
      disposed = true;
      playVersion.current += 1;
      playingRef.current = false;
      cancelAnimationFrame(frame);
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onPause);
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('error', onError);
      audio.pause();
      wave.current?.destroy();
      wave.current = null;
      audio.removeAttribute('src');
      audio.load();
    };
  }, [recording.id, recording.audio_url, recording.duration_seconds, recording.waveform]);

  const playFrom = useCallback(async (start: number, end: number | null) => {
    const audio = audioRef.current!;
    const version = ++playVersion.current;
    endRef.current = end;
    setError(null);
    try {
      audio.currentTime = Math.max(0, Math.min(start, recording.duration_seconds));
      setTime(audio.currentTime);
      await audio.play();
    } catch (cause) {
      if (version !== playVersion.current) return;
      playingRef.current = false;
      setPlaying(false);
      setError(cause instanceof Error ? cause.message : 'Playback could not start.');
    }
  }, [recording.duration_seconds]);

  useEffect(() => {
    if (match) {
      void playFrom(match.start_seconds, Math.min(match.end_seconds, recording.duration_seconds));
    } else if (previousMatch.current) {
      playVersion.current += 1;
      endRef.current = null;
      audioRef.current?.pause();
    }
    previousMatch.current = match;
  }, [match, playFrom, recording.duration_seconds]);

  function toggle() {
    const audio = audioRef.current!;
    if (playing) { playVersion.current += 1; audio.pause(); return; }
    const start = match && (audio.currentTime < match.start_seconds || audio.currentTime >= match.end_seconds)
      ? match.start_seconds : audio.currentTime >= recording.duration_seconds ? 0 : audio.currentTime;
    void playFrom(start, match?.end_seconds ?? null);
  }

  function seek(next: number) {
    endRef.current = null;
    clearRef.current();
    audioRef.current!.currentTime = next;
    setTime(next);
  }

  return <section className="player" aria-label="Audio player">
    <div className="section-label"><span>Waveform</span><span className="mono">{recording.sample_rate.toLocaleString()} Hz / {recording.channels === 1 ? 'Mono' : 'Stereo'}</span></div>
    <div className="wave-stage">
      <div ref={container} className={fallback ? 'waveform is-hidden' : 'waveform'} aria-label="Recording waveform" />
      {fallback && <div className="wave-fallback"><Volume2 size={24} /><span>Waveform unavailable</span></div>}
      {!fallback && match && <div className="segment-highlight" style={{
        left: `${100 * match.start_seconds / recording.duration_seconds}%`,
        width: `${100 * (match.end_seconds - match.start_seconds) / recording.duration_seconds}%`,
      }} />}
    </div>
    <div className="time-ruler mono"><span>00:00.0</span><span>{formatTime(recording.duration_seconds / 2)}</span><span>{formatTime(recording.duration_seconds)}</span></div>
    <audio ref={audioRef} preload="metadata" aria-label="Recording audio" />
    <label className="sr-only" htmlFor="seek">Playback position</label>
    <input id="seek" className="seek" type="range" min="0" max={recording.duration_seconds} step="0.01"
      value={Math.min(time, recording.duration_seconds)} disabled={!ready} onChange={(event) => seek(Number(event.target.value))}
      aria-valuetext={formatTime(time)} />
    <div className="transport">
      <button className="icon-button" title="Return to start" aria-label="Return to start" disabled={!ready} onClick={() => seek(0)}><RotateCcw size={17} /></button>
      <button className="icon-button play-button" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} disabled={!ready} onClick={toggle}>
        {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
      </button>
      <span className="mono transport-time">{formatTime(time)} <span>/ {formatTime(recording.duration_seconds)}</span></span>
      <span className="transport-state" role="status">{!ready ? 'Loading audio…' : match ? `Match ${match.rank} selected` : 'Full recording'}</span>
      <label className="volume" title="Volume"><Volume2 size={17} /><span className="sr-only">Volume</span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => {
        const next = Number(event.target.value); setVolume(next); audioRef.current!.volume = next;
      }} /></label>
    </div>
    {error && <p role="alert" className="inline-error">{error}</p>}
  </section>;
}
