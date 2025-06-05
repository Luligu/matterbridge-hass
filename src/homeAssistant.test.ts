// Home Assistant WebSocket Client Tests

/* eslint-disable jest/no-conditional-expect */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { WebSocket, WebSocketServer } from 'ws';
import { AnsiLogger, CYAN, db, LogLevel } from 'matterbridge/logger';
import { wait } from 'matterbridge/utils';

import { HassArea, HassConfig, HassDevice, HassEntity, HassServices, HassState, HassWebSocketResponseResult, HomeAssistant } from './homeAssistant';

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

describe('HomeAssistant', () => {
  let server: WebSocketServer;
  let client: WebSocket;
  let homeAssistant: HomeAssistant;
  const wsUrl = 'ws://localhost:8123';
  const apiPath = '/api/websocket';
  const accessToken = 'testAccessToken';
  const reconnectTimeoutTime = 120;
  const reconnectRetries = 10;

  const device_registry_response: HassDevice[] = [];
  const entity_registry_response: HassEntity[] = [];
  const area_registry_response: HassArea[] = [];
  const states_response: HassState[] = [];
  const services_response: HassServices = {};
  const config_response: HassConfig = {} as HassConfig;

  beforeAll(async () => {
    server = new WebSocketServer({ port: 8123, path: apiPath });

    server.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      // console.log('WebSocket server new client connected:', ip);

      // Simulate sending "auth_required" when the client connects
      ws.send(JSON.stringify({ type: 'auth_required' }));

      ws.on('message', (message) => {
        const msg = JSON.parse(message.toString());
        // console.log('WebSocket server received a message:', msg);
        if (msg.type === 'auth' && msg.access_token === accessToken) {
          ws.send(JSON.stringify({ type: 'auth_ok' }));
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ id: msg.id, type: 'pong', success: true, result: {} }));
        } else if (msg.type === 'get_config') {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: config_response }));
        } else if (msg.type === 'get_services') {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: services_response }));
        } else if (msg.type === 'config/device_registry/list') {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: device_registry_response }));
        } else if (msg.type === 'config/entity_registry/list') {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: entity_registry_response }));
        } else if (msg.type === 'config/area_registry/list') {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: area_registry_response }));
        } else if (msg.type === 'get_states') {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: states_response }));
        } else if (msg.type === 'subscribe_events') {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true }));
        } else if (msg.type === 'call_service') {
          ws.send(JSON.stringify({ id: (homeAssistant as any).eventsSubscribeId, type: 'event', success: true, event: { event_type: 'call_service' } }));
          ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: {} }));
        }
      });
    });

    server.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    await new Promise((resolve) => {
      server.on('listening', () => {
        console.log('WebSocket server listening on', wsUrl + apiPath);
        resolve(undefined);
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    //
  });

  afterAll(async () => {
    for (const client of server.clients) {
      client.terminate();
    }

    await new Promise((resolve) => {
      server.close(() => {
        console.log('WebSocket server closed');
        resolve(undefined);
      });
    });
  });

  it('client should connect', async () => {
    client = new WebSocket(wsUrl + apiPath);
    expect(client).toBeInstanceOf(WebSocket);

    return new Promise((resolve) => {
      client.once('open', () => {
        console.log('WebSocket client connected');
        resolve(undefined);
      });
    });
  });

  it('client should close', async () => {
    expect(client).toBeInstanceOf(WebSocket);

    return new Promise((resolve) => {
      client.on('close', () => {
        console.log('WebSocket client closed');
        resolve(undefined);
      });
      client.close();
    });
  });

  it('should create an instance of HomeAssistant', () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken, reconnectTimeoutTime, reconnectRetries);
    expect(homeAssistant).toBeDefined();
    expect(homeAssistant.wsUrl).toBe(wsUrl);
    expect(homeAssistant.wsAccessToken).toBe(accessToken);
    expect((homeAssistant as any).reconnectTimeoutTime).toBe(reconnectTimeoutTime * 1000);
    expect((homeAssistant as any).reconnectRetries).toBe(reconnectRetries);
    expect(homeAssistant).toBeInstanceOf(HomeAssistant);
  });

  it('fetch should log error if not connected to HomeAssistant', async () => {
    try {
      await homeAssistant.fetch('get_states');
    } catch (error) {
      expect(error.message).toBe('Fetch error: not connected to Home Assistant');
    }
  });

  it('callService should log error if not connected to HomeAssistant', async () => {
    try {
      await homeAssistant.callService('light', 'turn_on', 'myentityid', {});
    } catch (error) {
      expect(error.message).toBe('CallService error: not connected to Home Assistant');
    }
  });

  it('fetch should log error if ws is not connected to HomeAssistant', async () => {
    homeAssistant.connected = true;
    try {
      await homeAssistant.fetch('get_states');
    } catch (error) {
      expect(error.message).toBe('Fetch error: WebSocket not open');
    }
    homeAssistant.connected = false;
  });

  it('callService should log error if ws is not connected to HomeAssistant', async () => {
    homeAssistant.connected = true;
    try {
      await homeAssistant.callService('light', 'turn_on', 'myentityid', {});
    } catch (error) {
      expect(error.message).toBe('CallService error: WebSocket not open');
    }
    homeAssistant.connected = false;
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
    expect((homeAssistant as any).reconnectTimeoutTime).toBe(120 * 1000);
    expect((homeAssistant as any).reconnectRetries).toBe(10);
    expect((homeAssistant as any).pingInterval).not.toBeNull();
    expect((homeAssistant as any).pingTimeout).toBeNull();
    expect((homeAssistant as any).reconnectTimeout).toBeNull();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Connecting to Home Assistant on ${homeAssistant.wsUrl}...`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `WebSocket connection established`);

    expect(server.clients.size).toBe(1);
    client = Array.from(server.clients)[0];
  });

  it('should log error if cannot parse message from Home Assistant', async () => {
    client.send('invalid message');
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, expect.stringContaining(`Error parsing WebSocket message: SyntaxError: Unexpected token`));
  });

  it('should parse message from Home Assistant with binary=true', async () => {
    client.send('invalid message', { binary: true });
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, expect.stringContaining(`Error parsing WebSocket message: SyntaxError: Unexpected token`));
  });

  it('should parse message from Home Assistant with binary=false', async () => {
    client.send('invalid message', { binary: false });
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, expect.stringContaining(`Error parsing WebSocket message: SyntaxError: Unexpected token`));
  });

  it('should react to pong from Home Assistant', async () => {
    expect((homeAssistant as any).pingTimeout).toBeNull();
    (homeAssistant as any).pingTimeout = setTimeout(() => {}, 10000);
    await new Promise<void>((resolve) => {
      homeAssistant.once('pong', () => {
        resolve();
      });
      client.send(JSON.stringify({ type: 'pong', id: -2, success: true }));
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Home Assistant pong received with id -2`);
    expect((homeAssistant as any).pingTimeout).toBeNull();
  });

  it('should log error if event messages from Home Assistant are missing data', async () => {
    homeAssistant.once('error', (error) => {
      expect(error).toBe('WebSocket event response missing event data for id undefined');
    });
    client.send(JSON.stringify({ type: 'event' }));
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'WebSocket event response missing event data for id undefined');
  });

  it('should parse state_changed event messages from Home Assistant', async () => {
    client.send(
      JSON.stringify({
        type: 'event',
        event: { event_type: 'state_changed', data: { entity_id: 'myentityid', new_state: { entity_id: 'myentityid' } } },
        id: (homeAssistant as any).eventsSubscribeId,
      }),
    );
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Entity id ${CYAN}myentityid${db} not found processing event`);
    jest.clearAllMocks();

    homeAssistant.hassEntities.set('myentityid', { entity_id: 'myentityid', device_id: 'mydeviceid' } as any);
    await new Promise<void>((resolve) => {
      homeAssistant.once('event', () => {
        resolve();
      });
      client.send(
        JSON.stringify({
          type: 'event',
          event: { event_type: 'state_changed', data: { entity_id: 'myentityid', old_state: { entity_id: 'myentityid' }, new_state: { entity_id: 'myentityid' } } },
          id: (homeAssistant as any).eventsSubscribeId,
        }),
      );
    });
    expect(homeAssistant.hassStates.get('myentityid')).toEqual({ entity_id: 'myentityid' });
  });

  it('should parse call_service event messages from Home Assistant', async () => {
    await new Promise<void>((resolve) => {
      homeAssistant.once('call_service', () => {
        resolve();
      });
      client.send(JSON.stringify({ type: 'event', event: { event_type: 'call_service' }, id: (homeAssistant as any).eventsSubscribeId }));
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Event ${CYAN}call_service${db} received id ${CYAN}${(homeAssistant as any).eventsSubscribeId}${db}`);
  });

  it('should parse device_registry_updated event messages from Home Assistant', async () => {
    device_registry_response.push({ id: 'mydeviceid', name: 'My Device' } as HassDevice);
    await new Promise<void>((resolve) => {
      homeAssistant.once('devices', () => {
        resolve();
      });
      client.send(JSON.stringify({ type: 'event', event: { event_type: 'device_registry_updated' }, id: (homeAssistant as any).eventsSubscribeId }));
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Event ${CYAN}device_registry_updated${db} received id ${CYAN}${(homeAssistant as any).eventsSubscribeId}${db}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Received 1 devices.`);
    expect(homeAssistant.hassDevices.get('mydeviceid')).toBeDefined();
    expect(homeAssistant.hassDevices.get('mydeviceid')?.name).toBe('My Device');
    device_registry_response.splice(0, device_registry_response.length); // Clear the response for next tests
  });

  it('should fail parsing device_registry_updated event messages from Home Assistant', async () => {
    device_registry_response.push({ id: 'mydeviceid', name: 'My Device' } as HassDevice);
    const fetchSpy = jest.spyOn(HomeAssistant.prototype, 'fetch').mockImplementationOnce(() => {
      return Promise.reject(new Error('Failed to fetch registry'));
    });
    client.send(JSON.stringify({ type: 'event', event: { event_type: 'device_registry_updated' }, id: (homeAssistant as any).eventsSubscribeId }));
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Event ${CYAN}device_registry_updated${db} received id ${CYAN}${(homeAssistant as any).eventsSubscribeId}${db}`);
    fetchSpy.mockRestore();
    device_registry_response.splice(0, device_registry_response.length); // Clear the response for next tests
  });

  it('should parse entity_registry_updated event messages from Home Assistant', async () => {
    entity_registry_response.push({ entity_id: 'myentityid', device_id: 'mydeviceid' } as HassEntity);
    await new Promise<void>((resolve) => {
      homeAssistant.once('entities', () => {
        resolve();
      });
      client.send(JSON.stringify({ type: 'event', event: { event_type: 'entity_registry_updated' }, id: (homeAssistant as any).eventsSubscribeId }));
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Event ${CYAN}entity_registry_updated${db} received id ${CYAN}${(homeAssistant as any).eventsSubscribeId}${db}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Received 1 entities.`);
    expect(homeAssistant.hassEntities.get('myentityid')).toBeDefined();
    expect(homeAssistant.hassEntities.get('myentityid')?.device_id).toBe('mydeviceid');
    entity_registry_response.splice(0, entity_registry_response.length); // Clear the response for next tests
  });

  it('should fail parsing entity_registry_updated event messages from Home Assistant', async () => {
    entity_registry_response.push({ entity_id: 'myentityid', device_id: 'mydeviceid' } as HassEntity);
    const fetchSpy = jest.spyOn(HomeAssistant.prototype, 'fetch').mockImplementationOnce(() => {
      return Promise.reject(new Error('Failed to fetch registry'));
    });
    client.send(JSON.stringify({ type: 'event', event: { event_type: 'entity_registry_updated' }, id: (homeAssistant as any).eventsSubscribeId }));
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Event ${CYAN}entity_registry_updated${db} received id ${CYAN}${(homeAssistant as any).eventsSubscribeId}${db}`);
    fetchSpy.mockRestore();
    entity_registry_response.splice(0, entity_registry_response.length); // Clear the response for next tests
  });

  it('should parse area_registry_updated event messages from Home Assistant', async () => {
    area_registry_response.push({ area_id: 'myareaid', name: 'My Area' } as HassArea);
    await new Promise<void>((resolve) => {
      homeAssistant.once('areas', () => {
        resolve();
      });
      client.send(JSON.stringify({ type: 'event', event: { event_type: 'area_registry_updated' }, id: (homeAssistant as any).eventsSubscribeId }));
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Event ${CYAN}area_registry_updated${db} received id ${CYAN}${(homeAssistant as any).eventsSubscribeId}${db}`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Received 1 areas.`);
    expect(homeAssistant.hassAreas.get('myareaid')).toBeDefined();
    expect(homeAssistant.hassAreas.get('myareaid')?.name).toBe('My Area');
    area_registry_response.splice(0, area_registry_response.length); // Clear the response for next tests
  });

  it('should fail parsing area_registry_updated event messages from Home Assistant', async () => {
    area_registry_response.push({ area_id: 'myareaid', name: 'My Area' } as HassArea);
    const fetchSpy = jest.spyOn(HomeAssistant.prototype, 'fetch').mockImplementationOnce(() => {
      return Promise.reject(new Error('Failed to fetch registry'));
    });
    client.send(JSON.stringify({ type: 'event', event: { event_type: 'area_registry_updated' }, id: (homeAssistant as any).eventsSubscribeId }));
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Event ${CYAN}area_registry_updated${db} received id ${CYAN}${(homeAssistant as any).eventsSubscribeId}${db}`);
    fetchSpy.mockRestore();
    area_registry_response.splice(0, area_registry_response.length); // Clear the response for next tests
  });

  it('should log error if unknown event messages from Home Assistant', async () => {
    client.send(JSON.stringify({ type: 'event', event: { event_type: 'unknown' } }));
    await wait(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `*Unknown event type ${CYAN}unknown${db} received id ${CYAN}undefined${db}`);
  });

  it('should react to pong from websocket', async () => {
    expect((homeAssistant as any).pingTimeout).toBeNull();
    await new Promise<void>((resolve) => {
      homeAssistant.once('pong', () => {
        resolve();
      });
      client.pong();
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `WebSocket pong received`);
    expect((homeAssistant as any).pingTimeout).toBeNull();
  });

  it('should react to pong from websocket and reset ping timeout', async () => {
    expect((homeAssistant as any).pingTimeout).toBeNull();
    (homeAssistant as any).pingTimeout = setTimeout(() => {}, 10000);
    await new Promise<void>((resolve) => {
      homeAssistant.once('pong', () => {
        resolve();
      });
      client.pong();
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `WebSocket pong received`);
    expect((homeAssistant as any).pingTimeout).toBeNull();
  });

  it('should react to ping from websocket', async () => {
    expect((homeAssistant as any).pingTimeout).toBeNull();
    await new Promise<void>((resolve) => {
      homeAssistant.once('ping', () => {
        resolve();
      });
      client.ping();
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `WebSocket ping received`);
    expect((homeAssistant as any).pingTimeout).toBeNull();
  });

  it('should react to ping from websocket and reset ping timeout', async () => {
    expect((homeAssistant as any).pingTimeout).toBeNull();
    (homeAssistant as any).pingTimeout = setTimeout(() => {}, 10000);
    await new Promise<void>((resolve) => {
      homeAssistant.once('ping', () => {
        resolve();
      });
      client.ping();
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `WebSocket ping received`);
    expect((homeAssistant as any).pingTimeout).toBeNull();
  });

  it('should get the devices asyncronously from Home Assistant', async () => {
    device_registry_response.push({ id: 'mydeviceid', name: 'My Device' } as HassDevice);
    const devices = await homeAssistant.fetch('config/device_registry/list');
    expect(devices).toEqual([{ id: 'mydeviceid', name: 'My Device' }]);
    device_registry_response.splice(0, device_registry_response.length); // Clear the response for next tests
  });

  it('should get the entities asyncronously from Home Assistant', async () => {
    entity_registry_response.push({ entity_id: 'myentityid', device_id: 'mydeviceid' } as HassEntity);
    const entities = await homeAssistant.fetch('config/entity_registry/list');
    expect(entities).toEqual([{ entity_id: 'myentityid', device_id: 'mydeviceid' }]);
    entity_registry_response.splice(0, entity_registry_response.length); // Clear the response for next tests
  });

  it('should get the areas asyncronously from Home Assistant', async () => {
    const areas = await homeAssistant.fetch('config/area_registry/list');
    expect(areas).toEqual([]);
  });

  it('should get the states asyncronously from Home Assistant', async () => {
    const states = await homeAssistant.fetch('get_states');
    expect(states).toEqual([]);
  });

  it('should get the config asyncronously from Home Assistant', async () => {
    const config = await homeAssistant.fetch('get_config');
    expect(config).toEqual({});
  });

  it('should get the services asyncronously from Home Assistant', async () => {
    const services = await homeAssistant.fetch('get_services');
    expect(services).toEqual({});
  });

  it('should request async call_service from Home Assistant', async () => {
    const response = await homeAssistant.callService('light', 'turn_on', 'myentityid');
    expect(response).toEqual({});
  });

  it('should request async call_service with params from Home Assistant', async () => {
    const response = await homeAssistant.callService('light', 'turn_on', 'myentityid', {});
    expect(response).toEqual({});
  });

  it('should not start ping if already started', async () => {
    (homeAssistant as any).startPing();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Ping interval already started`);
  });

  it('should close the WebSocket connection to Home Assistant on error', async () => {
    await new Promise<void>((resolve) => {
      homeAssistant.on('socket_closed', () => {
        resolve();
      });
      client.close(undefined, 'Bye');
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `WebSocket connection closed. Code: 1005 Reason: `);
    expect((homeAssistant as any).reconnectTimeout).not.toBeNull();
    await homeAssistant.close();
    expect((homeAssistant as any).reconnectTimeout).toBeNull();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Closing Home Assistant connection...`);
    expect(homeAssistant.connected).toBe(false);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, `Home Assistant connection closed`);
    expect(homeAssistant.connected).toBe(false);
    expect(homeAssistant.ws).toBeNull();
    expect((homeAssistant as any).pingInterval).toBeNull();
    expect((homeAssistant as any).pingTimeout).toBeNull();
    expect((homeAssistant as any).reconnectTimeout).toBeNull();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should not connect if wsUrl is not ws:// or wss://', async () => {
    homeAssistant = new HomeAssistant('http://localhost:8123', accessToken, reconnectTimeoutTime, reconnectRetries);
    await expect(homeAssistant.connect()).rejects.toThrow('Invalid WebSocket URL: http://localhost:8123. It must start with ws:// or wss://');
    expect(homeAssistant.connected).toBe(false);
    await homeAssistant.close();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should not connect if wsUrl is wss:// and certificate are not present', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', accessToken, reconnectTimeoutTime, reconnectRetries, './invalid/cert.pem');
    await expect(homeAssistant.connect()).rejects.toThrow();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Loading CA certificate from ./invalid/cert.pem...`);
    expect(homeAssistant.connected).toBe(false);
    await homeAssistant.close();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should not connect if wsUrl is wss:// and certificate are not correct', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', accessToken, reconnectTimeoutTime, reconnectRetries, path.join('certificates', 'matterbridge-hass-ca.crt'));

    await new Promise((resolve) => {
      homeAssistant.once('error', () => {
        homeAssistant.close();
        resolve(undefined);
      });
      homeAssistant.connect();
    });

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Loading CA certificate from ${path.join('certificates', 'matterbridge-hass-ca.crt')}...`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `CA certificate loaded successfully`);
    // expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, expect.stringContaining(`WebSocket error:`));
    expect(homeAssistant.connected).toBe(false);
    await homeAssistant.close();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should react to connection events with Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken, reconnectTimeoutTime, reconnectRetries);

    jest.useFakeTimers();

    await new Promise<void>((resolve) => {
      homeAssistant.once('connected', () => {
        resolve();
      });
      homeAssistant.connect();
    });
    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.ws).not.toBeNull();
    expect((homeAssistant as any).reconnectTimeoutTime).toBe(reconnectTimeoutTime * 1000);
    expect((homeAssistant as any).reconnectRetries).toBe(reconnectRetries);
    expect((homeAssistant as any).pingInterval).not.toBeNull();
    expect((homeAssistant as any).pingTimeout).toBeNull();
    expect((homeAssistant as any).reconnectTimeout).toBeNull();
    expect(server.clients.size).toBe(1);
    client = Array.from(server.clients)[0];

    jest.clearAllMocks();
    (homeAssistant as any).startPing();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Ping interval already started`);

    jest.clearAllMocks();
    await new Promise<void>((resolve) => {
      homeAssistant.once('socket_closed', () => {
        resolve();
      });
      client.close(undefined, 'Bye');
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, 'WebSocket connection closed. Code: 1005 Reason: ');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.NOTICE, `Reconnecting in 120 seconds...`);
    expect((homeAssistant as any).reconnectTimeout).not.toBeNull();
    expect((homeAssistant as any).reconnectRetries).toBe(reconnectRetries);

    jest.clearAllMocks();
    (homeAssistant as any).startReconnect();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, 'Reconnecting already in progress.');

    jest.clearAllMocks();
    jest.advanceTimersByTime(reconnectTimeoutTime * 1000);

    jest.useRealTimers();

    await new Promise<void>((resolve) => {
      homeAssistant.once('connected', () => {
        resolve();
      });
    });
    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.ws).not.toBeNull();

    jest.clearAllMocks();
    await new Promise<void>((resolve) => {
      homeAssistant.once('error', () => {
        resolve();
      });
      homeAssistant.ws?.emit('error', new Error('Test error'));
    });
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, 'WebSocket error: Error: Test error');

    await homeAssistant.close();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should send ping to Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken, 0, 0);
    expect((homeAssistant as any).reconnectTimeoutTime).toBe(0);
    expect((homeAssistant as any).reconnectRetries).toBe(0);

    jest.useFakeTimers();

    await new Promise((resolve) => {
      homeAssistant.once('connected', () => {
        resolve(undefined);
      });
      homeAssistant.connect();
    });

    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.ws).not.toBeNull();
    expect((homeAssistant as any).pingInterval).not.toBeNull();
    expect((homeAssistant as any).pingTimeout).toBeNull();
    expect((homeAssistant as any).reconnectTimeout).toBeNull();

    jest.advanceTimersByTime((homeAssistant as any).pingIntervalTime);

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, 'Sending WebSocket ping...');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Sending Home Assistant ping id`));
    expect((homeAssistant as any).pingTimeout).not.toBeNull();

    jest.advanceTimersByTime((homeAssistant as any).pingTimeoutTime);

    jest.useRealTimers();

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'Ping timeout. Closing connection...');

    (homeAssistant as any).pingInterval = setInterval(() => {}, 30000);
    (homeAssistant as any).pingTimeout = setTimeout(() => {}, 30000);

    await homeAssistant.close();
    expect((homeAssistant as any).pingInterval).toBeNull();
    expect((homeAssistant as any).pingTimeout).toBeNull();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });
});

describe('HomeAssistant with ssl', () => {
  let httpsServer: https.Server;
  let server: WebSocketServer;
  let client: WebSocket;
  let homeAssistant: HomeAssistant;
  const accessToken = 'testAccessToken';
  const reconnectTimeoutTime = 120;
  const reconnectRetries = 10;
  const wsUrl = 'wss://localhost:8123';
  const apiPath = '/api/websocket';

  beforeAll(async () => {
    const serverOptions = {
      cert: fs.readFileSync(path.join('certificates', 'homeassistant.crt')),
      key: fs.readFileSync(path.join('certificates', 'homeassistant.key')),
    };
    httpsServer = https.createServer(serverOptions);
    server = new WebSocketServer({ server: httpsServer, path: apiPath });
    server.on('connection', (socket, request) => {
      const ip = request.socket.remoteAddress;
      console.log('WebSocket ssl server new client connected:', ip);
      socket.send(JSON.stringify({ type: 'auth_required' }));
      socket.on('message', (message) => {
        const msg = JSON.parse(message.toString());
        console.log('WebSocket ssl server received a message:', msg);
        if (msg.type === 'auth' && msg.access_token === accessToken) {
          socket.send(JSON.stringify({ type: 'auth_ok' }));
        } else if (msg.type === 'auth' && msg.access_token === 'notajson') {
          socket.send('auth_ok');
        } else if (msg.type === 'ping') {
          socket.send(JSON.stringify({ id: msg.id, type: 'pong', success: true, result: {} }));
        } else if (msg.type === 'get_config') {
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: {} }));
        } else if (msg.type === 'get_services') {
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: {} }));
        } else if (msg.type === 'config/device_registry/list') {
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [] }));
        } else if (msg.type === 'config/entity_registry/list') {
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [] }));
        } else if (msg.type === 'config/area_registry/list') {
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [] }));
        } else if (msg.type === 'get_states') {
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [] }));
        } else if (msg.type === 'subscribe_events') {
          if (msg.event_type === 'notanevent') {
            socket.send(
              JSON.stringify({ id: msg.id, type: 'result', success: false, error: { code: 'notanevent', message: 'Not a valid event type' } } as HassWebSocketResponseResult),
            );
          } else if (msg.event_type === 'notajson') {
            socket.send('not a json');
          } else if (msg.event_type === 'noresponse') {
            // Do not send any response
          } else {
            socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true } as HassWebSocketResponseResult));
          }
        } else if (msg.type === 'unsubscribe_events') {
          if (msg.subscription === -1) {
            socket.send(
              JSON.stringify({ id: msg.id, type: 'result', success: false, error: { code: 'notanid', message: 'Not a valid subscription id' } } as HassWebSocketResponseResult),
            );
          } else if (msg.subscription === -2) {
            socket.send('not a json');
          } else if (msg.subscription === -3) {
            // Do not send any response
          } else {
            socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true } as HassWebSocketResponseResult));
          }
        } else if (msg.type === 'call_service' && msg.domain === 'notajson') {
          socket.send('not a json');
        } else if (msg.type === 'call_service' && msg.domain === 'nosuccess') {
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: false, error: 'nosuccess' }));
        } else if (msg.type === 'call_service' && msg.domain === 'noresponse') {
          // Do not send any response
        } else if (msg.type === 'call_service') {
          socket.send(JSON.stringify({ id: (homeAssistant as any).eventsSubscribeId, type: 'event', success: true, event: { event_type: 'call_service' } }));
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: {} }));
        } else if (msg.type === 'notajson') {
          socket.send('not a json');
        } else if (msg.type === 'noresponse') {
          // Do nothing, simulate no response
        } else if (msg.type === 'nosuccess') {
          socket.send(JSON.stringify({ id: msg.id, type: 'result', success: false, error: 'nosuccess' }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      httpsServer.listen(8123, () => {
        console.log(`WSS server running on port 8123`);
        resolve();
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    for (const client of server.clients) {
      client.close();
    }
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('WebSocket ssl server closed');
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      httpsServer.close(() => {
        console.log('HTTPS server closed');
        resolve();
      });
    });
  });

  it('client should connect', async () => {
    client = new WebSocket(wsUrl + apiPath, {
      ca: fs.readFileSync(path.join('certificates', 'matterbridge-hass-ca.crt')),
      rejectUnauthorized: true,
    });

    expect(client).toBeInstanceOf(WebSocket);

    await new Promise<void>((resolve) => {
      client.once('open', () => {
        console.log('WebSocket client connected');
        resolve();
      });
    });
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it('client should close', async () => {
    expect(client).toBeInstanceOf(WebSocket);

    await new Promise<void>((resolve) => {
      client.once('close', () => {
        console.log('WebSocket client closed');
        resolve();
      });
      client.close();
    });
    expect(client.readyState).toBe(WebSocket.CLOSED);
  });

  it('should not connect to Home Assistant with ssl', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', 'notajson', reconnectTimeoutTime, reconnectRetries, undefined, false);

    try {
      await homeAssistant.connect();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Error parsing WebSocket message');
    }

    expect(homeAssistant.connected).toBe(false);
    await homeAssistant.close();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should connect to Home Assistant with ssl', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', accessToken, reconnectTimeoutTime, reconnectRetries, undefined, false);

    await new Promise<void>((resolve) => {
      homeAssistant.once('connected', () => {
        resolve();
      });
      homeAssistant.connect();
    });

    expect(homeAssistant.connected).toBe(true);
  });

  it('should get and set responseTimeout', async () => {
    homeAssistant.responseTimeout = 10000;
    expect(homeAssistant.responseTimeout).toBe(10000);
    homeAssistant.responseTimeout = 5000;
    expect(homeAssistant.responseTimeout).toBe(5000);
  });

  it('should have start pingpong', async () => {
    expect((homeAssistant as any).pingInterval).not.toBeNull();
    expect((homeAssistant as any).pingTimeout).toBeNull();
  });

  it('should get the config asyncronously from Home Assistant', async () => {
    const config = await homeAssistant.fetch('get_config');
    expect(config).toEqual({});
  });

  it('should throw the fetch from Home Assistant', async () => {
    await expect(homeAssistant.fetch('notajson')).rejects.toThrow();
  });

  it('should throw for timeout the fetch from Home Assistant', async () => {
    homeAssistant.responseTimeout = 10; // Set a short timeout for testing
    homeAssistant.once('error', (error) => {
      expect(error).toBe('WebSocket response error: undefined');
    });
    await expect(homeAssistant.fetch('noresponse')).rejects.toThrow('Fetch type noresponse id 3 did not complete before the timeout');
    homeAssistant.responseTimeout = 10000; // Restore the default timeout
  });

  it('should reject no success the fetch from Home Assistant', async () => {
    homeAssistant.once('error', (error) => {
      expect(error).toBe('WebSocket response error: undefined');
    });
    await expect(homeAssistant.fetch('nosuccess')).rejects.toThrow();
  });

  it('should throw the callService from Home Assistant', async () => {
    await expect(homeAssistant.callService('notajson', 'turn_on', 'myentityid')).rejects.toThrow();
  });

  it('should throw for timeout the callService from Home Assistant', async () => {
    homeAssistant.responseTimeout = 10; // Set a short timeout for testing
    homeAssistant.once('error', (error) => {
      expect(error).toBe('WebSocket response error: undefined');
    });
    await expect(homeAssistant.callService('noresponse', 'turn_on', 'myentityid', {})).rejects.toThrow(
      'CallService service noresponse.turn_on entity myentityid id 6 did not complete before the timeout',
    );
    homeAssistant.responseTimeout = 10000; // Restore the default timeout
  });

  it('should reject no success the callService from Home Assistant', async () => {
    homeAssistant.once('error', (error) => {
      expect(error).toBe('WebSocket response error: undefined');
    });
    await expect(homeAssistant.callService('nosuccess', 'turn_on', 'myentityid')).rejects.toThrow();
  });

  it('should disconnect from Home Assistant with ssl', async () => {
    expect(homeAssistant.connected).toBe(true);

    await new Promise<void>((resolve) => {
      homeAssistant.once('disconnected', () => {
        resolve();
      });
      homeAssistant.close();
    });

    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('startPing should log message if disconnect from Home Assistant with ssl', async () => {
    expect(homeAssistant.connected).toBe(false);

    jest.useFakeTimers();
    (homeAssistant as any).startPing();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, 'Starting ping interval...');
    jest.advanceTimersByTime((homeAssistant as any).pingIntervalTime);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'WebSocket not open sending ping. Closing connection...');
    jest.useRealTimers();

    homeAssistant.close();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should connect to Home Assistant with ssl and rejectUnauthorized=false', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', accessToken, undefined, undefined, undefined, false);
    await homeAssistant.connect();
    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.hassDevices.size).toBe(0);
    expect(homeAssistant.hassEntities.size).toBe(0);
    expect(homeAssistant.hassStates.size).toBe(0);
    expect(homeAssistant.hassAreas.size).toBe(0);
    expect(homeAssistant.hassServices).toBeNull();
    expect(homeAssistant.hassConfig).toBeNull();
  });

  it('should not connect a second time to Home Assistant with ssl', async () => {
    expect(homeAssistant.connected).toBe(true);
    await expect(homeAssistant.connect()).rejects.toThrow('Already connected to Home Assistant');
  });

  it('should fetch data from Home Assistant', async () => {
    expect(homeAssistant.connected).toBe(true);
    await homeAssistant.fetchData();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, 'Fetching initial data from Home Assistant...');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, 'Initial data fetched successfully.');
  });

  it('should fetch data from Home Assistant and fail', async () => {
    expect(homeAssistant.connected).toBe(true);
    jest.spyOn(homeAssistant, 'fetch').mockImplementationOnce(() => {
      return Promise.reject(new Error('Failed to fetch data'));
    });
    await homeAssistant.fetchData();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, 'Fetching initial data from Home Assistant...');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'Error fetching initial data: Error: Failed to fetch data');
  });

  it('should subscribe to Home Assistant', async () => {
    expect(homeAssistant.connected).toBe(true);
    const subscriptionId = await homeAssistant.subscribe();
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      `Subscribing to ${CYAN}all events${db} with id ${CYAN}${subscriptionId}${db} and timeout ${CYAN}${(homeAssistant as any)._responseTimeout}${db} ms ...`,
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Subscribed successfully with id ${CYAN}${subscriptionId}${db}`);
  });

  it('should subscribe to Home Assistant and fail for event not valid', async () => {
    expect(homeAssistant.connected).toBe(true);
    await expect(homeAssistant.subscribe('notanevent')).rejects.toThrow('Not a valid event type');
  });

  it('should subscribe to Home Assistant and fail for Unexpected token', async () => {
    expect(homeAssistant.connected).toBe(true);
    await expect(homeAssistant.subscribe('notajson')).rejects.toThrow();
  });

  it('should subscribe to Home Assistant and fail not connected', async () => {
    expect(homeAssistant.connected).toBe(true);
    homeAssistant.connected = false; // Simulate not connected
    await expect(homeAssistant.subscribe()).rejects.toThrow('Subscribe error: not connected to Home Assistant');
    homeAssistant.connected = true; // Restore connection state
  });

  it('should subscribe to Home Assistant and fail for timeout', async () => {
    expect(homeAssistant.connected).toBe(true);
    homeAssistant.responseTimeout = 1; // Set a short timeout for testing
    await expect(homeAssistant.subscribe('noresponse')).rejects.toThrow(
      `Subscribe event noresponse id ${(homeAssistant as any).requestId - 1} did not complete before the timeout`,
    );
    homeAssistant.responseTimeout = 5000; // Restore default timeout
  });

  it('should unsubscribe to Home Assistant', async () => {
    expect(homeAssistant.connected).toBe(true);
    const subscriptionId = await homeAssistant.unsubscribe(123456);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      `Unsubscribing from subscription ${CYAN}123456${db} with id ${CYAN}${(homeAssistant as any).requestId - 1}${db} and timeout ${CYAN}${(homeAssistant as any)._responseTimeout}${db} ms ...`,
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Unsubscribed successfully with id ${CYAN}${(homeAssistant as any).requestId - 1}${db}`);
  });

  it('should unsubscribe to Home Assistant and fail for event not valid', async () => {
    expect(homeAssistant.connected).toBe(true);
    await expect(homeAssistant.unsubscribe(-1)).rejects.toThrow('Not a valid subscription id');
  });

  it('should unsubscribe to Home Assistant and fail for Unexpected token', async () => {
    expect(homeAssistant.connected).toBe(true);
    await expect(homeAssistant.unsubscribe(-2)).rejects.toThrow();
  });

  it('should unsubscribe to Home Assistant and fail not connected', async () => {
    expect(homeAssistant.connected).toBe(true);
    homeAssistant.connected = false; // Simulate not connected
    await expect(homeAssistant.unsubscribe(123456)).rejects.toThrow('Unsubscribe error: not connected to Home Assistant');
    homeAssistant.connected = true; // Restore connection state
  });

  it('should unsubscribe to Home Assistant and fail for timeout', async () => {
    expect(homeAssistant.connected).toBe(true);
    homeAssistant.responseTimeout = 1; // Set a short timeout for testing
    await expect(homeAssistant.unsubscribe(-3)).rejects.toThrow(`Unsubscribe subscription -3 id ${(homeAssistant as any).requestId - 1} did not complete before the timeout`);
    homeAssistant.responseTimeout = 5000; // Restore default timeout
  });

  it('should close with Home Assistant with ssl', async () => {
    expect(homeAssistant.connected).toBe(true);
    await homeAssistant.close();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'Closing Home Assistant connection...');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'Home Assistant connection closed');
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
    expect(homeAssistant.connected).toBe(false);
  });

  it('should subscribe to Home Assistant and fail ws not opened', async () => {
    homeAssistant.connected = true; // Ensure connected state
    await expect(homeAssistant.subscribe()).rejects.toThrow('Subscribe error: WebSocket not open');
    homeAssistant.connected = false; // Restore connection state
  });

  it('should unsubscribe to Home Assistant and fail ws not opened', async () => {
    homeAssistant.connected = true; // Ensure connected state
    await expect(homeAssistant.unsubscribe(123456)).rejects.toThrow('Unsubscribe error: WebSocket not open');
    homeAssistant.connected = false; // Restore connection state
  });

  it('should not connect if wsUrl is wss:// and certificate are not present', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', accessToken, reconnectTimeoutTime, reconnectRetries, './invalid/cert.pem');
    homeAssistant.on('error', () => {
      //
    });

    try {
      await homeAssistant.connect();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('WebSocket error connecting to Home Assistant: Error: ENOENT');
    }

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Loading CA certificate from ./invalid/cert.pem...`);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`WebSocket error connecting to Home Assistant: Error: ENOENT`));
    expect(homeAssistant.connected).toBe(false);
    await homeAssistant.close();
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should close for timeout', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', accessToken, undefined, undefined, path.join('certificates', 'matterbridge-hass-ca.crt'), false);
    homeAssistant.on('error', () => {
      //
    });

    await new Promise<void>((resolve) => {
      homeAssistant.once('connected', () => {
        resolve();
      });
      homeAssistant.connect();
    });

    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.hassDevices.size).toBe(0);
    expect(homeAssistant.hassEntities.size).toBe(0);
    expect(homeAssistant.hassStates.size).toBe(0);
    expect(homeAssistant.hassAreas.size).toBe(0);
    expect(homeAssistant.hassServices).toBeNull();
    expect(homeAssistant.hassConfig).toBeNull();

    // jest.restoreAllMocks();
    expect(homeAssistant.ws).toBeDefined();
    if (!homeAssistant.ws) return;
    jest.spyOn(homeAssistant.ws, 'close').mockImplementationOnce((code?: number, data?: string | Buffer) => {
      // Simulate a close event with a short timeout
    });

    homeAssistant.responseTimeout = 1; // Set a short timeout for testing
    try {
      await homeAssistant.close(1000, 'Test close');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Close did not complete before the timeout of 1 ms');
    }
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should connect to Home Assistant with ssl and CA certificate', async () => {
    homeAssistant = new HomeAssistant('wss://localhost:8123', accessToken, undefined, undefined, path.join('certificates', 'matterbridge-hass-ca.crt'), false);
    homeAssistant.on('error', () => {
      //
    });

    try {
      await homeAssistant.connect();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.hassDevices.size).toBe(0);
    expect(homeAssistant.hassEntities.size).toBe(0);
    expect(homeAssistant.hassStates.size).toBe(0);
    expect(homeAssistant.hassAreas.size).toBe(0);
    expect(homeAssistant.hassServices).toBeNull();
    expect(homeAssistant.hassConfig).toBeNull();

    const close = homeAssistant.close(1000, 'Test close');
    homeAssistant.ws?.emit('error', new Error('Test error'));
    try {
      await close;
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Close received error event while closing connection to Home Assistant');
    }

    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  });

  it('should connect to Home Assistant with ssl and self-signed CA certificate', async () => {
    // jest.restoreAllMocks();
    homeAssistant = new HomeAssistant('wss://localhost:8123', accessToken, undefined, undefined, path.join('certificates', 'matterbridge-hass-ca.crt'), true);

    await homeAssistant.connect();

    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.hassDevices.size).toBe(0);
    expect(homeAssistant.hassEntities.size).toBe(0);
    expect(homeAssistant.hassStates.size).toBe(0);
    expect(homeAssistant.hassAreas.size).toBe(0);
    expect(homeAssistant.hassServices).toBeNull();
    expect(homeAssistant.hassConfig).toBeNull();

    await homeAssistant.close(1000, 'Test close');
    homeAssistant.removeAllListeners(); // Remove all listeners to avoid memory leaks
  }, 10000);
});

describe('HomeAssistant parser', () => {
  const readMockHomeAssistantFile = (filePath: string) => {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data) as {
        devices: HassDevice[];
        entities: HassEntity[];
        areas: HassArea[];
        states: HassState[];
        config: HassConfig;
        services: HassServices;
      };
    } catch (error) {
      console.error(`Error reading or parsing ${filePath}:`, error);
      return null;
    }
  };

  // const data = readMockHomeAssistantFile(path.join('mock', 'homeassistant.json'));
  const data = readMockHomeAssistantFile(path.join('mock', 'ts_homeassistant.json'));

  it('should parse Home Assistant data', () => {
    if (!data) return;
    expect(data.devices).toBeDefined();
    expect(data.entities).toBeDefined();
    expect(data.states).toBeDefined();
    expect(data.areas).toBeDefined();
    expect(data.services).toBeDefined();
    expect(data.config).toBeDefined();
    expect(data.devices.length).toBeGreaterThan(0);
    expect(data.entities.length).toBeGreaterThan(0);
    expect(data.states.length).toBeGreaterThan(0);
    expect(data.areas.length).toBeGreaterThan(0);
  });

  it('should test HassDevice properties', () => {
    if (!data) return;
    const properties = new Set<string>();
    for (const device of data.devices) {
      expect(device).toBeDefined();
      expect(device.id).toBeDefined();
      expect(device.id).not.toBeNull();
      expect(device.id).toHaveLength(32);
      expect(device.name).not.toBeNull();
      expect(device.created_at).toBeGreaterThanOrEqual(0);
      expect(device.modified_at).toBeGreaterThanOrEqual(0);
      Object.entries(device).forEach(([key, value]) => {
        properties.add(key);
      });
    }
    let output = 'HassDevice properties:';
    Array.from(properties)
      .sort()
      .forEach((property) => {
        output += `\n- ${property}`;
      });
    // consoleLogSpy.mockRestore();
    console.log(output);
  });

  it('should test HassEntity properties', () => {
    if (!data) return;
    const properties = new Set<string>();
    for (const entity of data.entities) {
      expect(entity).toBeDefined();
      expect(entity.id).toBeDefined();
      expect(entity.id).not.toBeNull();
      expect(entity.id).toHaveLength(32);
      expect(entity.entity_id).toBeDefined();
      expect(entity.entity_id).not.toBeNull();
      expect(entity.unique_id).toBeDefined();
      expect(entity.unique_id).not.toBeNull();
      expect(entity.device_id).toBeDefined();
      expect(entity.platform).toBeDefined();
      expect(entity.platform).not.toBeNull();
      expect(entity.config_entry_id).toBeDefined();

      Object.entries(entity).forEach(([key, value]) => {
        properties.add(key);
      });
    }
    let output = 'HassEntity properties:';
    Array.from(properties)
      .sort()
      .forEach((property) => {
        output += `\n- ${property}`;
      });
    // consoleLogSpy.mockRestore();
    console.log(output);
  });

  it('should test HassArea properties', () => {
    if (!data) return;
    const properties = new Set<string>();
    for (const area of data.areas) {
      expect(area).toBeDefined();
      expect(area.area_id).toBeDefined();
      expect(area.area_id).not.toBeNull();
      expect(area.name).not.toBeNull();

      Object.entries(area).forEach(([key, value]) => {
        properties.add(key);
      });
    }
    let output = 'HassArea properties:';
    Array.from(properties)
      .sort()
      .forEach((property) => {
        output += `\n- ${property}`;
      });
    // consoleLogSpy.mockRestore();
    console.log(output);
  });

  it('should test HassState properties', () => {
    if (!data) return;
    const properties = new Set<string>();
    const attributeProperties = new Set<string>();
    for (const state of data.states) {
      expect(state).toBeDefined();
      expect(state.entity_id).toBeDefined();
      expect(state.entity_id).not.toBeNull();
      expect(state.state).toBeDefined();
      expect(state.state).not.toBeNull();
      expect(state.attributes).toBeDefined();
      expect(state.attributes).not.toBeNull();
      expect(state.last_changed).toBeDefined();
      expect(state.last_changed).not.toBeNull();
      expect(state.last_reported).toBeDefined();
      expect(state.last_reported).not.toBeNull();
      expect(state.last_updated).toBeDefined();
      expect(state.last_updated).not.toBeNull();
      expect(state.context).toBeDefined();
      expect(state.context).not.toBeNull();
      expect(state.attributes).toBeDefined();
      expect(state.attributes).not.toBeNull();
      Object.entries(state.attributes).forEach(([key, value]) => {
        attributeProperties.add(key);
      });

      Object.entries(state).forEach(([key, value]) => {
        properties.add(key);
      });
    }
    let output = 'HassState properties:';
    Array.from(properties)
      .sort()
      .forEach((property) => {
        output += `\n- ${property}`;
      });
    // consoleLogSpy.mockRestore();
    console.log(output);
    output = 'HassState attributes properties:';
    Array.from(attributeProperties)
      .sort()
      .forEach((property) => {
        output += `\n- ${property}`;
      });
    console.log(output);
  });
});
