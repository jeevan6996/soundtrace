# First local milestone: 27 October 2026

## Implemented

SoundTrace now has a local FastAPI service and React/TypeScript workbench for
validated WAV upload, frozen CLAP indexing, text-to-audio window retrieval,
waveform inspection, interval playback and JSON evidence export. Audio is
stored in memory, not uploaded to a cloud service. Preparing the model is an
explicit separate download; inference requests load local files only.

The baseline is ten-second overlapping windows, not a trained temporal model.
The service remains single-user and loopback-only, without public hosting or
authentication. This log records local milestone evidence before initial
publication; it is not evidence of a hosted service or a completed research result.

## Model evidence

- Model: `laion/clap-htsat-unfused`, CPU inference.
- Revision: `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`.
- Local libraries: torch 2.14.1, transformers 4.57.6, librosa 0.11.0.
- Original synthetic fixture: ten seconds of gated tones, then ten seconds of
  seeded noise; 16 kHz mono, resampled to 48 kHz for the model.
- SHA-256: `42aecbd43db16d2b33cc4193ea55f814b270ec42312fc825acf81828a64addb8`.
- Three windows were actually embedded. "Electronic beeping" ranked 0-10 s
  first (cosine 0.530); "A steady hissing noise" ranked 10-20 s first (0.511).

These are smoke observations, not retrieval accuracy, calibrated confidence,
realtime performance or evidence of improvement over CLAP. Local generated
reports, uploads and model weights are ignored by Git.

## Verification

Commands run from the repository root unless indicated otherwise:

| Check | Result |
| --- | --- |
| `.venv/bin/pytest` | 68 passed |
| `.venv/bin/ruff check .` | Passed |
| `.venv/bin/ruff format --check .` | Passed |
| `.venv/bin/mypy src` | Passed, six source files |
| `npm run check` in `apps/web` | Passed |
| `npm test -- --run` in `apps/web` | 53 passed |
| `npm run build` in `apps/web` | Passed |
| `npm audit --audit-level=moderate` in `apps/web` | Zero reported vulnerabilities |
| `uv pip check --python .venv/bin/python` with writable cache | 70 compatible packages |
| `python scripts/smoke_model.py` in the project environment | Actual model execution passed |

Independent agent reviews found and prompted fixes for inference lock scope,
upload admission, failed-model readiness, player state reset, fallback controls
and label contrast. Follow-up reviews reported no remaining actionable findings
within those scopes. A separate review of HTTP ranges also passed, including
30 additional byte/header probes. This is review evidence, not a guarantee.

Chrome testing used the production build at desktop 1440 x 900 and mobile
390/320 x 844. Upload, real indexing/search, JSON download, nonzero interval
start, pause/resume and manual seeking were exercised. The waveform canvas was
nonblank, and mobile layouts had no horizontal overflow. Invalid WAV content
produced explicit decode feedback.

Browser QA caught a real integration defect that mocked player tests missed:
without HTTP byte-range support, Chrome reported `seekable: [[0,0]]` and reset
seeks to zero. The new handler was developed against failing range tests. On
retest Chrome reported `[[0,20]]`, and selected playback paused at exactly 10 s.

At this local verification milestone, remote CI had not run. Check the GitHub
Actions page separately for current publication checks. Chrome was tested locally on macOS; Firefox, Safari and mobile
hardware playback are unverified.

## Next milestone

1. Freeze a small legally reviewed real-audio manifest and source-separated
   development/evaluation splits. Do not bulk-download or redistribute unchecked
   recordings.
2. Measure clip retrieval and timestamped localisation separately; establish
   false-match cases, latency and peak-memory baselines.
3. Compare fixed windows against multi-scale retrieval and temporal refinement.
   Add spectrogram inspection and audio-example search after the baseline.
4. Only then expose evidence-preserving read-only MCP tools and evaluate an
   investigator agent against direct search.

The evaluation, model training, MCP tools and agent are not implemented yet.
See [data and evaluation gates](data-and-evaluation.md).
