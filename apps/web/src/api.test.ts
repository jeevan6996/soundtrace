import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API boundary', () => {
  it('uploads raw WAV with the filename header, not multipart', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: 'a' }));
    vi.stubGlobal('fetch', fetcher);
    const file = new File(['RIFF'], 'field take.wav', { type: 'audio/wav' });
    await api.upload(file);
    expect(fetcher).toHaveBeenCalledWith('/api/recordings', expect.objectContaining({
      method: 'POST', body: file,
      headers: { 'Content-Type': 'audio/wav', 'X-Filename': 'field%20take.wav' },
    }));
  });
  it('surfaces JSON detail on an unavailable model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ detail: 'Local weights missing' }, { status: 503 })));
    await expect(api.index('a')).rejects.toThrow('Local weights missing');
  });
  it('preserves Unicode filenames using the backend percent-decoding convention', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: 'a' }));
    vi.stubGlobal('fetch', fetcher);
    await api.upload(new File(['RIFF'], 'caf\u00e9.wav', { type: 'audio/wav' }));
    expect(fetcher).toHaveBeenCalledWith('/api/recordings', expect.objectContaining({
      headers: expect.objectContaining({ 'X-Filename': 'caf%C3%A9.wav' }),
    }));
  });
  it('does not expose a non-JSON proxy error document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>trace</html>', { status: 502 })));
    await expect(api.health()).rejects.toThrow('Request failed (502)');
  });
  it('accepts a 204 deletion without parsing JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.remove('a')).resolves.toBeUndefined();
  });
});
