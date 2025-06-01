/* eslint-disable @typescript-eslint/no-inferrable-types */
/**
 * This file contains the class HomeAssistant.
 *
 * @file src\homeAssistant.ts
 * @author Luca Liguori
 * @date 2024-09-14
 * @version 1.0.1
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
  result?: HassConfig | HassServices | HassDevice[] | HassEntity[] | HassState[] | HassArea[];
  [key: string]: HomeAssistantPrimitive;
}

export type HomeAssistantPrimitive = string | number | bigint | boolean | object | null | undefined;

interface HomeAssistantEventEmitter {
  connected: [ha_version: HomeAssistantPrimitive];
  disconnected: [error: string];
  socket_closed: [code: number, reason: Buffer];
  socket_opened: [];
  config: [config: HassConfig];
  services: [services: HassServices];
  states: [states: HassState[]];
  error: [error: string];
  devices: [devices: HassDevice[]];
  entities: [entities: HassEntity[]];
  areas: [areas: HassArea[]];
  subscribed: [];
  event: [deviceId: string | null, entityId: string, old_state: HassState, new_state: HassState];
  call_service: [];
  ping: [data: Buffer];
  pong: [data: Buffer];
}

export class HomeAssistant extends EventEmitter {
  connected = false;
  ws: WebSocket | null = null;
  wsUrl: string;
  wsAccessToken: string;
  log: AnsiLogger;
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
  private readonly reconnectTimeoutTime: number = 60000; // Reconnect timeout in milliseconds, 0 means no timeout.
  private readonly reconnectRetries: number = 10; // Number of retries for reconnection. It will retry until the connection is established or the maximum number of retries is reached.
  private _responseTimeout: number = 5000; // Default WebSocket timeout for responses in milliseconds
  private readonly certificatePath: string | undefined = undefined; // Full path to the CA certificate for secure connections
  private readonly rejectUnauthorized: boolean | undefined = undefined; // Whether the WebSocket has to reject unauthorized certificates
  private reconnectRetry = 1; // Reconnect retry count. It is incremented each time a reconnect is attempted till the maximum number of retries is reached.
  private requestId = 1; // Next id for WebSocket requests. It has to be incremented for each request.

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

  get responseTimeout(): number {
    return this._responseTimeout;
  }

  set responseTimeout(value: number) {
    this._responseTimeout = value;
  }

  /**
   * Creates an instance of the HomeAssistant class.
   *
   * @param {string} url - The WebSocket URL for connecting to Home Assistant (i.e. ws://localhost:8123 or wss://localhost:8123).
   * @param {string} accessToken - The access token for authenticating with Home Assistant.
   * @param {number} [reconnectTimeoutTime=60] - The timeout duration for reconnect attempts in seconds. Defaults to 60 seconds.
   * @param {number} [reconnectRetries=10] - The number of reconnection attempts to make before giving up. Defaults to 10 attempts.
   * @param {string | undefined} [certificatePath=undefined] - The path to the CA certificate for secure WebSocket connections. Defaults to undefined.
   * @param {boolean | undefined} [rejectUnauthorized=undefined] - Whether to reject unauthorized certificates. Defaults to undefined.
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

  private onOpen = () => {
    this.log.debug('WebSocket connection established');
    this.emit('socket_opened');
  };

  private onPing(data: Buffer) {
    this.log.debug('WebSocket ping received');
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    this.pingTimeout = null;
    this.emit('ping', data);
  }

  private onPong(data: Buffer) {
    this.log.debug('WebSocket pong received');
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    this.pingTimeout = null;
    this.emit('pong', data);
  }

  private onError(error: Error) {
    const errorMessage = `WebSocket error: ${error}`;
    this.log.debug(errorMessage);
    this.emit('error', errorMessage);
  }

  private onMessage(data: WebSocket.RawData, isBinary: boolean) {
    let response;
    try {
      response = JSON.parse(isBinary ? data.toString() : (data as unknown as string)) as HassWebSocketResponse;
    } catch (error) {
      this.log.error(`Error parsing WebSocket message: ${error}`);
      return;
    }
    if (response.type === 'pong') {
      this.log.debug(`Home Assistant pong received with id ${response.id}`);
      if (this.pingTimeout) clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
      this.emit('pong', Buffer.from('Home Assistant pong received'));
    } else if (response.type === 'event') {
      if (!response.event) {
        const errorMessage = `WebSocket event response missing event data for id ${response.id}`;
        this.log.error(errorMessage);
        this.emit('error', errorMessage);
        return;
      }
      if (response.event.event_type === 'state_changed') {
        const entity = this.hassEntities.get(response.event.data.entity_id);
        if (!entity) {
          this.log.debug(`Entity id ${CYAN}${response.event.data.entity_id}${db} not found processing event`);
          return;
        }
        if (response.event.data.old_state && response.event.data.new_state) {
          this.hassStates.set(response.event.data.new_state.entity_id, response.event.data.new_state);
          this.emit('event', entity.device_id, entity.entity_id, response.event.data.old_state, response.event.data.new_state);
        }
      } else if (response.event.event_type === 'call_service') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        this.emit('call_service');
      } else if (response.event.event_type === 'device_registry_updated') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        this.fetch('config/device_registry/list')
          .then((devices: HassDevice[]) => {
            this.log.debug(`Received ${devices.length} devices.`);
            devices.forEach((device) => this.hassDevices.set(device.id, device));
            this.emit('devices', devices);
          })
          .catch((error) => {
            this.log.error(`Error fetching device registry: ${error}`);
          });
      } else if (response.event.event_type === 'entity_registry_updated') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        this.fetch('config/entity_registry/list')
          .then((entities: HassEntity[]) => {
            this.log.debug(`Received ${entities.length} entities.`);
            entities.forEach((entity) => this.hassEntities.set(entity.entity_id, entity));
            this.emit('entities', entities);
          })
          .catch((error) => {
            this.log.error(`Error fetching entity registry: ${error}`);
          });
      } else if (response.event.event_type === 'area_registry_updated') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        this.fetch('config/area_registry/list')
          .then((areas: HassArea[]) => {
            this.log.debug(`Received ${areas.length} areas.`);
            areas.forEach((area) => this.hassAreas.set(area.area_id, area));
            this.emit('areas', areas);
          })
          .catch((error) => {
            this.log.error(`Error fetching area registry: ${error}`);
          });
      } else {
        this.log.debug(`*Unknown event type ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
      }
    }
  }

  private onClose(code: number, reason: Buffer) {
    const closeMessage = `WebSocket connection closed. Code: ${code} Reason: ${reason.toString()}`;
    this.log.debug(closeMessage);
    this.connected = false;
    this.stopPing();
    this.emit('socket_closed', code, reason);
    this.startReconnect();
  }

  /**
   * Connects to Home Assistant WebSocket API. It establishes a WebSocket connection, authenticates, fetches initial data, and subscribes to events.
   *
   * @returns {Promise<void>}
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        return reject(new Error('Already connected to Home Assistant'));
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
          return reject(new Error(`Invalid WebSocket URL: ${this.wsUrl}. It must start with ws:// or wss://`));
        }

        // Add the event listeners
        this.ws.on('open', this.onOpen.bind(this));
        this.ws.on('ping', this.onPing.bind(this));
        this.ws.on('pong', this.onPong.bind(this));
        this.ws.on('error', this.onError.bind(this));
        this.ws.on('close', this.onClose.bind(this));

        this.ws.onmessage = async (event: WebSocket.MessageEvent) => {
          let response;
          try {
            response = JSON.parse(event.data.toString()) as HassWebSocketResponse;
          } catch (error) {
            return reject(new Error(`Error parsing WebSocket message: ${error}`));
          }
          if (response.type === 'auth_required') {
            this.log.debug('Authentication required. Sending auth message...');
            this.ws?.send(
              JSON.stringify({
                type: 'auth',
                access_token: this.wsAccessToken,
              }),
            );
          } else if (response.type === 'auth_ok') {
            // Handle successful authentication
            this.log.debug(`Authenticated successfully with Home Assistant v. ${response.ha_version}`);
            this.connected = true;
            this.reconnectRetry = 1; // Reset the reconnect retry count

            // Add the message event listeners
            if (this.ws) this.ws.onmessage = null; // Clear the current onmessage handler to avoid duplicate processing
            this.ws?.on('message', this.onMessage.bind(this));

            // Start ping interval
            this.startPing();
            this.emit('connected', response.ha_version);
            return resolve();
          }
        };
      } catch (error) {
        const errorMessage = `WebSocket error connecting to Home Assistant: ${error}`;
        this.log.debug(errorMessage);
        return reject(new Error(errorMessage));
      }
    });
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
      this.log.debug(`Sending Home Assistant ping id ${this.requestId}...`);
      this.ws.send(
        JSON.stringify({
          id: this.requestId++,
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
   * Start the reconnection timeout if reconnectTimeoutTime and reconnectRetries are set in the config.
   */
  private startReconnect() {
    if (this.reconnectTimeout) {
      this.log.debug(`Reconnecting already in progress.`);
      return;
    }
    if (this.reconnectTimeoutTime && this.reconnectRetry <= this.reconnectRetries) {
      this.log.notice(`Reconnecting in ${this.reconnectTimeoutTime / 1000} seconds...`);
      this.reconnectTimeout = setTimeout(() => {
        this.log.notice(`Reconnecting attempt ${this.reconnectRetry} of ${this.reconnectRetries}...`);
        this.connect();
        this.reconnectRetry++;
        this.reconnectTimeout = null;
      }, this.reconnectTimeoutTime).unref();
    } else {
      this.log.error('Restart the plugin to reconnect.');
    }
  }

  /**
   * Stops the ping interval, closes the WebSocket connection to Home Assistant and emits a 'disconnected' event.
   * @param {number} [code=1000] - The WebSocket close code. Default is 1000 (Normal closure).
   * @param {string | Buffer} [reason='Normal closure'] - The reason for closing the connection. Default is 'Normal closure'.
   * @returns {Promise<void>} - A Promise that resolves when the connection is closed or rejects with an error if the connection could not be closed.
   */
  close(code = 1000, reason: string | Buffer = 'Normal closure'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.log.info('Closing Home Assistant connection...');
      this.stopPing();
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      const cleanup = () => {
        clearTimeout(timer);
        this.ws?.removeAllListeners();
        this.ws = null;
        this.connected = false;
        this.emit('disconnected', 'WebSocket connection closed');
        this.log.info('Home Assistant connection closed');
      };

      const timer = setTimeout(() => {
        const message = `Close() did not complete before the timeout of ${this._responseTimeout} ms`;
        this.log.debug(message);
        cleanup();
        return reject(new Error(message));
      }, this._responseTimeout).unref();

      const onClose = () => {
        this.log.debug('Close() received closed event from Home Assistant');
        cleanup();
        return resolve();
      };

      const onError = () => {
        const message = 'Close() received error event while closing connection to Home Assistant';
        this.log.debug(message);
        cleanup();
        return reject(new Error(message));
      };

      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws.onclose = onClose;
        this.ws.onerror = onError;
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.log.debug('Close() websocket is open, closing...');
        this.ws.close(code, reason);
      } else {
        this.log.debug('Close() websocket is not open, resolving...');
        cleanup();
        return resolve();
      }
    });
  }

  /**
   * Fetches the initial data from Home Assistant.
   * This method retrieves the configuration, services, devices, entities, states, and areas from Home Assistant.
   */
  async fetchData() {
    try {
      this.log.debug('Fetching initial data from Home Assistant...');

      this.hassConfig = (await this.fetch('get_config')) as HassConfig;
      this.log.debug('Received config.');
      this.emit('config', this.hassConfig);

      this.hassServices = (await this.fetch('get_services')) as HassServices;
      this.log.debug('Received services.');
      this.emit('services', this.hassServices);

      const devices = (await this.fetch('config/device_registry/list')) as HassDevice[];
      devices.forEach((device: HassDevice) => this.hassDevices.set(device.id, device));
      this.log.debug(`Received ${devices.length} devices.`);
      this.emit('devices', devices);

      const entities = (await this.fetch('config/entity_registry/list')) as HassEntity[];
      entities.forEach((entity: HassEntity) => this.hassEntities.set(entity.entity_id, entity));
      this.log.debug(`Received ${entities.length} entities.`);
      this.emit('entities', entities);

      const states = (await this.fetch('get_states')) as HassState[];
      states.forEach((state: HassState) => this.hassStates.set(state.entity_id, state));
      this.log.debug(`Received ${states.length} states.`);
      this.emit('states', states);

      const areas = (await this.fetch('config/area_registry/list')) as HassArea[];
      areas.forEach((area: HassArea) => this.hassAreas.set(area.area_id, area));
      this.log.debug(`Received ${areas.length} areas.`);
      this.emit('areas', areas);

      this.log.debug('Initial data fetched successfully.');
    } catch (error) {
      this.log.error(`Error fetching initial data: ${error}`);
    }
  }

  /**
   * It subscribes to events to receive updates on state changes and other events.
   */
  async subscribe() {
    try {
      this.log.debug('Subscribing to events...');
      await this.fetch('subscribe_events');
      this.log.debug('Subscribed to events.');
      this.emit('subscribed');
    } catch (error) {
      this.log.error(`Error subscribing to events: ${error}`);
    }
  }

  /**
   * Sends a request to Home Assistant and waits for a response.
   *
   * @param {string} api - The type of request to send.
   * @returns {Promise<any>} - A Promise that resolves with the response from Home Assistant or rejects with an error.
   * @throws {Error} - Throws an error if not connected to Home Assistant or if the WebSocket is not open.
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
  fetch(api: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('Fetch error: not connected to Home Assistant'));
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Fetch error: WebSocket not open'));
      }

      const requestId = this.requestId++;

      const timer = setTimeout(() => {
        this.ws?.removeEventListener('message', handleMessage);
        return reject(new Error(`Fetch api ${api} id ${requestId} did not complete before the timeout`));
      }, this._responseTimeout).unref();

      const handleMessage = (event: WebSocket.MessageEvent) => {
        try {
          const response = JSON.parse(event.data.toString()) as HassWebSocketResponse;
          if (response.type === 'result' && response.id === requestId) {
            clearTimeout(timer);
            this.ws?.removeEventListener('message', handleMessage);
            if (response.success) {
              return resolve(response.result);
            } else {
              return reject(new Error(response.error?.message));
            }
          }
        } catch (error) {
          clearTimeout(timer);
          this.ws?.removeEventListener('message', handleMessage);
          reject(error);
        }
      };

      this.ws.addEventListener('message', handleMessage);

      this.log.debug(`Fetching async ${CYAN}${api}${db} with id ${CYAN}${requestId}${db} and timeout ${CYAN}${this._responseTimeout}${db} ms ...`);
      this.ws.send(JSON.stringify({ id: requestId, type: api }));
    });
  }

  /**
   * Sends async command to a specified Home Assistant service for a specific entity and waits for a response.
   *
   * @param {string} domain - The domain of the Home Assistant service.
   * @param {string} service - The service to call on the Home Assistant domain.
   * @param {string} entityId - The ID of the entity to target with the command.
   * @param {Record<string, any>} [serviceData={}] - Optional additional data to send with the command.
   * @returns {Promise<any>} - A Promise that resolves with the response from Home Assistant or rejects with an error.
   * @throws {Error} - Throws an error if not connected to Home Assistant or if the WebSocket is not open.
   *
   * @example <caption>Example usage of the callService method.</caption>
   * await this.callService('switch', 'toggle', 'switch.living_room');
   * await this.callService('light', 'turn_on', 'light.living_room', { brightness: 255 });
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callService(domain: string, service: string, entityId: string, serviceData: Record<string, HomeAssistantPrimitive> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('CallService error: not connected to Home Assistant'));
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('CallService error: WebSocket not open'));
      }

      const requestId = this.requestId++;

      const timer = setTimeout(() => {
        this.ws?.removeEventListener('message', handleMessage);
        return reject(new Error(`CallService service ${domain}.${service} entity ${entityId} id ${requestId} did not complete before the timeout`));
      }, this._responseTimeout).unref();

      const handleMessage = (event: WebSocket.MessageEvent) => {
        try {
          const response = JSON.parse(event.data.toString()) as HassWebSocketResponse;
          if (response.type === 'result' && response.id === requestId) {
            clearTimeout(timer);
            this.ws?.removeEventListener('message', handleMessage);
            if (response.success) {
              return resolve(response.result);
            } else {
              return reject(new Error(response.error?.message));
            }
          }
        } catch (error) {
          clearTimeout(timer);
          this.ws?.removeEventListener('message', handleMessage);
          reject(error);
        }
      };

      this.ws.addEventListener('message', handleMessage);

      this.log.debug(
        `Calling service async ${CYAN}${domain}.${service}${db} for entity ${CYAN}${entityId}${db} with ${debugStringify(serviceData)}${db} id ${CYAN}${requestId}${db} and timeout ${CYAN}${this._responseTimeout}${db} ms ...`,
      );
      this.ws.send(
        JSON.stringify({
          id: requestId, // Unique message ID
          type: 'call_service',
          domain, // Domain of the entity (e.g., light, switch, media_player, etc.)
          service, // The specific service to call (e.g., turn_on, turn_off)
          service_data: {
            entity_id: entityId, // The entity_id of the device (e.g., light.living_room)
            ...serviceData, // Additional data to send with the command
          },
        }),
      );
    });
  }
}
