# SoundTrace First Slice Implementation Plan

**Goal:** Run a tested local upload/index/search/playback workflow.
**Spec:** [Design](design.md).

- [x] Add backend tests; observe red for missing ingestion/retrieval contracts.
- [x] Implement bounded WAV validation, exact windows, cosine ranking and store.
- [x] Wire lazy local-only CLAP provider, explicit preparation and API errors.
- [x] Implement frontend with waveform, player, upload/index/search/export and tests.
- [x] Install bounded dependencies and verify model preparation if feasible.
- [x] Run Python/frontend checks and browser upload/playback/error/mobile QA.
- [x] Independent final review; record actual evidence and remaining model/data gates.

Evidence, review corrections and remaining work: [first milestone](progress.md).

No publication is part of this plan. Synthetic tests do not validate semantics.
