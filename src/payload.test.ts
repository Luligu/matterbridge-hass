// src\payload.test.ts

const NAME = 'Payload';
const HOMEDIR = path.join('jest', NAME);

import fs from 'node:fs';
import path from 'node:path';

import { jest } from '@jest/globals';
import { setupTest } from 'matterbridge/jestutils';
import type { AnsiLogger } from 'matterbridge/logger';

import type { HassArea, HassDevice, HassEntity, HassLabel, HassServices, HassState, HomeAssistant } from './homeAssistant.js';
import { savePayload } from './payload.js';

// Setup the test environment
await setupTest(NAME, false);

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

describe('Payload', () => {
  const filePath = path.join(HOMEDIR, 'payload.json');
  let logger: Pick<AnsiLogger, 'debug' | 'error'>;

  beforeEach(async () => {
    jest.clearAllMocks();
    logger = {
      debug: jest.fn(),
      error: jest.fn(),
    };
    await fs.promises.mkdir(HOMEDIR, { recursive: true });
    await fs.promises.rm(filePath, { force: true });
  });

  afterEach(async () => {
    await fs.promises.rm(filePath, { force: true });
  });

  it('should save the Home Assistant payload to a file', async () => {
    const ha = createHomeAssistant();

    await savePayload(ha, filePath, logger as AnsiLogger);

    expect(logger.debug).toHaveBeenCalledWith(`Payload successfully written to ${filePath}`);

    const savedPayload = JSON.parse(await fs.promises.readFile(filePath, 'utf8')) as {
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
    const ha = createHomeAssistant();

    await savePayload(ha, HOMEDIR, logger as AnsiLogger);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error writing payload to file ${HOMEDIR}:`));
  });
});
