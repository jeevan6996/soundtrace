"""Single-user, loopback-only audio investigation service."""

import logging
import re
from dataclasses import dataclass
from hashlib import sha256
from math import gcd
from pathlib import Path
from threading import BoundedSemaphore, RLock
from time import perf_counter
from urllib.parse import unquote

import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field, StrictInt, field_validator
from scipy.signal import resample_poly
from starlette.concurrency import run_in_threadpool

from soundtrace.contracts import EmbeddingProvider, RecordingInfo
from soundtrace.core import (
    MAX_BYTES,
    MAX_DURATION,
    MAX_RECORDINGS,
    Audio,
    decode_wav,
    normalise,
    rank_windows,
    waveform_peaks,
    window_bounds,
)
from soundtrace.model import ClapProvider


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=300)
    top_k: StrictInt = Field(default=5, ge=1, le=20)

    @field_validator("query")
    @classmethod
    def strip_query(cls, value):
        if not value.strip():
            raise ValueError("Enter a sound to search for.")
        return value.strip()


@dataclass
class Recording:
    raw: bytes
    audio: Audio
    meta: RecordingInfo
    bounds: list[tuple[float, float]]
    vectors: np.ndarray | None = None


def create_app(provider: EmbeddingProvider | None = None) -> FastAPI:
    provider = provider if provider is not None else ClapProvider()
    recordings: dict[str, Recording] = {}
    lock = RLock()
    upload_gate = BoundedSemaphore(1)
    model_gate = BoundedSemaphore(1)
    app = FastAPI(title="SoundTrace", version="0.1.0")

    def find(identity: str) -> Recording:
        if identity not in recordings:
            raise HTTPException(404, "Recording not found.")
        return recordings[identity]

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "model": {
                "id": provider.model_id,
                "ready": provider.ready,
                "loaded": provider.loaded,
                "reason": provider.reason,
            },
            "limits": {
                "max_bytes": MAX_BYTES,
                "max_duration_seconds": MAX_DURATION,
                "max_recordings": MAX_RECORDINGS,
            },
        }

    @app.get("/api/recordings")
    def listing():
        with lock:
            return {"recordings": [r.meta.copy() for r in recordings.values()]}

    def add(raw, filename):
        try:
            audio = decode_wav(raw)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        identity = sha256(raw).hexdigest()
        with lock:
            if identity in recordings:
                return recordings[identity].meta.copy()
            if len(recordings) >= MAX_RECORDINGS:
                raise HTTPException(
                    409, "Remove a recording before uploading another (limit: four)."
                )
            meta: RecordingInfo = {
                "id": identity,
                "sha256": identity,
                "filename": Path(unquote(filename)).name[:160] or "recording.wav",
                "duration_seconds": audio.duration,
                "sample_rate": audio.sample_rate,
                "channels": audio.channels,
                "indexed": False,
                "windows": 0,
                "waveform": waveform_peaks(audio.mono),
                "audio_url": f"/api/recordings/{identity}/audio",
            }
            recordings[identity] = Recording(raw, audio, meta, window_bounds(audio.duration))
            return meta.copy()

    @app.post("/api/recordings", status_code=201)
    async def upload(request: Request):
        if not upload_gate.acquire(blocking=False):
            raise HTTPException(429, "Another upload is in progress. Retry shortly.")
        try:
            with lock:
                if len(recordings) >= MAX_RECORDINGS:
                    raise HTTPException(409, "Recording limit reached. Remove a recording first.")
            raw = bytearray()
            async for chunk in request.stream():
                if len(raw) + len(chunk) > MAX_BYTES:
                    raise HTTPException(413, "Recording exceeds the 25 MB upload limit.")
                raw.extend(chunk)
            return await run_in_threadpool(
                add, bytes(raw), request.headers.get("X-Filename", "audio.wav")
            )
        finally:
            upload_gate.release()

    @app.get("/api/recordings/{identity}/audio")
    def playback(identity: str, request: Request):
        with lock:
            raw = find(identity).raw
        headers = {
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        }
        full = Response(raw, media_type="audio/wav", headers=headers)
        ranges = request.headers.getlist("range")
        # Ignore unsupported sets and bound integer parsing, not just the response size.
        if len(ranges) != 1 or len(ranges[0]) > 256 or "if-range" in request.headers:
            return full
        match = re.fullmatch(
            r"bytes=[ \t]*([0-9]*)-([0-9]*)", ranges[0].strip(" \t"), re.IGNORECASE
        )
        if match is None or not any(match.groups()):
            return full
        first, last = (int(value) if value else None for value in match.groups())
        size = len(raw)
        if first is None:
            start, end = max(0, size - (last or 0)), size - 1
        else:
            if last is not None and last < first:
                return full
            start, end = first, min(last if last is not None else size - 1, size - 1)
        if start >= size:
            raise HTTPException(
                416,
                "Requested byte range is not satisfiable.",
                headers={**headers, "Content-Range": f"bytes */{size}"},
            )
        return Response(
            raw[start : end + 1],
            status_code=206,
            media_type="audio/wav",
            headers={**headers, "Content-Range": f"bytes {start}-{end}/{size}"},
        )

    @app.delete("/api/recordings/{identity}", status_code=204)
    def remove(identity: str):
        with lock:
            find(identity)
            del recordings[identity]
        return Response(status_code=204)

    @app.post("/api/recordings/{identity}/index")
    def index(identity: str):
        with lock:
            item = find(identity)
            if item.vectors is not None:
                return item.meta.copy()
        if not provider.ready:
            raise HTTPException(503, provider.reason or "Audio model unavailable.")
        if not model_gate.acquire(blocking=False):
            raise HTTPException(409, "The audio model is busy. Retry shortly.")
        try:
            try:
                divisor = gcd(item.audio.sample_rate, 48000)
                mono = resample_poly(
                    item.audio.mono, 48000 // divisor, item.audio.sample_rate // divisor
                ).astype(np.float32)
                windows = [mono[round(a * 48000) : round(b * 48000)] for a, b in item.bounds]
                vectors = normalise(provider.audio(windows))
                if vectors.ndim != 2 or vectors.shape[0] != len(windows):
                    raise ValueError("Audio model returned incompatible embeddings.")
            except Exception as error:
                logging.getLogger(__name__).exception("CLAP indexing failed")
                raise HTTPException(
                    503, "Audio indexing failed; check the local model setup."
                ) from error
            with lock:
                if recordings.get(identity) is not item:
                    raise HTTPException(409, "Recording was removed while indexing.")
                item.vectors = vectors
                item.meta["indexed"] = True
                item.meta["windows"] = len(item.bounds)
                return item.meta.copy()
        finally:
            model_gate.release()

    @app.post("/api/recordings/{identity}/search")
    def search(identity: str, body: SearchRequest):
        with lock:
            item = find(identity)
            if item.vectors is None:
                raise HTTPException(409, "Index this recording before searching.")
            vectors = item.vectors
        if not model_gate.acquire(blocking=False):
            raise HTTPException(409, "The audio model is busy. Retry shortly.")
        try:
            started = perf_counter()
            try:
                ranking = rank_windows(vectors, np.asarray(provider.text(body.query)), body.top_k)
            except Exception as error:
                logging.getLogger(__name__).exception("CLAP search failed")
                raise HTTPException(
                    503, "Audio search failed; check the local model setup."
                ) from error
            with lock:
                if recordings.get(identity) is not item:
                    raise HTTPException(409, "Recording was removed while searching.")
            return {
                "query": body.query,
                "recording_sha256": identity,
                "model_id": provider.model_id,
                "model_revision": provider.revision,
                "latency_ms": round((perf_counter() - started) * 1000, 2),
                "matches": [
                    {
                        "rank": rank + 1,
                        "start_seconds": item.bounds[i][0],
                        "end_seconds": item.bounds[i][1],
                        "score": score,
                    }
                    for rank, (i, score) in enumerate(ranking)
                ],
                "limitations": [
                    "Cosine scores are relative similarities, not probabilities.",
                    "Windows are coarse candidates, not exact event boundaries.",
                    "The system does not establish that an event is absent.",
                ],
            }
        finally:
            model_gate.release()

    return app


app = create_app()
