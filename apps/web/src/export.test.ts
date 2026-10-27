import { afterEach, expect, it, vi } from 'vitest';
import { exportEvidence } from './export';

afterEach(() => vi.restoreAllMocks());

it('exports real evidence and releases the download object URL even if the click fails', () => {
  const create = vi.fn().mockReturnValue('blob:evidence');
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('Download blocked'); });
  const response = { query: 'bell', recording_sha256: 'abc', model_id: 'clap', model_revision: 'local', latency_ms: 10, matches: [], limitations: ['Coarse'] };
  expect(() => exportEvidence('field.wav', response)).toThrow('Download blocked');
  expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
  expect(revoke).toHaveBeenCalledWith('blob:evidence');
  expect(document.querySelector('a[download]')).toBeNull();
  vi.unstubAllGlobals();
});
