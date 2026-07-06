/**
 * @file vitest/payload.test.ts
 * @description This file contains the tests for the Home Assistant payload helper.
 * @author Luca Liguori
 */

const NAME = 'Payload';

import fs from 'node:fs';
import path from 'node:path';

import { HOMEDIR, setupTest } from 'matterbridge/vitest-utils';

import type { HassArea, HassDevice, HassEntity, HassLabel, HassServices, HassState, HomeAssistant } from '../src/homeAssistant.js';
import { savePayload } from '../src/payload.js';

// Setup the test environment
await setupTest(NAME, false);

const PAYLOAD_DIRECTORY = path.join(HOMEDIR, 'matterbridge-hass');
const FILE_PATH = path.join(PAYLOAD_DIRECTORY, 'homeassistant.json');

function createHomeAssistant(): HomeAssistant {
  return {
    hassDevices: new Map<string, HassDevice>(),
    hassEntities: new Map<string, HassEntity>(),
    hassStates: new Map<string, HassState>(),
    hassAreas: new Map<string, HassArea>(),
    hassLabels: new Map<string, HassLabel>(),
    hassConfig: null,
    hassServices: null,
  } as HomeAssistant;
}

type PayloadPlatformStub = {
  ha: HomeAssistant;
  log: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  matterbridge: {
    matterbridgePluginDirectory: string;
  };
};

function createPlatform(pluginDirectory = HOMEDIR): PayloadPlatformStub {
  return {
    ha: createHomeAssistant(),
    log: {
      debug: vi.fn(),
      error: vi.fn(),
    },
    matterbridge: {
      matterbridgePluginDirectory: pluginDirectory,
    },
  };
}

describe('Payload', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.promises.mkdir(PAYLOAD_DIRECTORY, { recursive: true });
    await fs.promises.rm(FILE_PATH, { force: true });
  });

  afterEach(async () => {
    await fs.promises.rm(FILE_PATH, { force: true });
  });

  it('should save the Home Assistant payload to a file', async () => {
    const platform = createPlatform();

    await savePayload(platform as unknown as Parameters<typeof savePayload>[0]);

    expect(platform.log.debug).toHaveBeenCalledWith(`Payload successfully written to ${FILE_PATH}`);

    const savedPayload = JSON.parse(await fs.promises.readFile(FILE_PATH, 'utf8')) as {
      devices: unknown[];
      entities: unknown[];
      areas: unknown[];
      labels: unknown[];
      states: unknown[];
      config: unknown;
      services: unknown;
    };

    expect(savedPayload).toEqual({
      devices: [],
      entities: [],
      areas: [],
      labels: [],
      states: [],
      config: null,
      services: null,
    });
  });

  it('should fail to save the Home Assistant payload to a file', async () => {
    const platform = createPlatform(FILE_PATH);
    const expectedFilePath = path.join(FILE_PATH, 'matterbridge-hass', 'homeassistant.json');

    await savePayload(platform as unknown as Parameters<typeof savePayload>[0]);

    expect(platform.log.error).toHaveBeenCalledWith(expect.stringContaining(`Error writing payload to file ${expectedFilePath}:`));
  });
});
