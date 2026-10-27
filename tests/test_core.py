from io import BytesIO

import numpy as np
import pytest
import soundfile as sf

from soundtrace.core import decode_wav, rank_windows, window_bounds


def wav(samples=None, rate=16000):
    buffer = BytesIO()
    sf.write(buffer, np.zeros(rate) if samples is None else samples, rate, format="WAV")
    return buffer.getvalue()


def test_decode_real_wav_and_stereo():
    data = decode_wav(wav(np.ones((8000, 2)) * 0.25))
    assert data.sample_rate == 16000 and data.channels == 2
    assert data.duration == 0.5
    assert data.mono.shape == (8000,)
    assert np.allclose(data.mono, 0.25, atol=1e-4)


@pytest.mark.parametrize("payload", [b"", b"not audio"])
def test_reject_corrupt_audio(payload):
    with pytest.raises(ValueError):
        decode_wav(payload)


def test_reject_nonfinite_audio():
    b = BytesIO()
    sf.write(b, np.array([np.nan, 0.1]), 16000, format="WAV", subtype="FLOAT")
    with pytest.raises(ValueError, match="finite"):
        decode_wav(b.getvalue())


@pytest.mark.parametrize(
    "duration,expected",
    [(1, [(0, 1)]), (10, [(0, 10)]), (12, [(0, 10), (2, 12)]), (20, [(0, 10), (5, 15), (10, 20)])],
)
def test_windows_cover_last_sample_without_duplicates(duration, expected):
    assert window_bounds(duration) == expected


@pytest.mark.parametrize("duration", [0, -1, np.nan, np.inf])
def test_reject_bad_duration(duration):
    with pytest.raises(ValueError):
        window_bounds(duration)


def test_rank_uses_cosine_and_stable_ties():
    scores = rank_windows(np.array([[2.0, 0.0], [0.0, 1.0], [1.0, 0.0]]), np.array([1.0, 0.0]), 3)
    assert [i for i, _ in scores] == [0, 2, 1]
    assert [s for _, s in scores] == [1.0, 1.0, 0.0]


@pytest.mark.parametrize("vectors", [np.array([[0.0, 0.0]]), np.array([[np.nan, 1.0]])])
def test_reject_invalid_embeddings(vectors):
    with pytest.raises(ValueError):
        rank_windows(vectors, np.ones(2), 1)


@pytest.mark.parametrize("rate,channels", [(7999, 1), (96001, 1), (16000, 3)])
def test_reject_unsupported_rate_or_channels(rate, channels):
    with pytest.raises(ValueError):
        decode_wav(wav(np.zeros((8000, channels)), rate))


def test_reject_overlong_and_non_wav_audio():
    with pytest.raises(ValueError):
        decode_wav(wav(np.zeros(8000 * 301), 8000))
    b = BytesIO()
    sf.write(b, np.zeros(8000), 8000, format="FLAC")
    with pytest.raises(ValueError, match="WAV"):
        decode_wav(b.getvalue())
