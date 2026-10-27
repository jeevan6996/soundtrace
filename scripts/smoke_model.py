"""Exercise the real local model on a synthetic playback fixture, not an accuracy test."""

import json
from importlib.metadata import version
from pathlib import Path
from time import perf_counter

from fastapi.testclient import TestClient

from soundtrace.api import create_app


def main():
    fixture = Path("data/dev/synthetic-playback.wav")
    client = TestClient(create_app())
    response = client.post(
        "/api/recordings",
        content=fixture.read_bytes(),
        headers={"X-Filename": fixture.name},
    )
    response.raise_for_status()
    recording = response.json()
    started = perf_counter()
    indexed = client.post(f"/api/recordings/{recording['id']}/index")
    indexed.raise_for_status()
    seconds = perf_counter() - started
    outputs = []
    for query in ("Electronic beeping", "A steady hissing noise"):
        result = client.post(f"/api/recordings/{recording['id']}/search", json={"query": query})
        result.raise_for_status()
        item = result.json()
        assert all(0 <= m["start_seconds"] < m["end_seconds"] <= 20 for m in item["matches"])
        assert all(-1 <= m["score"] <= 1 for m in item["matches"])
        outputs.append(item)
    report = {
        "scope": "synthetic playback fixture; real model execution, not semantic accuracy",
        "device": "cpu",
        "index_seconds_including_model_load": seconds,
        "indexed_windows": indexed.json()["windows"],
        "versions": {name: version(name) for name in ("torch", "transformers", "librosa")},
        "queries": outputs,
    }
    target = Path("output/model-smoke.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
