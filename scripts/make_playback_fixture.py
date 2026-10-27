"""Create an original synthetic playback fixture, not a semantic benchmark."""

from pathlib import Path

import numpy as np
import soundfile as sf


def main():
    rate = 16000
    time = np.arange(rate * 20) / rate
    tone = np.sin(2 * np.pi * 880 * time) * (np.sin(2 * np.pi * 2 * time) > 0)
    noise = np.random.default_rng(42).normal(0, 0.12, len(time))
    samples = np.where(time < 10, tone * 0.2, noise).astype("float32")
    target = Path("data/dev/synthetic-playback.wav")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError(target)
    sf.write(target, samples, rate, subtype="PCM_16")
    print(f"Created {target}: original synthetic tones/noise, playback testing only.")


if __name__ == "__main__":
    main()
