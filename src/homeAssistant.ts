/* eslint-disable @typescript-eslint/no-inferrable-types */
/**
 * This file contains the class HomeAssistant.
 *
 * @file src\homeAssistant.ts
 * @author Luca Liguori
 * @date 2024-09-14
 * @version 0.0.2
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

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { AnsiLogger, LogLevel, TimestampFormat, CYAN, db, debugStringify } from 'matterbridge/logger';
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
// prettier-ignore
export interface HassEntity {
  entity_id: string;                    // Unique ID of the entity (e.g., "light.living_room")
  area_id: string | null;               // The area ID this entity belongs to
  categories: object;                   // Categories of the entity
  config_entry_id: string;              // The config entry this entity belongs to
  created_at: string;                   // Timestamp of when the entity was created
  device_id: string | null;             // The ID of the device this entity is associated with (e.g., "14231f5b82717f1d9e2f71d354120331")
  disabled_by: string | null;           // Whether the entity is disabled and by whom
  entity_category: string | null;       // The category of the entity
  has_entity_name: boolean;             // Whether the entity has a name
  hidden_by: string | null;             // Whether the entity is hidden and by whom
  icon: string | null;                  // Optional icon associated with the entity
  id: string;                           // Unique ID of the entity (e.g., "368c6fd2f264aba2242e0658612c250e")
  labels: string[];                     // Labels associated with the entity
  modified_at: string;                  // Timestamp of last modification
  name: string | null;                  // Friendly name of the entity
  options: Record<string, HomeAssistantPrimitive> | null; // Additional options for the entity
  original_name: string | null;         // The original name of the entity (set by the integration)
  platform: string;                     // Platform or integration the entity belongs to (e.g., "shelly")
  unique_id: string;                    // Unique ID of the entity
  config_subentry_id: string | null;
  translation_key: string | null;
}

/**
 * Interface representing a Home Assistant area.
 */
export interface HassArea {
  aliases: string[];
  area_id: string;
  floor_id: string | null;
  humidity_entity_id: string | null;
  icon: string | null;
  labels: string[];
  name: string;
  picture: string | null;
  temperature_entity_id: string | null;
  created_at: number;
  modified_at: number;
}

/**
 * Interface representing the context of a Home Assistant event.
 */
export interface HassContext {
  id: string;
  user_id: string | null;
  parent_id: string | null;
}

/**
 * Interface representing the state of a Home Assistant entity.
 */
export interface HassState {
  entity_id: string;
  state: string;
  last_changed: string;
  last_reported: string;
  last_updated: string;
  attributes: HassStateAttributes & Record<string, HomeAssistantPrimitive>;
  context: HassContext;
}

/**
 * Interface representing the attributes of a Home Assistant entity's state.
 */
export interface HassStateAttributes {
  friendly_name?: string;
  unit_of_measurement?: string;
  icon?: string;
  entity_picture?: string;
  supported_features?: number;
  hidden?: boolean;
  assumed_state?: boolean;
  device_class?: string;
  state_class?: string;
  restored?: boolean;
}

/**
 * Interface representing the data of a Home Assistant event.
 */
export interface HassDataEvent {
  entity_id: string;
  old_state: HassState | null;
  new_state: HassState | null;
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

/**
 * Interface representing the unit system used in Home Assistant.
 */
export interface HassUnitSystem {
  length: string;
  accumulated_precipitation: string;
  mass: string;
  pressure: string;
  temperature: string;
  volume: string;
  wind_speed: string;
}

/**
 * Interface representing the configuration of Home Assistant.
 */
export interface HassConfig {
  latitude: number;
  longitude: number;
  elevation: number;
  unit_system: HassUnitSystem;
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
export interface HassService {
  [key: string]: object;
}

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export interface HassServices {
  [key: string]: HassService;
}

interface HassWebSocketResponse {
  id: number;
  type: string;
  success: boolean;
  error?: { code: string; message: string };
  event?: HassEvent;
  [key: string]: HomeAssistantPrimitive;
}

export type HomeAssistantPrimitive = string | number | bigint | boolean | object | null | undefined;

interface HomeAssistantEventEmitter {
  connected: [ha_version: HomeAssistantPrimitive];
  disconnected: [error: string];
  subscribed: [];
  config: [config: HassConfig];
  services: [services: HassServices];
  states: [states: HassState[]];
  error: [error: string];
  devices: [devices: HassDevice[]];
  entities: [entities: HassEntity[]];
  areas: [areas: HassArea[]];
  event: [deviceId: string | null, entityId: string, old_state: HassState, new_state: HassState];
  call_service: [];
  pong: [];
}

export class HomeAssistant extends EventEmitter {
  hassDevices = new Map<string, HassDevice>();
  hassEntities = new Map<string, HassEntity>();
  hassStates = new Map<string, HassState>();
  hassAreas = new Map<string, HassArea>();
  hassServices: HassServices | null = null;
  hassConfig: HassConfig | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private pingTimeout: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly pingIntervalTime: number = 30000;
  private readonly pingTimeoutTime: number = 35000;
  private readonly reconnectTimeoutTime: number = 60000; // Reconnect timeout in milliseconds, 0 means no timeout
  private readonly reconnectRetries: number = 10; // Number of retries for reconnection
  private readonly certificatePath: string | undefined = undefined; // Path to the CA certificate for secure connections
  private readonly rejectUnauthorized: boolean | undefined = undefined; // Whether to reject unauthorized certificates
  private reconnectRetry = 0; // Reconnect retry count
  private readonly configFetchId = 1;
  private readonly servicesFetchId = 2;
  private readonly devicesFetchId = 3;
  private readonly entitiesFetchId = 4;
  private readonly statesFetchId = 5;
  private readonly areasFetchId = 6;
  private readonly eventsSubscribeId = 7;
  private asyncFetchId = 0;
  private asyncCallServiceId = 0;
  private nextId = 8;
  connected = false;
  devicesReceived = false;
  entitiesReceived = false;
  statesReceived = false;
  areasReceived = false;
  subscribed = false;
  ws: WebSocket | null = null;
  wsUrl: string;
  wsAccessToken: string;
  log: AnsiLogger;

  /**
   * Emits an event of the specified type with the provided arguments.
   *
   * @template K - The type of the event to emit.
   * @param {K} eventName - The name of the event to emit.
   * @param {...HomeAssistantEventEmitter[K]} args - The arguments to pass to the event listeners.
   * @returns {boolean} - Returns true if the event had listeners, false otherwise.
   */
  override emit<K extends keyof HomeAssistantEventEmitter>(eventName: K, ...args: HomeAssistantEventEmitter[K]): boolean {
    return super.emit(eventName, ...args);
  }

  /**
   * Registers a listener for the specified event type.
   *
   * @template K - The type of the event to listen for.
   * @param {K} eventName - The name of the event to listen for.
   * @param {(...args: HomeAssistantEventEmitter[K]) => void} listener - The callback function to invoke when the event is emitted.
   * @returns {this} - Returns the instance of the HomeAssistant class for chaining.
   */
  override on<K extends keyof HomeAssistantEventEmitter>(eventName: K, listener: (...args: HomeAssistantEventEmitter[K]) => void): this {
    return super.on(eventName, listener);
  }

  /**
   * Creates an instance of the HomeAssistant class.
   *
   * @param {string} url - The WebSocket URL for connecting to Home Assistant.
   * @param {string} accessToken - The access token for authenticating with Home Assistant.
   * @param {number} [reconnectTimeoutTime=60] - The timeout duration for reconnect attempts in seconds. Defaults to 60 seconds.
   * @param {number} [reconnectRetries=10] - The number of reconnection attempts to make before giving up. Defaults to 10 attempts.
   */
  constructor(
    url: string,
    accessToken: string,
    reconnectTimeoutTime: number = 60,
    reconnectRetries: number = 10,
    certificatePath: string | undefined = undefined,
    rejectUnauthorized: boolean | undefined = undefined,
  ) {
    super();
    this.wsUrl = url;
    this.wsAccessToken = accessToken;
    this.reconnectTimeoutTime = reconnectTimeoutTime * 1000;
    this.reconnectRetries = reconnectRetries;
    this.certificatePath = certificatePath;
    this.rejectUnauthorized = rejectUnauthorized;
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

    try {
      this.log.info(`Connecting to Home Assistant on ${this.wsUrl}...`);

      if (this.wsUrl.startsWith('ws://')) {
        this.ws = new WebSocket(this.wsUrl + '/api/websocket');
      } else if (this.wsUrl.startsWith('wss://')) {
        let ca: string | Buffer<ArrayBufferLike> | (string | Buffer<ArrayBufferLike>)[] | undefined;
        // Load the CA certificate if provided
        if (this.certificatePath) {
          this.log.debug(`Loading CA certificate from ${this.certificatePath}...`);
          ca = readFileSync(this.certificatePath); // Load CA certificate from the provided path
          this.log.debug(`CA certificate loaded successfully`);
        }
        this.ws = new WebSocket(this.wsUrl + '/api/websocket', {
          ca,
          rejectUnauthorized: this.rejectUnauthorized,
        });
      } else {
        throw new Error(`Invalid WebSocket URL: ${this.wsUrl}. It must start with ws:// or wss://`);
      }

      this.ws.onopen = () => {
        this.log.debug('WebSocket connection established');
      };

      this.ws.onmessage = async (event: WebSocket.MessageEvent) => {
        let response;
        try {
          response = JSON.parse(event.data.toString()) as HassWebSocketResponse;
        } catch (error) {
          this.log.error(`Error parsing WebSocket message: ${error}`);
          return;
        }
        if (response.type === 'auth_required') {
          this.log.debug('Authentication required. Sending auth message...');
          // Send authentication message
          this.ws?.send(
            JSON.stringify({
              type: 'auth',
              access_token: this.wsAccessToken,
            }),
          );
        } else if (response.type === 'auth_ok') {
          this.log.debug(`Authenticated successfully with Home Assistant v. ${response.ha_version}`);
          this.connected = true;
          this.emit('connected', response.ha_version);

          // Fetch initial data and subscribe to events
          this.fetch('get_config', this.configFetchId);
          this.fetch('get_services', this.servicesFetchId);
          this.fetch('config/device_registry/list', this.devicesFetchId);
          this.fetch('config/entity_registry/list', this.entitiesFetchId);
          this.fetch('get_states', this.statesFetchId);
          this.fetch('config/area_registry/list', this.areasFetchId);
          this.fetch('subscribe_events', this.eventsSubscribeId);

          // Start ping interval
          this.startPing();
        } else if (response.type === 'result' && response.success !== true) {
          const errorMessage = response.error ? `WebSocket response error: ${response.error.message}` : 'WebSocket response error: unknown error';
          this.log.debug(`WebSocket response error: ${errorMessage}`);
          this.emit('error', errorMessage);
        } else if (response.type === 'result' && response.success) {
          if (response.id === this.devicesFetchId && response.result) {
            this.devicesReceived = true;
            const devices = response.result as HassDevice[];
            this.log.debug(`Received ${devices.length} devices.`);
            this.emit('devices', devices);
            devices.forEach((device) => {
              this.hassDevices.set(device.id, device);
              // console.log('Device:', device.id, device.name);
            });
          } else if (response.id === this.entitiesFetchId && response.result) {
            this.entitiesReceived = true;
            const entities = response.result as HassEntity[];
            this.log.debug(`Received ${entities.length} entities.`);
            this.emit('entities', entities);
            entities.forEach((entity) => {
              this.hassEntities.set(entity.entity_id, entity);
              // console.log('Entity:', entity.entity_id, entity.name ?? entity.original_name);
            });
          } else if (response.id === this.areasFetchId && response.result) {
            this.areasReceived = true;
            const areas = response.result as HassArea[];
            this.log.debug(`Received ${areas.length} areas.` /* , areas*/);
            this.emit('areas', areas);
            areas.forEach((area) => {
              this.hassAreas.set(area.area_id, area);
              // console.log('Area:', area.area_id, area.name ?? area.original_name);
            });
          } else if (response.id === this.statesFetchId) {
            this.statesReceived = true;
            const states = response.result as HassState[];
            this.log.debug(`Received ${states.length} states.`);
            this.emit('states', states);
            states.forEach((state) => {
              this.hassStates.set(state.entity_id, state);
              // console.log('State:', state.entity_id, state.state);
            });
          } else if (response.id === this.configFetchId) {
            // this.log.debug('Received config:', data);
            this.hassConfig = response.result as HassConfig;
            this.emit('config', this.hassConfig);
          } else if (response.id === this.servicesFetchId) {
            // this.log.debug('Received services:', data);
            this.hassServices = response.result as HassServices;
            this.emit('services', this.hassServices);
          } else if (response.id === this.eventsSubscribeId) {
            this.subscribed = true;
            this.emit('subscribed');
            this.log.debug('Subscribed to events:', response);
          } else if (response.id === this.asyncFetchId) {
            this.log.debug(`Received fectch async result id ${response.id}` /* , data*/);
          } else if (response.id === this.asyncCallServiceId) {
            this.log.debug(`Received callService async result id ${response.id}` /* , data*/);
          } else {
            this.log.debug(`Unknown result received id ${response.id}:` /* , data*/);
          }
        } else if (response.type === 'pong') {
          this.log.debug(`Home Assistant pong received with id ${response.id}`);
          if (this.pingTimeout) clearTimeout(this.pingTimeout);
          this.pingTimeout = null;
          this.emit('pong');
        } else if (response.type === 'event') {
          // this.log.debug(`Event received id ${data.id}:` /* , data.event*/);
          if (!response.event) {
            this.log.error('Event response missing event data');
            return;
          }
          if (response.id === this.eventsSubscribeId && response.event && response.event.event_type === 'state_changed') {
            // this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
            const entity = this.hassEntities.get(response.event.data.entity_id);
            if (!entity) {
              this.log.debug(`Entity id ${CYAN}${response.event.data.entity_id}${db} not found processing event`);
              return;
            }
            if (response.event.data.old_state && response.event.data.new_state) {
              this.hassStates.set(response.event.data.new_state.entity_id, response.event.data.new_state);
              this.emit('event', entity.device_id, entity.entity_id, response.event.data.old_state, response.event.data.new_state);
            }
          } else if (response.id === this.eventsSubscribeId && response.event && response.event.event_type === 'call_service') {
            this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
            this.emit('call_service');
          } else if (response.id === this.eventsSubscribeId && response.event && response.event.event_type === 'device_registry_updated') {
            this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
            const devices = (await this.fetchAsync('config/device_registry/list')) as HassDevice[];
            this.log.debug(`Received ${devices.length} devices.`);
            devices.forEach((device) => {
              this.hassDevices.set(device.id, device);
            });
            this.emit('devices', devices);
          } else if (response.id === this.eventsSubscribeId && response.event && response.event.event_type === 'entity_registry_updated') {
            this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
            const entities = (await this.fetchAsync('config/entity_registry/list')) as HassEntity[];
            this.log.debug(`Received ${entities.length} entities.`);
            entities.forEach((entity) => {
              this.hassEntities.set(entity.entity_id, entity);
            });
            this.emit('entities', entities);
          } else if (response.id === this.eventsSubscribeId && response.event && response.event.event_type === 'area_registry_updated') {
            this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
            const areas = (await this.fetchAsync('config/area_registry/list')) as HassArea[];
            this.log.debug(`Received ${areas.length} areas.`);
            areas.forEach((area) => {
              this.hassAreas.set(area.area_id, area);
            });
            this.emit('areas', areas);
          } else {
            this.log.debug(`*Unknown event type ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
          }
        }
      };

      this.ws.on('pong', () => {
        this.log.debug('WebSocket pong received');
        if (this.pingTimeout) clearTimeout(this.pingTimeout);
        this.pingTimeout = null;
      });

      this.ws.onerror = (event: WebSocket.ErrorEvent) => {
        const errorMessage = `WebSocket error: ${event.message} type: ${event.type}`;
        this.log.debug(errorMessage);
        this.emit('error', errorMessage);
      };

      this.ws.onclose = (event: WebSocket.CloseEvent) => {
        const errorMessage = `WebSocket connection closed. Reason: ${event.reason} Code: ${event.code} Clean: ${event.wasClean} Type: ${event.type}`;
        this.log.debug(errorMessage);
        this.connected = false;
        this.stopPing();
        this.emit('disconnected', errorMessage);
        this.startReconnect();
      };
    } catch (error) {
      const errorMessage = `WebSocket error connecting to Home Assistant: ${error}`;
      this.log.debug(errorMessage);
      this.emit('error', errorMessage);
    }
  }

  /**
   * Starts the ping interval to keep the WebSocket connection alive.
   * Logs an error if the ping interval is already started.
   */
  private startPing() {
    if (this.pingInterval) {
      this.log.debug('Ping interval already started');
      return;
    }
    this.log.debug('Starting ping interval...');
    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
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
        this.startReconnect();
      }, this.pingTimeoutTime);
    }, this.pingIntervalTime);
  }

  /**
   * Start the reconnection timeout.
   */
  startReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.reconnectTimeoutTime && this.reconnectRetry <= this.reconnectRetries) {
      this.log.notice(`Reconnecting in ${this.reconnectTimeoutTime / 1000} seconds...`);
      this.reconnectTimeout = setTimeout(() => {
        this.log.notice(`Reconnecting attempt ${this.reconnectRetry} of ${this.reconnectRetries}...`);
        this.connect();
        this.reconnectRetry++;
      }, this.reconnectTimeoutTime);
    } else {
      this.log.warn('The reconnectTimeout in the config is not enabled. Restart the plugin to reconnect.');
    }
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
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(0x1000, 'Normal closure');
    }
    this.ws?.removeAllListeners();
    this.ws = null;
    this.connected = false;
    this.emit('disconnected', 'WebSocket connection closed');
  }

  /**
   * Sends a fetch request to Home Assistant.
   * Logs an error if not connected or if the WebSocket is not open.
   *
   * @param {string} type - The type of fetch request to send.
   * @param {number} [id] - The ID of the fetch request. If not provided, a new ID is generated.
   */
  fetch(type: string, id?: number) {
    if (!this.connected) {
      this.log.error('Fetch error: not connected to Home Assistant');
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log.error('Fetch error: WebSocket not open');
      return;
    }
    if (!id) id = this.nextId++;
    this.log.debug(`Fetching ${CYAN}${type}${db} id ${CYAN}${id}${db}...`);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchAsync(type: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        this.log.error('FetchAsync error: not connected to Home Assistant');
        reject('FetchAsync error: not connected to Home Assistant');
        return;
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.log.error('FetchAsync error: WebSocket not open');
        reject('FetchAsync error: WebSocket not open');
        return;
      }
      const asyncFetchId = (this.asyncFetchId = this.nextId++);
      this.log.debug(`Fetching async ${CYAN}${type}${db} with id ${CYAN}${asyncFetchId}${db} and timeout ${CYAN}${timeout}${db} ms ...`);

      const message = JSON.stringify({ id: asyncFetchId, type });
      this.ws.send(message);

      const timer = setTimeout(() => {
        reject('FetchAsync did not complete before the timeout');
      }, timeout);

      const handleMessage = (event: WebSocket.MessageEvent) => {
        let response;
        try {
          response = JSON.parse(event.data.toString()) as HassWebSocketResponse;
        } catch (error) {
          this.log.error('FetchAsync error parsing WebSocket.MessageEvent:', error);
        }
        if (!response) {
          clearTimeout(timer);
          this.ws?.removeEventListener('message', handleMessage);
          reject('FetchAsync error parsing WebSocket.MessageEvent');
          return;
        }
        if (response.type === 'result' && response.id === asyncFetchId) {
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
  callService(domain: string, service: string, entityId: string, serviceData: Record<string, HomeAssistantPrimitive> = {}, id?: number) {
    if (!this.connected) {
      this.log.error('CallService error: not connected to Home Assistant');
      return;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log.error('CallService error: WebSocket not open');
      return;
    }
    if (!id) id = this.nextId++;
    this.log.debug(`Calling service ${CYAN}${domain}.${service}${db} for entity ${CYAN}${entityId}${db} with ${debugStringify(serviceData)}${db} id ${CYAN}${id}${db}`);
    this.ws.send(
      JSON.stringify({
        id, // Unique message ID
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

  /**
   * Sends async command to a specified Home Assistant service.
   *
   * @param {string} domain - The domain of the Home Assistant service.
   * @param {string} service - The service to call on the Home Assistant domain.
   * @param {string} entityId - The ID of the entity to target with the command.
   * @param {Record<string, any>} [serviceData={}] - Additional data to send with the command.
   * @param {number} [timeout=5000] - The timeout in milliseconds to wait for a response. Default is 5000ms.
   * @returns {Promise<any>} - A Promise that resolves with the response from Home Assistant or rejects with an error.
   *
   * @example <caption>Example usage of the callService method.</caption>
   * await this.callService('switch', 'toggle', 'switch.living_room');
   * await this.callService('light', 'turn_on', 'light.living_room', { brightness: 255 });
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callServiceAsync(domain: string, service: string, entityId: string, serviceData: Record<string, HomeAssistantPrimitive> = {}, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        this.log.error('CallServiceAsync error: not connected to Home Assistant');
        reject('CallServiceAsync error: not connected to Home Assistant');
        return;
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.log.error('CallServiceAsync error: WebSocket not open');
        reject('CallServiceAsync error: WebSocket not open');
        return;
      }
      const asyncCallServiceId = (this.asyncCallServiceId = this.nextId++);
      this.log.debug(
        `Calling service async ${CYAN}${domain}.${service}${db} for entity ${CYAN}${entityId}${db} with ${debugStringify(serviceData)}${db} id ${CYAN}${asyncCallServiceId}${db} and timeout ${CYAN}${timeout}${db} ms ...`,
      );
      this.ws.send(
        JSON.stringify({
          id: asyncCallServiceId, // Unique message ID
          type: 'call_service',
          domain, // Domain of the entity (e.g., light, switch, media_player, etc.)
          service, // The specific service to call (e.g., turn_on, turn_off)
          service_data: {
            entity_id: entityId, // The entity_id of the device (e.g., light.living_room)
            ...serviceData, // Additional data to send with the command
          },
        }),
      );

      const timer = setTimeout(() => {
        reject('CallServiceAsync did not complete before the timeout');
      }, timeout);

      const handleMessage = (event: WebSocket.MessageEvent) => {
        let response;
        try {
          response = JSON.parse(event.data.toString()) as HassWebSocketResponse;
        } catch (error) {
          this.log.error('CallServiceAsync error parsing WebSocket.MessageEvent:', error);
        }
        if (!response) {
          clearTimeout(timer);
          this.ws?.removeEventListener('message', handleMessage);
          reject('CallServiceAsync error parsing WebSocket.MessageEvent');
          return;
        }
        if (response.type === 'result' && response.id === asyncCallServiceId) {
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
}
