import { Matterbridge, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { HomeAssistantPlatform } from './platform.js';
import initializePlugin from './index';
import { jest } from '@jest/globals';

describe('initializePlugin', () => {
  let mockMatterbridge: Matterbridge;
  let mockLog: AnsiLogger;
  let mockConfig: PlatformConfig;

  beforeEach(() => {
    mockMatterbridge = { matterbridgePluginDirectory: 'temp', addBridgedDevice: jest.fn() } as unknown as Matterbridge;
    mockLog = { fatal: jest.fn(), error: jest.fn(), warn: jest.fn(), notice: jest.fn(), info: jest.fn(), debug: jest.fn() } as unknown as AnsiLogger;
    mockConfig = {
      'name': 'matterbridge-homeassistant',
      'type': 'DynamicPlatform',
      'blackList': [],
      'whiteList': [],
      'debug': false,
      'unregisterOnShutdown': false,
    } as PlatformConfig;
  });

  it('should return an instance of MatterPlatform', () => {
    const platform = initializePlugin(mockMatterbridge, mockLog, mockConfig);
    expect(platform).toBeInstanceOf(HomeAssistantPlatform);
  });
});
