import React from 'react';
import Renderer from 'react-test-renderer';
import { Linking } from 'react-native';
import { ClientProvider, getCached, setCached, useClient } from '../src/client';

const mockStorage = new Map<string, string>();
let mockHasSession = false;
let mockAuthListener: ((event: string, session: unknown) => void) | null = null;
const mockAuth = {
  getSession: jest.fn(async () => ({
    data: {
      session: mockHasSession
        ? { access_token: 'fixture-access-token', user: { id: 'fixture-user' } }
        : null,
    },
  })),
  onAuthStateChange: jest.fn(
    (listener: (event: string, session: unknown) => void) => {
      mockAuthListener = listener;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    },
  ),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
  setSession: jest.fn(async () => {
    mockHasSession = true;
    mockAuthListener?.('SIGNED_IN', { user: { id: 'fixture-user' } });
    return { error: null };
  }),
  signOut: jest.fn(async () => {
    mockHasSession = false;
    mockAuthListener?.('SIGNED_OUT', null);
    return { error: null };
  }),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: mockAuth }),
}));
jest.mock('../src/native', () => ({
  secureStorage: {
    getItem: async (key: string) => mockStorage.get(key) || null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key);
    },
  },
  createPKCE: async () => ({
    challenge: 'fixture-challenge',
    verifier: 'fixture-verifier',
  }),
}));
jest.mock('../src/generated/config', () => ({
  API_BASE_URL: 'https://famora.example',
}));
let current: ReturnType<typeof useClient>;
function Probe() {
  current = useClient();
  return null;
}
const family = {
  user: {
    id: 'fixture-user',
    displayName: 'Fixture family',
    email: 'fixture@example.com',
  },
  family: { id: 'family', name: 'Fixture family' },
  memberId: 'member',
  permissions: [],
  preferences: {},
  features: [],
  modules: {},
  preferenceSections: {},
  role: 'MEMBER',
};
const response = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  mockStorage.clear();
  mockStorage.set('famora.apiBase', 'https://famora.example');
  mockHasSession = false;
  mockAuthListener = null;
  jest.clearAllMocks();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
});
afterEach(() => jest.restoreAllMocks());

test('an unreachable initial server stops loading and exposes a retryable connection error', async () => {
  jest.useFakeTimers();
  let tree: Renderer.ReactTestRenderer | undefined;
  try {
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    await Renderer.act(async () => {
      tree = Renderer.create(
        <ClientProvider>
          <Probe />
        </ClientProvider>,
      );
      await Promise.resolve();
    });
    expect(current.loading).toBe(true);
    await Renderer.act(async () => {
      jest.advanceTimersByTime(12000);
      await Promise.resolve();
    });
    expect(current.loading).toBe(false);
    expect(current.error).toContain('Check your connection');
  } finally {
    if (tree) await Renderer.act(async () => tree?.unmount());
    jest.useRealTimers();
  }
}, 30000);

test('a cold-start OAuth callback waits for configuration and exchanges its code exactly once', async () => {
  mockStorage.set('famora.pkce', 'fixture-verifier');
  jest
    .spyOn(Linking, 'getInitialURL')
    .mockResolvedValue('famora://auth/callback?code=fixture-code');
  let resolveConfig!: (value: Response) => void;
  const config = new Promise<Response>(resolve => {
    resolveConfig = resolve;
  });
  const fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/config')) return config;
      if (url.includes('/auth/v1/token'))
        return response({
          access_token: 'fixture-access-token',
          refresh_token: 'fixture-refresh-token',
        });
      return response(family);
    });
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <ClientProvider>
        <Probe />
      </ClientProvider>,
    );
    await flush();
  });
  expect(mockAuth.setSession).not.toHaveBeenCalled();
  await Renderer.act(async () => {
    resolveConfig(
      response({
        supabaseUrl: 'https://supabase.example',
        supabaseKey: 'public-fixture-key',
      }),
    );
    await flush();
    await flush();
  });
  expect(mockAuth.setSession).toHaveBeenCalledTimes(1);
  expect(
    fetcher.mock.calls.filter(([url]) =>
      String(url).includes('/auth/v1/token'),
    ),
  ).toHaveLength(1);
  expect(current.session?.user.id).toBe('fixture-user');
  expect(mockStorage.has('famora.pkce')).toBe(false);
  await Renderer.act(async () => tree.unmount());
}, 30000);

test('revoked family access clears cached native records and the displayed profile', async () => {
  mockHasSession = true;
  let revoked = false;
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async input =>
      String(input).endsWith('/config')
        ? response({
            supabaseUrl: 'https://supabase.example',
            supabaseKey: 'public-fixture-key',
          })
        : revoked
        ? response({ error: 'Family access was revoked.' }, 403)
        : response(family),
    );
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <ClientProvider>
        <Probe />
      </ClientProvider>,
    );
    await flush();
    await flush();
  });
  expect(current.session?.user.id).toBe('fixture-user');
  setCached('workspace/tasks', { items: [{ title: 'Private task' }] });
  revoked = true;
  await Renderer.act(async () => {
    await expect(current.api('workspace/tasks')).rejects.toThrow('revoked');
    await flush();
    await flush();
  });
  expect(current.session).toBeNull();
  expect(getCached('workspace/tasks')).toBeUndefined();
  await Renderer.act(async () => tree.unmount());
}, 30000);

test('changing the server clears the previous session before sending any new-origin request', async () => {
  mockHasSession = true;
  const fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async input =>
      String(input).endsWith('/config')
        ? response({
            supabaseUrl: 'https://supabase.example',
            supabaseKey: 'public-fixture-key',
          })
        : response(family),
    );
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(
      <ClientProvider>
        <Probe />
      </ClientProvider>,
    );
    await flush();
    await flush();
  });
  setCached('workspace/tasks', { items: [{ title: 'Private task' }] });
  await Renderer.act(async () => {
    await current.connect('https://another-famora.example');
    await flush();
  });
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(current.session).toBeNull();
  expect(getCached('workspace/tasks')).toBeUndefined();
  const newOrigin = fetcher.mock.calls.filter(([url]) =>
    String(url).startsWith('https://another-famora.example'),
  );
  expect(newOrigin.length).toBeGreaterThan(0);
  for (const [, options] of newOrigin) expect(options?.headers).toBeUndefined();
  await expect(current.api('workspace/tasks')).rejects.toThrow('sign in');
  await Renderer.act(async () => tree.unmount());
}, 30000);
