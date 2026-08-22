import axios from 'axios';

/**
 * Smoke test against a running API. Replaces the Nx scaffold, which asserted a
 * `GET /api` route returning "Hello API" that this app has never had — so the
 * only test in the repo was failing by construction.
 */
describe('GET /api/health', () => {
  it('reports ok when the service and its database are reachable', async () => {
    const res = await axios.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ status: 'ok' });
  });
});
