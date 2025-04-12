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
import { AnsiLogger, LogLevel, TimestampFormat, CYAN, db, debugStringify } from 'matterbridge/logger';

import { Connection, SubscriptionUnsubscribe } from './connection.js';

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
  device_id: string | null; // The ID of the device this entity is associated with
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
export interface HassState {
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

export interface HassUnitSystem {
  length: string;
  accumulated_precipitation: string;
  mass: string;
  pressure: string;
  temperature: string;
  volume: string;
  wind_speed: string;
}

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

interface HomeAssistantEventEmitter {
  connected: [ha_version: HomeAssistantPrimitive];
  disconnected: [];
  subscribed: [];
  config: [config: HassConfig];
  services: [services: HassServices];
  states: [states: HassState[]];
  error: [error: { code: string; message: string } | undefined];
  devices: [devices: HassDevice[]];
  entities: [entities: HassEntity[]];
  event: [deviceId: string | null, entityId: string, old_state: HassState, new_state: HassState];
  call_service: [];
  pong: [];
}

export type HomeAssistantPrimitive = string | number | bigint | boolean | object | null | undefined;

export class HomeAssistant extends EventEmitter {
  hassDevices = new Map<string, HassDevice>();
  hassEntities = new Map<string, HassEntity>();
  hassStates = new Map<string, HassState>();
  hassServices: HassServices | null = null;
  hassConfig: HassConfig | null = null;
  devicesReceived = false;
  entitiesReceived = false;
  statesReceived = false;
  subscribed = false;
  connection: Connection | null = null;
  unsubscribe: SubscriptionUnsubscribe | undefined;
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
   */
  constructor(url: string, accessToken: string) {
    super();
    this.wsUrl = url;
    this.wsAccessToken = accessToken;
    this.log = new AnsiLogger({ logName: 'HomeAssistant', logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });
  }

  get connected() {
    return this.connection?.connected || false;
  }

  onConnected(connection : Connection) {
    this.log.debug(`Authenticated successfully with Home Assistant v. ${connection.haVersion}`);
    this.emit('connected', connection.haVersion);
  }

  onDisconnected() {
    this.emit('disconnected');
  }

  /**
   * Establishes a WebSocket connection to Home Assistant.
   */
  async connect() {
    if (this.connected) {
      this.log.info('Already connected to Home Assistant');
      return;
    }

    try {
      this.log.info(`Connecting to Home Assistant on ${this.wsUrl}...`);

      const connOptions = Object.assign(
      {
        setupRetry: 3,
        url: this.wsUrl,
        accessToken: this.wsAccessToken
      });
  
      this.connection = new Connection(connOptions);

      this.connection.addEventListener("ready", (connection : Connection) => this.onConnected.apply(this, [connection]));
      this.connection.addEventListener("disconnected", () => this.onDisconnected.apply(this));

      await this.connection.connect();

      // Fetch initial data
      this.fetch('get_config').then((response) => {
        this.hassConfig = response as HassConfig;
        this.emit('config', this.hassConfig);
      }, () => this.hassConfig = null)

      this.fetch('get_services').then((response) => {
        this.hassServices = response as HassServices;
        this.emit('services', this.hassServices);  
      }, () => this.hassServices = null)

      this.fetch('config/device_registry/list').then((response) => {
        const devices = response as HassDevice[];
        this.devicesReceived = true;
        this.log.debug(`Received ${devices.length} devices.`);
        this.emit('devices', devices);
        devices.forEach((device) => {
          this.hassDevices.set(device.id, device);
        });
      }, () => this.devicesReceived = false)

      this.fetch('config/entity_registry/list').then((response) => {
        const entities = response as HassEntity[];
        this.entitiesReceived = true;
        this.log.debug(`Received ${entities.length} entities.`);
        this.emit('entities', entities);
        entities.forEach((entity) => {
          this.hassEntities.set(entity.entity_id, entity);
        });
      }, () => this.entitiesReceived = false)

      this.fetch('get_states').then((response) => {
        const states =  response as HassState[]; 
        this.statesReceived = true;
        this.log.debug(`Received ${states.length} states.`);
        this.emit('states', states);
        states.forEach((state) => {
          this.hassStates.set(state.entity_id, state);
        });
      }, () => this.statesReceived = false)

      // Subscribe to events
      this.unsubscribe = await this.connection.subscribeMessage(async (event : HassEvent) => {

        switch (event.event_type) {
          case 'state_changed':
            // this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received`);
            const entity = this.hassEntities.get(event.data.entity_id);

            if (!entity) {
              this.log.debug(`Entity id ${CYAN}${event.data.entity_id}${db} not found processing event`);
              return;
            }
  
            if (event.data.old_state && event.data.new_state) {
              this.hassStates.set(event.data.new_state.entity_id, event.data.new_state);
              this.emit('event', entity.device_id, entity.entity_id, event.data.old_state, event.data.new_state);
            }
  
            break;
          case 'call_service':
            this.log.debug(`Event ${CYAN}${event.event_type}${db} received`);
            this.emit('call_service');

            break;
          case 'device_registry_updated':
            this.log.debug(`Event ${CYAN}${event.event_type}${db} received`);
            const devices = (await this.fetch('config/device_registry/list')) as HassDevice[]; 
            this.log.debug(`Received ${devices.length} devices.`);
            devices.forEach((device) => {
              this.hassDevices.set(device.id, device);
            });
            this.emit('devices', devices);

            break;
          case 'entity_registry_updated':
            this.log.debug(`Event ${CYAN}${event.event_type}${db} received`);
            const entities = (await this.fetch('config/entity_registry/list')) as HassEntity[]; 
            this.log.debug(`Received ${entities.length} entities.`);
            entities.forEach((entity) => {
              this.hassEntities.set(entity.entity_id, entity);
            });
            this.emit('entities', entities);

            break;
        }

      }, { type: "subscribe_events" });

      this.subscribed = true;
      this.emit('subscribed');
      this.log.debug('Subscribed to events');
    } catch (error) {
      this.log.error('WebSocket error connecting to Home Assistant:', error);
    }
  }

  /**
   * Closes the WebSocket connection to Home Assistant and stops the ping interval.
   * Emits a 'disconnected' event.
   */
  async close() {
    this.log.info('Closing Home Assistance connection...');

    if (this.subscribed && this.unsubscribe) {
      await this.unsubscribe();
    }

    if (this.connected && this.connection) {

      this.connection.removeEventListener("ready", this.onConnected);
      this.connection.removeEventListener("disconnected", this.onDisconnected);
      this.connection.close();
      this.connection = null;
    }
  }

  /**
   * Sends a fetch request to Home Assistant.
   * Logs an error if not connected or if the WebSocket is not open.
   *
   * @param {string} type - The type of fetch request to send.
   */
  async fetch(type: string) {

    if (!this.connected) {
      this.log.error('Fetch error: not connected to Home Assistant');
      return;
    }
    
    return await this.connection?.sendMessagePromise({ type });
  }

/**
   * Sends async command to a specified Home Assistant service.
   *
   * @param {string} domain - The domain of the Home Assistant service.
   * @param {string} service - The service to call on the Home Assistant domain.
   * @param {string} entityId - The ID of the entity to target with the command.
   * @param {Record<string, any>} [serviceData={}] - Additional data to send with the command.
   * @returns {Promise<any>} - A Promise that resolves with the response from Home Assistant or rejects with an error.
   *
   * @example <caption>Example usage of the callService method.</caption>
   * await this.callService('switch', 'toggle', 'switch.living_room');
   * await this.callService('light', 'turn_on', 'light.living_room', { brightness: 255 });
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async callService(domain: string, service: string, entityId: string, serviceData: Record<string, HomeAssistantPrimitive> = {}) {
    this.log.debug(
      `Calling service ${CYAN}${domain}.${service}${db} for entity ${CYAN}${entityId}${db} with ${debugStringify(serviceData)}${db} ...`,
    );

    if (!this.connected) {
      this.log.error('CallService error: not connected to Home Assistant');
      return;
    }
  
    return await this.connection?.sendMessagePromise({
        type: 'call_service',
        domain, // Domain of the entity (e.g., light, switch, media_player, etc.)
        service, // The specific service to call (e.g., turn_on, turn_off)
        service_data: {
          entity_id: entityId, // The entity_id of the device (e.g., light.living_room)
          ...serviceData, // Additional data to send with the command
        }
    });  
  }
}
