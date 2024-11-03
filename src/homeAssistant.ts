/**
 * This file contains the class HomeAssistant.
 *
 * @file src\homeAssistant.ts
 * @author Luca Liguori
 * @date 2024-09-14
 * @version 0.0.1
 *
 * Copyright 2024, 2025, 2026 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. *
 */

import { EventEmitter } from 'events';
import { AnsiLogger, LogLevel, TimestampFormat, CYAN, er, BLUE, db, debugStringify } from 'matterbridge/logger';
import WebSocket from 'ws';

/**
 * Interface representing a Home Assistant device.
 */
export interface HassDevice {
  id: string;
  area_id: string | null;
  configuration_url: string | null;
  config_entries: string[]; // List of config entry IDs
  connections: [string, string][]; // Array of connection types and identifiers
  created_at: number; // Timestamp of when the device was created
  disabled_by: string | null;
  entry_type: string | null;
  hw_version: string | null; // Hardware version
  identifiers: [string, string][]; // Identifiers for the device
  labels: string[];
  manufacturer: string | null; // Manufacturer of the device (e.g., "Shelly")
  model: string | null; // Model of the device (e.g., "Shelly 1")
  model_id: string | null; // Model ID of the device (e.g., "SNSW-001P16EU")
  modified_at: number; // Timestamp of last modification
  name: string | null; // Device name
  name_by_user: string | null; // Name set by the user
  primary_config_entry: string; // Primary config entry ID
  serial_number: string | null; // Serial number of the device
  sw_version: string | null; // Software version
  via_device_id: string | null; // Device ID of the parent device (if applicable)
}

/**
 * Interface representing a Home Assistant entity.
 */
export interface HassEntity {
  area_id: string | null; // The area ID this entity belongs to
  categories: object; // Categories of the entity
  config_entry_id: string; // The config entry this entity belongs to
  created_at: string; // Timestamp of when the entity was created
  device_id: string; // The ID of the device this entity is associated with
  disabled_by: string | null; // Whether the entity is disabled and by whom
  entity_category: string | null; // The category of the entity
  entity_id: string; // Unique ID of the entity (e.g., "light.living_room")
  has_entity_name: boolean; // Whether the entity has a name
  hidden_by: string | null; // Whether the entity is hidden and by whom
  icon: string | null; // Optional icon associated with the entity
  id: string; // Unique ID of the entity
  labels: string[]; // Labels associated with the entity
  modified_at: string; // Timestamp of last modification
  name: string | null; // Friendly name of the entity
  options: Record<string, HomeAssistantPrimitive> | null; // Additional options for the entity
  original_name: string | null; // The original name of the entity (set by the integration)
  platform: string; // Platform or integration the entity belongs to (e.g., "shelly")
  unique_id: string; // Unique ID of the entity
  unit_of_measurement: string | null; // Optional unit of measurement (e.g., °C, %, etc.)
  capabilities: Record<string, HomeAssistantPrimitive> | null; // Additional capabilities, like brightness for lights
  device_class: string | null; // Device class (e.g., "light", "sensor", etc.)
}

/**
 * Interface representing the context of a Home Assistant event.
 */
export interface HassContext {
  id: string;
  parent_id: string | null;
  user_id: string | null;
}

/**
 * Interface representing the state of a Home Assistant entity.
 */
export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, HomeAssistantPrimitive>;
  last_changed: string;
  last_reported: string;
  last_updated: string;
  context: HassContext;
}

/**
 * Interface representing the data of a Home Assistant event.
 */
export interface HassDataEvent {
  entity_id: string;
  old_state: HassEntityState;
  new_state: HassEntityState;
}

/**
 * Interface representing a Home Assistant event.
 */
export interface HassEvent {
  event_type: string;
  data: HassDataEvent;
  origin: string;
  time_fired: string;
  context: HassContext;
}

export interface HomeAssistantUnitSystem {
  length: string;
  accumulated_precipitation: string;
  mass: string;
  pressure: string;
  temperature: string;
  volume: string;
  wind_speed: string;
}

export interface HomeAssistantConfig {
  latitude: number;
  longitude: number;
  elevation: number;
  unit_system: HomeAssistantUnitSystem;
  location_name: string;
  time_zone: string;
  components: string[];
  config_dir: string;
  whitelist_external_dirs: string[];
  allowlist_external_dirs: string[];
  allowlist_external_urls: string[];
  version: string;
  config_source: string;
  recovery_mode: boolean;
  state: string;
  external_url: string | null;
  internal_url: string | null;
  currency: string;
  country: string;
  language: string;
  safe_mode: boolean;
  debug: boolean;
  radius: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface HomeAssistantService {
  [key: string]: object;
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface HomeAssistantServices {
  [key: string]: HomeAssistantService;
}

interface HomeAssistantEvent {
  connected: [ha_version: HomeAssistantPrimitive];
  disconnected: [event?: WebSocket.CloseEvent];
  subscribed: [];
  config: [config: HomeAssistantConfig];
  services: [services: HomeAssistantServices];
  states: [states: HassEntityState[]];
  error: [error: { code: string; message: string } | WebSocket.ErrorEvent | undefined];
  devices: [devices: HassDevice[]];
  entities: [entities: HassEntity[]];
  event: [deviceId: string, entityId: string, old_state: HassEntityState, new_state: HassEntityState];
}

interface HomeAssistantResponseEvent {
  id: number;
  type: string;
  success: boolean;
  error?: { code: string; message: string };
  [key: string]: HomeAssistantPrimitive;
}

export type HomeAssistantPrimitive = string | number | bigint | boolean | object | null | undefined;

export class HomeAssistant extends EventEmitter {
  hassDevices = new Map<string, HassDevice>();
  hassEntities = new Map<string, HassEntity>();
  hassServices: HomeAssistantServices | null = null;
  hassConfig: HomeAssistantConfig | null = null;
  hassStates: HassEntityState[] | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private pingTimeout: NodeJS.Timeout | null = null;
  private readonly pingIntervalTime = 30000;
  private readonly pingTimeoutTime = 35000;
  private readonly configFetchId = 1;
  private readonly servicesFetchId = 2;
  private readonly devicesFetchId = 3;
  private readonly entitiesFetchId = 4;
  private readonly statesFetchId = 5;
  private readonly eventsSubscribeId = 6;
  private asyncFetchId = 0;
  private nextId = 7;
  connected = false;
  devicesReceived = false;
  entitiesReceived = false;
  subscribed = false;
  ws: WebSocket | null = null;
  wsUrl: string;
  wsAccessToken: string;
  log: AnsiLogger;

  override emit<K extends keyof HomeAssistantEvent>(eventName: K, ...args: HomeAssistantEvent[K]): boolean {
    return super.emit(eventName, ...args);
  }

  override on<K extends keyof HomeAssistantEvent>(eventName: K, listener: (...args: HomeAssistantEvent[K]) => void): this {
    return super.on(eventName, listener);
  }

  /**
   * Creates an instance of the HomeAssistant class.
   *
   * @param {string} url - The WebSocket URL for connecting to Home Assistant.
   * @param {string} accessToken - The access token for authenticating with Home Assistant.
   */
  constructor(url: string, accessToken: string) {
    super();
    this.wsUrl = url;
    this.wsAccessToken = accessToken;
    this.log = new AnsiLogger({ logName: 'HomeAssistant', logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });
  }

  /**
   * Establishes a WebSocket connection to Home Assistant.
   */
  connect() {
    if (this.connected) {
      this.log.info('Already connected to Home Assistant');
      return;
    }
    this.log.info(`'Connecting to Home Assistant on ${this.wsUrl} ...`);
    this.ws = new WebSocket(this.wsUrl + '/api/websocket');

    this.ws.onopen = () => {
      this.log.debug('WebSocket connection established');
    };

    this.ws.onmessage = async (event: WebSocket.MessageEvent) => {
      let data;
      try {
        data = JSON.parse(event.data.toString()) as HomeAssistantResponseEvent;
      } catch (error) {
        this.log.error('Error parsing WebSocket.MessageEvent:', error);
        return;
      }
      if (data.type === 'auth_required') {
        this.log.debug('Authentication required. Sending auth message...');
        // Send authentication message
        this.ws?.send(
          JSON.stringify({
            type: 'auth',
            access_token: this.wsAccessToken,
          }),
        );
      } else if (data.type === 'auth_ok') {
        this.log.debug(`Authenticated successfully with Home Assistant v. ${data.ha_version}`);
        this.connected = true;
        this.emit('connected', data.ha_version);

        // Fetch initial data and subscribe to events
        this.fetch('get_config', this.configFetchId);
        this.fetch('get_services', this.servicesFetchId);
        this.fetch('config/device_registry/list', this.devicesFetchId);
        this.fetch('config/entity_registry/list', this.entitiesFetchId);
        this.fetch('get_states', this.statesFetchId);
        this.fetch('subscribe_events', this.eventsSubscribeId);

        // Start ping interval
        this.startPing();
      } else if (data.type === 'result' && data.success !== true) {
        this.log.error('Error result received:', data);
        this.emit('error', data.error);
      } else if (data.type === 'result' && data.success) {
        if (data.id === this.devicesFetchId && data.result) {
          this.devicesReceived = true;
          const devices = data.result as HassDevice[];
          this.log.debug(`Received ${devices.length} devices.`);
          this.emit('devices', devices);
          devices.forEach((device) => {
            this.hassDevices.set(device.id, device);
            // console.log('Device:', device.id, device.name);
          });
        } else if (data.id === this.entitiesFetchId && data.result) {
          this.entitiesReceived = true;
          const entities = data.result as HassEntity[];
          this.log.debug(`Received ${entities.length} entities.`);
          this.emit('entities', entities);
          entities.forEach((entity) => {
            this.hassEntities.set(entity.entity_id, entity);
            // console.log('Entity:', entity.entity_id, entity.name ?? entity.original_name);
          });
        } else if (data.id === this.eventsSubscribeId) {
          this.subscribed = true;
          this.emit('subscribed');
          this.log.debug('Subscribed to events:', data);
        } else if (data.id === this.configFetchId) {
          // this.log.debug('Received config:', data);
          this.hassConfig = data.result as HomeAssistantConfig;
          this.emit('config', this.hassConfig);
        } else if (data.id === this.statesFetchId) {
          // this.log.debug('****Received states:', data);
          this.hassStates = data.result as HassEntityState[];
          this.emit('states', this.hassStates);
        } else if (data.id === this.servicesFetchId) {
          // this.log.debug('Received services:', data);
          this.hassServices = data.result as HomeAssistantServices;
          this.emit('services', this.hassServices);
        } else if (data.id === this.asyncFetchId) {
          this.log.debug(`Received async result id ${data.id}` /* , data*/);
        } else {
          this.log.debug(`Unknown result received id ${data.id}:` /* , data*/);
        }
      } else if (data.type === 'pong') {
        this.log.debug(`Home Assistant pong received with id ${data.id}`);
        if (this.pingTimeout) clearTimeout(this.pingTimeout);
        this.pingTimeout = null;
      } else if (data.type === 'event') {
        // this.log.debug(`Event received id ${data.id}:` /* , data.event*/);
        const event = data.event as HassEvent;
        if (data.id === this.eventsSubscribeId && data.event && event.event_type === 'state_changed') {
          const entity = this.hassEntities.get(event.data.entity_id);
          if (!entity) {
            this.log.error(`Entity ${CYAN}${event.data.entity_id}${er} not found processing event`);
            return;
          }
          const device = this.hassDevices.get(entity.device_id);
          if (!device) {
            this.log.error('Device not found processing event:', entity.device_id);
            return;
          }
          this.emit('event', device.id, event.data.entity_id, event.data.old_state, event.data.new_state);
        } else if (data.id === this.eventsSubscribeId && data.event && event.event_type === 'call_service') {
          this.log.debug(`Event ${CYAN}${event?.event_type}${db} received id ${data.id}`);
        } else {
          this.log.debug(`*Unknown event type ${CYAN}${event?.event_type}${db} received id ${data.id}`);
        }
      }
    };

    this.ws.on('pong', () => {
      this.log.debug('WebSocket pong received');
      if (this.pingTimeout) clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    });

    this.ws.onerror = (event: WebSocket.ErrorEvent) => {
      this.log.error('WebSocket error:', event.message, 'Type:', event.type);
      this.emit('error', event);
    };

    this.ws.onclose = (event: WebSocket.CloseEvent) => {
      this.log.debug('WebSocket connection closed. Reason:', event.reason, 'Code:', event.code, 'Clean:', event.wasClean, 'Type:', event.type);
      this.connected = false;
      this.emit('disconnected', event);
    };
  }

  /**
   * Starts the ping interval to keep the WebSocket connection alive.
   * Logs an error if the ping interval is already started.
   */
  private startPing() {
    if (this.pingInterval) {
      this.log.error('Ping interval already started');
      return;
    }
    this.log.debug('Starting ping interval...');
    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws?.readyState !== WebSocket.OPEN) {
        this.log.error('WebSocket not open sending ping. Closing connection...');
        this.close();
        return;
      }
      this.log.debug(`Sending WebSocket ping...`);
      this.ws.ping();
      this.log.debug(`Sending Home Assistant ping id ${this.nextId}...`);
      this.ws.send(
        JSON.stringify({
          id: this.nextId++,
          type: 'ping',
        }),
      );
      this.pingTimeout = setTimeout(() => {
        this.log.error('Ping timeout. Closing connection...');
        this.close();
      }, this.pingTimeoutTime);
    }, this.pingIntervalTime);
  }

  /**
   * Stops the ping interval and clears any pending timeouts.
   */
  private stopPing() {
    this.log.debug('Stopping ping interval...');
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  /**
   * Closes the WebSocket connection to Home Assistant and stops the ping interval.
   * Emits a 'disconnected' event.
   */
  close() {
    this.log.info('Closing Home Assistance connection...');
    this.stopPing();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(0x1000, 'Normal closure');
    }
    this.ws?.removeAllListeners();
    this.ws = null;
    this.connected = false;
    this.emit('disconnected');
  }

  /**
   * Sends a fetch request to Home Assistant.
   * Logs an error if not connected or if the WebSocket is not open.
   *
   * @param {string} type - The type of fetch request to send.
   * @param {number} [id] - The ID of the fetch request. If not provided, a new ID is generated.
   */
  private fetch(type: string, id?: number) {
    if (!this.connected) {
      this.log.error('Fetch error: not connected to Home Assistant');
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log.error('Fetch error: WebSocket not open.');
      return;
    }
    if (!id) id = this.nextId++;
    this.log.debug(`Fetching ${type} with id ${id}...`);
    this.ws.send(JSON.stringify({ id, type }));
  }

  /**
   * Sends a request to Home Assistant and waits for a response.
   *
   * @param {string} type - The type of request to send.
   * @param {number} [timeout=5000] - The timeout in milliseconds to wait for a response. Default is 5000ms.
   * @returns {Promise<any>} - A Promise that resolves with the response from Home Assistant or rejects with an error.
   *
   * @example
   * // Example usage:
   * fetchAsync('get_states')
   *   .then(response => {
   *     console.log('Received response:', response);
   *   })
   *   .catch(error => {
   *     console.error('Error:', error);
   *   });
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-inferrable-types
  fetchAsync(type: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        this.log.error('Fetch error: not connected to Home Assistant');
        reject('Fetch error: not connected to Home Assistant');
        return;
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.log.error('Fetch error: WebSocket not open.');
        reject('Fetch error: WebSocket not open.');
        return;
      }
      this.asyncFetchId = this.nextId++;
      this.log.debug(`Fetching async ${type} with id ${this.asyncFetchId}...`);

      const message = JSON.stringify({ id: this.asyncFetchId, type });
      this.ws.send(message);

      const timer = setTimeout(() => {
        reject('Fetch async did not complete before the timeout');
      }, timeout);

      const handleMessage = (event: WebSocket.MessageEvent) => {
        let response;
        try {
          response = JSON.parse(event.data.toString()) as HomeAssistantResponseEvent;
        } catch (error) {
          this.log.error('Error parsing WebSocket.MessageEvent:', error);
        }
        if (!response) {
          clearTimeout(timer);
          this.ws?.removeEventListener('message', handleMessage);
          reject('Error parsing WebSocket.MessageEvent');
          return;
        }
        if (response.type === 'result' && response.id === this.asyncFetchId) {
          clearTimeout(timer);
          this.ws?.removeEventListener('message', handleMessage);
          if (response.success) {
            resolve(response.result);
          } else {
            reject(response.error);
          }
        }
      };

      this.ws.addEventListener('message', handleMessage);
    });
  }

  /**
   * Sends a command to a specified Home Assistant service.
   *
   * @param {string} domain - The domain of the Home Assistant service.
   * @param {string} service - The service to call on the Home Assistant domain.
   * @param {string} entityId - The ID of the entity to target with the command.
   * @param {Record<string, any>} [serviceData={}] - Additional data to send with the command.
   *
   * @example <caption>Example usage of the callService method.</caption>
   * await this.callService('switch', 'toggle', 'switch.living_room');
   * await this.callService('light', 'turn_on', 'light.living_room', { brightness: 255 });
   */
  callService(domain: string, service: string, entityId: string, serviceData: Record<string, HomeAssistantPrimitive> = {}) {
    this.log.debug(`Calling service ${BLUE}${domain}.${service}${db} for entity ${BLUE}${entityId}${db} with: ${debugStringify(serviceData)}`);
    this.ws?.send(
      JSON.stringify({
        id: this.nextId++, // Unique message ID
        type: 'call_service',
        domain, // Domain of the entity (e.g., light, switch, media_player, etc.)
        service, // The specific service to call (e.g., turn_on, turn_off)
        service_data: {
          entity_id: entityId, // The entity_id of the device (e.g., light.living_room)
          ...serviceData, // Additional data to send with the command
        },
      }),
    );
  }
}
