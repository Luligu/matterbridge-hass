// src\homeAssistant.test.ts

const MATTER_PORT = 0;
const NAME = 'HomeAssistantFetch';
const HOMEDIR = path.join('jest', NAME);

// Home Assistant Fetch Test

import path from 'node:path';

import { jest } from '@jest/globals';
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

  it('returns false and logs error when fetch throws', async () => {
    const fetchError = new Error('network failure');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(fetchError);

    try {
      await expect(homeAssistant.waitForHassRunning()).resolves.toBe(false);

      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Home Assistant core is not RUNNING: network failure'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
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

      expect(fetchMock).toHaveBeenCalledTimes(60);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    } finally {
      fetchMock.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });
});
