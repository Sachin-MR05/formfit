/** HTTP client for the FormFit API. Everything the app can fail on is reported as an ApiError (status 0 = network). */
import type { Cursors, PullResult, PushPayload, PushResult, SyncApi } from './types.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly retryAfterS: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface ApiUser {
  id: string;
  email: string;
  display_name: string | null;
  created_at: number;
}

export interface AuthResponse {
  user: ApiUser;
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
}

/** Just enough of fetch for the client (and for test doubles). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

export interface ApiClientOptions {
  /** e.g. "http://localhost:8000". Empty = the app runs without a server. */
  baseUrl: string;
  fetch: FetchLike;
  getToken: () => string | null;
  timeoutMs?: number;
}

export class ApiClient implements SyncApi {
  private readonly base: string;
  private readonly timeoutMs: number;

  constructor(private readonly opts: ApiClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  get enabled(): boolean {
    return this.base !== '';
  }

  private async raw(method: string, path: string, body?: unknown, auth = true): Promise<{ text: string; contentType: string }> {
    if (!this.enabled) throw new ApiError(0, 'not_configured', 'Cloud sync is not configured for this build.');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = this.opts.getToken();
      if (!token) throw new ApiError(401, 'not_authenticated', 'Sign in to continue.');
      headers['Authorization'] = `Bearer ${token}`;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.opts.fetch(`${this.base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      const text = await res.text();
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok) {
        let code = `http_${res.status}`;
        let message = `The server answered with an error (${res.status}).`;
        let details: Record<string, unknown> = {};
        try {
          const e = JSON.parse(text)?.error;
          if (e && typeof e.message === 'string') {
            code = typeof e.code === 'string' ? e.code : code;
            message = e.message;
            details = typeof e.details === 'object' && e.details ? e.details : {};
          }
        } catch {
          /* not JSON (e.g. a proxy error page): keep the generic message */
        }
        const ra = Number(res.headers.get('retry-after'));
        throw new ApiError(res.status, code, message, details, Number.isFinite(ra) && ra > 0 ? ra : null);
      }
      return { text, contentType };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new ApiError(0, aborted ? 'timeout' : 'network', aborted ? 'The server took too long to answer.' : 'Cannot reach the server. Check your connection.');
    } finally {
      clearTimeout(timer);
    }
  }

  private async json<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const { text } = await this.raw(method, path, body, auth);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(502, 'bad_response', 'The server sent an unreadable answer.');
    }
  }

  health = () => this.json<{ status: string }>('GET', '/health', undefined, false);
  signup = (email: string, password: string, displayName: string | null, acceptTerms: boolean) =>
    this.json<AuthResponse>('POST', '/auth/signup', { email, password, display_name: displayName, accept_terms: acceptTerms }, false);
  login = (email: string, password: string) => this.json<AuthResponse>('POST', '/auth/login', { email, password }, false);
  me = () => this.json<{ user: ApiUser }>('GET', '/auth/me');
  push = (payload: PushPayload) => this.json<PushResult>('POST', '/sync/push', payload);

  pull(cursors: Partial<Cursors>, limit = 500): Promise<PullResult> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursors.profiles) q.set('profiles_cursor', cursors.profiles);
    if (cursors.sessions) q.set('sessions_cursor', cursors.sessions);
    if (cursors.reps) q.set('reps_cursor', cursors.reps);
    return this.json<PullResult>('GET', `/sync/pull?${q.toString()}`);
  }

  async exportJson(): Promise<string> {
    return (await this.raw('GET', '/export')).text;
  }
  deleteAccount = (password: string) => this.json<{ deleted: boolean }>('DELETE', '/me', { password });
}
