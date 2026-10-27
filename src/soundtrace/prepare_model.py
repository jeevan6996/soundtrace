"""Explicit one-time checkpoint preparation: python -m soundtrace.prepare_model."""

import json
from pathlib import Path

from soundtrace.model import MODEL_ID, ROOT


def main():
    from huggingface_hub import HfApi, snapshot_download

    revision = HfApi().model_info(MODEL_ID).sha
    target = ROOT / "data/models/clap"
    target.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        MODEL_ID,
        revision=revision,
        local_dir=target,
        allow_patterns=["*.json", "*.txt", "*.bin", "*.safetensors"],
    )
    (target / "soundtrace-model.json").write_text(
        json.dumps({"model_id": MODEL_ID, "revision": revision}, indent=2) + "\n"
    )
    print(f"Prepared {MODEL_ID} at revision {revision} in {Path(target)}")


if __name__ == "__main__":
    main()
