# SoundTrace web

React 19 / TypeScript investigation workbench. Vite serves on loopback port
5182 with a same-origin `/api` proxy to `http://127.0.0.1:8012`.

```sh
npm install
npm run check
npm test
npm run build
npm run dev
```

No development server is started by the test or build commands.

## Implementation

- Raw WAV uploads with percent-encoded `X-Filename` (decoded by the backend).
- Explicit indexing uses `model.ready`, not `model.loaded`.
- WaveSurfer renders backend-derived peaks against the original WAV media.
  Native audio is retained as a waveform-initialization fallback.
- Segment playback enforces the end with both media time updates and an
  animation-frame check. Playback timing is browser-scheduled, not sample-exact.
- Search changes abort/invalidate in-flight requests. Recording/query changes
  clear results and clip selection. Queries are capped at 300 characters in
  both the input and client request guard.
- JSON export preserves the complete API search response and releases its
  temporary object URL. No audio, model, fonts, or semantic results are bundled.
- The favicon reuses Lucide AudioLines; its ISC notice is embedded in the SVG.

## Verification Evidence

Local checks on 2026-10-27:

- `npm install --no-fund --cache .npm-cache`: installed successfully.
- `npm run check`: passed.
- `npm test`: 29 tests passed across six files.
- `npm run build`: passed.
- `npm audit --cache .npm-cache --audit-level=moderate`: zero vulnerabilities.

Tests were added before their corresponding implementations. Initial scaffold
runs failed because product modules did not yet exist; these were import
failures, not behavioral regression proof. Subsequent behavioral red/green
runs recorded:

- Unicode filename test failed (`caf_.wav` instead of `caf%C3%A9.wav`), then
  passed after using the backend's percent-decoding convention.
- Repeated segment-end test failed (two pause calls instead of one), then
  passed after consuming the segment boundary before seeking to its end.
- Query-limit tests failed (input maximum 1000 and a 301-character query still
  searchable), then passed with the 300-character input and request guards.

Coverage also includes timestamp rounding, negative cosine scores, raw upload
body/headers, 204 deletion, JSON and non-JSON errors, lazy-model indexing,
stale results/errors, out-of-order responses, selection clearing, exact start
and end seeking, playback failure, honest empty/model-unavailable states,
connection errors, and download cleanup on failure.

Browser audio/canvas behavior, desktop/mobile visual inspection, and live API
integration remain parent QA responsibilities. jsdom tests use native-media
and canvas boundary doubles; they do not establish real-browser playback,
semantic retrieval quality, or model benchmark performance. Review here was
self-review only. No backend tests, git operations, publication, or persistent
server startup were performed by this frontend task.
