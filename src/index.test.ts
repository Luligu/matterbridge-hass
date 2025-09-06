// src\index.test.ts

const MATTER_PORT = 0;
const NAME = 'Index';
const HOMEDIR = path.join('jest', NAME);

import path from 'node:path';
import { rmSync } from 'node:fs';

import { jest } from '@jest/globals';
import { type Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { AnsiLogger, CYAN, nf, rs, LogLevel, idn, TimestampFormat } from 'matterbridge/logger';

import { HomeAssistantPlatform, HomeAssistantPlatformConfig } from './platform.js';
import { consoleDebugSpy, consoleErrorSpy, consoleInfoSpy, consoleLogSpy, consoleWarnSpy, loggerLogSpy, setDebug, setupTest } from './jestHelpers.js';

import initializePlugin from './index.js';

// Setup the test environment
setupTest(NAME, false);

describe('initializePlugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const log = new AnsiLogger({ logName: NAME, logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });

  const mockMatterbridge = {
    matterbridgeDirectory: HOMEDIR + '/.matterbridge',
    matterbridgePluginDirectory: HOMEDIR + '/Matterbridge',
    systemInformation: {
      ipv4Address: undefined,
      ipv6Address: undefined,
      osRelease: 'xx.xx.xx.xx.xx.xx',
      nodeVersion: '22.1.10',
    },
    matterbridgeVersion: '3.2.4',
    log,
    getDevices: jest.fn(() => []),
    getPlugins: jest.fn(() => []),
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
  } as unknown as Matterbridge;

  const mockConfig = {
    name: 'matterbridge-hass',
    type: 'DynamicPlatform',
    version: '1.0.0',
    host: 'ws://homeassistant.local:8123',
    token: 'long-lived token',
    certificatePath: '',
    rejectUnauthorized: true,
    reconnectTimeout: 60,
    reconnectRetries: 10,
    filterByArea: '',
    filterByLabel: '',
    applyFiltersToDeviceEntities: false,
    whiteList: [],
    blackList: [],
    entityBlackList: [],
    deviceEntityBlackList: {},
    splitEntities: [],
    namePostfix: '',
    postfix: '',
    airQualityRegex: '',
    enableServerRvc: false,
    debug: false,
    unregisterOnShutdown: false,
  } as HomeAssistantPlatformConfig;

  let platform: HomeAssistantPlatform;

  it('should return an instance of HomeAssistantPlatform', async () => {
    platform = initializePlugin(mockMatterbridge, log, mockConfig);
    expect(platform).toBeInstanceOf(HomeAssistantPlatform);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Initializing platform: ${CYAN}${mockConfig.name}${nf} version: ${CYAN}${mockConfig.version}${rs}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Initialized platform: ${CYAN}${mockConfig.name}${nf} version: ${CYAN}${mockConfig.version}${rs}`);
  });

  it('should shutdown the platform', async () => {
    expect(platform).toBeInstanceOf(HomeAssistantPlatform);
    await platform.onShutdown('Unit test shutdown');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Unit test shutdown`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Shut down platform ${idn}${mockConfig.name}${rs}${nf} completed`);
  });
});
