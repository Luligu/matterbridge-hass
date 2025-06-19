// Home Assistant Real WebSocket Client Tests

import fs from 'node:fs';
import path from 'node:path';

import { jest } from '@jest/globals';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';

import { HassArea, HassConfig, HassDevice, HassEntity, HassServices, HassState, HomeAssistant } from './homeAssistant.js';

let loggerLogSpy: jest.SpiedFunction<typeof AnsiLogger.prototype.log>;
let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
let consoleDebugSpy: jest.SpiedFunction<typeof console.log>;
let consoleInfoSpy: jest.SpiedFunction<typeof console.log>;
let consoleWarnSpy: jest.SpiedFunction<typeof console.log>;
let consoleErrorSpy: jest.SpiedFunction<typeof console.log>;
const debug = false; // Set to true to enable debug logging

if (!debug) {
  loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {});
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {});
  consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((...args: any[]) => {});
  consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation((...args: any[]) => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation((...args: any[]) => {});
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: any[]) => {});
} else {
  loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log');
  consoleLogSpy = jest.spyOn(console, 'log');
  consoleDebugSpy = jest.spyOn(console, 'debug');
  consoleInfoSpy = jest.spyOn(console, 'info');
  consoleWarnSpy = jest.spyOn(console, 'warn');
  consoleErrorSpy = jest.spyOn(console, 'error');
}

let accessToken: string | null = null;
try {
  accessToken = fs.readFileSync(path.join('certificates', 'ubuntuToken'), 'utf8').trim();
} catch (error) {
  accessToken = null;
}

describe('HomeAssistant real test on ubuntu', () => {
  let homeAssistant: HomeAssistant;
  const wsUrl = 'ws://192.168.69.1:8123';
  let subscriptionId = 0;
  const testEntityId = 'light.virtual_light';

  let device_registry_response: HassDevice[] = [];
  let entity_registry_response: HassEntity[] = [];
  let area_registry_response: HassArea[] = [];
  let label_registry_response: HassArea[] = [];
  let states_response: HassState[] = [];
  let services_response: HassServices = {} as HassServices;
  let config_response: HassConfig = {} as HassConfig;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  it('should have at least one test', () => {
    expect(wsUrl).toBeDefined();
  });

  if (!accessToken) return;

  it('should create an instance of HomeAssistant', () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    expect(homeAssistant).toBeDefined();
    expect(homeAssistant.wsUrl).toBe(wsUrl);
    expect(homeAssistant.wsAccessToken).toBe(accessToken);
    expect((homeAssistant as any).reconnectTimeoutTime).toBe(60 * 1000);
    expect((homeAssistant as any).reconnectRetries).toBe(10);
    expect(homeAssistant).toBeInstanceOf(HomeAssistant);
  });

  it('should establish a WebSocket connection to Home Assistant', async () => {
    let opened = false;
    homeAssistant.once('socket_opened', () => {
      opened = true;
    });

    await new Promise<void>((resolve) => {
      homeAssistant.once('connected', () => {
        resolve();
      });
      homeAssistant.connect();
    });

    expect(opened).toBe(true);
    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.ws).not.toBeNull();
    expect((homeAssistant as any).pingInterval).not.toBeNull();
    expect((homeAssistant as any).pingTimeout).toBeNull();
    expect((homeAssistant as any).reconnectTimeout).toBeNull();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Connecting to Home Assistant on ${homeAssistant.wsUrl}...`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `WebSocket connection established`);
  });

  it('should get the devices from Home Assistant', async () => {
    device_registry_response = await homeAssistant.fetch('config/device_registry/list');
    expect(device_registry_response.length).toBeGreaterThan(0);
  });

  it('should get the entities from Home Assistant', async () => {
    entity_registry_response = await homeAssistant.fetch('config/entity_registry/list');
    expect(entity_registry_response.length).toBeGreaterThan(0);
  });

  it('should get the areas from Home Assistant', async () => {
    area_registry_response = await homeAssistant.fetch('config/area_registry/list');
    expect(area_registry_response.length).toBeGreaterThan(0);
  });

  it('should get the labels from Home Assistant', async () => {
    label_registry_response = await homeAssistant.fetch('config/label_registry/list');
    expect(label_registry_response.length).toBeGreaterThan(0);
  });

  it('should get the states from Home Assistant', async () => {
    states_response = await homeAssistant.fetch('get_states');
    expect(states_response.length).toBeGreaterThan(0);
  });

  it('should get the config  from Home Assistant', async () => {
    config_response = await homeAssistant.fetch('get_config');
    expect(typeof config_response).toBe('object');
  });

  it('should get the services from Home Assistant', async () => {
    services_response = await homeAssistant.fetch('get_services');
    expect(typeof services_response).toBe('object');
  });

  it('should fetch initial data from Home Assistant', async () => {
    await expect(homeAssistant.fetchData()).resolves.toBeUndefined();
  });

  it('should subscribe to Home Assistant', async () => {
    subscriptionId = await homeAssistant.subscribe();
    expect(subscriptionId).toBe(15);
  });

  it('should fail to fetch from Home Assistant', async () => {
    await expect(homeAssistant.fetch('notvalid')).rejects.toThrow('Unknown command.');
  });

  it('should call_service for domain light with turn_on to Home Assistant', async () => {
    const result = await homeAssistant.callService('light', 'turn_on', testEntityId);
    expect(result).toBeDefined();
    expect(result.context).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for state update
    expect(homeAssistant.hassStates.get(testEntityId)?.state).toBe('on');
  });

  it('should call_service for domain light with brightness 255 to Home Assistant', async () => {
    const result = await homeAssistant.callService('light', 'turn_on', testEntityId, { brightness: 255 });
    expect(result).toBeDefined();
    expect(result.context).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for state update
    expect(homeAssistant.hassStates.get(testEntityId)?.attributes.brightness).toBe(255);
  });

  it('should call_service for domain light with brightness 10 to Home Assistant', async () => {
    const result = await homeAssistant.callService('light', 'turn_on', testEntityId, { brightness: 10 });
    expect(result).toBeDefined();
    expect(result.context).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for state update
    expect(homeAssistant.hassStates.get(testEntityId)?.attributes.brightness).toBe(10);
  });

  it('should call_service for domain light with turn_off to Home Assistant', async () => {
    const result = await homeAssistant.callService('light', 'turn_off', testEntityId);
    expect(result).toBeDefined();
    expect(result.context).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for state update
    expect(homeAssistant.hassStates.get(testEntityId)?.state).toBe('off');
  });

  it('should fail to call_service to Home Assistant with a not valid domain', async () => {
    await expect(homeAssistant.callService('notadomain', 'turn_on', testEntityId)).rejects.toThrow('Service notadomain.turn_on not found.');
  });

  it('should fail to call_service to Home Assistant with a not valid service', async () => {
    await expect(homeAssistant.callService('light', 'notvalid', testEntityId)).rejects.toThrow('Service light.notvalid not found.');
  });

  it('should fail to call_service to Home Assistant with a not valid entity', async () => {
    await expect(homeAssistant.callService('light', 'turn_on', 'notvalid')).rejects.toThrow("not a valid value for dictionary value @ data['target']['entity_id']. Got 'notvalid'");
  });

  it('should unsubscribe to Home Assistant', async () => {
    await expect(homeAssistant.unsubscribe(subscriptionId)).resolves.toBeUndefined();
  });

  it('should unsubscribe to Home Assistant and fail', async () => {
    await expect(homeAssistant.unsubscribe(1)).rejects.toThrow('Subscription not found.');
  });

  it('should close the WebSocket connection to Home Assistant', async () => {
    let closed = false;
    homeAssistant.on('socket_closed', () => {
      closed = true;
    });

    await new Promise<void>((resolve) => {
      homeAssistant.on('disconnected', () => {
        resolve();
      });
      homeAssistant.close();
    });

    expect(closed).toBe(true);
    expect(homeAssistant.connected).toBe(false);
    expect(homeAssistant.ws).toBeNull();
    expect((homeAssistant as any).pingInterval).toBeNull();
    expect((homeAssistant as any).pingTimeout).toBeNull();
    expect((homeAssistant as any).reconnectTimeout).toBeNull();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Closing Home Assistant connection...`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Home Assistant connection closed`);
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });
});
