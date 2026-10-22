import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError, type FetchLike } from './api.ts';

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function client(handler: (c: Call) => { status?: number; body?: string; headers?: Record<string, string> } | Promise<never> | Error, opts: { token?: string | null; baseUrl?: string; timeoutMs?: number } = {}) {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const r = handler(call);
    if (r instanceof Error) throw r;
    const res = (await r) as { status?: number; body?: string; headers?: Record<string, string> };
    const status = res.status ?? 200;
    const h = res.headers ?? { 'content-type': 'application/json' };
    return { ok: status >= 200 && status < 300, status, headers: { get: (n: string) => h[n.toLowerCase()] ?? null }, text: async () => res.body ?? '{}' };
  };
  const token = opts.token === undefined ? 'tok' : opts.token;
  return { api: new ApiClient({ baseUrl: opts.baseUrl ?? 'http://api.test/', fetch: fetchFn, getToken: () => token, timeoutMs: opts.timeoutMs }), calls };
}

async function fails(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected the call to fail');
}

describe('ApiClient', () => {
  it('builds the URL, sends JSON and the bearer token', async () => {
    const { api, calls } = client(() => ({ body: '{"server_time":1}' }));
    await api.push({ profiles: [], sessions: [], reps: [] });
    expect(calls[0]!.url).toBe('http://api.test/api/sync/push');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers['Authorization']).toBe('Bearer tok');
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(calls[0]!.body!)).toEqual({ profiles: [], sessions: [], reps: [] });
  });

  it('sign-in and sign-up send no token', async () => {
    const { api, calls } = client(() => ({ body: '{}' }), { token: null });
    await api.login('a@b.co', 'pw');
    await api.signup('a@b.co', 'password1', 'Ann', true);
    expect(calls.every((c) => !('Authorization' in c.headers))).toBe(true);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ email: 'a@b.co', password: 'password1', display_name: 'Ann', accept_terms: true });
  });

  it('refuses to call protected routes without a token (no request is made)', async () => {
    const { api, calls } = client(() => ({}), { token: null });
    const e = await fails(api.me());
    expect([e.status, e.code, calls.length]).toEqual([401, 'not_authenticated', 0]);
  });

  it('builds the pull query from the cursors', async () => {
    const { api, calls } = client(() => ({}));
    await api.pull({ sessions: '12:abc', reps: '5:' }, 100);
    const q = new URL(calls[0]!.url).searchParams;
    expect([q.get('limit'), q.get('sessions_cursor'), q.get('reps_cursor'), q.get('profiles_cursor')]).toEqual(['100', '12:abc', '5:', null]);
  });

  it('turns the server error body into an ApiError', async () => {
    const { api } = client(() => ({ status: 409, body: '{"error":{"code":"email_taken","message":"Already used","details":{"x":1}}}' }));
    const e = await fails(api.signup('a@b.co', 'password1', null, true));
    expect([e.status, e.code, e.message, e.details]).toEqual([409, 'email_taken', 'Already used', { x: 1 }]);
  });

  it('reads Retry-After on throttling', async () => {
    const { api } = client(() => ({ status: 429, body: '{"error":{"code":"rate_limited","message":"slow down"}}', headers: { 'content-type': 'application/json', 'retry-after': '30' } }));
    expect((await fails(api.login('a@b.co', 'x'))).retryAfterS).toBe(30);
  });

  it('copes with non-JSON error pages (proxies, crashes)', async () => {
    const { api } = client(() => ({ status: 502, body: '<html>Bad gateway</html>', headers: { 'content-type': 'text/html' } }));
    const e = await fails(api.me());
    expect([e.status, e.code]).toEqual([502, 'http_502']);
    expect(e.message).toContain('502');
  });

  it('reports a failed connection as a network error (status 0)', async () => {
    const { api } = client(() => new TypeError('fetch failed'));
    const e = await fails(api.me());
    expect([e.status, e.isNetwork, e.code]).toEqual([0, true, 'network']);
  });

  it('gives up on a server that never answers', async () => {
    const hang: FetchLike = (_u, init) => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const api = new ApiClient({ baseUrl: 'http://api.test', fetch: hang, getToken: () => 't', timeoutMs: 20 });
    const e = await fails(api.me());
    expect([e.status, e.code]).toEqual([0, 'timeout']);
  });

  it('a 200 with an unreadable body is a bad_response, not a crash', async () => {
    const { api } = client(() => ({ body: 'not json' }));
    expect((await fails(api.me())).code).toBe('bad_response');
  });

  it('is disabled (and says so) when no address is configured', async () => {
    const { api, calls } = client(() => ({}), { baseUrl: '' });
    expect(api.enabled).toBe(false);
    expect((await fails(api.login('a@b.co', 'x'))).code).toBe('not_configured');
    expect(calls).toHaveLength(0);
  });

  it('exports raw text and deletes the account with the password', async () => {
    const { api, calls } = client((c) => (c.url.endsWith('/export') ? { body: '{"reps":[]}' } : { body: '{"deleted":true}' }));
    expect(await api.exportJson()).toBe('{"reps":[]}');
    await api.deleteAccount('secret');
    expect(calls[1]!.method).toBe('DELETE');
    expect(JSON.parse(calls[1]!.body!)).toEqual({ password: 'secret' });
  });
});
