/**
 * @description This file contains the class HomeAssistant.
 * @file src\homeAssistant.ts
 * @author Luca Liguori
 * @created 2024-09-14
 * @version 1.1.1
 * @license Apache-2.0
 * @copyright 2024, 2025, 2026 Luca Liguori.
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
 * limitations under the License.
 */

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';

import { AnsiLogger, LogLevel, TimestampFormat, CYAN, db, debugStringify, er } from 'matterbridge/logger';
import WebSocket, { ErrorEvent } from 'ws';

/**
 * Interface representing a Home Assistant device.
 */
// prettier-ignore
export interface HassDevice {
  id: string;                                             // Unique ID of the device (e.g., "14231f5b82717f1d9e2f71d354120331")
  area_id: string | null;                                 // Area ID this device belongs to
  configuration_url: string | null;                       // URL for device configuration
  config_entries: string[];                               // List of config entry IDs
  config_entries_subentries: Record<string, unknown[]>;   // Map of config entry IDs to subentries
  connections: [string, string][];                        // Array of connection types and identifiers
  created_at: number;                                     // Timestamp of when the device was created
  disabled_by: string | null;                             // Whether the device is disabled and by whom (e.g., "user" or "integration")
  entry_type: string | null;                              // Type of entry (e.g., "service" or null)
  hw_version: string | null;                              // Hardware version
  identifiers: [string, string][];                        // Identifiers for the device
  labels: string[];                                       // Labels associated with the device
  manufacturer: string | null;                            // Manufacturer of the device (e.g., "Shelly")
  model: string | null;                                   // Model of the device (e.g., "Shelly 1")
  model_id: string | null;                                // Model ID of the device (e.g., "SNSW-001P16EU")
  modified_at: number;                                    // Timestamp of last modification
  name: string | null;                                    // Device name
  name_by_user: string | null;                            // Name set by the user
  primary_config_entry: string;                           // Primary config entry ID
  serial_number: string | null;                           // Serial number of the device
  sw_version: string | null;                              // Software version
  via_device_id: string | null;                           // Device ID of the parent device (if applicable)
}

/**
 * Interface representing a Home Assistant entity.
 */
// prettier-ignore
export interface HassEntity {
  id: string;                                                 // Unique ID of the entity (e.g., "368c6fd2f264aba2242e0658612c250e")
  entity_id: string;                                          // Unique ID of the entity (e.g., "light.living_room")
  area_id: string | null;                                     // The area ID this entity belongs to
  categories: object;                                         // Categories of the entity
  config_entry_id: string | null;                             // The config entry this entity belongs to
  config_subentry_id: string | null;                          // The config subentry this entity belongs to
  created_at: number;                                         // Timestamp of when the entity was created or 0
  device_id: string | null;                                   // The ID of the device this entity is associated with (e.g., "14231f5b82717f1d9e2f71d354120331" or null)
  disabled_by: string | null;                                 // Whether the entity is disabled and by whom
  entity_category: string | null;                             // The category of the entity
  has_entity_name: boolean;                                   // Whether the entity has a name (name and original_name can be null even if true)
  hidden_by: string | null;                                   // Whether the entity is hidden and by whom
  icon: string | null;                                        // Optional icon associated with the entity
  labels: string[];                                           // Labels associated with the entity
  modified_at: number;                                        // Timestamp of last modification or 0
  name: string | null;                                        // Friendly name of the entity
  options: Record<string, HomeAssistantPrimitive> | null;     // Additional options for the entity
  original_name: string | null;                               // The original name of the entity (set by the integration)
  platform: string;                                           // Platform or integration the entity belongs to (e.g., "shelly")
  translation_key: string | null;                             // Translation key for the entity (used for localization)
  unique_id: string;                                          // Unique ID of the entity
}

/**
 * Interface representing a Home Assistant label.
 */
export interface HassLabel {
  label_id: string;
  color: string | null;
  created_at: number;
  description: string | null;
  icon: string | null;
  modified_at: number;
  name: string;
}

/**
 * Interface representing a Home Assistant area.
 */
export interface HassArea {
  aliases: string[];
  area_id: string;
  created_at: number;
  floor_id: string | null;
  humidity_entity_id: string | null;
  icon: string | null;
  labels: string[];
  modified_at: number;
  name: string;
  picture: string | null;
  temperature_entity_id: string | null;
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
  last_changed: string;
  last_reported: string;
  last_updated: string;
  attributes: HassStateAttributes & HassStateLightAttributes & HassStateClimateAttributes & HassStateFanAttributes;
  context: HassContext;
}

/**
 * Interface representing the generic attributes of a Home Assistant entity's state.
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
 * Interface representing the attributes of a Home Assistant light entity's state.
 */
export interface HassStateLightAttributes {
  effect_list?: string[]; // List of effects available for the light
  effect?: string | null; // Current effect of the light
  supported_color_modes?: string[]; // List of supported color modes (e.g., "onoff", "brightness", "color_temp", "xy", "hs", "rgb", "rgbw", "rgbww")
  color_mode?: string | null; // Current color mode of the light (e.g., "onoff", "brightness", "color_temp", "xy", "hs", "rgb", "rgbw", "rgbww")
  brightness?: number | null;
  color_temp?: number | null;
  min_mireds?: number | null;
  max_mireds?: number | null;
  color_temp_kelvin?: number | null;
  min_color_temp_kelvin?: number | null;
  max_color_temp_kelvin?: number | null;
  xy_color?: [number, number] | null; // XY color values
  hs_color?: [number, number] | null; // Hue and saturation color values
  rgb_color?: [number, number, number] | null; // RGB color values
  rgbw_color?: [number, number, number, number] | null; // RGBW color values
  rgbww_color?: [number, number, number, number, number] | null; // RGBWW color values
}

/**
 * Interface representing the attributes of a Home Assistant fan entity's state.
 */
export interface HassStateFanAttributes {
  preset_modes?: ('auto' | 'low' | 'medium' | 'high')[]; // List of supported fan modes
  preset_mode?: 'auto' | 'low' | 'medium' | 'high' | null; // Current preset mode of the fan (e.g., "auto") but also the state of the fan entity
  percentage?: number; // Current speed setting
  percentage_step?: number; // Current step speed setting of the fan entity
}

/**
 * Interface representing the attributes of a Home Assistant climate entity's state.
 */
export interface HassStateClimateAttributes {
  hvac_modes?: ('off' | 'heat' | 'cool' | 'heat_cool' | 'auto' | 'dry' | 'fan_only')[]; // List of supported HVAC modes
  hvac_mode?: 'off' | 'heat' | 'cool' | 'heat_cool' | 'auto' | 'dry' | 'fan_only' | null; // Current HVAC mode but also the state of the climate entity
  preset_modes?: ('none' | 'eco' | 'away' | 'boost' | 'comfort' | 'home' | 'sleep' | 'activity')[]; // List of supported preset modes
  preset_mode?: 'none' | 'eco' | 'away' | 'boost' | 'comfort' | 'home' | 'sleep' | 'activity' | null; // Current preset mode
  fan_modes?: ('on' | 'off' | 'auto' | 'low' | 'medium' | 'high' | 'top' | 'middle' | 'focus' | 'diffuse')[]; // List of supported fan modes
  fan_mode?: 'on' | 'off' | 'auto' | 'low' | 'medium' | 'high' | 'top' | 'middle' | 'focus' | 'diffuse' | null; // Fan mode
  current_temperature?: number | null; // Current temperature of the climate entity
  temperature?: number | null; // Target temperature setting for the climate entity (not in heat_cool thermostats)
  target_temp_high?: number | null; // Target high temperature setting (for heat_cool thermostats)
  target_temp_low?: number | null; // Target low temperature setting (for heat_cool thermostats)
  min_temp?: number | null; // Minimum temperature setting
  max_temp?: number | null; // Maximum temperature setting
}

/**
 * Interface representing a Home Assistant event.
 */
export interface HassEvent {
  data: {
    entity_id: string;
    new_state: HassState | null;
    old_state: HassState | null;
  };
  event_type: string;
  time_fired: string;
  origin: string; // Origin of the event (e.g., "LOCAL")
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
  /** '°C' or '°F' */
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

export interface HassService {
  [key: string]: object;
}

export interface HassServices {
  [key: string]: HassService;
}

export type HassWebSocketResponse =
  | HassWebSocketResponseAuthRequired
  | HassWebSocketResponseAuthOk
  | HassWebSocketResponseAuthInvalid
  | HassWebSocketResponsePong
  | HassWebSocketResponseEvent
  | HassWebSocketResponseResult;

export interface HassWebSocketResponseAuthRequired {
  type: 'auth_required';
  ha_version: string; // i.e. "2021.12.0"
}

export interface HassWebSocketResponseAuthOk {
  type: 'auth_ok';
  ha_version: string; // i.e. "2021.12.0"
}

export interface HassWebSocketResponseAuthInvalid {
  type: 'auth_invalid';
  message: string; // i.e. "Invalid access token"
}

export interface HassWebSocketResponsePong {
  type: 'pong';
  id: number; // The id of the ping request that this pong is responding to
}

export interface HassWebSocketResponseEvent {
  id: number; // The id of the subscribe request that this event is responding to
  type: 'event';
  event: HassEvent;
}

export interface HassWebSocketResponseResult {
  id: number; // The id of the subscribe_events request that this response is responding to
  type: 'result';
  success: boolean;
  result: null; // The result is null for subscribe_events responses
  error?: { code: string; message: string }; // Error object for the response with success false
}

export interface HassWebSocketResponseSuccess {
  id: number; // The id of the fetch request that this response is responding to
  type: 'result';
  success: true;
  result: unknown;
}

export interface HassWebSocketResponseError {
  id: number; // The id of the fetch request that this response is responding to
  type: 'result';
  success: false;
  error: { code: string; message: string }; // Error object for the response with success false
}

export interface HassWebSocketResponseFetch {
  id: number; // The id of the fetch request that this response is responding to
  type: 'result';
  success: boolean;
  result: HassConfig | HassServices | HassDevice[] | HassEntity[] | HassState[] | HassArea[] | HassLabel[] | null; // The result of the fetch command, can be null if the fetch fails or does not return a result
  error?: { code: string; message: string }; // Error object for the response with success false
}

export interface HassWebSocketResponseCallService {
  id: number; // The id of the call_service request that this response is responding to
  type: 'result';
  success: boolean;
  result: { context: HassContext; response: unknown };
  error?: { code: string; message: string }; // Error object for the response with success false
}

export interface HassWebSocketRequestAuth {
  type: 'auth';
  access_token: string;
}

export interface HassWebSocketRequestPing {
  type: 'ping';
  id: number;
}

export interface HassWebSocketRequestFetch {
  id: number;
  type: string; // The data to fetch: get_config, get_services, get_states...
}

export interface HassWebSocketRequestCallService {
  id: number;
  type: 'call_service';
  domain: string;
  service: string;
  service_data?: { entity_id: string } & Record<string, HomeAssistantPrimitive>; // Optional service data to send with the service call
  target?: {
    entity_id: string;
  };
  return_response?: boolean; // Optional flag to return a response from the service call, defaults to false. Must be included for service actions that return response data. Fails for service actions that return response data.
}

export interface HassWebSocketRequestSubscribeEvents {
  id: number;
  type: 'subscribe_events';
  event_type?: string; // Optional event type to subscribe to specific events (i.e. state_changed), if not provided all events are subscribed
}

export interface HassWebSocketRequestUnsubscribeEvents {
  id: number;
  type: 'unsubscribe_events';
  subscription: number; // ID of the subscription to unsubscribe from
}

export type HomeAssistantPrimitive = string | number | bigint | boolean | object | null | undefined;

interface HomeAssistantEventEmitter {
  connected: [ha_version: string];
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
  labels: [labels: HassLabel[]];
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
  hassLabels = new Map<string, HassLabel>();
  hassServices: HassServices | null = null;
  hassConfig: HassConfig | null = null;
  static hassConfig: HassConfig | null = null;
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

  private fetchTimeout: NodeJS.Timeout | null = null;
  private fetchQueue = new Set<string>();

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
   * @param {number} [reconnectTimeoutTime] - The timeout duration for reconnect attempts in seconds. Defaults to 60 seconds.
   * @param {number} [reconnectRetries] - The number of reconnection attempts to make before giving up. Defaults to 10 attempts.
   * @param {string | undefined} [certificatePath] - The path to the CA certificate for secure WebSocket connections. Defaults to undefined.
   * @param {boolean | undefined} [rejectUnauthorized] - Whether to reject unauthorized certificates. Defaults to undefined.
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
    this.log = new AnsiLogger({
      logName: 'HomeAssistant',
      logTimestampFormat: TimestampFormat.TIME_MILLIS,
      logLevel: LogLevel.DEBUG,
    });
  }

  private onOpen = () => {
    this.log.debug('WebSocket connection established');
    this.emit('socket_opened');
  };

  private onPing(data: Buffer) {
    this.log.debug('WebSocket ping received');
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
      this.log.debug('Stopped ping timeout');
    }
    this.emit('ping', data);
  }

  private onPong(data: Buffer) {
    this.log.debug('WebSocket pong received');
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
      this.log.debug('Stopped ping timeout');
    }
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
    // console.log(`Received WebSocket message:`, response);
    if (response.type === 'pong') {
      this.log.debug(`Home Assistant pong received with id ${response.id}`);
      if (this.pingTimeout) {
        clearTimeout(this.pingTimeout);
        this.pingTimeout = null;
        this.log.debug('Stopped ping timeout');
      }
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
      } else if (response.event.event_type === 'core_config_updated') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        if (this.fetchTimeout) clearTimeout(this.fetchTimeout);
        this.fetchTimeout = setTimeout(this.onFetchTimeout.bind(this), 5000).unref();
        this.fetchQueue.add('get_config');
      } else if (response.event.event_type === 'device_registry_updated') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        if (this.fetchTimeout) clearTimeout(this.fetchTimeout);
        this.fetchTimeout = setTimeout(this.onFetchTimeout.bind(this), 5000).unref();
        this.fetchQueue.add('config/device_registry/list');
      } else if (response.event.event_type === 'entity_registry_updated') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        if (this.fetchTimeout) clearTimeout(this.fetchTimeout);
        this.fetchTimeout = setTimeout(this.onFetchTimeout.bind(this), 5000).unref();
        this.fetchQueue.add('config/entity_registry/list');
      } else if (response.event.event_type === 'area_registry_updated') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        if (this.fetchTimeout) clearTimeout(this.fetchTimeout);
        this.fetchTimeout = setTimeout(this.onFetchTimeout.bind(this), 5000).unref();
        this.fetchQueue.add('config/area_registry/list');
      } else if (response.event.event_type === 'label_registry_updated') {
        this.log.debug(`Event ${CYAN}${response.event.event_type}${db} received id ${CYAN}${response.id}${db}`);
        if (this.fetchTimeout) clearTimeout(this.fetchTimeout);
        this.fetchTimeout = setTimeout(this.onFetchTimeout.bind(this), 5000).unref();
        this.fetchQueue.add('config/label_registry/list');
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
    this.emit('disconnected', `Code: ${code} Reason: ${reason.toString()}`);
    this.startReconnect();
  }

  private async onFetchTimeout() {
    this.fetchTimeout = null;
    this.log.debug(`Fetch timeout reached, processing fetch queue of ${this.fetchQueue.size} fetch id(s)...`);
    for (const fetchId of this.fetchQueue) {
      this.log.debug(`Fetching ${CYAN}${fetchId}${db}...`);
      try {
        const data = await this.fetch(fetchId);
        this.log.debug(`Received data for ${CYAN}${fetchId}${db}`);
        if (fetchId === 'get_config') {
          const config = data as HassConfig;
          this.log.debug(`Received config.`);
          this.hassConfig = config;
          HomeAssistant.hassConfig = this.hassConfig;
          this.emit('config', config);
        } else if (fetchId === 'config/device_registry/list') {
          const devices = data as HassDevice[];
          this.log.debug(`Received ${devices.length} devices.`);
          devices.forEach((device) => this.hassDevices.set(device.id, device));
          this.emit('devices', devices);
        } else if (fetchId === 'config/entity_registry/list') {
          const entities = data as HassEntity[];
          this.log.debug(`Received ${entities.length} entities.`);
          entities.forEach((entity) => this.hassEntities.set(entity.entity_id, entity));
          this.emit('entities', entities);
        } else if (fetchId === 'config/area_registry/list') {
          const areas = data as HassArea[];
          this.log.debug(`Received ${areas.length} areas.`);
          areas.forEach((area) => this.hassAreas.set(area.area_id, area));
          this.emit('areas', areas);
        } else if (fetchId === 'config/label_registry/list') {
          const labels = data as HassLabel[];
          this.log.debug(`Received ${labels.length} labels.`);
          labels.forEach((label) => this.hassLabels.set(label.label_id, label));
          this.emit('labels', labels);
        }
      } catch (error) {
        this.log.error(`Error fetching ${CYAN}${fetchId}${er}: ${error}`);
      }
      this.fetchQueue.delete(fetchId);
    }
  }

  /**
   * Connects to Home Assistant WebSocket API. It establishes a WebSocket connection and authenticates.
   *
   * @returns {Promise<string>} - A Promise that resolves to the HA version when the connection is established and authenticated, or rejects with an error if the connection fails.
   */
  connect(): Promise<string> {
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
        this.ws.on('close', this.onClose.bind(this));

        this.ws.onerror = (event: ErrorEvent) => {
          this.log.error(`WebSocket error: ${event.message}`);
          this.emit('error', `WebSocket error: ${event.message}`);
          return reject(new Error(`WebSocket error: ${event.message}`));
        };

        this.ws.onmessage = async (event: WebSocket.MessageEvent) => {
          let response;
          try {
            response = JSON.parse(event.data.toString()) as HassWebSocketResponse;
          } catch (error) {
            return reject(new Error(`Error parsing WebSocket message: ${error}`));
          }
          // console.log(`Received WebSocket message:`, response);
          if (response.type === 'auth_required') {
            this.log.debug(`Authentication required: ${debugStringify(response)}`);
            this.log.debug('Authentication required. Sending auth message...');
            this.ws?.send(
              JSON.stringify({
                type: 'auth',
                access_token: this.wsAccessToken,
              } as HassWebSocketRequestAuth),
            );
          } else if (response.type === 'auth_ok') {
            // Handle successful authentication
            this.log.debug(`Authenticated successfully: ${debugStringify(response)}`);
            this.log.debug(`Authenticated successfully with Home Assistant v. ${response.ha_version}`);
            this.connected = true;
            this.reconnectRetry = 1; // Reset the reconnect retry count

            // Add the message event listeners
            if (this.ws) this.ws.onmessage = null; // Clear the current onmessage handler to avoid duplicate processing
            this.ws?.on('message', this.onMessage.bind(this)); // Set the new onmessage handler
            if (this.ws) this.ws.onerror = null; // Clear the current onerror handler to avoid duplicate processing
            this.ws?.on('error', this.onError.bind(this));

            // Start ping interval
            this.startPing();
            this.emit('connected', response.ha_version);
            return resolve(response.ha_version);
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
        } as HassWebSocketRequestPing),
      );
      this.log.debug('Starting ping timeout...');
      this.pingTimeout = setTimeout(() => {
        this.log.error('Ping timeout. Closing connection...');
        this.close();
        this.startReconnect();
      }, this.pingTimeoutTime).unref();
      this.log.debug('Started ping timeout');
    }, this.pingIntervalTime).unref();
    this.log.debug('Started ping interval');
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
    this.log.debug('Stopped ping interval');
    this.log.debug('Stopping ping timeout...');
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
    this.log.debug('Stopped ping timeout');
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
   *
   * @param {number} [code] - The WebSocket close code. Default is 1000 (Normal closure).
   * @param {string} [reason] - The reason for closing the connection. Default is 'Normal closure'.
   * @returns {Promise<void>} - A Promise that resolves when the connection is closed or rejects with an error if the connection could not be closed.
   */
  close(code: number = 1000, reason: string = 'Normal closure'): Promise<void> {
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
        const message = `Close did not complete before the timeout of ${this._responseTimeout} ms`;
        this.log.debug(message);
        cleanup();
        return reject(new Error(message));
      }, this._responseTimeout).unref();

      const onClose = () => {
        this.log.debug('Close received closed event from Home Assistant');
        this.emit('socket_closed', code, Buffer.from(reason));
        cleanup();
        return resolve();
      };

      const onError = () => {
        const message = 'Close received error event while closing connection to Home Assistant';
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
        this.log.debug('Close websocket is open, closing...');
        this.ws.close(code, reason);
      } else {
        this.log.debug('Close websocket is not open, resolving...');
        cleanup();
        return resolve();
      }
    });
  }

  /**
   * Fetches the initial data from Home Assistant.
   * This method retrieves the config, services, devices, entities, states, areas and labels from Home Assistant.
   */
  async fetchData() {
    try {
      this.log.debug('Fetching initial data from Home Assistant...');

      this.hassConfig = (await this.fetch('get_config')) as HassConfig;
      HomeAssistant.hassConfig = this.hassConfig;
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

      const labels = (await this.fetch('config/label_registry/list')) as HassLabel[];
      labels.forEach((label: HassLabel) => this.hassLabels.set(label.label_id, label));
      this.log.debug(`Received ${labels.length} labels.`);
      this.emit('labels', labels);

      this.log.debug('Initial data fetched successfully.');
    } catch (error) {
      this.log.error(`Error fetching initial data: ${error}`);
    }
  }

  /**
   * Sends a request to Home Assistant and waits for a response.
   *
   * @param {string} type - The type of request to send.
   * @returns {Promise<any>} - A Promise that resolves with the response from Home Assistant or rejects with an error.
   * @example
   * fetch('get_states')
   *   .then(response => {
   *     console.log('Received response:', response);
   *   })
   *   .catch(error => {
   *     console.error('Error:', error);
   *   });
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch(type: string): Promise<any> {
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
        return reject(new Error(`Fetch type ${type} id ${requestId} did not complete before the timeout`));
      }, this._responseTimeout).unref();

      const handleMessage = (event: WebSocket.MessageEvent) => {
        try {
          const response = JSON.parse(event.data.toString()) as HassWebSocketResponseFetch;
          if (response.type === 'result' && response.id === requestId) {
            clearTimeout(timer);
            this.ws?.removeEventListener('message', handleMessage);
            if (response.success) {
              return resolve(response.result);
            } else {
              // console.error(`Fetch error:`, response);
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

      this.log.debug(`Fetching ${CYAN}${type}${db} with id ${CYAN}${requestId}${db} and timeout ${CYAN}${this._responseTimeout}${db} ms ...`);
      this.ws.send(JSON.stringify({ id: requestId, type } as HassWebSocketRequestFetch));
    });
  }

  /**
   * Sends a "subscribe_events" request to Home Assistant and waits for a response.
   *
   * @param {string | undefined} event - The event to subscribe to or all events if not specified.
   * @returns {Promise<number>} - A Promise that resolves with the subscribe id from Home Assistant or rejects with an error.
   * @example subscribe('state_changed')
   *   .then(response => {
   *     console.log('Received response subscription id:', response);
   *   })
   *   .catch(error => {
   *     console.error('Error subscribing:', error);
   *   });
   */
  subscribe(event?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('Subscribe error: not connected to Home Assistant'));
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Subscribe error: WebSocket not open'));
      }

      const requestId = this.requestId++;

      const timer = setTimeout(() => {
        this.ws?.removeEventListener('message', handleMessage);
        return reject(new Error(`Subscribe event ${event} id ${requestId} did not complete before the timeout`));
      }, this._responseTimeout).unref();

      const handleMessage = (event: WebSocket.MessageEvent) => {
        try {
          const response = JSON.parse(event.data.toString()) as HassWebSocketResponseResult;
          if (response.type === 'result' && response.id === requestId) {
            clearTimeout(timer);
            this.ws?.removeEventListener('message', handleMessage);
            if (response.success) {
              this.log.debug(`Subscribed successfully with id ${CYAN}${requestId}${db}`);
              return resolve(response.id);
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

      this.log.debug(`Subscribing to ${CYAN}${event ?? 'all events'}${db} with id ${CYAN}${requestId}${db} and timeout ${CYAN}${this._responseTimeout}${db} ms ...`);
      this.ws.send(
        JSON.stringify({
          id: requestId,
          type: 'subscribe_events',
          event_type: event,
        } as HassWebSocketRequestSubscribeEvents),
      );
    });
  }

  /**
   * Sends a "subscribe_events" request to Home Assistant and waits for a response.
   *
   * @param {number} subscriptionId - The subscription id to unsubscribe from.
   * @returns {Promise<void>} - A Promise that resolves or rejects with an error.
   * @example unsubscribe('state_changed')
   *    .then(() => {
   *      console.log('Unsubscribed successfully');
   *    })
   *    .catch(error => {
   *      console.error('Error unsubscribing:', error);
   *    });
   */
  unsubscribe(subscriptionId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        return reject(new Error('Unsubscribe error: not connected to Home Assistant'));
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('Unsubscribe error: WebSocket not open'));
      }

      const requestId = this.requestId++;

      const timer = setTimeout(() => {
        this.ws?.removeEventListener('message', handleMessage);
        return reject(new Error(`Unsubscribe subscription ${subscriptionId} id ${requestId} did not complete before the timeout`));
      }, this._responseTimeout).unref();

      const handleMessage = (event: WebSocket.MessageEvent) => {
        try {
          const response = JSON.parse(event.data.toString()) as HassWebSocketResponseResult;
          if (response.type === 'result' && response.id === requestId) {
            clearTimeout(timer);
            this.ws?.removeEventListener('message', handleMessage);
            if (response.success) {
              this.log.debug(`Unsubscribed successfully with id ${CYAN}${requestId}${db}`);
              return resolve();
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

      this.log.debug(`Unsubscribing from subscription ${CYAN}${subscriptionId}${db} with id ${CYAN}${requestId}${db} and timeout ${CYAN}${this._responseTimeout}${db} ms ...`);
      this.ws.send(
        JSON.stringify({
          id: requestId,
          type: 'unsubscribe_events',
          subscription: subscriptionId,
        } as HassWebSocketRequestUnsubscribeEvents),
      );
    });
  }

  /**
   * Sends async command to a specified Home Assistant service for a specific entity and waits for a response.
   *
   * @param {string} domain - The domain of the Home Assistant service.
   * @param {string} service - The service to call on the Home Assistant domain.
   * @param {string} entityId - The ID of the entity to target with the command.
   * @param {Record<string, any>} [serviceData] - Optional additional data to send with the command.
   *
   * @returns {Promise<any>} - A Promise that resolves with the response from Home Assistant or rejects with an error.
   *
   * @example <caption>Example usage of the callService method.</caption>
   * await this.callService('switch', 'toggle', 'switch.living_room');
   * await this.callService('light', 'turn_on', 'light.living_room', { brightness: 255 });
   */
  callService(domain: string, service: string, entityId: string, serviceData: Record<string, HomeAssistantPrimitive> = {}): Promise<{ context: HassContext; response: unknown }> {
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
          const response = JSON.parse(event.data.toString()) as HassWebSocketResponseCallService;
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
        `Calling service ${CYAN}${domain}.${service}${db} for entity ${CYAN}${entityId}${db} with ${debugStringify(serviceData)}${db} id ${CYAN}${requestId}${db} and timeout ${CYAN}${this._responseTimeout}${db} ms ...`,
      );
      this.ws.send(
        JSON.stringify({
          id: requestId, // Unique message ID
          type: 'call_service',
          domain, // Domain of the entity (e.g., light, switch, media_player, etc.)
          service, // The specific service to call (e.g., turn_on, turn_off)
          service_data: {
            // entity_id: entityId, // The entity_id of the device (e.g., light.living_room)
            ...serviceData, // Additional data to send with the command
          },
          target: {
            entity_id: entityId, // Optional target entity_id to send the command to, if not provided it will use the service_data entity_id
          },
          // return_response: true, // Must be included for service actions that return response data. Fails for service actions that return response data.
        } as HassWebSocketRequestCallService),
      );
    });
  }
}
