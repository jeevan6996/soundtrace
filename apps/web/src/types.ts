export interface Recording {
  id: string;
  filename: string;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  indexed: boolean;
  windows: number;
  waveform: number[];
  audio_url: string;
  sha256: string;
}

export interface Health {
  status: string;
  model: { id: string; ready: boolean; loaded: boolean; reason: string | null };
  limits: { max_bytes: number; max_duration_seconds: number; max_recordings: number };
}

export interface Match {
  rank: number;
  start_seconds: number;
  end_seconds: number;
  score: number;
}

export interface SearchResponse {
  query: string;
  recording_sha256: string;
  model_id: string;
  model_revision: string | null;
  latency_ms: number;
  matches: Match[];
  limitations: string[];
}
