# SoundTrace: Find What You Heard

## Intent

An audio investigation workbench: upload a recording, describe a sound, inspect
ranked time windows, replay them and export the evidence. It searches acoustic
content, not only transcript words. The user approved this direction and asked
to proceed directly with implementation; technical choices below are engineering
decisions, not claims of separately approved product requirements.

## Approaches

1. Frozen CLAP audio/text embeddings with overlapping windows: selected for the
   first measurable local baseline. Temporal boundaries remain coarse.
2. Train a temporal-localisation head: deferred until baseline evaluation and
   licensed timestamped data are available.
3. Large audio-language agent first: deferred; plausible answers are not proof
   of acoustic grounding and would obscure retrieval quality.

## First milestone

- Local-only Python/FastAPI backend and React/TypeScript workbench.
- WAV uploads, bounded to 25 MB and five minutes, one/two channels, validated
  sample rates and finite decoded samples. Maximum four recordings per process.
- SHA-256 recording identity, canonical in-memory metadata and local playback.
- Ten-second windows with five-second hop, plus a final aligned window.
- Optional frozen `laion/clap-htsat-unfused` CPU provider, 48 kHz mono inputs,
  explicit model preparation outside requests; model absence is an honest state.
- Cosine-ranked text search; scores are not probabilities. No calibrated
  absent-event detection or fine temporal-boundary claim.
- Play/pause, seekable real waveform, selected-result playback and JSON export.
- Invalid-input, missing-model, indexing and error states; responsive controls.

## API contract

API routes are under `/api` and proxied by Vite to port 8012. Frontend port 5182.

- `GET /health`: `{status, model:{id,ready,loaded,reason}, limits:{max_bytes,max_duration_seconds,max_recordings}}`.
- `GET /recordings`: `{recordings: Recording[]}`.
- `POST /recordings`: raw WAV body, `X-Filename` header; returns Recording.
- `GET /recordings/{id}/audio`: original validated WAV bytes, with single-byte
  range support for browser seeking; unsupported range sets use full responses.
- `DELETE /recordings/{id}`: 204; releases audio/index state.
- `POST /recordings/{id}/index`: returns updated Recording, no pretend embeddings.
- `POST /recordings/{id}/search`: `{query,top_k:5}`; returns SearchResponse.

Recording: `{id,filename,duration_seconds,sample_rate,channels,indexed,windows,
waveform:number[],audio_url,sha256}`. waveform contains up to 600 real magnitude peaks.

SearchResponse: `{query,recording_sha256,model_id,model_revision,latency_ms,
matches:[{rank,start_seconds,end_seconds,score}],limitations:string[]}`.

Errors: JSON `{detail:string}` with appropriate 4xx/503; no stack traces in UI.
Store/upload is independent of model availability. Index/search disabled when
the provider is unavailable. No automatic network downloads inside a request.

## Data and evaluation

Use user-owned WAV files for upload and a small provenance-reviewed research
cohort for model experiments. Synthetic waveforms test parsing/timing only,
never semantic quality. Do not ship third-party recordings before per-file
redistribution checks. Clotho captions and source audio have different terms.
Clotho-Moment is synthetic; its public card does not replace original-source
licence review. Dataset packaging sizes differ across mirrors: no bulk download.

Next evaluate Recall@K, temporal IoU, false-match behaviour, index/query latency
and memory. Split by original source recording, not overlapping windows or
synthetic remixes of shared source clips. CLAP pretraining overlap is a disclosed
limitation; benchmark scores are not proof of unseen-data generalisation.

## Later milestones

1. Real-data retrieval benchmark and spectrogram inspection.
2. Audio-example search, temporal refinement and measured negative-query policy.
3. Read-only MCP tools for search/inspect/export, then a bounded investigator
   agent evaluated against direct search. No MCP or agent capability is claimed yet.

## Limits

Single-user loopback prototype, not a multi-tenant service. No transcription,
speaker identification, copyrighted-music library, streamed microphone, paid
service, model training, public hosting or performance guarantee in this milestone.
No disk/model downloads beyond a bounded local development setup; retain at
least 10 GB free. No commit, GitHub creation, push or public release implicit.

## Sources checked 27 October 2026

- https://huggingface.co/laion/clap-htsat-unfused (model card, Apache-2.0 listing)
- https://zenodo.org/records/4783391 (Clotho per-file audio and caption terms)
- https://dcase.community/challenge2026/task-audio-moment-retrieval-from-long-audio
- https://huggingface.co/datasets/lighthouse-emnlp2024/Clotho-Moment
