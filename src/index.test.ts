/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { HomeAssistantPlatform } from './platform.js';
import initializePlugin from './index';
import { jest } from '@jest/globals';

describe('initializePlugin', () => {
  const mockLog = {
    fatal: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.fatal', message, parameters);
    }),
    error: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.error', message, parameters);
    }),
    warn: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.warn', message, parameters);
    }),
    notice: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.notice', message, parameters);
    }),
    info: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.info', message, parameters);
    }),
    debug: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.debug', message, parameters);
    }),
  } as unknown as AnsiLogger;

  const mockMatterbridge = {
    matterbridgeDirectory: './jest/matterbridge',
    matterbridgePluginDirectory: './jest/plugins',
    systemInformation: { ipv4Address: undefined, ipv6Address: undefined, osRelease: 'xx.xx.xx.xx.xx.xx', nodeVersion: '22.1.10' },
    matterbridgeVersion: '2.2.6',
    edge: true,
    log: mockLog,
    getDevices: jest.fn(() => {
      // console.log('getDevices called');
      return [];
    }),
    getPlugins: jest.fn(() => {
      // console.log('getDevices called');
      return [];
    }),
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      // console.log('addBridgedEndpoint called');
    }),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      // console.log('removeBridgedEndpoint called');
    }),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {
      // console.log('removeAllBridgedEndpoints called');
    }),
  } as unknown as Matterbridge;

  const mockConfig = {
    'name': 'matterbridge-hass',
    'type': 'DynamicPlatform',
    'blackList': [],
    'whiteList': [],
    'host': 'http://homeassistant.local:8123',
    'token': 'long-lived token',
    'debug': false,
    'unregisterOnShutdown': false,
  } as PlatformConfig;

  // Spy on and mock the AnsiLogger.log method
  const loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {
    // console.error(`Mocked AnsiLogger.log: ${level} - ${message}`, ...parameters);
  });

  // Spy on and mock console.log
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {
    // console.error('Mocked console.log', args);
  });

  it('should return an instance of HomeAssistantPlatform', async () => {
    const platform = initializePlugin(mockMatterbridge, mockLog, mockConfig);
    expect(platform).toBeInstanceOf(HomeAssistantPlatform);
    platform.onShutdown();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for ha.close() to complete
  });
});
