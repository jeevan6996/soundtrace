"""Provider and recording contracts shared across the retrieval boundary."""

from typing import Protocol, TypedDict

import numpy as np
from numpy.typing import NDArray


class EmbeddingProvider(Protocol):
    model_id: str
    revision: str
    loaded: bool

    @property
    def ready(self) -> bool: ...

    @property
    def reason(self) -> str | None: ...

    def audio(self, samples: list[NDArray[np.float32]]) -> NDArray[np.float32]: ...

    def text(self, query: str) -> NDArray[np.float32]: ...


class RecordingInfo(TypedDict):
    id: str
    sha256: str
    filename: str
    duration_seconds: float
    sample_rate: int
    channels: int
    indexed: bool
    windows: int
    waveform: list[float]
    audio_url: str
