# Development

SoundTrace is a work-in-progress personal research/engineering project. Start
with the [design](docs/design.md), [architecture](docs/architecture.md) and
[current evidence](docs/progress.md) before changing scope or reporting results.

## Repository structure

```text
src/soundtrace/        Python API, audio core and model adapter
apps/web/             React/TypeScript interface and frontend tests
tests/                Python core, API and provider tests
scripts/              Original fixture generation and real-model smoke test
docs/                 Architecture, demo, design and evaluation documentation
docs/media/           Actual UI screenshots using original synthetic audio
.github/workflows/    Backend and frontend CI checks
```

`data/`, `output/`, environments, dependencies and build products are ignored.
Do not commit uploads, model weights, secrets or third-party audio whose terms
have not been checked. The frontend is a separate Node package; Python uses the
standard `src` layout with `pyproject.toml` and `uv.lock`.

## Setup

Use Python 3.12, uv and Node.js 24. For deterministic non-model development:

```sh
uv sync --locked --extra dev
source .venv/bin/activate
```

To exercise CLAP, sync with `--extra model` as well and prepare the checkpoint
explicitly using the root README. Do not trigger downloads inside API requests
or ordinary unit tests. For the frontend, run `npm ci` in `apps/web`.

## Required local checks

From the repository root with the environment activated:

```sh
pytest
ruff check .
ruff format --check .
mypy src
```

From `apps/web`:

```sh
npm run check
npm test -- --run
npm run build
```

The GitHub workflow runs these checks without downloading CLAP weights. Run the
real-model smoke separately when changing inference. For player, layout or
transport changes, also test actual browser audio and desktop/mobile rendering;
mocked media tests cannot establish HTTP seekability or real playback.

## Change expectations

- Reproduce regressions and add a failing test before the fix where applicable.
- Trace API contracts and types across client, store, model and export consumers.
- Keep acquisition, inference, presentation and evaluation responsibilities separate.
- Update architecture/demo/status documentation when behaviour or scope changes.
- Record unrun checks and limitations explicitly. Synthetic success is not a
  real-data benchmark; similarity scores are not calibrated probabilities.
- Review the complete final change and keep commits focused. Use signed-off
  commits for this project's contribution workflow.

Real-audio work must follow [the provenance and evaluation gates](docs/data-and-evaluation.md).
