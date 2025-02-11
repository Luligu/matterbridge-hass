/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { WebSocket, WebSocketServer } from 'ws';
import { HomeAssistant } from './homeAssistant'; // Adjust the import path as necessary
import { expect, it, jest } from '@jest/globals';
import { AnsiLogger, CYAN, db, LogLevel } from 'matterbridge/logger';
import { wait } from 'matterbridge/utils';

// let loggerLogSpy: jest.SpiedFunction<(level: LogLevel, message: string, ...parameters: any[]) => void>;

// Spy on and mock the AnsiLogger.log method
const loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {
   console.error(`Mocked AnsiLogger.log: ${level} - ${message}`, ...parameters);
});
// Spy on and mock console.log
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {  
  //
});

describe('HomeAssistant', () => {
  let server: WebSocketServer;
  let homeAssistant: HomeAssistant;
  const wsUrl = 'ws://localhost:8123';
  const accessToken = 'testAccessToken';
  const path = '/api/websocket';0

  let client: WebSocket;
  let eventsSubscribeId: number;

  const device_test = {
    "area_id": "area",
    "configuration_url": null,
    "config_entries": [],
    "connections": [],
    "created_at": 0,
    "disabled_by": null,
    "entry_type": null,
    "hw_version": null,
    "id": "083706adbaca12f6fdc002ddbac88e75",
    "identifiers": [],
    "labels": [],
    "manufacturer": "Device Manufacturer",
    "model": "Device Model",
    "model_id": null,
    "modified_at": 1737802067.510746,
    "name_by_user": "My Device",
    "name": "Manufacturer Device",
    "primary_config_entry": "f6914623c39e567af089ff96fc6ae19d",
    "serial_number": null,
    "sw_version": null,
    "via_device_id": null
  }

  const entity_test = {
    "area_id": null,
    "categories": {},
    "config_entry_id": null,
    "created_at": 0,
    "device_id": null,
    "disabled_by": null,
    "entity_category": null,
    "entity_id": "person.admin",
    "has_entity_name": false,
    "hidden_by": null,
    "icon": null,
    "id": "85a9dd18771a19161cc61b98c1ea1656",
    "labels": [],
    "modified_at": 1738596869.280928,
    "name": null,
    "options": {
      "conversation": {
        "should_expose": false
      },
      "collection": {
        "hash": "db86c6517898ee985d88215e679e7661"
      }
    },
    "original_name": "Admin",
    "platform": "person",
    "translation_key": null,
    "unique_id": "admin"
  }

  const state_test = {
    "entity_id": "person.admin",
    "state": "Home",
    "attributes": {
      "editable": true,
      "id": "admin",
      "device_trackers": [ ],
      "latitude": null,
      "longitude": null,
      "user_id": "5000838b26704bc6a72516ec63c0f8b1",
      "entity_picture": "/api/image/serve/4d2d7edbc0f528eda0f33cc90908f6e6/512x512",
      "friendly_name": "Admin"
    },
    "last_changed": "2025-02-11T02:08:12.115552+00:00",
    "last_reported": "2025-02-11T04:46:17.701094+00:00",
    "last_updated": "2025-02-11T04:46:17.701094+00:00",
    "context": {
      "id": "01JKSN8N35238EGYJ427RS69VN",
      "parent_id": null,
      "user_id": null
    }
  }

  beforeAll(async () => {
    server = new WebSocketServer({ port: 8123, path });

    server.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      console.log('WebSocket server new client connected:', ip);

      // Simulate sending "auth_required" when the client connects
      ws.send(JSON.stringify({ type: 'auth_required' }));

      ws.on('message', (message) => {
        const msg = JSON.parse(message.toString());
        console.log('WebSocket server received a message:', msg);

        switch (msg.type) {
          case 'auth':
              if (msg.access_token === accessToken)
                ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '0001.01' }));
              else
                ws.send(JSON.stringify({ type: 'auth_invalid', ha_version: '0001.01' }));
            break;
          case 'ping':
            ws.send(JSON.stringify({ id: msg.id, type: 'pong' }));
            break;
          case 'get_config':
          case 'get_services':
            ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: {} }));
            break;
          case 'config/device_registry/list':
            ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [ device_test ] }));
            break;
          case 'config/entity_registry/list':
            ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [ entity_test ] }));
            break;
          case 'get_states':
              ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: [ state_test ] }));
            break;
          case 'subscribe_events':
            eventsSubscribeId = msg.id;
            ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true }));
          case 'unsubscribe_events':
            ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true }));
            break;
          case 'call_service':
            ws.send(JSON.stringify({ id: eventsSubscribeId, type: 'event', success: true, event: { event_type: 'call_service' } }));
            ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: {} }));              
            break;
        }
      });
    });

    server.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    await new Promise((resolve) => {
      server.on('listening', () => {
        console.log('WebSocket server listening on', wsUrl + path);
        resolve(undefined);
      });
    });
  });

  afterAll(async () => {
    for (const client of server.clients) {
      client.terminate();
    }

    await new Promise((resolve) => {
      server.close(() => {
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

  it('client should connect', async () => {
    client = new WebSocket(wsUrl + path);
    expect(client).toBeInstanceOf(WebSocket);

    return new Promise((resolve) => {
      client.on('open', () => {
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
    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    expect(homeAssistant).toBeInstanceOf(HomeAssistant);
  });

  it('should log error if not connected to HomeAssistant', () => {
    homeAssistant.fetch('get_states');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'Fetch error: not connected to Home Assistant');
    homeAssistant.callService('light', 'turn_on', 'myentityid', {});
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'CallService error: not connected to Home Assistant');
  });

  it('should log error for async if not connected to HomeAssistant', async () => {
    try {
      await homeAssistant.fetch('get_states');
    } catch (error: any) {
      //
    }
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'Fetch error: not connected to Home Assistant');
    try {
      await homeAssistant.callService('light', 'turn_on', 'myentityid', {});
    } catch (error: any) {
      //
    }
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'CallService error: not connected to Home Assistant');
  });

  it('should log error if ws is not connected to HomeAssistant', async () => {
    //homeAssistant.connected = true;
    try {
      await homeAssistant.fetch('get_states');
    } catch (error: any) {
      //
    }
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'Fetch error: not connected to Home Assistant');
    try {
      await homeAssistant.callService('light', 'turn_on', 'myentityid', {});
    } catch (error: any) {
      //
    }
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.ERROR, 'CallService error: not connected to Home Assistant');
    //homeAssistant.connected = false;
  });

  it('should establish a WebSocket connection to Home Assistant', async () => {
    await homeAssistant.connect();

    expect(homeAssistant.connected).toBe(true);
    expect(homeAssistant.connection).not.toBeNull();
  });

  it('should fetch from HomeAssistant', async () => {
    await homeAssistant.fetch('get_states');
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Fetching ${CYAN}get_states${db}...`);
   });

  it('should call_service from HomeAssistant', async () => {
    await homeAssistant.callService('light', 'turn_on', 'myentityid', {});
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Calling service ${CYAN}light.turn_on${db} for entity ${CYAN}myentityid${db}`));

    jest.clearAllMocks();
    await homeAssistant.callService('light', 'turn_on', 'myentityid', {});
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining(`Calling service ${CYAN}light.turn_on${db} for entity ${CYAN}myentityid${db}`));

  });

  it('should request call_service from Home Assistant', async () => {
    await homeAssistant.callService('light', 'turn_on', 'myentityid');
    expect(homeAssistant).toBeDefined();
  });

  it('should get the devices asyncronously from Home Assistant', async () => {
    const states = await homeAssistant.fetch('config/device_registry/list');
    expect(states).toEqual([device_test]);
  });

  it('should get the entities asyncronously from Home Assistant', async () => {
    const states = await homeAssistant.fetch('config/entity_registry/list');
    expect(states).toEqual([entity_test]);
  });

  it('should get the states asyncronously from Home Assistant', async () => {
    const states = await homeAssistant.fetch('get_states');
    expect(states).toEqual([state_test]);
  });

  it('should close the WebSocket connection to Home Assistant', async () => {
    await homeAssistant.close();

    expect(homeAssistant.connected).toBe(false);
    expect(homeAssistant.connection).toBeNull();
  });

  it('should fail to connect with missing host url', async () => {
    homeAssistant = new HomeAssistant('', 'invalid');
    await homeAssistant.connect();

    expect(homeAssistant.connected).toBe(false);
  })

  it('should report invalid authentication', async () => {
    homeAssistant = new HomeAssistant(wsUrl, 'invalid');
    await homeAssistant.connect();

    expect(homeAssistant.connected).toBe(false);
  })

  it('should not allow double connect()', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    await homeAssistant.connect();

    await homeAssistant.connect();

    await homeAssistant.close();

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, 'Already connected to Home Assistant');
  })

  it('should reconnect on interrupted connection', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    await homeAssistant.connect();

    for (const client of server.clients) {
      client.terminate();
    }    

    await wait(100);

    await homeAssistant.connection?.ping();

    await homeAssistant.close();

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Trying to reconnect.`);
  })

  it('should force reconnect', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    await homeAssistant.connect();

    for (const client of server.clients) {
      client.terminate();
    }    

    homeAssistant.connection?.reconnect(true);

    await wait(100);

    await homeAssistant.close();

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.INFO, expect.stringContaining(`Connecting to Home Assistant on`));
  })

  it('should not allow suspend without a promise set', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    await homeAssistant.connect();

    expect(() => { homeAssistant.connection?.suspend() }).toThrow('Suspend promise not set');

    await homeAssistant.close();
  }) 

  it('should get config from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);

    let eventConfig;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('config', async (config) => {
          eventConfig = config;
          resolve(null);
        })
      }),  
      homeAssistant.connect()
    ]);

    await homeAssistant.close();

    expect(eventConfig).toEqual({});
  });

  it('should get services from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);

    let eventServices;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('services', async (services) => {
          eventServices = services;
          resolve(null);
        })
      }),  
      homeAssistant.connect()
    ]);

    await homeAssistant.close();

    expect(eventServices).toEqual({});
  });

  it('should get config/device_registry/list from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);

    let eventDevices;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('devices', async (devices) => {
          eventDevices = devices;
          resolve(null);
        })
      }),  
      homeAssistant.connect()
    ]);

    await homeAssistant.close();

    expect(eventDevices).toEqual([device_test]);
    expect(homeAssistant.hassDevices.has(device_test.id)).toBe(true);
  });

  it('should get config/entity_registry/list from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);

    let eventEntities;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('entities', async (entities) => {
          eventEntities = entities;
          resolve(null);
        })
      }),  
      homeAssistant.connect()
    ]);

    await homeAssistant.close();

    expect(eventEntities).toEqual([entity_test]);
    expect(homeAssistant.hassEntities.has(entity_test.entity_id)).toBe(true);
  });

  it('should get get_states from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);

    let eventStates;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('states', async (states) => {
          eventStates = states;
          resolve(null);
        })
      }),  
      homeAssistant.connect()
    ]);

    await homeAssistant.close();

    expect(eventStates).toEqual([state_test]);
    expect(homeAssistant.hassStates.has(state_test.entity_id)).toBe(true);
  });

  it('should get subscribe_events from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    
    let hasSubscribed = false;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('subscribed', async () => {
          hasSubscribed = true;
          resolve(null);
        })
      }),  
      homeAssistant.connect()
    ]);

    await homeAssistant.close();

    expect(hasSubscribed).toBe(true);
  });

  it('should unsubscribe for unknown subscriptions from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    
    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('subscribed', async () => {
          for (const client of server.clients) {
            client.send(JSON.stringify({ id: 10001, type: 'event', success: true, event: { event_type: 'device_registry_updated' } }));
          }
          
          resolve(null);
        })
      }),  
      homeAssistant.connect()
    ]);

    await homeAssistant.close();

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, `Received event for unknown subscription 10001. Unsubscribing.`);
  });

  it('should handle device_registry_updated event from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);

    let eventDevices;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('subscribed', async () => {

          for (const client of server.clients) {
            client.send(JSON.stringify({ id: eventsSubscribeId, type: 'event', success: true, event: { event_type: 'device_registry_updated' } }));
          }

          resolve(null);
        })
      }),
      new Promise((resolve) => {
        homeAssistant.on('devices', async (devices) => {
          eventDevices = devices;
          resolve(null);
        })
      }),
      homeAssistant.connect()
    ]);

    await homeAssistant.close();    
    homeAssistant.removeAllListeners();

    expect(eventDevices).toEqual([device_test]);
  });

  it('should handle entity_registry_updated event from Home Assistant', async () => {
    homeAssistant = new HomeAssistant(wsUrl, accessToken);

    let eventEntities;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('subscribed', async () => {

          for (const client of server.clients) {
            client.send(JSON.stringify({ id: eventsSubscribeId, type: 'event', success: true, event: { event_type: 'entity_registry_updated' } }));
          }

          resolve(null);
        })
      }),
      new Promise((resolve) => {
        homeAssistant.on('entities', async (entities) => {
          eventEntities = entities;
          resolve(null);
        })
      }),
      homeAssistant.connect()
    ]);

    await homeAssistant.close();    
    homeAssistant.removeAllListeners();

    expect(eventEntities).toEqual([entity_test]);
  });

  it('should parse state_changed events from Home Assistant', async () => {

    homeAssistant = new HomeAssistant(wsUrl, accessToken);
    homeAssistant.hassEntities.set('myentityid', { entity_id: 'myentityid', device_id: 'mydeviceid' } as any);

    let eventDeviceId;
    let eventEntityId;

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('subscribed', async () => {

          for (const client of server.clients) {
            client.send(
              JSON.stringify({
                id: eventsSubscribeId,
                type: 'event',
                event: { event_type: 'state_changed', data: { entity_id: 'myentityid', new_state: { entity_id: 'myentityid' }, old_state: { entity_id: 'myentityid' }  } },
              }));
          }

          resolve(null);
        })
      }),
      new Promise((resolve) => {
        homeAssistant.on('event', async (deviceId, entityId, oldState, newState) => {
          eventDeviceId = deviceId;
          eventEntityId = entityId;

          resolve(null);
        })
      }),
      homeAssistant.connect()
    ]);

    await homeAssistant.close();
    homeAssistant.removeAllListeners();

    expect(eventDeviceId).toEqual('mydeviceid');
    expect(eventEntityId).toEqual('myentityid');
  });

  it('should not allow state_changed for unknown events from Home Assistant', async () => {

    homeAssistant = new HomeAssistant(wsUrl, accessToken);

    await Promise.all([
      new Promise((resolve) => {

        homeAssistant.on('subscribed', async () => {

          for (const client of server.clients) {
            client.send(
              JSON.stringify({
                id: eventsSubscribeId,
                type: 'event',
                event: { event_type: 'state_changed', data: { entity_id: 'unknown_entityid', new_state: { entity_id: 'unknown_entityid' }, old_state: { entity_id: 'unknown_entityid' }  } },
              }));
          }

          resolve(null);
        })
      }),
      homeAssistant.connect()
    ]);

    await homeAssistant.close();
    homeAssistant.removeAllListeners();

    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Entity id ${CYAN}unknown_entityid${db} not found processing event`);
  });

});
