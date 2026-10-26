import 'react-native-url-polyfill/auto';
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { AppState, Linking } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureStorage, createPKCE } from './native';
import { API_BASE_URL } from './generated/config';
import { serverAddress } from './model';
import type { AppSession } from './types';

type Client = {
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  session: AppSession | null;
  loading: boolean;
  error: string;
  server: string;
  connect: (base: string) => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  supabase: SupabaseClient | null;
};
const ClientContext = createContext<Client | null>(null);
class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (problem) {
    if (problem instanceof Error && problem.name === 'AbortError')
      throw new Error(
        'Could not reach Famora. Check your connection and try again.',
      );
    throw problem;
  } finally {
    clearTimeout(timer);
  }
}
const cache = new Map<string, unknown>();
const watchers = new Map<string, Set<() => void>>();
export function setCached<T>(path: string, value: T) {
  cache.set(path, value);
  watchers.get(path)?.forEach(fn => fn());
}
export function getCached<T>(path: string) {
  return cache.get(path) as T | undefined;
}
function clearCache() {
  cache.clear();
  watchers.forEach(set => set.forEach(fn => fn()));
}
export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [server, setServer] = useState(API_BASE_URL);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const baseRef = useRef(server);
  const clientRef = useRef<SupabaseClient | null>(null);
  const authSubscription = useRef<(() => void) | null>(null);
  const userIdRef = useRef<string | null>(null);
  const handledCodes = useRef(new Set<string>());
  const pendingURL = useRef<string | null>(null);
  const authConfig = useRef<{
    supabaseUrl: string;
    supabaseKey: string;
  } | null>(null);
  const sessionRefresh = useRef<() => Promise<void>>(async () => {});
  const api = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const auth = clientRef.current;
      const origin = baseRef.current;
      const token = (await auth?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Please sign in to continue.');
      if (auth !== clientRef.current || origin !== baseRef.current)
        throw new Error('The server connection changed. Please retry.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch(`${origin}/api/mobile/${path}`, {
          ...options,
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, ...options.headers },
        });
        const result = await response.json();
        if (auth !== clientRef.current || origin !== baseRef.current)
          throw new Error('The server connection changed. Please retry.');
        if (!response.ok || result?.error || result?.ok === false) {
          if (path !== 'session' && [401, 403].includes(response.status))
            void sessionRefresh.current();
          throw new ApiError(
            typeof result.error === 'string'
              ? result.error
              : 'Could not complete the request.',
            response.status,
          );
        }
        return result as T;
      } catch (problem) {
        if (problem instanceof Error && problem.name === 'AbortError')
          throw new Error(
            'The server took too long to respond. Your previous data is still available. Pull down to retry.',
          );
        throw problem;
      } finally {
        clearTimeout(timeout);
      }
    },
    [],
  );
  const refreshSession = useCallback(async () => {
    const current = clientRef.current;
    if (!(await current?.auth.getSession())?.data.session) {
      setSession(null);
      return;
    }
    try {
      const result = await api<AppSession>('session');
      if (alive.current) {
        setSession(result);
        setError('');
      }
    } catch (problem) {
      if (alive.current) {
        if (
          problem instanceof ApiError &&
          [401, 403].includes(problem.status)
        ) {
          setSession(null);
          clearCache();
        }
        setError(
          problem instanceof Error
            ? problem.message
            : 'Could not load your family.',
        );
      }
    }
  }, [api]);
  useEffect(() => {
    sessionRefresh.current = refreshSession;
  }, [refreshSession]);
  const connect = useCallback(
    async (base: string) => {
      const normalized = serverAddress(base);
      setLoading(true);
      setError('');
      try {
        if (clientRef.current && normalized !== baseRef.current) {
          await clientRef.current.auth.signOut({ scope: 'local' });
          authSubscription.current?.();
          clientRef.current.auth.stopAutoRefresh();
          clientRef.current = null;
          setSupabase(null);
          setSession(null);
          userIdRef.current = null;
          clearCache();
        }
        const response = await fetchWithTimeout(
          `${normalized}/api/mobile/config`,
        );
        if (!response.ok)
          throw new Error(
            'This server does not have the Famora mobile API. Deploy the latest Famora version, then retry.',
          );
        const config = (await response.json()) as {
          supabaseUrl: string;
          supabaseKey: string;
        };
        if (!config.supabaseUrl?.startsWith('https://') || !config.supabaseKey)
          throw new Error('The server is missing its sign-in configuration.');
        config.supabaseUrl = serverAddress(config.supabaseUrl);
        authSubscription.current?.();
        clientRef.current?.auth.stopAutoRefresh();
        clearCache();
        const auth = createClient(config.supabaseUrl, config.supabaseKey, {
          auth: {
            storage: secureStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
            flowType: 'pkce',
          },
        });
        baseRef.current = normalized;
        clientRef.current = auth;
        authConfig.current = config;
        setServer(normalized);
        setSupabase(auth);
        setSession(null);
        await secureStorage.setItem('famora.apiBase', normalized);
        const { data } = auth.auth.onAuthStateChange((_event, next) => {
          if (next?.user.id !== userIdRef.current) {
            clearCache();
            setSession(null);
            userIdRef.current = next?.user.id || null;
          }
          if (!next) {
            setSession(null);
            clearCache();
          } else
            setTimeout(() => {
              void refreshSession();
            }, 0);
        });
        authSubscription.current = () => data.subscription.unsubscribe();
        auth.auth.startAutoRefresh();
        await refreshSession();
      } catch (problem) {
        setError(
          problem instanceof Error
            ? problem.message
            : 'Could not connect to Famora.',
        );
        throw problem;
      } finally {
        setLoading(false);
      }
    },
    [refreshSession],
  );
  useEffect(() => {
    alive.current = true;
    void secureStorage
      .getItem('famora.apiBase')
      .then(saved => connect(saved || API_BASE_URL))
      .catch(() => {});
    return () => {
      alive.current = false;
      authSubscription.current?.();
      clientRef.current?.auth.stopAutoRefresh();
    };
  }, [connect]);
  useEffect(() => {
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') {
        clientRef.current?.auth.startAutoRefresh();
        void refreshSession();
      } else clientRef.current?.auth.stopAutoRefresh();
    });
    const process = async (url: string) => {
      try {
        const callback = new URL(url);
        if (
          callback.protocol !== 'famora:' ||
          callback.hostname !== 'auth' ||
          callback.pathname !== '/callback' ||
          callback.username ||
          callback.password
        )
          return;
        const code = callback.searchParams.get('code');
        const auth = clientRef.current;
        if (!auth) {
          pendingURL.current = url;
          return;
        }
        if (!code)
          throw new Error(
            callback.searchParams.get('error') ||
              'Sign-in did not return a code.',
          );
        if (handledCodes.current.has(code)) return;
        handledCodes.current.add(code);
        const verifier = await secureStorage.getItem('famora.pkce');
        if (!verifier)
          throw new Error('This sign-in has expired. Please start again.');
        {
          const config = authConfig.current;
          if (!config)
            throw new Error('Please connect to your Famora server first.');
          const tokenResponse = await fetchWithTimeout(
            `${config.supabaseUrl}/auth/v1/token?grant_type=pkce`,
            {
              method: 'POST',
              headers: {
                apikey: config.supabaseKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                auth_code: code,
                code_verifier: verifier,
              }),
            },
          );
          const tokens = await tokenResponse.json();
          if (!tokenResponse.ok)
            throw new Error(
              tokens.msg ||
                tokens.error_description ||
                'Sign-in could not be completed.',
            );
          const applied = await auth.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          });
          if (applied.error) throw applied.error;
        }
        await secureStorage.removeItem('famora.pkce');
        await refreshSession();
      } catch (problem) {
        setError(
          problem instanceof Error ? problem.message : 'Could not sign in.',
        );
      }
    };
    const links = Linking.addEventListener('url', ({ url }) => {
      void process(url);
    });
    if (pendingURL.current) {
      const queued = pendingURL.current;
      pendingURL.current = null;
      void process(queued);
    }
    void Linking.getInitialURL().then(url => {
      if (url) void process(url);
    });
    return () => {
      app.remove();
      links.remove();
    };
  }, [refreshSession, supabase]);
  const login = async () => {
    setError('');
    if (!clientRef.current) {
      await connect(server);
      if (!clientRef.current) return;
    }
    const result = await createPKCE();
    await secureStorage.setItem('famora.pkce', result.verifier);
    await Linking.openURL(
      `${baseRef.current}/auth/mobile?challenge=${encodeURIComponent(
        result.challenge,
      )}`,
    );
  };
  const logout = async () => {
    await clientRef.current?.auth.signOut();
    setSession(null);
    clearCache();
  };
  return (
    <ClientContext.Provider
      value={{
        api,
        session,
        loading,
        error,
        server,
        connect,
        login,
        logout,
        refreshSession,
        supabase,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}
export function useClient() {
  const client = useContext(ClientContext);
  if (!client) throw new Error('ClientProvider is missing.');
  return client;
}
export function useResource<T>(path: string | null, interval = 0) {
  const { api } = useClient();
  const [, render] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!path) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const data = await api<T>(path);
      if (request === generation.current) {
        setCached(path, data);
        setError('');
      }
    } catch (problem) {
      if (request === generation.current)
        setError(
          problem instanceof Error ? problem.message : 'Could not refresh.',
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [api, path]);
  useEffect(() => {
    if (!path) return;
    let set = watchers.get(path);
    if (!set) {
      set = new Set();
      watchers.set(path, set);
    }
    const listener = () => render(n => n + 1);
    set.add(listener);
    void refresh();
    const timer = interval
      ? setInterval(() => {
          if (AppState.currentState === 'active') void refresh();
        }, interval)
      : undefined;
    return () => {
      generation.current++;
      set?.delete(listener);
      if (timer) clearInterval(timer);
    };
  }, [path, refresh, interval]);
  return {
    data: path ? getCached<T>(path) : undefined,
    loading,
    error,
    refresh,
  };
}
export function useAction() {
  const { api } = useClient();
  return useCallback(
    <T,>(
      action: string,
      id?: string,
      value?: string,
      data?: Record<string, unknown>,
    ) =>
      api<T>('action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, value, data }),
      }),
    [api],
  );
}
