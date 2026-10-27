# Demo walkthrough

## What this demo demonstrates

A working local audio search prototype: natural-language queries retrieve actual
CLAP-ranked candidate intervals, which can be replayed and exported. It does not
demonstrate natural-sound accuracy, a newly trained model or an agent workflow.

The checked-in [desktop](media/desktop.png) and [mobile](media/mobile.png)
screenshots were captured from the production UI with real local model results.
They use an original synthetic fixture so no third-party recording is needed.

## Prepare

Follow the root [setup instructions](../README.md#run-locally). Allow the explicit
model preparation to finish before recording the demo. From the repository root
with the Python environment activated:

```sh
python scripts/make_playback_fixture.py
python scripts/smoke_model.py
```

This generates `data/dev/synthetic-playback.wav`: ten seconds of gated tones,
then ten seconds of seeded noise. The smoke script uses a separate API instance;
upload the fixture in the browser as well. Local data and reports are ignored
by Git. Do not substitute private recordings in screenshots or screen captures.

## Suggested 60-90 second recording

| Step | Action | Evidence to show |
| --- | --- | --- |
| 1 | Upload the generated WAV | Real waveform and 20-second duration |
| 2 | Index the recording | Completed index and available local model |
| 3 | Search `Electronic beeping` | Ranked candidate windows and cosine scores |
| 4 | Play the first match | Playback starts at zero and pauses at ten seconds |
| 5 | Search `A steady hissing noise` | First candidate moves to the second half |
| 6 | Play or seek within the recording | Actual audio and waveform cursor |
| 7 | Export JSON and open provenance | Recording hash, model revision and timestamps |
| 8 | Show the README status | Working prototype; real-data evaluation is next |

The recorded smoke run ranked 0-10 seconds first for beeping and 10-20 seconds
first for hissing. These are observations on synthetic input, not an accuracy
target or a guarantee for arbitrary recordings. Explain cosine scores as relative
similarity, never as confidence percentages.

## Recording checklist

- Keep browser chrome, API health and model state genuine; do not add simulated results.
- Wait for indexing before the timed presentation; disclose any cuts around setup.
- Use system-audio recording if sound is included. Browser automation validated
  playback state, but no narrated video or system-audio capture is included yet.
- Avoid notifications, personal paths, account details and unrelated browser tabs.
- Show one desktop workflow and a short mobile layout view rather than claiming
  mobile hardware compatibility from a resized desktop browser.
- Retain the work-in-progress label until evaluation and deployment gates are met.

## Known limits

WAV only; at most four in-memory recordings; restart clears state. Candidate
windows are coarse. Semantic evaluation, calibrated absence detection, public
hosting, MCP and investigator agents are not yet implemented. See the
[milestone evidence](progress.md) for checks actually run.
