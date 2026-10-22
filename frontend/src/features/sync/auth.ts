/** Who is signed in. The token is kept in localStorage (see backend/README.md for the trade-off). */
import { createStore } from 'zustand/vanilla';
import type { KeyValueStorage } from '../../lib/storage.ts';
import { ApiError, type ApiUser, type AuthResponse } from './api.ts';

export const AUTH_STORAGE_KEY = 'formfit.auth.v1';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthState {
  status: 'checking' | 'signed_out' | 'signed_in';
  user: AuthUser | null;
  /** true while a sign-in or sign-up request is running */
  busy: boolean;
}

/** The part of the API the auth manager uses. */
export interface AuthApi {
  signup(email: string, password: string, displayName: string | null, acceptTerms: boolean): Promise<AuthResponse>;
  login(email: string, password: string): Promise<AuthResponse>;
  me(): Promise<{ user: ApiUser }>;
}

const toUser = (u: ApiUser): AuthUser => ({ id: u.id, email: u.email, displayName: u.display_name });

export class AuthManager {
  readonly store = createStore<AuthState>()(() => ({ status: 'checking', user: null, busy: false }));
  private api: AuthApi | null = null;
  private _token: string | null = null;

  constructor(private readonly storage: KeyValueStorage | null) {}

  /** The API client needs the token and the manager needs the API: connect them after both exist. */
  bind(api: AuthApi): void {
    this.api = api;
  }

  get token(): string | null {
    return this._token;
  }

  private persist(token: string | null, user: AuthUser | null): void {
    try {
      if (token && user) this.storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
      else if (this.storage?.removeItem) this.storage.removeItem(AUTH_STORAGE_KEY);
      else this.storage?.setItem(AUTH_STORAGE_KEY, '');
    } catch {
      /* storage blocked: stay signed in for this visit only */
    }
  }

  private setSession(res: AuthResponse): AuthUser {
    const user = toUser(res.user);
    this._token = res.access_token;
    this.persist(res.access_token, user);
    this.store.setState({ status: 'signed_in', user, busy: false });
    return user;
  }

  /**
   * Restore a previous sign-in. The user stays signed in while offline; the token is verified in the background
   * and only a definite 401 signs them out.
   */
  async restore(): Promise<void> {
    let saved: { token?: string; user?: AuthUser } = {};
    try {
      const raw = this.storage?.getItem(AUTH_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = {};
    }
    if (!saved.token || !saved.user?.id) {
      this.store.setState({ status: 'signed_out', user: null });
      return;
    }
    this._token = saved.token;
    this.store.setState({ status: 'signed_in', user: saved.user });
    try {
      const me = await this.api?.me();
      if (me) this.store.setState({ user: toUser(me.user) });
    } catch (e) {
      if (e instanceof ApiError && e.isUnauthorized) this.handleUnauthorized();
      // network trouble: keep the saved sign-in
    }
  }

  async signUp(email: string, password: string, displayName: string | null, acceptTerms: boolean): Promise<AuthUser> {
    if (!this.api) throw new Error('auth is not connected to an API');
    this.store.setState({ busy: true });
    try {
      return this.setSession(await this.api.signup(email, password, displayName, acceptTerms));
    } catch (e) {
      this.store.setState({ busy: false });
      throw e;
    }
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    if (!this.api) throw new Error('auth is not connected to an API');
    this.store.setState({ busy: true });
    try {
      return this.setSession(await this.api.login(email, password));
    } catch (e) {
      this.store.setState({ busy: false });
      throw e;
    }
  }

  signOut(): void {
    this._token = null;
    this.persist(null, null);
    this.store.setState({ status: 'signed_out', user: null, busy: false });
  }

  /** The server rejected our token (expired, or the account is gone). */
  handleUnauthorized(): void {
    this.signOut();
  }
}
