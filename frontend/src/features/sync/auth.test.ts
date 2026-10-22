import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../../lib/storage.ts';
import { ApiError, type AuthResponse } from './api.ts';
import { AUTH_STORAGE_KEY, AuthManager, type AuthApi } from './auth.ts';

const response = (id = 'u1', token = 'tok-1'): AuthResponse => ({
  user: { id, email: 'ann@example.com', display_name: 'Ann', created_at: 1 }, access_token: token, token_type: 'bearer', expires_in: 100,
});
function storage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] };
}
function api(over: Partial<AuthApi> = {}): AuthApi {
  return { signup: async () => response(), login: async () => response(), me: async () => ({ user: response().user }), ...over };
}
function manager(a: AuthApi, s: KeyValueStorage | null = storage()) {
  const m = new AuthManager(s);
  m.bind(a);
  return m;
}

describe('AuthManager', () => {
  it('starts in "checking" until restored', () => {
    expect(manager(api()).store.getState().status).toBe('checking');
  });

  it('sign-in stores the session and exposes the user and token', async () => {
    const s = storage();
    const m = manager(api(), s);
    const user = await m.signIn('ann@example.com', 'pw');
    expect(user).toEqual({ id: 'u1', email: 'ann@example.com', displayName: 'Ann' });
    expect(m.store.getState()).toEqual({ status: 'signed_in', user, busy: false });
    expect(m.token).toBe('tok-1');
    expect(JSON.parse(s.data[AUTH_STORAGE_KEY]!).token).toBe('tok-1');
  });

  it('sign-up works the same way', async () => {
    const m = manager(api());
    await m.signUp('ann@example.com', 'password1', 'Ann', true);
    expect(m.store.getState().status).toBe('signed_in');
  });

  it('a failed sign-in keeps you signed out, clears the busy flag, and passes the error on', async () => {
    const m = manager(api({ login: async () => { throw new ApiError(401, 'invalid_credentials', 'Incorrect email or password.'); } }));
    let err: unknown;
    try { await m.signIn('a@b.co', 'x'); } catch (e) { err = e; }
    expect((err as ApiError).code).toBe('invalid_credentials');
    expect(m.store.getState()).toEqual({ status: 'checking', user: null, busy: false });
    expect(m.token).toBeNull();
  });

  it('sign-out forgets everything', async () => {
    const s = storage();
    const m = manager(api(), s);
    await m.signIn('a@b.co', 'x');
    m.signOut();
    expect(m.store.getState().status).toBe('signed_out');
    expect(m.token).toBeNull();
    expect(s.data[AUTH_STORAGE_KEY]).toBeUndefined();
  });

  it('restores a saved sign-in and refreshes the user', async () => {
    const s = storage({ [AUTH_STORAGE_KEY]: JSON.stringify({ token: 'old', user: { id: 'u1', email: 'old@example.com', displayName: null } }) });
    const m = manager(api(), s);
    await m.restore();
    expect(m.token).toBe('old');
    expect(m.store.getState().user?.email).toBe('ann@example.com'); // refreshed from /auth/me
  });

  it('stays signed in while offline', async () => {
    const s = storage({ [AUTH_STORAGE_KEY]: JSON.stringify({ token: 'old', user: { id: 'u1', email: 'a@b.co', displayName: null } }) });
    const m = manager(api({ me: async () => { throw new ApiError(0, 'network', 'offline'); } }), s);
    await m.restore();
    expect(m.store.getState().status).toBe('signed_in');
  });

  it('signs out when the server says the token is no good', async () => {
    const s = storage({ [AUTH_STORAGE_KEY]: JSON.stringify({ token: 'old', user: { id: 'u1', email: 'a@b.co', displayName: null } }) });
    const m = manager(api({ me: async () => { throw new ApiError(401, 'token_expired', 'expired'); } }), s);
    await m.restore();
    expect(m.store.getState().status).toBe('signed_out');
    expect(m.token).toBeNull();
  });

  it('nothing saved, corrupt storage or no storage at all means signed out', async () => {
    for (const s of [storage(), storage({ [AUTH_STORAGE_KEY]: '{broken' }), storage({ [AUTH_STORAGE_KEY]: '{}' }), null]) {
      const m = manager(api(), s);
      await m.restore();
      expect(m.store.getState().status).toBe('signed_out');
    }
  });

  it('works when storage throws (private mode)', async () => {
    const broken: KeyValueStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const m = manager(api(), broken);
    await m.restore();
    await m.signIn('a@b.co', 'x');
    expect(m.store.getState().status).toBe('signed_in');
  });

  it('refuses to sign in before it is connected to an API', async () => {
    const m = new AuthManager(null);
    let failed = false;
    try { await m.signIn('a@b.co', 'x'); } catch { failed = true; }
    expect(failed).toBe(true);
  });
});
