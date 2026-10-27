"""Bounded audio decoding and deterministic retrieval mathematics."""

from dataclasses import dataclass
from io import BytesIO
from math import isfinite

import numpy as np
import soundfile as sf
from numpy.typing import NDArray

MAX_BYTES = 25_000_000
MAX_DURATION = 300
MAX_RECORDINGS = 4


@dataclass(frozen=True)
class Audio:
    mono: NDArray[np.float32]
    sample_rate: int
    channels: int

    @property
    def duration(self) -> float:
        return len(self.mono) / self.sample_rate


def decode_wav(payload: bytes) -> Audio:
    if not payload or len(payload) > MAX_BYTES:
        raise ValueError("Upload a WAV file no larger than 25 MB.")
    try:
        with sf.SoundFile(BytesIO(payload)) as source:
            if source.format not in {"WAV", "WAVEX"}:
                raise ValueError("Only WAV recordings are supported.")
            if not 8000 <= source.samplerate <= 96000 or source.channels not in {1, 2}:
                raise ValueError("Use mono/stereo WAV audio between 8 and 96 kHz.")
            if source.frames <= 0 or source.frames / source.samplerate > MAX_DURATION:
                raise ValueError("Recordings must contain audio and be at most five minutes.")
            samples = source.read(dtype="float32", always_2d=True)
            rate, channels = source.samplerate, source.channels
    except (sf.LibsndfileError, RuntimeError) as error:
        raise ValueError("The file could not be decoded as WAV audio.") from error
    if not np.isfinite(samples).all():
        raise ValueError("Audio samples must be finite.")
    if np.max(np.abs(samples)) > 1.00001:
        raise ValueError("Audio samples must lie between -1 and 1.")
    if len(samples) / rate < 0.05:
        raise ValueError("Recordings must be at least 50 milliseconds long.")
    return Audio(samples.mean(axis=1, dtype=np.float32), rate, channels)


def window_bounds(duration: float) -> list[tuple[float, float]]:
    if not isfinite(duration) or not 0 < duration <= MAX_DURATION:
        raise ValueError("Duration must be finite and between zero and five minutes.")
    if duration <= 10:
        return [(0, duration)]
    starts = list(np.arange(0, duration - 10, 5, dtype=float))
    starts.append(duration - 10)
    return [(float(start), min(float(start) + 10, duration)) for start in starts]


def normalise(vectors: NDArray) -> NDArray[np.float32]:
    values = np.asarray(vectors, dtype=np.float32)
    if values.ndim not in {1, 2} or values.size == 0 or not np.isfinite(values).all():
        raise ValueError("Embeddings must be nonempty finite vectors.")
    norms = np.linalg.norm(values, axis=-1, keepdims=True)
    if not np.isfinite(norms).all() or np.any(norms <= 1e-12):
        raise ValueError("Embedding norms must be finite and positive.")
    return values / norms


def rank_windows(vectors: NDArray, query: NDArray, top_k: int) -> list[tuple[int, float]]:
    if type(top_k) is not int or not 1 <= top_k <= 20:
        raise ValueError("top_k must be between 1 and 20.")
    if vectors.ndim != 2 or query.ndim != 1 or vectors.shape[1] != query.shape[0]:
        raise ValueError("Audio and query embedding dimensions must match.")
    scores = np.clip(normalise(vectors) @ normalise(query), -1, 1)
    order = np.argsort(-scores, kind="stable")[:top_k]
    return [(int(i), float(scores[i])) for i in order]


def waveform_peaks(samples: NDArray, bins: int = 600) -> list[float]:
    return [
        float(np.max(np.abs(part))) for part in np.array_split(samples, min(bins, len(samples)))
    ]
