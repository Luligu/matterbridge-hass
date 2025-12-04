// src\homeAssistant.test.ts

const MATTER_PORT = 0;
const NAME = 'HomeAssistantFetch';
const HOMEDIR = path.join('jest', NAME);

// Home Assistant Fetch Test

import path from 'node:path';
import * as fs from 'node:fs';

import { jest } from '@jest/globals';
import * as undici from 'undici';
import { loggerErrorSpy, loggerNoticeSpy, setupTest } from 'matterbridge/jestutils';

// Setup the test environment
await setupTest(NAME, false);

const { HomeAssistant } = await import('./homeAssistant.js');

type HomeAssistantInstance = InstanceType<typeof HomeAssistant>;

describe('HomeAssistant.waitForHassRunning', () => {
  let homeAssistant: HomeAssistantInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    homeAssistant = new HomeAssistant('ws://localhost:8123', 'token');
  });

  it('returns true when Home Assistant core reports RUNNING', async () => {
    const fetchResponse = {
      ok: true,
      text: jest.fn(async () => JSON.stringify({ state: 'RUNNING' })),
    };
    const fetchMock = jest.spyOn(globalThis as unknown as { fetch: (...args: [unknown?, unknown?]) => Promise<typeof fetchResponse> }, 'fetch');
    fetchMock.mockResolvedValue(fetchResponse);

    try {
      await expect(homeAssistant.waitForHassRunning()).resolves.toBe(true);

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8123/api/core/state',
        expect.objectContaining({
          headers: { Authorization: 'Bearer token' },
        }),
      );

      expect(loggerNoticeSpy).toHaveBeenCalledWith('Home Assistant core is RUNNING');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('uses https fetch with TLS dispatcher when wsUrl is wss://', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', 'token');

    const fetchResponse = {
      ok: true,
      text: jest.fn(async () => JSON.stringify({ state: 'RUNNING' })),
    };
    const fetchMock = jest.spyOn(globalThis as unknown as { fetch: (...args: [unknown?, unknown?]) => Promise<typeof fetchResponse> }, 'fetch');
    fetchMock.mockResolvedValue(fetchResponse);

    try {
      await expect(homeAssistant.waitForHassRunning()).resolves.toBe(true);

      expect(fetchMock).toHaveBeenCalledWith('https://localhost:8123/api/core/state', expect.any(Object));

      const fetchOptions = fetchMock.mock.calls[0]?.[1] as { dispatcher?: unknown; headers?: Record<string, string> };
      expect(fetchOptions?.headers).toEqual({ Authorization: 'Bearer token' });
      expect(fetchOptions?.dispatcher).toBeInstanceOf(undici.Agent);

      expect(loggerNoticeSpy).toHaveBeenCalledWith('Home Assistant core is RUNNING');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('loads CA certificate when certificatePath is provided', async () => {
    const certificatePath = path.join(HOMEDIR, 'ca.pem');
    fs.mkdirSync(path.dirname(certificatePath), { recursive: true });
    fs.writeFileSync(certificatePath, 'dummy-ca');

    homeAssistant = new HomeAssistant('wss://localhost:8123', 'token', undefined, undefined, certificatePath, false);

    const fetchResponse = {
      ok: true,
      text: jest.fn(async () => JSON.stringify({ state: 'RUNNING' })),
    };
    const fetchMock = jest.spyOn(globalThis as unknown as { fetch: (...args: [unknown?, unknown?]) => Promise<typeof fetchResponse> }, 'fetch');
    fetchMock.mockResolvedValue(fetchResponse);

    try {
      await expect(homeAssistant.waitForHassRunning()).resolves.toBe(true);

      expect(fetchMock).toHaveBeenCalledWith('https://localhost:8123/api/core/state', expect.any(Object));

      const fetchOptions = fetchMock.mock.calls[0]?.[1] as { dispatcher?: unknown; headers?: Record<string, string> };
      expect(fetchOptions?.headers).toEqual({ Authorization: 'Bearer token' });
      expect(fetchOptions?.dispatcher).toBeInstanceOf(undici.Agent);

      expect(loggerNoticeSpy).toHaveBeenCalledWith('Home Assistant core is RUNNING');
    } finally {
      fetchMock.mockRestore();
      fs.rmSync(certificatePath, { force: true });
    }
  });

  it('logs error when fetch throws', async () => {
    const fetchError = new Error('network failure');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(fetchError);

    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: (...args: unknown[]) => void) => {
      if (typeof handler === 'function') {
        handler();
      }
      return {} as NodeJS.Timeout;
    }) as typeof setTimeout);

    try {
      await expect(homeAssistant.waitForHassRunning()).resolves.toBe(false);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Home Assistant core is not RUNNING: Error: network failure'));
      expect(fetchMock).toHaveBeenCalledTimes(20);
    } finally {
      fetchMock.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });

  it('returns false after reaching max delay when core never RUNNING', async () => {
    const fetchResponse = {
      ok: true,
      text: jest.fn(async () => JSON.stringify({ state: 'STARTING' })),
    };
    const fetchMock = jest.spyOn(globalThis as unknown as { fetch: (...args: [unknown?, unknown?]) => Promise<typeof fetchResponse> }, 'fetch');
    fetchMock.mockResolvedValue(fetchResponse);

    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: (...args: unknown[]) => void) => {
      if (typeof handler === 'function') {
        handler();
      }
      return {} as NodeJS.Timeout;
    }) as typeof setTimeout);

    try {
      await expect(homeAssistant.waitForHassRunning()).resolves.toBe(false);

      expect(fetchMock).toHaveBeenCalledTimes(20);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    } finally {
      fetchMock.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });
});
