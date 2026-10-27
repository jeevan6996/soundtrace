"""Frozen, CPU-only CLAP provider; requests never initiate model downloads."""

import json
import os
import re
from pathlib import Path

import numpy as np

MODEL_ID = "laion/clap-htsat-unfused"
ROOT = Path(__file__).resolve().parents[2]


class ClapProvider:
    model_id = MODEL_ID

    def __init__(self):
        self.path = Path(os.environ.get("SOUNDTRACE_MODEL_DIR", ROOT / "data/models/clap"))
        self.loaded = False
        self._model = None
        self._processor = None
        self._failure: str | None = None
        self.revision = "unprepared"
        try:
            manifest = json.loads((self.path / "soundtrace-model.json").read_text())
            revision = manifest.get("revision") if isinstance(manifest, dict) else None
            if isinstance(revision, str) and re.fullmatch(r"[0-9a-f]{40}", revision):
                self.revision = revision
        except (OSError, ValueError):
            pass

    @property
    def ready(self):
        required = ("config.json", "preprocessor_config.json", "tokenizer_config.json")
        try:
            weights = any(
                (self.path / name).is_file() and (self.path / name).stat().st_size > 0
                for name in ("model.safetensors", "pytorch_model.bin")
            )
            return (
                self.revision != "unprepared"
                and self._failure is None
                and weights
                and all(
                    (self.path / name).is_file() and (self.path / name).stat().st_size > 0
                    for name in required
                )
            )
        except OSError:
            return False

    @property
    def reason(self):
        if self._failure:
            return self._failure
        return None if self.ready else "Prepare the local CLAP checkpoint before indexing."

    def _load(self):
        if not self.ready:
            raise RuntimeError(self.reason)
        if self.loaded:
            return
        try:
            import torch
            from transformers import ClapModel, ClapProcessor

            torch.set_num_threads(2)
            self._processor = ClapProcessor.from_pretrained(self.path, local_files_only=True)
            self._model = (
                ClapModel.from_pretrained(self.path, local_files_only=True).eval().to("cpu")
            )
            self.loaded = True
        except Exception:
            self._failure = (
                "Local model loading failed. Re-prepare the checkpoint and restart the API."
            )
            self._model = None
            self._processor = None
            self.loaded = False
            raise

    def audio(self, samples):
        self._load()
        import torch

        model, processor = self._model, self._processor
        if model is None or processor is None:
            raise RuntimeError("The local audio model did not initialise.")
        rows = []
        with torch.inference_mode():
            for start in range(0, len(samples), 2):
                inputs = processor(
                    audio=samples[start : start + 2], sampling_rate=48000, return_tensors="pt"
                )
                rows.append(model.get_audio_features(**inputs).cpu().numpy())
        return np.concatenate(rows)

    def text(self, query):
        self._load()
        import torch

        model, processor = self._model, self._processor
        if model is None or processor is None:
            raise RuntimeError("The local audio model did not initialise.")
        with torch.inference_mode():
            inputs = processor(text=[query], return_tensors="pt", padding=True, truncation=True)
            return model.get_text_features(**inputs).cpu().numpy()[0]
