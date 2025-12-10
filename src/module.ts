/**
 * @description This file contains the class HomeAssistantPlatform.
 * @file src\module.ts
 * @author Luca Liguori
 * @created 2024-09-13
 * @version 1.7.0
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

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable jsdoc/reject-any-type */

// Node.js imports
import path from 'node:path';
import fs from 'node:fs';

// matterbridge imports
import {
  PlatformConfig,
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  bridgedNode,
  onOffOutlet,
  powerSource,
  PrimitiveTypes,
  electricalSensor,
  PlatformMatterbridge,
} from 'matterbridge';
import { ActionContext } from 'matterbridge/matter';
import { AnsiLogger, LogLevel, dn, idn, ign, nf, rs, wr, db, or, debugStringify, YELLOW, CYAN, hk, er } from 'matterbridge/logger';
import { deepEqual, isValidArray, isValidBoolean, isValidNumber, isValidObject, isValidString, waiter } from 'matterbridge/utils';
import { OnOff, LevelControl, BridgedDeviceBasicInformation, PowerSource, ColorControl } from 'matterbridge/matter/clusters';
import { ClusterId, ClusterRegistry } from 'matterbridge/matter/types';

// Plugin imports
import { HassDevice, HassEntity, HassState, HomeAssistant, HassConfig as HassConfig, HomeAssistantPrimitive, HassServices, HassArea, HassLabel } from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';
import {
  convertMatterXYToHA,
  hassCommandConverter,
  hassDomainBinarySensorsConverter,
  hassDomainEventConverter,
  hassDomainSensorsConverter,
  hassUpdateAttributeConverter,
  hassUpdateStateConverter,
} from './converters.js';
import { addBinarySensorEntity } from './binary_sensor.entity.js';
import { addSensorEntity } from './sensor.entity.js';
import { addControlEntity } from './control.entity.js';
import { addEventEntity } from './event.entity.js';

export interface HomeAssistantPlatformConfig extends PlatformConfig {
  host: string;
  certificatePath: string;
  rejectUnauthorized: boolean;
  token: string;
  reconnectTimeout: number;
  reconnectRetries: number;
  filterByArea: string;
  filterByLabel: string;
  applyFiltersToDeviceEntities: boolean;
  whiteList: string[];
  blackList: string[];
  entityBlackList: string[];
  deviceEntityBlackList: Record<string, string[]>;
  splitEntities: string[];
  namePostfix: string;
  postfix: string;
  airQualityRegex: string;
  enableServerRvc: boolean;
}

/**
 * This is the standard interface for Matterbridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param {PlatformMatterbridge} matterbridge - An instance of MatterBridge. This is the main interface for interacting with the MatterBridge system.
 * @param {AnsiLogger} log - An instance of AnsiLogger. This is used for logging messages in a format that can be displayed with ANSI color codes.
 * @param {HomeAssistantPlatformConfig} config - The HomeAssistantPlatform platform configuration.
 *
 * @returns {HomeAssistantPlatform} - An instance of the HomeAssistantPlatform. This is the main interface for interacting with Home Assistant.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: HomeAssistantPlatformConfig): HomeAssistantPlatform {
  return new HomeAssistantPlatform(matterbridge, log, config);
}

/**
 * HomeAssistantPlatform class extends the MatterbridgeDynamicPlatform class.
 * It initializes the Home Assistant connection, fetches data, subscribes to events,
 * and creates Matterbridge devices based on Home Assistant entities and devices.
 * It also handles updates from Home Assistant and converts them to Matterbridge commands.
 */
export class HomeAssistantPlatform extends MatterbridgeDynamicPlatform {
  /** Home Assistant instance */
  ha: HomeAssistant;

  /** Home Assistant subscription ID */
  haSubscriptionId: number | null = null;

  /** Convert the label filter in the config from name to label_id */
  labelIdFilter: string = '';

  /** Bridged devices map. Key is device.id for devices and entity.entity_id for individual entities (without the postfix). Value is the MatterbridgeEndpoint */
  readonly matterbridgeDevices = new Map<string, MatterbridgeEndpoint>();

  /** Endpoint names remapping for entities. Key is entity.entity_id. Value is the endpoint name ('' for the main endpoint) */
  readonly endpointNames = new Map<string, string>();

  /** Battery voltage entities */
  readonly batteryVoltageEntities = new Set<string>();

  /** Regex to match air quality sensors. It matches all domain sensor (sensor\.) with names ending in _air_quality */
  airQualityRegex: RegExp | undefined;

  readonly individualEntitiesDomains = ['automation', 'scene', 'script', 'input_boolean', 'input_button'];
  readonly supportedCoreDomains = ['switch', 'light', 'lock', 'fan', 'cover', 'climate', 'valve', 'vacuum'];

  /**
   * Constructor for the HomeAssistantPlatform class.
   * It initializes the platform, verifies the Matterbridge version, and sets up the Home Assistant connection.
   *
   * @param {PlatformMatterbridge} matterbridge - The Matterbridge instance.
   * @param {AnsiLogger} log - The logger instance.
   * @param {PlatformConfig} config - The platform configuration.
   */
  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    override config: HomeAssistantPlatformConfig,
  ) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.4.0')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.4.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info(`Initializing platform: ${CYAN}${this.config.name}${nf} version: ${CYAN}${this.config.version}${rs}`);

    if (!isValidString(config.host, 1) || !isValidString(config.token, 1)) {
      setImmediate(async () => {
        await this.onShutdown('Invalid configuration');
      });
      throw new Error('Host and token must be defined in the configuration');
    }

    // Set the default values for the config for old versions of it
    // istanbul ignore next
    {
      this.config.certificatePath = isValidString(config.certificatePath, 1) ? config.certificatePath : '';
      this.config.rejectUnauthorized = isValidBoolean(config.rejectUnauthorized) ? config.rejectUnauthorized : true;
      this.config.reconnectTimeout = isValidNumber(config.reconnectTimeout, 30) ? config.reconnectTimeout : 60;
      this.config.reconnectRetries = isValidNumber(config.reconnectRetries, 0) ? config.reconnectRetries : 10;
      this.config.filterByArea = isValidString(this.config.filterByArea, 1) ? this.config.filterByArea : '';
      this.config.filterByLabel = isValidString(this.config.filterByLabel, 1) ? this.config.filterByLabel : '';
      this.config.applyFiltersToDeviceEntities = isValidBoolean(this.config.applyFiltersToDeviceEntities) ? this.config.applyFiltersToDeviceEntities : false;
      this.config.whiteList = isValidArray(this.config.whiteList, 1) ? this.config.whiteList : [];
      this.config.blackList = isValidArray(this.config.blackList, 1) ? this.config.blackList : [];
      this.config.entityBlackList = isValidArray(this.config.entityBlackList, 1) ? this.config.entityBlackList : [];
      this.config.deviceEntityBlackList = isValidObject(this.config.deviceEntityBlackList, 1) ? this.config.deviceEntityBlackList : {};
      this.config.splitEntities = this.config.splitEntities === undefined ? [] : this.config.splitEntities;
      this.config.namePostfix = isValidString(this.config.namePostfix, 1, 3) ? this.config.namePostfix : '';
      this.config.postfix = isValidString(this.config.postfix, 1, 3) ? this.config.postfix : '';
      this.config.airQualityRegex = isValidString(this.config.airQualityRegex, 1) ? this.config.airQualityRegex : '';
      this.config.enableServerRvc = isValidBoolean(this.config.enableServerRvc) ? this.config.enableServerRvc : true;
    }

    // Initialize air quality regex from config or use default
    this.airQualityRegex = this.createRegexFromConfig(config.airQualityRegex);

    this.ha = new HomeAssistant(config.host, config.token, config.reconnectTimeout, config.reconnectRetries, config.certificatePath, config.rejectUnauthorized);
    this.ha.log.logLevel = this.log.logLevel;

    this.ha.on('connected', async (ha_version: HomeAssistantPrimitive) => {
      this.log.notice(`Connected to Home Assistant ${ha_version}`);

      this.log.info(`Fetching data from Home Assistant...`);
      try {
        await this.ha.fetchData();
        this.log.info(`Fetched data from Home Assistant successfully`);
      } catch (error) {
        this.log.error(`Error fetching data from Home Assistant: ${error}`);
      }

      this.log.info(`Subscribing to Home Assistant events...`);
      try {
        this.haSubscriptionId = await this.ha.subscribe();
        this.log.info(`Subscribed to Home Assistant events successfully with id ${this.haSubscriptionId}`);
      } catch (error) {
        this.log.error(`Error subscribing to Home Assistant events: ${error}`);
      }
      if (this.isConfigured) this.wssSendSnackbarMessage('Reconnected to Home Assistant', 5, 'success');
      if (this.isConfigured) this.wssSendRestartRequired();
    });

    this.ha.on('disconnected', () => {
      this.log.warn('Disconnected from Home Assistant');
      if (this.isConfigured) this.wssSendSnackbarMessage('Disconnected from Home Assistant', 5, 'warning');
    });

    this.ha.on('error', (error: string) => {
      this.log.error(`Error from Home Assistant: ${error}`);
    });

    this.ha.on('subscribed', () => {
      this.log.info(`Subscribed to Home Assistant events`);
    });

    this.ha.on('config', (config: HassConfig) => {
      this.log.info(
        `Configuration received from Home Assistant: state ${CYAN}${config.state}${nf} temperature unit ${CYAN}${config.unit_system.temperature}${nf} pressure unit ${CYAN}${config.unit_system.pressure}${nf}`,
      );
    });

    this.ha.on('services', (_services: HassServices) => {
      this.log.info('Services received from Home Assistant');
    });

    this.ha.on('devices', (_devices: HassDevice[]) => {
      this.log.info('Devices received from Home Assistant');
    });

    this.ha.on('entities', (_entities: HassEntity[]) => {
      this.log.info('Entities received from Home Assistant');
    });

    this.ha.on('areas', (_areas: HassArea[]) => {
      this.log.info('Areas received from Home Assistant');
    });

    this.ha.on('labels', (labels: HassLabel[]) => {
      this.log.info('Labels received from Home Assistant');
      // Convert the label filter from the name in the config to the corresponding label_id
      if (isValidString(this.config.filterByLabel, 1)) {
        // If the label_id is already set, use it
        if (labels.find((label) => label.label_id === this.config.filterByLabel)) {
          this.labelIdFilter = this.config.filterByLabel;
          this.log.info(`Filtering by label_id: ${CYAN}${this.labelIdFilter}${nf}`);
          return;
        }
        // Look for the label_id by name
        this.labelIdFilter = labels.find((label) => label.name === this.config.filterByLabel)?.label_id ?? '';
        if (this.labelIdFilter) {
          this.log.info(`Filtering by label_id: ${CYAN}${this.labelIdFilter}${nf}`);
          return;
        }
        this.log.warn(`Label "${this.config.filterByLabel}" not found in Home Assistant. Filter by label is disabled.`);
      }
    });

    this.ha.on('states', (_states: HassState[]) => {
      this.log.info('States received from Home Assistant');
    });

    this.ha.on('event', this.updateHandler.bind(this));

    this.log.info(`Initialized platform: ${CYAN}${this.config.name}${nf} version: ${CYAN}${this.config.version}${rs}`);
  }

  override async onStart(reason?: string) {
    this.log.info(`Starting platform ${idn}${this.config.name}${rs}${nf}: ${reason ?? ''}`);

    // Create the plugin directory inside the Matterbridge plugin directory
    await fs.promises.mkdir(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-hass'), { recursive: true });

    // Wait for Home Assistant to be connected and fetch devices and entities and subscribe events
    this.log.info(`Connecting to Home Assistant at ${CYAN}${this.config.host}${nf}...`);
    try {
      await this.ha.connect();
      this.log.info(`Connected to Home Assistant at ${CYAN}${this.config.host}${nf}`);
    } catch (error) {
      this.log.error(`Error connecting to Home Assistant at ${CYAN}${this.config.host}${nf}: ${error}`);
    }
    const check = () => {
      this.log.debug(
        `Checking Home Assistant connection: connected ${CYAN}${this.ha.connected}${db} config ${CYAN}${this.ha.hassConfig !== null}${db} services ${CYAN}${this.ha.hassServices !== null}${db} subscription ${CYAN}${this.haSubscriptionId !== null}${db}`,
      );
      return this.ha.connected && this.ha.hassConfig !== null && this.ha.hassServices !== null && this.haSubscriptionId !== null;
    };
    await waiter('Home Assistant connected', check, true, 110000, 1000); // Wait for 110 seconds with 1 second interval and throw error if not connected

    // Save devices, entities, states, config and services to a local file without awaiting
    this.savePayload(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-hass', 'homeassistant.json'));

    // Clean the selectDevice and selectEntity maps
    await this.ready;
    await this.clearSelect();

    // *********************************************************************************************************
    // ************************************* Scan the individual entities **************************************
    // *********************************************************************************************************
    for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === null)) {
      const [domain, name] = entity.entity_id.split('.');
      // Skip not supported domains.
      if (
        !this.individualEntitiesDomains.includes(domain) &&
        !this.supportedCoreDomains.includes(domain) &&
        domain !== 'sensor' &&
        domain !== 'binary_sensor' &&
        domain !== 'event'
      ) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db} has unsupported domain ${CYAN}${domain}${db}. Skipping...`);
        continue;
      }
      // Get the entity state. If the entity is disabled, it doesn't have a state, we skip it.
      const hassState = this.ha.hassStates.get(entity.entity_id);
      if (!hassState) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db} disabled by ${entity.disabled_by}: state not found. Skipping...`);
        continue;
      }
      // If the entity doesn't have a valid name, we skip it.
      const entityName = entity.name ?? entity.original_name;
      if (!isValidString(entityName, 1)) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db} has no valid name. Skipping...`);
        continue;
      }
      // If the entity has an already registered name, we skip it.
      if (this.hasDeviceName(entityName)) {
        this.log.warn(`Individual entity ${CYAN}${entityName}${wr} already exists as a registered device. Please change the name in Home Assistant`);
        continue;
      }
      // Set the selects and validate.
      this.setSelectDevice(entity.id, entityName, undefined, 'hub');
      this.setSelectEntity(entityName, entity.entity_id, 'hub');
      if (!this.validateDevice([entityName, entity.entity_id, entity.id], true)) continue;
      if (!this.isValidAreaLabel(entity.area_id, entity.labels)) {
        this.log.debug(
          `Individual entity ${CYAN}${entityName}${db} is not in the area "${CYAN}${this.config.filterByArea}${db}" or doesn't have the label "${CYAN}${this.config.filterByLabel}${db}". Skipping...`,
        );
        continue;
      }

      // Create a Mutable device with bridgedNode
      this.log.info(`Creating device for individual entity ${idn}${entityName}${rs}${nf} domain ${CYAN}${domain}${nf} name ${CYAN}${name}${nf}`);
      const mutableDevice = new MutableDevice(
        this.matterbridge,
        entityName + (isValidString(this.config.namePostfix, 1, 3) ? ' ' + this.config.namePostfix : ''),
        isValidString(this.config.postfix, 1, 3) ? entity.id.slice(0, 32 - this.config.postfix.length) + this.config.postfix : entity.id.slice(0, 32),
        0xfff1,
        'HomeAssistant',
        0x8000,
        domain,
      );
      mutableDevice.addDeviceTypes('', bridgedNode);

      // Lookup and add individual entities domains.
      if (this.individualEntitiesDomains.includes(domain)) {
        // Set the composed type and configUrl based on the domain
        if (domain === 'automation') {
          mutableDevice.setComposedType(`Hass Automation`);
          mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/automation/dashboard`);
        } else if (domain === 'scene') {
          mutableDevice.setComposedType(`Hass Scene`);
          mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/scene/dashboard`);
        } else if (domain === 'script') {
          mutableDevice.setComposedType(`Hass Script`);
          mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/script/dashboard`);
        } else if (domain === 'input_boolean') {
          mutableDevice.setComposedType(`Hass Boolean`);
          mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`);
        } else if (domain === 'input_button') {
          mutableDevice.setComposedType(`Hass Button`);
          mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`);
        }

        // Add to the main endpoint onOffOutlet device type and the OnOffCluster
        mutableDevice.addDeviceTypes('', onOffOutlet);
        mutableDevice.addCommandHandler('', 'on', async (data, _endpointName, _command) => {
          if (domain === 'automation') {
            await this.ha.callService(domain, 'trigger', entity.entity_id);
          } else if (domain === 'input_button') {
            await this.ha.callService(domain, 'press', entity.entity_id);
          } else {
            await this.ha.callService(domain, 'turn_on', entity.entity_id);
          }
          // We revert the state after 500ms except for input_boolean and switch template that mantain the state
          if (domain !== 'input_boolean' && domain !== 'switch') {
            setTimeout(() => {
              // istanbul ignore next cause is too long
              data.endpoint.setAttribute(OnOff.Cluster.id, 'onOff', false, data.endpoint.log);
            }, 500).unref();
          }
        });
        mutableDevice.addCommandHandler('', 'off', async (_data, _endpointName, _command) => {
          // We don't revert only for input_boolean and switch template
          if (domain === 'input_boolean' /* || domain === 'switch'*/) await this.ha.callService(domain, 'turn_off', entity.entity_id);
        });
      }

      // Set the device mode for the Rvc.
      if (domain === 'vacuum' && this.config.enableServerRvc) mutableDevice.setMode('server');
      // Lookup and add core domains entity.
      if (this.supportedCoreDomains.includes(domain))
        addControlEntity(mutableDevice, entity, hassState, this.commandHandler.bind(this), this.subscribeHandler.bind(this), this.log);
      // Lookup and add sensor domain entity.
      if (domain === 'sensor') addSensorEntity(mutableDevice, entity, hassState, this.airQualityRegex, name.includes('battery'), this.log);
      // Lookup and add binary_sensor domain entity.
      if (domain === 'binary_sensor') addBinarySensorEntity(mutableDevice, entity, hassState, this.log);
      // Lookup and add event domain entity.
      if (domain === 'event') addEventEntity(mutableDevice, entity, hassState, this.log);
      // Add PowerSource with battery feature if the entity is a battery
      if (mutableDevice.get().deviceTypes.includes(powerSource)) {
        mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Ok, 200);
      }

      if (entity.platform === 'template') {
        mutableDevice.setComposedType(`Hass Template`);
        mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`);
      }

      // Register the device if we have found a supported domain
      if (mutableDevice.get().deviceTypes.length > 1 || mutableDevice.size() > 1) {
        try {
          mutableDevice.create(true); // Use remap for individual entities
          mutableDevice.logMutableDevice();
          this.log.debug(`Registering device ${dn}${entityName}${db}...`);
          await this.registerDevice(mutableDevice.getEndpoint());
          this.matterbridgeDevices.set(entity.entity_id, mutableDevice.getEndpoint());
        } catch (error) {
          this.log.error(`Failed to register device ${dn}${entityName}${er}: ${error}`);
        }
        this.endpointNames.set(entity.entity_id, ''); // Set the endpoint name for the individual entity to the main endpoint
      } else {
        this.log.debug(`Removing device ${dn}${entityName}${db}...`);
        this.clearDeviceSelect(entity.id);
        this.clearEntitySelect(entityName);
      }
      mutableDevice.destroy();
    } // End of individual entities loop

    this.log.debug(`Individual entities endpoint map(${this.matterbridgeDevices.size}/${this.endpointNames.size}):`);
    for (const [entity, endpoint] of this.endpointNames) {
      this.log.debug(`- individual entity ${CYAN}${entity}${db} mapped to endpoint ${CYAN}${endpoint === '' ? 'main' : endpoint}${db}`);
    }

    // *********************************************************************************************************
    // ******************************************* Scan the devices ********************************************
    // *********************************************************************************************************
    for (const device of Array.from(this.ha.hassDevices.values())) {
      // Check if we have a valid device
      const deviceName = device.name_by_user ?? device.name;
      if (!isValidString(deviceName, 1)) {
        this.log.debug(`Device ${CYAN}${deviceName}${db} has not valid name. Skipping...`);
        continue;
      }
      // Skip the service devices
      if (device.entry_type === 'service') {
        this.log.debug(`Device ${CYAN}${deviceName}${db} is a service. Skipping...`);
        continue;
      }
      // Skip the devices without entities
      if (Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id).length === 0) {
        this.log.debug(`Device ${CYAN}${deviceName}${db} has no entities. Skipping...`);
        continue;
      }
      // If the device has an already registered name, we skip it.
      if (this.hasDeviceName(deviceName)) {
        this.log.warn(`Device ${CYAN}${deviceName}${wr} already exists as a registered device. Please change the name in Home Assistant`);
        continue;
      }
      // Set the device selects and validate the device.
      this.setSelectDevice(device.id, deviceName, undefined, 'hub');
      if (!this.validateDevice([deviceName, device.id], true)) continue;
      if (!this.isValidAreaLabel(device.area_id, device.labels)) {
        this.log.debug(
          `Device ${CYAN}${deviceName}${db} is not in the area "${CYAN}${this.config.filterByArea}${db}" or doesn't have the label "${CYAN}${this.config.filterByLabel}${db}". Skipping...`,
        );
        continue;
      }
      this.log.info(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}...`);

      // Check if the device has any battery entities
      let battery = false;
      for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id)) {
        const state = this.ha.hassStates.get(entity.entity_id);
        if (state && state.attributes['device_class'] === 'battery') {
          this.log.debug(`Device ${CYAN}${device.name}${db} has a battery entity: ${CYAN}${entity.entity_id}${db}`);
          battery = true;
        }
        if (battery && state && state.attributes['state_class'] === 'measurement' && state.attributes['device_class'] === 'voltage') {
          this.log.debug(`Device ${CYAN}${device.name}${db} has a battery voltage entity: ${CYAN}${entity.entity_id}${db}`);
          this.batteryVoltageEntities.add(entity.entity_id);
        }
      }

      // Create a Mutable device
      const mutableDevice = new MutableDevice(
        this.matterbridge,
        deviceName + (isValidString(this.config.namePostfix, 1, 3) ? ' ' + this.config.namePostfix : ''),
        isValidString(this.config.postfix, 1, 3) ? device.id.slice(0, 32 - this.config.postfix.length) + this.config.postfix : device.id.slice(0, 32),
        0xfff1,
        'HomeAssistant',
        0x8000,
        device.model ?? 'Unknown',
      );
      mutableDevice.addDeviceTypes('', bridgedNode);
      if (battery) {
        mutableDevice.addDeviceTypes('', powerSource);
        mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Ok, 200); // Add PowerSource with battery feature
      }
      mutableDevice.setComposedType('Hass Device');
      mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/devices/device/${device.id}`);

      // Scan entities that belong to this device for supported domains and services and add them to the Matterbridge device
      for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id)) {
        this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db}`);
        const [domain, _name] = entity.entity_id.split('.');
        const entityName = entity.name ?? entity.original_name ?? deviceName;
        let endpointName = entity.entity_id;
        // Skip not supported domains.
        if (!this.supportedCoreDomains.includes(domain) && domain !== 'sensor' && domain !== 'binary_sensor' && domain !== 'event') {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} has unsupported domain ${CYAN}${domain}${db}. Skipping...`);
          continue;
        }
        // Get the entity state. If the entity is disabled, it doesn't have a state, we skip it.
        const hassState = this.ha.hassStates.get(entity.entity_id);
        if (!hassState) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} disabled by ${entity.disabled_by}: state not found. Skipping...`);
          continue;
        }
        // Set the entity selects and validate the entity.
        this.setSelectDeviceEntity(device.id, entity.entity_id, entityName, 'component');
        this.setSelectEntity(entityName, entity.entity_id, 'component');
        if ((this.config.splitEntities as string[]).includes(entity.entity_id)) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} name ${CYAN}${entityName}${db} is a splitEntity. Skipping...`);
          continue; // Skip split entities from the main device
        }
        if (!this.validateEntity(deviceName, entity.entity_id, true)) continue;
        if (this.config.applyFiltersToDeviceEntities && !this.isValidAreaLabel(entity.area_id, entity.labels)) {
          this.log.debug(
            `Device ${CYAN}${deviceName}${db} entity ${CYAN}${entity.entity_id}${db} is not in the area "${CYAN}${this.config.filterByArea}${db}" or doesn't have the label "${CYAN}${this.config.filterByLabel}${db}". Skipping...`,
          );
          continue;
        }
        // Set the entity mode for the Rvc.
        if (domain === 'vacuum' && this.config.enableServerRvc) mutableDevice.setMode('server');
        if (domain === 'vacuum' && this.config.enableServerRvc && !battery) mutableDevice.addDeviceTypes('', powerSource); // Temporary fix for vacuum without battery and enableServerRvc
        // Lookup and add core domains entity.
        const eControl = addControlEntity(mutableDevice, entity, hassState, this.commandHandler.bind(this), this.subscribeHandler.bind(this), this.log);
        if (eControl !== undefined) {
          endpointName = eControl;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Lookup and add sensor domain entity.
        const eSensor = addSensorEntity(mutableDevice, entity, hassState, this.airQualityRegex, battery, this.log);
        if (eSensor !== undefined) {
          endpointName = eSensor;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Lookup and add binary_sensor domain entity.
        const eBinarySensor = addBinarySensorEntity(mutableDevice, entity, hassState, this.log);
        if (eBinarySensor !== undefined) {
          endpointName = eBinarySensor;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Lookup and add event domain entity.
        const eEvent = addEventEntity(mutableDevice, entity, hassState, this.log);
        if (eEvent !== undefined) {
          endpointName = eEvent;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Found a supported entity domain
        if (mutableDevice.has(endpointName))
          this.log.debug(`Creating endpoint ${CYAN}${entity.entity_id}${db} for device ${idn}${device.name}${rs}${db} id ${CYAN}${device.id}${db}...`);
        else {
          this.clearEntitySelect(entityName);
          this.log.debug(`Deleting endpoint ${CYAN}${entity.entity_id}${db} for device ${idn}${device.name}${rs}${db} id ${CYAN}${device.id}${db}...`);
        }
      } // hassEntities

      // Register the device if we have found supported domains and entities
      if (mutableDevice.size() > 1) {
        try {
          this.log.debug(`Registering device ${dn}${device.name}${db}...`);
          mutableDevice.create(true); // Use remap for device entities
          mutableDevice.logMutableDevice();
          await this.registerDevice(mutableDevice.getEndpoint());
          this.matterbridgeDevices.set(device.id, mutableDevice.getEndpoint());
        } catch (error) {
          this.log.error(`Failed to register device ${dn}${device.name}${er}: ${error}`);
        }
        // Log all the remapped endpoints
        for (const remappedEndpoint of mutableDevice.getRemappedEndpoints()) {
          this.log.debug(`**- Device ${CYAN}${device.name}${db} remapped endpoint ${CYAN}${remappedEndpoint}${db}`);
        }
        // Log all the split endpoints
        for (const splitEndpoint of mutableDevice.getSplitEndpoints()) {
          this.log.debug(`**- Device ${CYAN}${device.name}${db} split endpoint ${CYAN}${splitEndpoint}${db}`);
        }
        // Check if some entities are mapped to remapped endpoints and set them to the main endpoint
        for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id)) {
          const endpoint = this.endpointNames.get(entity.entity_id);
          if (endpoint && mutableDevice.getRemappedEndpoints().has(endpoint)) {
            this.log.debug(`**- Device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} remapped to endpoint ${CYAN}${'main'}${db}`);
            this.endpointNames.set(entity.entity_id, '');
          } else if (endpoint && !mutableDevice.getRemappedEndpoints().has(endpoint)) {
            this.log.debug(`**- Device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} mapped to endpoint ${CYAN}${endpoint}${db}`);
          }
        }
      } else {
        this.log.debug(`Device ${CYAN}${device.name}${db} has no supported entities. Deleting device select...`);
        this.clearDeviceSelect(device.id);
      }
      mutableDevice.destroy();
    } // End of devices loop

    // *********************************************************************************************************
    // ************************************ Scan the split entities  *******************************************
    // *********************************************************************************************************
    for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id !== null && (this.config.splitEntities as string[]).includes(e.entity_id))) {
      const [domain, name] = entity.entity_id.split('.');
      // Skip not supported domains.
      if (
        !this.individualEntitiesDomains.includes(domain) &&
        !this.supportedCoreDomains.includes(domain) &&
        domain !== 'sensor' &&
        domain !== 'binary_sensor' &&
        domain !== 'event'
      ) {
        this.log.debug(`Split entity ${CYAN}${entity.entity_id}${db} has unsupported domain ${CYAN}${domain}${db}. Skipping...`);
        continue;
      }
      // Get the entity state. If the entity is disabled, it doesn't have a state, we skip it.
      const hassState = this.ha.hassStates.get(entity.entity_id);
      if (!hassState) {
        this.log.debug(`Split entity ${CYAN}${entity.entity_id}${db} state not found. Skipping...`);
        continue;
      }
      // If the entity doesn't have a valid name, we skip it.
      const entityName = entity.name ?? entity.original_name;
      if (!isValidString(entityName, 1)) {
        this.log.debug(`Split entity ${CYAN}${entity.entity_id}${db} has no valid name. Skipping...`);
        continue;
      }
      // If the entity has an already registered name, we skip it.
      if (this.hasDeviceName(entityName)) {
        this.log.warn(
          `Split entity ${CYAN}${entity.entity_id}${wr} name ${CYAN}${entityName}${wr} already exists as a registered device. Please change the name in Home Assistant.`,
        );
        continue;
      }
      // Set the selects and validate.
      this.setSelectDevice(entity.id, entityName, undefined, 'hub');
      this.setSelectEntity(entityName, entity.entity_id, 'hub');
      if (!this.validateDevice([entityName, entity.entity_id, entity.id], true)) continue;
      if (!this.isValidAreaLabel(entity.area_id, entity.labels)) {
        this.log.debug(
          `Split entity ${CYAN}${entity.entity_id}${db} name ${CYAN}${entityName}${db} is not in the area "${CYAN}${this.config.filterByArea}${db}" or doesn't have the label "${CYAN}${this.config.filterByLabel}${db}". Skipping...`,
        );
        continue;
      }

      // Create a Mutable device with bridgedNode
      this.log.info(`Creating device for split entity ${idn}${entityName}${rs}${nf} domain ${CYAN}${domain}${nf} name ${CYAN}${name}${nf}`);
      const mutableDevice = new MutableDevice(
        this.matterbridge,
        entityName + (isValidString(this.config.namePostfix, 1, 3) ? ' ' + this.config.namePostfix : ''),
        isValidString(this.config.postfix, 1, 3) ? entity.id.slice(0, 32 - this.config.postfix.length) + this.config.postfix : entity.id.slice(0, 32),
        0xfff1,
        'HomeAssistant',
        0x8000,
        domain,
      );
      mutableDevice.addDeviceTypes('', bridgedNode);

      // Set the device mode for the Rvc.
      if (domain === 'vacuum' && this.config.enableServerRvc) mutableDevice.setMode('server');
      // Lookup and add core domains entity.
      if (this.supportedCoreDomains.includes(domain))
        addControlEntity(mutableDevice, entity, hassState, this.commandHandler.bind(this), this.subscribeHandler.bind(this), this.log);
      // Lookup and add sensor domain entity.
      if (domain === 'sensor') addSensorEntity(mutableDevice, entity, hassState, this.airQualityRegex, name.includes('battery'), this.log);
      // Lookup and add binary_sensor domain entity.
      if (domain === 'binary_sensor') addBinarySensorEntity(mutableDevice, entity, hassState, this.log);
      // Lookup and add event domain entity.
      if (domain === 'event') addEventEntity(mutableDevice, entity, hassState, this.log);
      // Add PowerSource with battery feature if the entity is a battery
      if (mutableDevice.get().deviceTypes.includes(powerSource)) {
        mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Ok, 200);
      }

      // Register the device if we have found a supported domain
      if (mutableDevice.get().deviceTypes.length > 1 || mutableDevice.size() > 1) {
        try {
          mutableDevice.create(true); // Use remap for split entities
          mutableDevice.logMutableDevice();
          this.log.debug(`Registering device ${dn}${entityName}${db}...`);
          await this.registerDevice(mutableDevice.getEndpoint());
          this.matterbridgeDevices.set(entity.entity_id, mutableDevice.getEndpoint());
          this.endpointNames.set(entity.entity_id, ''); // Set the endpoint name for the split entity to the main endpoint
        } catch (error) {
          this.log.error(`Failed to register device ${dn}${entityName}${er}: ${error}`);
        }
      } else {
        this.log.debug(`Removing device ${dn}${entityName}${db}...`);
        this.clearDeviceSelect(entity.id);
        this.clearEntitySelect(entityName);
      }
      mutableDevice.destroy();
    } // End of split entities loop

    this.log.debug(`All entities endpoint map(${this.endpointNames.size}):`);
    for (const [entity, endpoint] of this.endpointNames) {
      this.log.debug(
        `- ${this.matterbridgeDevices.has(entity) ? 'individual' : 'device'} entity ${CYAN}${entity}${db} mapped to endpoint ${CYAN}${endpoint === '' ? 'main' : endpoint}${db}`,
      );
    }

    this.log.info(`Started platform ${idn}${this.config.name}${rs}${nf}: ${reason ?? ''}`);
  }

  override async onConfigure() {
    await super.onConfigure();
    this.log.info(`Configuring platform ${idn}${this.config.name}${rs}${nf}...`);
    try {
      for (const state of Array.from(this.ha.hassStates.values())) {
        // Skip states without entity
        const entity = this.ha.hassEntities.get(state.entity_id);
        if (!entity) continue;
        // Skip unregistered entities
        if (this.endpointNames.get(entity.entity_id) === undefined) continue;
        // Skip unsupported domains
        const [domain, _name] = entity.entity_id.split('.');
        if (!this.individualEntitiesDomains.includes(domain) && !this.supportedCoreDomains.includes(domain) && domain !== 'sensor' && domain !== 'binary_sensor') continue;

        this.log.debug(`Configuring state of entity ${CYAN}${state.entity_id}${db}...`);
        await this.updateHandler(entity.device_id, entity.entity_id, state, state);
      }
      this.log.info(`Configured platform ${idn}${this.config.name}${rs}${nf}`);
    } catch (error) {
      this.log.error(`Error configuring platform ${idn}${this.config.name}${rs}${er}: ${error}`);
    }
  }

  override async onChangeLoggerLevel(logLevel: LogLevel) {
    this.log.info(`Logger level changed to ${logLevel}`);
    this.ha.log.logLevel = logLevel;
    for (const device of this.matterbridgeDevices.values()) {
      device.log.logLevel = logLevel;
    }
  }

  override async onShutdown(reason?: string) {
    await super.onShutdown(reason);
    this.log.info(`Shutting down platform ${idn}${this.config.name}${rs}${nf}: ${reason ?? ''}`);

    try {
      await this.ha?.close();
      this.ha?.removeAllListeners();
      this.log.info('Home Assistant connection closed');
    } catch (error) {
      this.log.error(`Error closing Home Assistant connection: ${error}`);
    }

    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();

    this.matterbridgeDevices.clear();
    this.batteryVoltageEntities.clear();
    this.endpointNames.clear();
    this.log.info(`Shut down platform ${idn}${this.config.name}${rs}${nf} completed`);
  }

  /**
   * Handle incoming commands from Matterbridge.
   *
   * @param {object} data The incoming command data.
   * @param {Record<string, any>} data.request The full request object from Matter controller.
   * @param {string} data.cluster The cluster the command is for.
   * @param {Record<string, PrimitiveTypes>} data.attributes The attributes of the cluster the command is for.
   * @param {MatterbridgeEndpoint} data.endpoint The endpoint the command is for.
   * @param {string} endpointName The name of the endpoint the command is for.
   * @param {string} command The command being handled.
   *
   * @returns {Promise<void>} A promise that resolves when the command has been handled.
   *
   * @remarks This function maps Matterbridge commands to Home Assistant services and calls them accordingly.
   * It uses a predefined mapping to convert commands and their attributes to Home Assistant service calls.
   * If the command or domain is not supported, it logs a warning message.
   *
   * @remarks Light domain.
   *
   * In Home Assistant, changing brightness or color (all modes) without affecting the on/off state of a light is not possible.
   * The light.turn_on service will turn the light on if it's off while in Matter we can change brightness or color while the light is off if options.executeIfOff is set to true.
   */
  async commandHandler(
    data: { request: Record<string, any>; cluster: string; attributes: Record<string, PrimitiveTypes>; endpoint: MatterbridgeEndpoint },
    endpointName: string,
    command: string,
  ): Promise<void> {
    const entityId = endpointName;
    if (!entityId) return;
    data.endpoint.log.info(`${db}Received matter command ${ign}${command}${rs}${db} for endpoint ${or}${endpointName}${db}:${or}${data.endpoint?.maybeNumber}${db}`);
    const state = this.ha.hassStates.get(entityId);
    const domain = entityId.split('.')[0];
    const hassCommand = hassCommandConverter.find((cvt) => cvt.command === command && cvt.domain === domain);
    if (hassCommand) {
      if (domain === 'cover') {
        // Special handling for cover goToLiftPercentage command. When goToLiftPercentage is called with 0, we may call the open service and when called with 10000 we may call the close service.
        // This allows to support also covers not supporting the set_cover_position service.
        if (command === 'goToLiftPercentage' && data.request.liftPercent100thsValue === 10000) {
          await this.ha.callService(hassCommand.domain, 'close_cover', entityId);
          return;
        } else if (command === 'goToLiftPercentage' && data.request.liftPercent100thsValue === 0) {
          await this.ha.callService(hassCommand.domain, 'open_cover', entityId);
          return;
        }
      }
      if (domain === 'light') {
        // Special handling for light commands. Hass service light.turn_on will turn on the light if it's off while in Matter we can change brightness or color while the light is off if options.executeIfOff is set to true.
        const state = data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff');
        if (['moveToLevel', 'moveToColorTemperature', 'moveToColor', 'moveToHue', 'moveToSaturation', 'moveToHueAndSaturation'].includes(command) && state === false) {
          data.endpoint.log.debug(
            `***Command ${ign}${command}${rs}${db} for domain ${CYAN}${domain}${db} entity ${CYAN}${entityId}${db} received while the light is off => skipping it`,
          );
          return; // Skip the command if the light is off. Matter will store the values in the clusters and we apply them when the light is turned on
        }
        if (command === 'moveToLevelWithOnOff' && data.request['level'] <= (data.endpoint.getAttribute(LevelControl.Cluster.id, 'minLevel') ?? 1)) {
          data.endpoint.log.debug(
            `***Command ${ign}${command}${rs}${db} for domain ${CYAN}${domain}${db} entity ${CYAN}${entityId}${db} received with level = minLevel => turn off the light`,
          );
          await this.ha.callService('light', 'turn_off', entityId);
          return; // Turn off the light if level <= minLevel
        }
        if (
          command === 'on' ||
          command === 'toggle' ||
          (command === 'moveToLevelWithOnOff' && data.request['level'] > (data.endpoint.getAttribute(LevelControl.Cluster.id, 'minLevel') ?? 1) && state === false)
        ) {
          this.log.debug(
            `***Command ${ign}${command}${rs}${db} for domain ${CYAN}${domain}${db} entity ${CYAN}${entityId}${db} received while the light is off => turn on the light with attributes`,
          );
          const serviceAttributes: Record<string, HomeAssistantPrimitive> = {};
          // We need to add the cluster attributes since we are turning on the light and it was off
          const brightness = data.endpoint.hasAttributeServer(LevelControl.Cluster.id, 'currentLevel')
            ? Math.round((data.endpoint.getAttribute(LevelControl.Cluster.id, 'currentLevel') / 254) * 255)
            : undefined;
          if (isValidNumber(brightness, 1, 255)) serviceAttributes['brightness'] = brightness;
          const color_temp =
            data.endpoint.hasClusterServer(ColorControl.Cluster.id) &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'colorTemperatureMireds') &&
            data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.ColorTemperatureMireds
              ? data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds')
              : undefined;
          if (isValidNumber(color_temp)) serviceAttributes['color_temp'] = color_temp;
          const hs_color =
            data.endpoint.hasClusterServer(ColorControl.Cluster.id) &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentHue') &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentSaturation') &&
            data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.CurrentHueAndCurrentSaturation
              ? [
                  Math.round((data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentHue') / 254) * 360),
                  Math.round((data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentSaturation') / 254) * 100),
                ]
              : undefined;
          if (isValidArray(hs_color, 2)) serviceAttributes['hs_color'] = hs_color;
          const xy_color =
            data.endpoint.hasClusterServer(ColorControl.Cluster.id) &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentX') &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentY') &&
            data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode') === ColorControl.ColorMode.CurrentXAndCurrentY
              ? convertMatterXYToHA(data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentX'), data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentY'))
              : undefined;
          if (isValidArray(xy_color, 2)) serviceAttributes['xy_color'] = xy_color;
          // Transition time
          if (isValidNumber(data.request?.transitionTime, 1)) serviceAttributes['transition'] = Math.round(data.request.transitionTime / 10);
          // Call the light.turn_on service with the attributes
          await this.ha.callService('light', 'turn_on', entityId, serviceAttributes);
          return;
        }
      }
      const serviceAttributes: Record<string, HomeAssistantPrimitive> = hassCommand.converter ? hassCommand.converter(data.request, data.attributes, state) : undefined;
      if (isValidNumber(data.request?.transitionTime, 1)) serviceAttributes['transition'] = Math.round(data.request.transitionTime / 10);
      await this.ha.callService(hassCommand.domain, hassCommand.service, entityId, serviceAttributes);
    } else {
      data.endpoint.log.warn(`Command ${ign}${command}${rs}${wr} not supported for domain ${CYAN}${domain}${wr} entity ${CYAN}${entityId}${wr}`);
    }
  }

  subscribeHandler(
    entity: HassEntity,
    hassSubscribe: {
      domain: string;
      service: string;
      with: string;
      clusterId: ClusterId;
      attribute: string;
      converter?: any;
    },
    newValue: any,
    oldValue: any,
    context: ActionContext,
  ) {
    let endpoint: MatterbridgeEndpoint | undefined;
    if (entity.device_id) {
      // Device entity
      const matterbridgeDevice = this.matterbridgeDevices.get(entity.device_id);
      if (!matterbridgeDevice) {
        this.log.debug(`Subscribe handler: Matterbridge device ${entity.device_id} for ${entity.entity_id} not found`);
        return;
      }
      // If it has not been remapped to the main endpoint
      endpoint = matterbridgeDevice.getChildEndpointByName(entity.entity_id) || matterbridgeDevice.getChildEndpointByName(entity.entity_id.replaceAll('.', ''));
      // If it has been remapped to the main endpoint
      if (!endpoint && this.endpointNames.get(entity.entity_id) === '') endpoint = matterbridgeDevice;
    } else {
      // Individual entity
      endpoint = this.matterbridgeDevices.get(entity.entity_id);
    }
    if (!endpoint) {
      this.log.debug(`Subscribe handler: Endpoint ${entity.entity_id} for device ${entity.device_id} not found`);
      return;
    }
    if (context && context.offline === true) {
      endpoint.log.debug(
        `Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} ` +
          `on endpoint ${or}${endpoint?.maybeId}${db}:${or}${endpoint?.maybeNumber}${db} changed for an offline update`,
      );
      return; // Skip offline updates
    }
    if ((typeof newValue !== 'object' && newValue === oldValue) || (typeof newValue === 'object' && deepEqual(newValue, oldValue))) {
      endpoint.log.debug(
        `Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} ` +
          `on endpoint ${or}${endpoint?.maybeId}${db}:${or}${endpoint?.maybeNumber}${db} not changed`,
      );
      return; // Skip unchanged values
    }
    endpoint.log.info(
      `${db}Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} on endpoint ${or}${endpoint?.maybeId}${db}:${or}${endpoint?.maybeNumber}${db} ` +
        `changed from ${YELLOW}${typeof oldValue === 'object' ? debugStringify(oldValue) : oldValue}${db} to ${YELLOW}${typeof newValue === 'object' ? debugStringify(newValue) : newValue}${db}`,
    );
    const value = hassSubscribe.converter ? hassSubscribe.converter(newValue) : newValue;
    if (hassSubscribe.converter)
      endpoint.log.debug(`Converter: ${typeof newValue === 'object' ? debugStringify(newValue) : newValue} => ${typeof value === 'object' ? debugStringify(value) : value}`);
    const domain = entity.entity_id.split('.')[0];
    if (value !== null) this.ha.callService(domain, hassSubscribe.service, entity.entity_id, { [hassSubscribe.with]: value });
    // The converter returns null for fan turn_on with percentage 0 => call turn_off
    else this.ha.callService(domain, 'turn_off', entity.entity_id);
  }

  async updateHandler(deviceId: string | null, entityId: string, old_state: HassState, new_state: HassState) {
    // const matterbridgeDevice = this.matterbridgeDevices.get(deviceId ?? entityId);
    const matterbridgeDevice = this.matterbridgeDevices.has(entityId) ? this.matterbridgeDevices.get(entityId) : this.matterbridgeDevices.get(deviceId ?? entityId);
    if (!matterbridgeDevice) {
      if (this.endpointNames.get(entityId) !== undefined) this.log.debug(`Update handler: Matterbridge device ${deviceId ?? entityId} for ${entityId} not found`);
      return;
    }
    let endpoint = matterbridgeDevice.getChildEndpointByName(entityId) || matterbridgeDevice.getChildEndpointByName(entityId.replaceAll('.', ''));
    if (!endpoint) {
      const mappedEndpoint = this.endpointNames.get(entityId);
      if (mappedEndpoint === '') {
        this.log.debug(`Update handler: Endpoint ${entityId} for ${deviceId} mapped to endpoint '${mappedEndpoint}'`);
        endpoint = matterbridgeDevice;
      } else if (mappedEndpoint) {
        // istanbul ignore next cause the AirQuality and PowerEnergy are now remapped to main
        this.log.debug(`Update handler: Endpoint ${entityId} for ${deviceId} mapped to endpoint '${mappedEndpoint}'`);
        // istanbul ignore next cause the AirQuality and PowerEnergy are now remapped to main
        endpoint = matterbridgeDevice.getChildEndpointByName(mappedEndpoint);
      }
    }
    if (!endpoint) {
      this.log.debug(`Update handler: Endpoint ${entityId} for ${deviceId} not found`);
      return;
    }
    // Set the device reachable attribute to false if the new state is unavailable
    if ((new_state.state === 'unavailable' && old_state.state !== 'unavailable') || (new_state.state === 'unavailable' && old_state.state === 'unavailable')) {
      matterbridgeDevice.setAttribute(BridgedDeviceBasicInformation.Cluster.id, 'reachable', false, matterbridgeDevice.log);
      return; // Skip the update if the device is unavailable
    }
    // Set the device reachable attribute to true if the new state is available
    if (old_state.state === 'unavailable' && new_state.state !== 'unavailable') {
      matterbridgeDevice.setAttribute(BridgedDeviceBasicInformation.Cluster.id, 'reachable', true, matterbridgeDevice.log);
    }
    matterbridgeDevice.log.info(
      `${db}Received update event from Home Assistant device ${idn}${matterbridgeDevice?.deviceName}${rs}${db} entity ${CYAN}${entityId}${db} ` +
        `from ${YELLOW}${old_state.state}${db} with ${debugStringify(old_state.attributes)}${db} to ${YELLOW}${new_state.state}${db} with ${debugStringify(new_state.attributes)}`,
    );
    const domain = entityId.split('.')[0];
    if (['automation', 'scene', 'script', 'input_button'].includes(domain)) {
      // No update for individual entities (automation, scene, script) only for input_boolean that maintains the state
      return;
    } else if (domain === 'sensor') {
      // Convert to the airquality sensor if the entity is an air quality sensor with regex
      if (this.airQualityRegex && this.airQualityRegex.test(entityId)) {
        new_state.attributes['state_class'] = 'measurement';
        new_state.attributes['device_class'] = 'aqi';
        this.log.debug(`***Converting entity ${CYAN}${entityId}${db} to air quality sensor`);
      }
      // Update sensors of the device
      const hassSensorConverter =
        new_state.attributes['device_class'] === 'voltage' && new_state.attributes['unit_of_measurement'] === 'V'
          ? hassDomainSensorsConverter.find(
              (s) =>
                s.domain === domain &&
                s.withStateClass === new_state.attributes['state_class'] &&
                s.withDeviceClass === new_state.attributes['device_class'] &&
                s.deviceType === (this.batteryVoltageEntities.has(entityId) ? powerSource : electricalSensor),
            )
          : hassDomainSensorsConverter.find(
              (s) => s.domain === domain && s.withStateClass === new_state.attributes['state_class'] && s.withDeviceClass === new_state.attributes['device_class'],
            );
      if (hassSensorConverter) {
        // accepted values: "0" "123" "-1" "23.5" "-0.25"
        const stateValue = /^-?\d+(\.\d+)?$/.test(new_state.state) ? parseFloat(new_state.state) : new_state.state;
        const convertedValue = hassSensorConverter.converter(stateValue, new_state.attributes['unit_of_measurement']);
        endpoint.log.debug(
          `Converting sensor ${new_state.attributes['state_class']}:${new_state.attributes['device_class']} value "${new_state.state}" to ${CYAN}${convertedValue}${db}`,
        );
        if (convertedValue !== null) await endpoint.setAttribute(hassSensorConverter.clusterId, hassSensorConverter.attribute, convertedValue, endpoint.log);
      } else {
        endpoint.log.warn(
          `Update sensor ${CYAN}${domain}${wr}:${CYAN}${new_state.attributes['state_class']}${wr}:${CYAN}${new_state.attributes['device_class']}${wr} not supported for entity ${entityId}`,
        );
      }
    } else if (domain === 'binary_sensor') {
      // Update binary_sensors of the device
      const hassBinarySensorConverter = hassDomainBinarySensorsConverter.find((s) => s.domain === domain && s.withDeviceClass === new_state.attributes['device_class']);
      if (hassBinarySensorConverter) {
        const convertedValue = hassBinarySensorConverter.converter(new_state.state);
        endpoint.log.debug(
          `Converting binary_sensor ${new_state.attributes['device_class']} value "${new_state.state}" to ${CYAN}${typeof convertedValue === 'object' ? debugStringify(convertedValue) : convertedValue}${db}`,
        );
        if (convertedValue !== null) await endpoint.setAttribute(hassBinarySensorConverter.clusterId, hassBinarySensorConverter.attribute, convertedValue, endpoint.log);
      } else {
        endpoint.log.warn(`Update binary_sensor ${CYAN}${domain}${wr}:${CYAN}${new_state.attributes['device_class']}${wr} not supported for entity ${entityId}`);
      }
    } else if (domain === 'event') {
      // Update event of the device
      const hassEventConverter = hassDomainEventConverter.find((c) => c.hassEventType === new_state.attributes['event_type']);
      if (hassEventConverter) {
        await endpoint.triggerSwitchEvent(hassEventConverter.matterbridgeEventType, endpoint.log);
      } else {
        endpoint.log.debug(`Update event ${CYAN}${domain}${db}:${CYAN}${new_state.attributes['event_type']}${db} not supported for entity ${entityId}`);
      }
    } else {
      // Update state of the device
      const hassUpdateState = hassUpdateStateConverter.filter((updateState) => updateState.domain === domain && updateState.state === new_state.state);
      if (hassUpdateState.length > 0) {
        for (const update of hassUpdateState) {
          if (update.clusterId !== undefined) await endpoint.setAttribute(update.clusterId, update.attribute, update.value, matterbridgeDevice.log);
        }
      } else {
        endpoint.log.warn(`Update state ${CYAN}${domain}${wr}:${CYAN}${new_state.state}${wr} not supported for entity ${entityId}`);
      }
      // Some devices wrongly update attributes even if the state is off. Provisionally we will skip the update of attributes in this case.
      if ((domain === 'light' || domain === 'fan') && new_state.state === 'off') {
        endpoint.log.info(`State is off, skipping update of attributes for entity ${CYAN}${entityId}${nf}`);
        return;
      }
      // Update attributes of the device
      const hassUpdateAttributes = hassUpdateAttributeConverter.filter((updateAttribute) => updateAttribute.domain === domain);
      if (hassUpdateAttributes.length > 0) {
        // console.error('Processing update attributes: ', hassUpdateAttributes.length);
        for (const update of hassUpdateAttributes) {
          // console.error('- processing update attribute', update.with, 'value', new_state.attributes[update.with]);
          // @ts-expect-error: dynamic property access for Home Assistant state attribute
          const value = new_state.attributes[update.with];
          if (value !== null) {
            const convertedValue = update.converter(value, new_state);
            // console.error(`-- converting update attribute (entity: ${entityId}) (${hassUpdateAttributes.length}) update.with ${update.with} value ${value} to ${convertedValue} for cluster ${update.clusterId} attribute ${update.attribute}`);
            endpoint.log.debug(`Converting attribute ${update.with} value ${value} to ${CYAN}${convertedValue}${db}`);
            if (convertedValue !== null) await endpoint.setAttribute(update.clusterId, update.attribute, convertedValue, endpoint.log);
          }
        }
      }
    }
  }

  /**
   * Save the Home Assistant payload to a file.
   * The payload contains devices, entities, areas, labels, states, config and services.
   *
   * @param {string} filename The name of the file to save the payload to.
   */
  private async savePayload(filename: string) {
    const payload = {
      devices: Array.from(this.ha.hassDevices.values()),
      entities: Array.from(this.ha.hassEntities.values()),
      areas: Array.from(this.ha.hassAreas.values()),
      labels: Array.from(this.ha.hassLabels.values()),
      states: Array.from(this.ha.hassStates.values()),
      config: this.ha.hassConfig,
      services: this.ha.hassServices,
    };
    try {
      await fs.promises.writeFile(filename, JSON.stringify(payload, null, 2));
      this.log.debug(`Payload successfully written to ${filename}`);
      return;
    } catch (error) {
      this.log.error(`Error writing payload to file ${filename}: ${error}`);
    }
  }
  /**
   * Validate the areaId and labels of a device or an entity against the configured filters.
   *
   * @param {string | null} areaId The area ID of the device / entity. It is null if the device / entity is not in any area.
   * @param {string[]} labels The labels ids of the device / entity. It is an empty array if the device / entity has no labels.
   *
   * @returns {boolean} True if the area and label are valid according to the filters, false otherwise.
   */
  isValidAreaLabel(areaId: string | null, labels: string[]): boolean {
    let areaMatch = true;
    let labelMatch = true;
    // Filter by area if configured
    if (isValidString(this.config.filterByArea, 1)) {
      if (!areaId) return false; // If the areaId is null, the device / entity is not in any area, so we skip it.
      areaMatch = false;
      const area = this.ha.hassAreas.get(areaId);
      if (!area) return false; // If the area is not found, we skip it.
      if (area.name === this.config.filterByArea) areaMatch = true;
    }
    // Filter by label if configured. The labelIdFilter is the label ID to filter by and it is set from the config to the label ID.
    if (isValidString(this.labelIdFilter, 1)) {
      if (labels.length === 0) return false; // If the labels array is empty, the device / entity has no labels, so we skip it.
      labelMatch = false;
      if (labels.includes(this.labelIdFilter)) labelMatch = true;
    }
    return areaMatch && labelMatch;
  }

  /**
   * Create a RegExp from a config string with error handling
   *
   * @param {string | undefined} regexString - The regex pattern string from config
   * @returns {RegExp | undefined} - Valid RegExp object
   */
  private createRegexFromConfig(regexString: string): RegExp | undefined {
    if (!isValidString(regexString, 1)) {
      this.log.debug(`No valid custom regex provided`);
      return undefined; // Return undefined if no regex is provided or if it is an empty string
    }
    try {
      const customRegex = new RegExp(regexString);
      this.log.info(`Using air quality regex: ${CYAN}${regexString}${nf}`);
      return customRegex;
    } catch (error) {
      this.log.warn(`Invalid regex pattern "${regexString}": ${error}`);
      return undefined;
    }
  }
}
