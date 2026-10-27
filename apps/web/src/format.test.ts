import { describe, expect, it } from 'vitest';
import { formatTime, formatScore } from './format';

describe('time and score labels', () => {
  it.each([[0, '00:00.0'], [9.99, '00:10.0'], [65.24, '01:05.2'], [3600, '60:00.0'], [-4, '00:00.0'], [NaN, '--:--']])(
    'formats %s seconds without misleading rounded boundaries', (value, expected) => {
      expect(formatTime(value)).toBe(expected);
    },
  );
  it('keeps negative cosine similarity and does not convert to probability', () => {
    expect(formatScore(-0.12345)).toBe('-0.123');
    expect(formatScore(0.7826)).toBe('0.783');
  });
});
