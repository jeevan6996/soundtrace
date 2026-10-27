import json

from soundtrace.model import ClapProvider


def test_partial_checkpoint_is_not_advertised_as_ready(tmp_path, monkeypatch):
    monkeypatch.setenv("SOUNDTRACE_MODEL_DIR", str(tmp_path))
    (tmp_path / "config.json").write_text("{}")
    (tmp_path / "soundtrace-model.json").write_text(json.dumps({"revision": "a" * 40}))
    provider = ClapProvider()
    assert not provider.ready
    assert not provider.loaded
    assert provider.reason


def test_malformed_model_manifest_does_not_crash_startup(tmp_path, monkeypatch):
    monkeypatch.setenv("SOUNDTRACE_MODEL_DIR", str(tmp_path))
    (tmp_path / "soundtrace-model.json").write_text("[]")
    assert not ClapProvider().ready


def test_failed_load_updates_model_readiness(tmp_path, monkeypatch):
    import sys
    from types import SimpleNamespace

    import pytest

    monkeypatch.setenv("SOUNDTRACE_MODEL_DIR", str(tmp_path))
    (tmp_path / "soundtrace-model.json").write_text(json.dumps({"revision": "a" * 40}))
    for name in (
        "config.json",
        "preprocessor_config.json",
        "tokenizer_config.json",
        "pytorch_model.bin",
    ):
        (tmp_path / name).write_text("not a valid checkpoint")

    class BrokenProcessor:
        @classmethod
        def from_pretrained(cls, *args, **kwargs):
            raise ValueError("invalid model configuration")

    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(set_num_threads=lambda _: None))
    monkeypatch.setitem(
        sys.modules,
        "transformers",
        SimpleNamespace(ClapProcessor=BrokenProcessor, ClapModel=object),
    )
    provider = ClapProvider()
    assert provider.ready
    with pytest.raises((ValueError, RuntimeError)):
        provider._load()
    assert not provider.ready
    assert provider.reason and "failed" in provider.reason.lower()


def test_empty_checkpoint_files_are_not_ready(tmp_path, monkeypatch):
    monkeypatch.setenv("SOUNDTRACE_MODEL_DIR", str(tmp_path))
    (tmp_path / "soundtrace-model.json").write_text(json.dumps({"revision": "a" * 40}))
    for name in (
        "config.json",
        "preprocessor_config.json",
        "tokenizer_config.json",
        "pytorch_model.bin",
    ):
        (tmp_path / name).touch()
    assert not ClapProvider().ready
