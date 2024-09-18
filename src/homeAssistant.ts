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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';
import { AnsiLogger, LogLevel, TimestampFormat, CYAN, er } from 'matterbridge/logger';
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
  options: Record<string, any> | null; // Additional options for the entity
  original_name: string | null; // The original name of the entity (set by the integration)
  platform: string; // Platform or integration the entity belongs to (e.g., "shelly")
  unique_id: string; // Unique ID of the entity
  unit_of_measurement: string | null; // Optional unit of measurement (e.g., °C, %, etc.)
  capabilities: Record<string, any> | null; // Additional capabilities, like brightness for lights
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
  attributes: Record<string, any>;
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

export interface HomeAssistantServices {
  homeassistant: {
    save_persistent_states: HomeAssistantService;
    turn_off: HomeAssistantService;
    turn_on: HomeAssistantService;
    toggle: HomeAssistantService;
    stop: HomeAssistantService;
    restart: HomeAssistantService;
    check_config: HomeAssistantService;
    update_entity: HomeAssistantService;
    reload_core_config: HomeAssistantService;
    set_location: HomeAssistantService;
    reload_custom_templates: HomeAssistantService;
    reload_config_entry: HomeAssistantService;
    reload_all: HomeAssistantService;
  };
  persistent_notification: {
    create: HomeAssistantService;
    dismiss: HomeAssistantService;
    dismiss_all: HomeAssistantService;
  };
  system_log: {
    clear: HomeAssistantService;
    write: HomeAssistantService;
  };
  logger: {
    set_default_level: HomeAssistantService;
    set_level: HomeAssistantService;
  };
  person: {
    reload: HomeAssistantService;
  };
  frontend: {
    set_theme: HomeAssistantService;
    reload_themes: HomeAssistantService;
  };
  recorder: {
    purge: HomeAssistantService;
    purge_entities: HomeAssistantService;
    enable: HomeAssistantService;
    disable: HomeAssistantService;
  };
  hassio: {
    addon_start: HomeAssistantService;
    addon_stop: HomeAssistantService;
    addon_restart: HomeAssistantService;
    addon_update: HomeAssistantService;
    addon_stdin: HomeAssistantService;
    host_shutdown: HomeAssistantService;
    host_reboot: HomeAssistantService;
    backup_full: HomeAssistantService;
    backup_partial: HomeAssistantService;
    restore_full: HomeAssistantService;
    restore_partial: HomeAssistantService;
  };
  update: {
    install: HomeAssistantService;
    skip: HomeAssistantService;
    clear_skipped: HomeAssistantService;
  };
  cloud: {
    remote_connect: HomeAssistantService;
    remote_disconnect: HomeAssistantService;
  };
  ffmpeg: {
    start: HomeAssistantService;
    stop: HomeAssistantService;
    restart: HomeAssistantService;
  };
  tts: {
    speak: HomeAssistantService;
    clear_cache: HomeAssistantService;
    cloud_say: HomeAssistantService;
  };
  scene: {
    turn_on: HomeAssistantService;
    reload: HomeAssistantService;
    apply: HomeAssistantService;
    create: HomeAssistantService;
    delete: HomeAssistantService;
  };
  zone: {
    reload: HomeAssistantService;
  };
  input_select: {
    reload: HomeAssistantService;
    select_first: HomeAssistantService;
    select_last: HomeAssistantService;
    select_next: HomeAssistantService;
    select_option: HomeAssistantService;
    select_previous: HomeAssistantService;
    set_options: HomeAssistantService;
  };
  input_number: {
    reload: HomeAssistantService;
    set_value: HomeAssistantService;
    increment: HomeAssistantService;
    decrement: HomeAssistantService;
  };
  logbook: {
    log: HomeAssistantService;
  };
  timer: {
    reload: HomeAssistantService;
    start: HomeAssistantService;
    pause: HomeAssistantService;
    cancel: HomeAssistantService;
    finish: HomeAssistantService;
    change: HomeAssistantService;
  };
  input_button: {
    reload: HomeAssistantService;
    press: HomeAssistantService;
  };
  script: {
    reload: HomeAssistantService;
    turn_on: HomeAssistantService;
    turn_off: HomeAssistantService;
    toggle: HomeAssistantService;
  };
  input_boolean: {
    reload: HomeAssistantService;
    turn_on: HomeAssistantService;
    turn_off: HomeAssistantService;
    toggle: HomeAssistantService;
  };
  automation: {
    trigger: HomeAssistantService;
    toggle: HomeAssistantService;
    turn_on: HomeAssistantService;
    turn_off: HomeAssistantService;
    reload: HomeAssistantService;
  };
  conversation: {
    process: HomeAssistantService;
    reload: HomeAssistantService;
  };
  schedule: {
    reload: HomeAssistantService;
  };
  climate: {
    turn_on: HomeAssistantService;
    turn_off: HomeAssistantService;
    toggle: HomeAssistantService;
    set_hvac_mode: HomeAssistantService;
    set_preset_mode: HomeAssistantService;
    set_aux_heat: HomeAssistantService;
    set_temperature: HomeAssistantService;
    set_humidity: HomeAssistantService;
    set_fan_mode: HomeAssistantService;
    set_swing_mode: HomeAssistantService;
  };
  cover: {
    open_cover: HomeAssistantService;
    close_cover: HomeAssistantService;
    set_cover_position: HomeAssistantService;
    stop_cover: HomeAssistantService;
    toggle: HomeAssistantService;
    open_cover_tilt: HomeAssistantService;
    close_cover_tilt: HomeAssistantService;
    stop_cover_tilt: HomeAssistantService;
    set_cover_tilt_position: HomeAssistantService;
    toggle_cover_tilt: HomeAssistantService;
  };
  fan: {
    turn_on: HomeAssistantService;
    turn_off: HomeAssistantService;
    toggle: HomeAssistantService;
    increase_speed: HomeAssistantService;
    decrease_speed: HomeAssistantService;
    oscillate: HomeAssistantService;
    set_direction: HomeAssistantService;
    set_percentage: HomeAssistantService;
    set_preset_mode: HomeAssistantService;
  };
  light: {
    turn_on: HomeAssistantService;
    turn_off: HomeAssistantService;
    toggle: HomeAssistantService;
  };
  lock: {
    unlock: HomeAssistantService;
    lock: HomeAssistantService;
    open: HomeAssistantService;
  };
  number: {
    set_value: HomeAssistantService;
  };
  select: {
    select_first: HomeAssistantService;
    select_last: HomeAssistantService;
    select_next: HomeAssistantService;
    select_option: HomeAssistantService;
    select_previous: HomeAssistantService;
  };
  switch: {
    turn_off: HomeAssistantService;
    turn_on: HomeAssistantService;
    toggle: HomeAssistantService;
  };
  shopping_list: {
    add_item: HomeAssistantService;
    remove_item: HomeAssistantService;
    complete_item: HomeAssistantService;
    incomplete_item: HomeAssistantService;
    complete_all: HomeAssistantService;
    incomplete_all: HomeAssistantService;
    clear_completed_items: HomeAssistantService;
    sort: HomeAssistantService;
  };
  counter: {
    increment: HomeAssistantService;
    decrement: HomeAssistantService;
    reset: HomeAssistantService;
    set_value: HomeAssistantService;
  };
  input_datetime: {
    reload: HomeAssistantService;
    set_datetime: HomeAssistantService;
  };
  input_text: {
    reload: HomeAssistantService;
    set_value: HomeAssistantService;
  };
  notify: {
    send_message: HomeAssistantService;
    persistent_notification: HomeAssistantService;
    mobile_app_lucas_iphone: HomeAssistantService;
    notify: HomeAssistantService;
  };
  device_tracker: {
    see: HomeAssistantService;
  };
  todo: {
    add_item: HomeAssistantService;
    update_item: HomeAssistantService;
    remove_item: HomeAssistantService;
    get_items: HomeAssistantService;
    remove_completed_items: HomeAssistantService;
  };
  button: {
    press: HomeAssistantService;
  };
  text: {
    set_value: HomeAssistantService;
  };
  valve: {
    open_valve: HomeAssistantService;
    close_valve: HomeAssistantService;
    set_valve_position: HomeAssistantService;
    stop_valve: HomeAssistantService;
    toggle: HomeAssistantService;
  };
  weather: {
    get_forecasts: HomeAssistantService;
  };
}

interface HomeAssistantEvent {
  connected: [ha_version: string];
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
  [key: string]: any;
}

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

  constructor(url: string, accessToken: string) {
    super();
    this.wsUrl = url;
    this.wsAccessToken = accessToken;

    this.log = new AnsiLogger({ logName: 'HomeAssistant', logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });
  }

  connect() {
    if (this.connected) {
      this.log.info('Already connected to Home Assistant');
      return;
    }
    this.log.info(`'Connecting to Home Assistant on ${this.wsUrl} ...`);
    this.ws = new WebSocket(this.wsUrl + '/api/websocket');

    this.ws.onopen = () => {
      this.log.debug('WebSocket connection established');

      // Send authentication message
      this.ws?.send(
        JSON.stringify({
          type: 'auth',
          access_token: this.wsAccessToken,
        }),
      );
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
      } else if (data.type === 'result' && !data.success) {
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
        } else {
          this.log.debug(`Result received id ${data.id}:`, data);
        }
      } else if (data.type === 'pong') {
        this.log.debug(`Home Assistant pong received with id ${data.id}`);
        if (this.pingTimeout) clearTimeout(this.pingTimeout);
        this.pingTimeout = null;
      } else if (data.type === 'event') {
        this.log.debug(`Event received id ${data.id}:` /* , data.event*/);
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

  close() {
    this.log.info('Closing Home Assistance connection...');
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = null;
    if (this.pingTimeout) clearTimeout(this.pingTimeout);
    this.pingTimeout = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(0x1000, 'Normal closure');
    }
    this.ws?.removeAllListeners();
    this.ws = null;
    this.connected = false;
    this.emit('disconnected');
  }

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
  fetchAsync(type: string, timeout = 5000): Promise<any> {
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
      const id = this.nextId++;
      this.log.debug(`***Fetching async ${type} with id ${id}...`);

      const message = JSON.stringify({ id, type });
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
        if (response.type === 'result' && response.id === id) {
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
   * @param {string} domain - The domain of the Home Assistant service.
   * @param {string} service - The action to call on the Home Assistant service.
   * @param {string} entityId - The ID of the entity to target with the command.
   * @param {Record<string, any>} [serviceData={}] - Additional data to send with the command.
   *
   * @example <caption>Example usage of the callService method.</caption>
   * await this.callService('switch', 'toggle', 'switch.living_room');
   * await this.callService('light', 'turn_on', 'light.living_room', { brightness: 255 });
   *
   */
  callService(domain: string, service: string, entityId: string, serviceData: Record<string, any> = {}) {
    this.log.debug(`Calling service ${domain}.${service} for entity ${entityId}`);
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

/*
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT signal. Exiting...');
  ha.close();
  // process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal. Exiting...');
  ha.close();
  // process.exit(0);
});

const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIzNzQzODI4MGY5ZTc0ODcxYTg3YTgzOTBjZjg0YjI3ZSIsImlhdCI6MTcyNjI2MjA4OCwiZXhwIjoyMDQxNjIyMDg4fQ.PokvSxUHklUrqNizJwcZsJyh_gL-A7FvAJ12hnsHt-M';

const ha = new HomeAssistant('http://homeassistant.local:8123', TOKEN);

ha.on('connected', () => {
  console.log('Connected to Home Assistant');
  ha.fetchDevices();
  ha.fetchEntities();
  ha.subscribeEvents();
});

ha.on('disconnected', () => {
  console.log('Disconnected from Home Assistant');
});

setTimeout(
  () => {
    if (ha.connected) {
      console.log('Closing...');
      ha.close();
    }
  },
  60 * 60 * 1000,
);
*/
