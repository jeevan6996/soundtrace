import { useRef, useState } from 'react';
import { Activity, AlertCircle, AudioLines, Check, ChevronRight, Download, FileAudio2, FolderOpen,
  HardDrive, LoaderCircle, Play, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { Player } from './Player';
import { useWorkbench } from './useWorkbench';
import { formatScore, formatTime } from './format';
import { exportEvidence } from './export';
import './styles.css';

export default function App() {
  const work = useWorkbench();
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { health, selected, response } = work;
  const full = Boolean(health && work.recordings.length >= health.limits.max_recordings);
  const uploadDisabled = work.loading || work.busy || full;
  const status = work.loading ? 'Connecting' : !health ? 'API offline' : health.model.ready ? 'Model available' : 'Model unavailable';

  const resultState = work.searching ? 'Searching…' : work.loading ? 'Loading session…' : !selected ? 'No search results'
    : !health?.model.ready ? 'Model unavailable' : !selected.indexed ? 'Recording not indexed'
      : response ? 'No matches returned' : 'No query submitted';

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" aria-label="SoundTrace home"><AudioLines size={25} strokeWidth={1.8} /><span>SoundTrace</span></a>
      <span className="header-divider" />
      <span className="workspace-label">Audio investigation</span>
      <div className={`connection ${!health && !work.loading ? 'unavailable' : ''}`}><span className="status-dot" /><span>Local workspace</span></div>
      <button className="icon-button" title="Refresh session" aria-label="Refresh session" disabled={work.loading || work.busy} onClick={() => void work.refresh()}>
        <RefreshCw size={17} className={work.loading ? 'spin' : ''} />
      </button>
    </header>

    <aside className="sidebar" aria-label="Recordings">
      <div className="rail-heading"><h2>Recordings</h2><span className="count">{work.recordings.length}{health ? ` / ${health.limits.max_recordings}` : ''}</span></div>
      <button className="button primary upload-button" disabled={uploadDisabled} onClick={() => fileInput.current?.click()}>
        {work.operation === 'upload' ? <LoaderCircle size={17} className="spin" /> : <Upload size={17} />}
        {work.operation === 'upload' ? 'Uploading…' : 'Upload WAV'}
      </button>
      <input ref={fileInput} className="sr-only" type="file" accept=".wav,audio/wav,audio/x-wav" aria-label="Upload WAV file" disabled={uploadDisabled}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void work.upload(file); event.target.value = ''; }} />
      <p className="upload-limit">{full ? 'Recording limit reached' : health
        ? `WAV / ${(health.limits.max_bytes / 1000000).toFixed(0)} MB / ${health.limits.max_duration_seconds / 60} min max`
        : 'WAV recordings'}</p>

      <nav className="recording-list" aria-label="Recording list">
        {work.loading && <p className="rail-empty" role="status">Loading recordings…</p>}
        {!work.loading && work.recordings.length === 0 && <div className="rail-empty"><FolderOpen size={22} /><span>No recordings</span></div>}
        {work.recordings.map((item) => <div className={`recording-item ${selected?.id === item.id ? 'active' : ''}`} key={item.id}>
          <button className="recording-select" aria-pressed={selected?.id === item.id} onClick={() => { work.selectRecording(item.id); setDownloadError(null); }}>
            <FileAudio2 size={19} />
            <span className="recording-info"><span className="filename" title={item.filename}>{item.filename}</span>
              <span className="recording-meta"><span className="mono">{formatTime(item.duration_seconds)}</span><span className={item.indexed ? 'indexed' : ''}>{item.indexed ? 'Indexed' : 'Not indexed'}</span></span>
            </span>
          </button>
          <button className="icon-button delete-button" title={`Delete ${item.filename}`} aria-label={`Delete ${item.filename}`} disabled={work.busy || work.loading}
            onClick={() => { if (window.confirm(`Delete "${item.filename}" and its index?`)) void work.deleteRecording(item.id); }}><Trash2 size={15} /></button>
        </div>)}
      </nav>

      <div className="model-status">
        <div className="section-label"><span>Retrieval model</span><Activity size={15} /></div>
        <div className={`model-state ${health && !health.model.ready ? 'unavailable' : ''}`}><span className={`status-dot ${health?.model.ready ? '' : 'muted'}`} />{status}</div>
        {health && <><span className="model-id" title={health.model.id}>{health.model.id}</span><span className="model-loaded">{health.model.loaded ? 'Loaded in memory' : 'Not loaded'}</span></>}
        <div className="local-tag"><HardDrive size={13} /> Local session</div>
      </div>
    </aside>

    <main className="main">
      <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><span>Investigation</span></div>
      <div className="workbench-heading">
        <div className="heading-copy"><span className="section-label">Active recording</span><h1 title={selected?.filename}>{selected?.filename ?? 'Audio investigation'}</h1>
          <div className="metadata">{selected ? <><span className="mono">{formatTime(selected.duration_seconds)}</span><span>{selected.channels === 1 ? '1 channel' : '2 channels'}</span><span>{(selected.sample_rate / 1000).toLocaleString()} kHz</span></> : <span>Local session / {work.recordings.length} recordings</span>}</div>
        </div>
        {selected && <button className={`button ${selected.indexed ? 'quiet' : 'primary'}`} disabled={!work.canIndex} onClick={() => void work.indexRecording()}>
          {work.operation === 'index' ? <LoaderCircle size={16} className="spin" /> : selected.indexed ? <Check size={16} /> : <Activity size={16} />}
          {work.operation === 'index' ? 'Indexing…' : selected.indexed ? 'Indexed' : 'Index recording'}
        </button>}
      </div>

      {work.error && <div className="error-banner" role="alert"><AlertCircle size={18} /><span>{work.error}</span><button className="icon-button" aria-label="Dismiss error" title="Dismiss error" onClick={work.dismissError}><X size={16} /></button></div>}
      {health && !health.model.ready && <div className="model-banner"><AlertCircle size={17} /><div><strong>Model unavailable</strong><span>{health.model.reason || 'Local model is not prepared.'}</span></div></div>}

      {selected ? <Player key={selected.id} recording={selected} match={work.selectedMatch} onClearMatch={() => work.selectMatch(null)} /> : <section className="empty-player" aria-label="Audio player">
        <div className="section-label"><span>Waveform</span><span className="mono">-- Hz / --</span></div>
        <div className="empty-wave"><FileAudio2 size={28} strokeWidth={1.3} /><span>{work.loading ? 'Loading session…' : 'No recording selected'}</span></div>
        <div className="empty-transport"><Play size={17} /><span className="mono">--:-- / --:--</span></div>
      </section>}

      <form className="search-form" onSubmit={(event) => { event.preventDefault(); setDownloadError(null); void work.search(); }}>
        <label htmlFor="query">Sound query</label>
        <div className="query-controls"><div className="query-input"><Search size={19} /><input id="query" type="search" placeholder="Describe a sound…" value={work.query} maxLength={300}
          onChange={(event) => { work.setQuery(event.target.value); setDownloadError(null); }} disabled={!selected || work.loading} autoComplete="off" /></div>
          <button className="button primary" type="submit" disabled={!work.canSearch || work.searching}>{work.searching ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}{work.searching ? 'Searching…' : 'Search'}</button>
        </div>
      </form>

      <section className="results" aria-label="Ranked matches" aria-busy={work.searching}>
        <div className="results-heading"><h2>Matches <span className="count">{response?.matches.length ?? '--'}</span></h2>
          <button className="button quiet" disabled={!response || work.searching} onClick={() => {
            if (!response || !selected) return;
            try { exportEvidence(selected.filename, response); setDownloadError(null); }
            catch { setDownloadError('Evidence could not be downloaded. Retry export.'); }
          }}><Download size={16} />Export JSON</button>
        </div>
        {downloadError && <p role="alert" className="inline-error">{downloadError}</p>}
        <div className="result-columns"><span>Rank</span><span>Time window</span><span>Cosine similarity</span><span className="sr-only">Playback</span></div>
        {response?.matches.length ? <ol className="match-list">{response.matches.map((match) => <li key={match.rank} className={work.selectedMatch?.rank === match.rank ? 'selected' : ''}>
          <span className="rank mono">{String(match.rank).padStart(2, '0')}</span>
          <div className="match-time"><span className="mono">{formatTime(match.start_seconds)} <span className="time-dash">–</span> {formatTime(match.end_seconds)}</span><span className="window-duration">{(match.end_seconds - match.start_seconds).toFixed(1)} s window</span></div>
          <span className="score mono">{formatScore(match.score)}</span>
          <button className="icon-button match-play" title={`Play match ${match.rank}`} aria-label={`Play match ${match.rank}`} aria-pressed={work.selectedMatch?.rank === match.rank}
            onClick={() => work.selectMatch({ ...match })}><Play size={17} fill="currentColor" /></button>
        </li>)}</ol> : <div className="results-empty" role="status">{work.searching ? <LoaderCircle size={24} className="spin" /> : <Search size={25} strokeWidth={1.3} />}<span>{resultState}</span></div>}
        {response && <div className="result-notes">
          <div className="query-summary">“{response.query}”<span className="mono">{response.latency_ms.toFixed(0)} ms</span></div>
          <p>Cosine similarity, not probability. Coarse time windows; event presence is not calibrated.</p>
          {response.limitations.map((note, index) => <p key={index}>{note}</p>)}
          <details><summary>Evidence provenance</summary><dl><dt>Recording SHA-256</dt><dd className="mono">{response.recording_sha256}</dd><dt>Model</dt><dd>{response.model_id}</dd><dt>Revision</dt><dd>{response.model_revision || 'Not reported'}</dd></dl></details>
        </div>}
      </section>
      <footer className="workbench-footer"><span>SoundTrace / Local workspace</span><span>{selected ? `${selected.windows} windows${selected.indexed ? ' / indexed' : ' / not indexed'}` : 'No active recording'}</span></footer>
    </main>
  </div>;
}
