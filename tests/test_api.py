from io import BytesIO

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from soundtrace.api import create_app


class TestProvider:
    """Deterministic contract provider, never evidence of semantic model quality."""

    model_id = "synthetic-test-provider"
    revision = "test-only"
    ready = True
    loaded = True
    reason = None

    def audio(self, samples):
        return np.array([[1.0, 0.0] for _ in samples])

    def text(self, query):
        return np.array([1.0, 0.0])


def payload():
    b = BytesIO()
    sf.write(b, np.sin(np.arange(32000) / 10) * 0.2, 16000, format="WAV")
    return b.getvalue()


@pytest.fixture
def client():
    return TestClient(create_app(TestProvider()))


def upload(client):
    response = client.post("/api/recordings", content=payload(), headers={"X-Filename": "test.wav"})
    assert response.status_code == 201
    return response.json()


def test_upload_index_search_playback_export_contract(client):
    item = upload(client)
    assert not item["indexed"] and item["duration_seconds"] == 2
    assert len(item["waveform"]) == 600
    assert client.get(item["audio_url"]).content == payload()
    assert (
        client.post(f"/api/recordings/{item['id']}/search", json={"query": "rain"}).status_code
        == 409
    )
    indexed = client.post(f"/api/recordings/{item['id']}/index").json()
    assert indexed["indexed"] and indexed["windows"] == 1
    result = client.post(f"/api/recordings/{item['id']}/search", json={"query": "rain"}).json()
    assert result["recording_sha256"] == item["sha256"]
    assert result["model_id"] == "synthetic-test-provider"
    assert result["matches"][0] == {"rank": 1, "start_seconds": 0, "end_seconds": 2, "score": 1}
    assert result["limitations"]
    assert client.delete(f"/api/recordings/{item['id']}").status_code == 204
    assert client.get(item["audio_url"]).status_code == 404


def test_corrupt_upload_and_unknown_identity(client):
    assert client.post("/api/recordings", content=b"invalid").status_code == 422
    assert client.get("/api/recordings/../../etc/passwd/audio").status_code == 404
    assert client.get("/api/recordings").json() == {"recordings": []}


def test_duplicate_upload_does_not_duplicate_storage(client):
    first, second = upload(client), upload(client)
    assert first["id"] == second["id"]
    assert len(client.get("/api/recordings").json()["recordings"]) == 1


@pytest.mark.parametrize("query", ["", "   ", "x" * 301])
def test_reject_bad_queries(client, query):
    item = upload(client)
    assert (
        client.post(f"/api/recordings/{item['id']}/search", json={"query": query}).status_code
        == 422
    )


def test_unavailable_provider_is_explicit():
    p = TestProvider()
    p.ready = False
    p.reason = "Model not prepared"
    c = TestClient(create_app(p))
    item = upload(c)
    assert c.get("/api/health").json()["model"]["ready"] is False
    assert c.post(f"/api/recordings/{item['id']}/index").status_code == 503


def test_failed_index_does_not_publish_partial_vectors(client, monkeypatch):
    monkeypatch.setattr(TestProvider, "audio", lambda *_: np.array([[np.nan, 1.0]]))
    item = upload(client)
    assert client.post(f"/api/recordings/{item['id']}/index").status_code == 503
    assert not client.get("/api/recordings").json()["recordings"][0]["indexed"]


def test_upload_limit_is_enforced_before_decoding(client):
    assert client.post("/api/recordings", content=b"x" * 25_000_001).status_code == 413


@pytest.mark.parametrize("top_k", [0, 21, True, 1.5])
def test_search_top_k_is_a_bounded_integer(client, top_k):
    item = upload(client)
    r = client.post(f"/api/recordings/{item['id']}/search", json={"query": "rain", "top_k": top_k})
    assert r.status_code == 422


def test_recording_count_cap_and_delete_releases_capacity(client):
    items = []
    for i in range(4):
        b = BytesIO()
        sf.write(b, np.ones(8000) * (i / 10), 16000, format="WAV")
        r = client.post("/api/recordings", content=b.getvalue())
        assert r.status_code == 201
        items.append(r.json())
    assert client.post("/api/recordings", content=payload()).status_code == 409
    client.delete(f"/api/recordings/{items[0]['id']}")
    assert client.post("/api/recordings", content=payload()).status_code == 201


def test_full_store_rejects_before_expensive_decode(client, monkeypatch):
    for i in range(4):
        b = BytesIO()
        sf.write(b, np.ones(8000) * (i / 10), 16000, format="WAV")
        assert client.post("/api/recordings", content=b.getvalue()).status_code == 201

    def forbidden_decode(_):
        raise AssertionError("A full store must reject admission before decoding.")

    monkeypatch.setattr("soundtrace.api.decode_wav", forbidden_decode)
    assert client.post("/api/recordings", content=payload()).status_code == 409


def test_slow_index_does_not_block_other_recording_playback(client, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    entered, release = Event(), Event()

    def slow_audio(self, samples):
        entered.set()
        assert release.wait(5)
        return np.array([[1.0, 0.0] for _ in samples])

    monkeypatch.setattr(TestProvider, "audio", slow_audio)
    item = upload(client)
    with ThreadPoolExecutor(max_workers=2) as executor:
        indexing = executor.submit(client.post, f"/api/recordings/{item['id']}/index")
        assert entered.wait(3)
        playback = executor.submit(client.get, item["audio_url"])
        try:
            assert playback.result(timeout=1).status_code == 200
        finally:
            release.set()
        assert indexing.result(timeout=3).status_code == 200


def test_concurrent_upload_is_rejected_before_second_decode(client, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    from soundtrace.core import decode_wav

    entered, release = Event(), Event()
    calls = []

    def slow_decode(raw):
        calls.append(1)
        entered.set()
        assert release.wait(5)
        return decode_wav(raw)

    monkeypatch.setattr("soundtrace.api.decode_wav", slow_decode)
    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(client.post, "/api/recordings", content=payload())
        assert entered.wait(3)
        try:
            second = client.post("/api/recordings", content=payload())
            assert second.status_code == 429
            assert len(calls) == 1
        finally:
            release.set()
        assert first.result(timeout=3).status_code == 201


def test_playback_advertises_byte_ranges_on_full_response(client):
    item = upload(client)
    response = client.get(item["audio_url"])
    assert response.status_code == 200
    assert response.content == payload()
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == str(len(payload()))
    assert "content-range" not in response.headers
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "range_header,start,end",
    [
        ("bytes=0-0", 0, 1),
        ("bytes=40-49", 40, 50),
        ("bytes=40-", 40, None),
        ("bytes=-10", -10, None),
        ("bytes=40-999999999999999999999999999999", 40, None),
        ("bytes=-999999999999999999999999999999", 0, None),
        ("bytes=0-", 0, None),
        ("BYTES=00040-00049", 40, 50),
        ("bytes=\t40-49 ", 40, 50),
    ],
)
def test_playback_returns_exact_single_byte_range(client, range_header, start, end):
    item = upload(client)
    raw = payload()
    response = client.get(item["audio_url"], headers={"Range": range_header})
    first = start if start >= 0 else len(raw) + start
    last = len(raw) - 1 if end is None else end - 1
    assert response.status_code == 206
    assert response.content == raw[start:end]
    assert response.headers["content-range"] == f"bytes {first}-{last}/{len(raw)}"
    assert response.headers["content-length"] == str(len(raw[start:end]))
    assert response.headers["content-type"] == "audio/wav"
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "range_header", ["bytes={size}-", "bytes=999999999999999999999-", "bytes=-0"]
)
def test_playback_rejects_unsatisfiable_range(client, range_header):
    item = upload(client)
    size = len(payload())
    response = client.get(item["audio_url"], headers={"Range": range_header.format(size=size)})
    assert response.status_code == 416
    assert response.headers["content-range"] == f"bytes */{size}"
    assert response.headers["content-length"] == str(len(response.content))
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "range_header",
    [
        "bytes=",
        "bytes=-",
        "bytes=49-40",
        "bytes=+1-2",
        "bytes=1.0-2",
        "bytes=0 - 2",
        "bytes=0-1,4-5",
        "bytes=999999999-999999999,0-0",
        "items=0-1",
        "bytes=" + "9" * 5000 + "-",
    ],
    ids=[
        "empty",
        "no-offsets",
        "reversed",
        "signed",
        "decimal",
        "spaces",
        "multiple",
        "mixed-satisfiability",
        "unknown-unit",
        "oversized",
    ],
)
def test_playback_ignores_unsupported_ranges(client, range_header):
    item = upload(client)
    response = client.get(item["audio_url"], headers={"Range": range_header})
    assert response.status_code == 200
    assert response.content == payload()
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-length"] == str(len(payload()))
    assert "content-range" not in response.headers


def test_playback_ignores_repeated_range_fields(client):
    item = upload(client)
    response = client.get(
        item["audio_url"], headers=[("Range", "bytes=0-0"), ("Range", "bytes=2-2")]
    )
    assert response.status_code == 200
    assert response.content == payload()
    assert response.headers["accept-ranges"] == "bytes"
    assert "content-range" not in response.headers


@pytest.mark.parametrize(
    "validator", ['"different-recording"', 'W/"weak"', "Tue, 27 Oct 2026 12:00:00 GMT"]
)
def test_playback_if_range_without_matching_validator_returns_full_response(client, validator):
    item = upload(client)
    response = client.get(item["audio_url"], headers={"Range": "bytes=0-0", "If-Range": validator})
    assert response.status_code == 200
    assert response.content == payload()
    assert response.headers["accept-ranges"] == "bytes"
    assert "content-range" not in response.headers


def test_playback_range_preserves_missing_recording_404(client):
    item = upload(client)
    assert client.delete(f"/api/recordings/{item['id']}").status_code == 204
    assert client.get(item["audio_url"], headers={"Range": "bytes=0-0"}).status_code == 404
