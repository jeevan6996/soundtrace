# Data and evaluation gates

## Current evidence

The original synthetic playback fixture contains ten seconds of gated tones
followed by ten seconds of seeded noise. It validates timing, resampling, waveform rendering and actual
CLAP invocation. It does not establish natural-sound retrieval accuracy. No
third-party raw audio is included in this repository.

## First real-data cohort

Before acquisition, freeze a bounded development manifest with source URL,
original recording identity, licence URL, attribution, declared use, byte hash,
duration, sample rate, caption/query provenance and temporal annotation source.
Start with at most 50 recordings and a total acquisition budget below 1 GB.
Unknown or incompatible redistribution terms block inclusion in public demos.

Keep a separate list of source files whose audio can be legally shared for a
recorded/public demo. User-owned uploads are not implicitly permission to retain
or publish them. No automatic web search/downloader is exposed to the agent.

Clotho 2.1's source audio licences are per-file; caption terms are separate.
Clotho-Moment contains synthetic mixtures and should be described as such.
CASTELLA raw recordings may require separate acquisition. Do not infer that a
dataset repository's headline licence clears every component recording.

## Evaluation design

- Keep windows and remixes of the same source recording within one split.
- Use development data for window-size/threshold choices; preserve a separate
  evaluation cohort before comparing temporal refinement methods.
- Report Recall@1/@5 and temporal IoU using timestamped reference intervals.
- For generic clip-caption datasets, report clip retrieval separately; captions
  alone are not event boundary annotations.
- Absence queries require explicit, independently reviewed negatives. Missing
  captions do not prove that a sound is absent.
- Report representative false matches and overlap/noise failures, not only
  successful searches or cherry-picked recordings.
- Measure index time, cold/warm query latency, CPU identity, resident memory and
  actual checkpoint/library versions. A single synthetic smoke test is not a
  latency benchmark or realtime certification.
- CLAP pretraining overlap may be unknown; disclose it. Do not call public
  benchmark results evidence of unseen-source generalisation without checking.

## Promotion

Only after this cohort is available should we compare fixed windows with
multi-scale candidates and temporal refinement, add calibrated abstention or
claim retrieval improvements. An investigator/MCP interface must cite actual
retrieved windows and preserve the same limitations as direct search.

## References

- https://zenodo.org/records/4783391
- https://dcase.community/challenge2026/task-audio-moment-retrieval-from-long-audio
- https://huggingface.co/datasets/lighthouse-emnlp2024/Clotho-Moment
