/**
 * @description This file contains the class HomeAssistantPlatform.
 * @file src\module.ts
 * @author Luca Liguori
 * @created 2024-09-13
 * @version 1.7.1
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

import fs from 'node:fs';
import path from 'node:path';

import { bridgedNode, electricalSensor, MatterbridgeDynamicPlatform, MatterbridgeEndpoint, PlatformConfig, PlatformMatterbridge, powerSource, PrimitiveTypes } from 'matterbridge';
import { AnsiLogger, CYAN, db, debugStringify, dn, er, hk, idn, ign, LogLevel, nf, or, rs, wr, YELLOW } from 'matterbridge/logger';
import { ActionContext } from 'matterbridge/matter';
import { BridgedDeviceBasicInformation, ColorControl, LevelControl, ModeSelect, OnOff, PowerSource } from 'matterbridge/matter/clusters';
import { ClusterId, getClusterNameById } from 'matterbridge/matter/types';
import { deepEqual, inspectError, isValidArray, isValidBoolean, isValidNumber, isValidObject, isValidString, waiter } from 'matterbridge/utils';

import { addBinarySensorEntity } from './binary_sensor.entity.js';
import { addButtonEntity } from './button.entity.js';
import { addControlEntity } from './control.entity.js';
import {
  clamp,
  convertMatterXYToHA,
  hassCommandConverter,
  hassDomainBinarySensorsConverter,
  hassDomainEventConverter,
  hassDomainSensorsConverter,
  hassUpdateAttributeConverter,
  hassUpdateStateConverter,
  miredsToKelvin,
} from './converters.js';
import { addEventEntity } from './event.entity.js';
import { addHelperEntity } from './helper.entity.js';
import { getDomain, getEntityName, isDeviceEntity, isDisabled, isHidden, isIndividualEntity, isSplitEntity, satisfiesAreaFilter, satisfiesLabelFilter } from './helpers.js';
import {
  DeviceId,
  type EntityId,
  type HassArea,
  type HassConfig,
  type HassDevice,
  type HassEntity,
  type HassLabel,
  type HassServices,
  type HassState,
  HomeAssistant,
  type HomeAssistantPrimitive,
} from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';
import { savePayload } from './payload.js';
import { writeReport } from './report.js';
import { addSensorEntity } from './sensor.entity.js';
import { StateCache } from './stateCache.js';

export interface HomeAssistantPlatformConfig extends PlatformConfig {
  host: string;
  certificatePath: string;
  rejectUnauthorized: boolean;
  token: string;
  reconnectTimeout: number;
  reconnectRetries: number;
  /** Filter devices and entities by area name */
  filterByArea: string;
  /** Filter devices and entities by label name */
  filterByLabel: string;
  whiteList: string[];
  blackList: string[];
  entityWhiteList: string[];
  entityBlackList: string[];
  deviceEntityBlackList: Record<string, string[]>;
  splitEntities: string[];
  splitByLabel: string;
  splitNameStrategy: 'Entity name' | 'Friendly name';
  controllerStrategy: 'Merge' | 'Matter';
  namePostfix: string;
  postfix: string;
  airQualityRegex: string;
  enableServerRvc: boolean;
  discardHiddenEntities: boolean;
  virtualControlLabel: string;
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

  /** State cache instance */
  stateCache = new StateCache();

  /** Bridged devices map. Key is device.id for devices and entity.entity_id for individual entities and split entities (without the postfix). Value is the MatterbridgeEndpoint */
  readonly matterbridgeDevices = new Map<DeviceId | EntityId, MatterbridgeEndpoint>();

  /** Entities that are currently being updated to avoid processing multiple updates at the same time. Keyed by entity.entity_id, value is the number of ongoing updates */
  readonly updatingEntities = new Map<EntityId, number>();

  /** Light entities that currently received updates while off. Set by entity.entity_id */
  readonly offUpdatedEntities = new Set<EntityId>();

  /** Endpoint names remapping for entities. Key is entity.entity_id. Value is the endpoint name ('' for the main endpoint) */
  readonly endpointNames = new Map<EntityId, string>();

  /** Battery voltage entities */
  readonly batteryVoltageEntities = new Set<EntityId>();

  /** Regex to match air quality sensors. It matches all domain sensor (sensor\.) with names ending in _air_quality */
  airQualityRegex: RegExp | undefined;

  /** Supported helper domains */
  readonly supportedHelpersDomains = ['automation', 'scene', 'script', 'input_boolean', 'input_button'];
  /** Supported core domains */
  readonly supportedCoreDomains = ['switch', 'light', 'lock', 'fan', 'cover', 'climate', 'valve', 'vacuum', 'remote', 'input_select', 'select', 'media_player']; // 'input_select' is an helper but we support it like core
  /** Supported other domains */
  readonly supportedOtherDomains = ['sensor', 'binary_sensor', 'event', 'button'];
  /** All supported domains */
  readonly supportedDomains = [...this.supportedHelpersDomains, ...this.supportedCoreDomains, ...this.supportedOtherDomains];

  // Brings to the frontend the most important messages.
  readonly filterMessages: { message: string; timeout: number; severity: 'error' | 'success' | 'info' | 'warning' | undefined }[] = [];
  filteredDevices = 0;
  filteredEntities = 0;
  unselectedDevices = 0;
  unselectedEntities = 0;
  duplicatedDevices = 0;
  duplicatedEntities = 0;
  longNameDevices = 0;
  longNameEntities = 0;
  failedDevices = 0;
  failedEntities = 0;

  /* Set to true to skip the check for the endpoint owner after registering a device. This is useful for testing purposes only. */
  dryRun = false;

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
    if (typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.8.0')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.8.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend.`,
      );
    }

    this.log.info(`Initializing platform: ${CYAN}${this.config.name}${nf} version: ${CYAN}${this.config.version}${rs}`);

    if (!isValidString(config.host, 1) || !isValidString(config.token, 1)) {
      setImmediate(() => {
        void this.onShutdown('Invalid configuration').catch(/* istanbul ignore next */ () => {});
      });
      this.wssSendSnackbarMessage('Home Assistant Plugin: configure Host and Token', 0, 'error');
      throw new Error('Host and token must be defined in the configuration');
    }

    // Set the default values for the config for old versions of it
    // istanbul ignore next cause it's only for backward compatibility with old versions of the config that are missing the new properties
    {
      this.config.certificatePath = isValidString(config.certificatePath, 1) ? config.certificatePath : '';
      this.config.rejectUnauthorized = isValidBoolean(config.rejectUnauthorized) ? config.rejectUnauthorized : true;
      this.config.reconnectTimeout = isValidNumber(config.reconnectTimeout, 30) ? config.reconnectTimeout : 60;
      this.config.reconnectRetries = isValidNumber(config.reconnectRetries, 0) ? config.reconnectRetries : 10;
      this.config.filterByArea = isValidString(this.config.filterByArea, 1) ? this.config.filterByArea : '';
      this.config.filterByLabel = isValidString(this.config.filterByLabel, 1) ? this.config.filterByLabel : '';
      this.config.whiteList = isValidArray(this.config.whiteList, 1) ? this.config.whiteList : [];
      this.config.blackList = isValidArray(this.config.blackList, 1) ? this.config.blackList : [];
      this.config.entityWhiteList = isValidArray(this.config.entityWhiteList, 1) ? this.config.entityWhiteList : [];
      this.config.entityBlackList = isValidArray(this.config.entityBlackList, 1) ? this.config.entityBlackList : [];
      this.config.deviceEntityBlackList = isValidObject(this.config.deviceEntityBlackList, 1) ? this.config.deviceEntityBlackList : {};
      this.config.splitEntities = isValidArray(this.config.splitEntities, 1) ? this.config.splitEntities : [];
      this.config.splitByLabel = isValidString(this.config.splitByLabel) ? this.config.splitByLabel : '';
      this.config.splitNameStrategy =
        isValidString(this.config.splitNameStrategy, 10) && ['Entity name', 'Friendly name'].includes(this.config.splitNameStrategy)
          ? this.config.splitNameStrategy
          : 'Entity name';
      this.config.controllerStrategy =
        isValidString(this.config.controllerStrategy, 5) && ['Merge', 'Matter'].includes(this.config.controllerStrategy) ? this.config.controllerStrategy : 'Merge';
      this.config.namePostfix = isValidString(this.config.namePostfix, 1, 3) ? this.config.namePostfix : '';
      this.config.postfix = isValidString(this.config.postfix, 1, 3) ? this.config.postfix : '';
      this.config.airQualityRegex = isValidString(this.config.airQualityRegex, 1) ? this.config.airQualityRegex : '';
      this.config.enableServerRvc = isValidBoolean(this.config.enableServerRvc) ? this.config.enableServerRvc : true;
      this.config.discardHiddenEntities = isValidBoolean(this.config.discardHiddenEntities) ? this.config.discardHiddenEntities : false;
      this.config.virtualControlLabel = isValidString(this.config.virtualControlLabel, 1) ? this.config.virtualControlLabel : '';
    }

    // Initialize air quality regex from config or use default
    this.airQualityRegex = this.createRegexFromConfig(config.airQualityRegex);

    this.stateCache.log.logLevel = this.log.logLevel;

    this.ha = new HomeAssistant(config.host, config.token, config.reconnectTimeout, config.reconnectRetries, config.certificatePath, config.rejectUnauthorized);
    this.ha.log.logLevel = this.log.logLevel;

    this.ha.on('connected', (ha_version: HomeAssistantPrimitive) => {
      this.log.notice(`Connected to Home Assistant ${ha_version}`);

      this.log.info(`Fetching data from Home Assistant...`);

      void this.ha
        .fetchData()
        .then(() => {
          this.log.info(`Fetched data from Home Assistant successfully`);
          // Subscribe when the data is fetched to avoid missing events during the fetch.
          this.log.info(`Subscribing to Home Assistant events...`);
          void this.ha
            .subscribe()
            .then((id) => {
              this.haSubscriptionId = id;
              this.log.info(`Subscribed to Home Assistant events successfully with id ${this.haSubscriptionId}`);
            })
            .catch((error) => {
              this.log.error(`Error subscribing to Home Assistant events: ${error}`);
            });
          if (this.isConfigured) this.wssSendSnackbarMessage('Reconnected to Home Assistant', 5, 'success');
          if (this.isConfigured) this.wssSendRestartRequired();
          // Subscribed
        })
        .catch((error) => {
          this.log.error(`Error fetching data from Home Assistant: ${error}`);
        });
    });

    this.ha.on('disconnected', () => {
      this.log.warn('Disconnected from Home Assistant');
      this.haSubscriptionId = null;
      // istanbul ignore else
      if (this.isReady) this.wssSendSnackbarMessage('Disconnected from Home Assistant', 5, 'warning');
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

    this.ha.on('areas', (areas: HassArea[]) => {
      this.log.info('Areas received from Home Assistant');
      // Convert the area filter from the name in the config to the corresponding area_id and check if it exists.
      if (isValidString(this.config.filterByArea, 1)) {
        const area = areas.find((a) => a.name === this.config.filterByArea);
        if (area) {
          this.log.notice(`Filtering by area: ${CYAN}${area.name}${nf}`);
          this.filterMessages.push({ message: `Home Assistant: filtering by area "${this.config.filterByArea}"`, timeout: 60, severity: 'success' });
        } else {
          this.log.warn(`Area "${this.config.filterByArea}" not found in Home Assistant. Filter by area will discard all devices and entities.`);
          this.filterMessages.push({
            message: `Home Assistant: area "${this.config.filterByArea}" set in filterByArea not found. Filter by area will discard all devices and entities.`,
            timeout: 0,
            severity: 'warning',
          });
        }
      }
    });

    this.ha.on('labels', (labels: HassLabel[]) => {
      this.log.info('Labels received from Home Assistant');
      // Convert the label filter from the name in the config to the corresponding label_id and check if it exists.
      if (isValidString(this.config.filterByLabel, 1)) {
        const label = labels.find((l) => l.name === this.config.filterByLabel);
        if (label) {
          this.log.notice(`Filtering by label: ${CYAN}${this.config.filterByLabel}${nf}`);
          this.filterMessages.push({ message: `Home Assistant: filtering by label: ${this.config.filterByLabel}`, timeout: 60, severity: 'success' });
        } else {
          this.log.warn(`Label "${this.config.filterByLabel}" not found in Home Assistant. Filter by label will discard all devices and entities.`);
          this.filterMessages.push({
            message: `Home Assistant: label "${this.config.filterByLabel}" set in filterByLabel not found. Filter by label will discard all devices and entities.`,
            timeout: 0,
            severity: 'warning',
          });
        }
      }
    });

    this.ha.on('states', (_states: HassState[]) => {
      this.log.info('States received from Home Assistant');
    });

    this.ha.on('event', (deviceId, entityId, old_state, new_state) => {
      void this.updateHandler(deviceId, entityId, old_state, new_state).catch(/* istanbul ignore next */ () => {});
    });

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
    // prettier-ignore
    void savePayload(this).catch(/* istanbul ignore next */ () => {});

    // Write the Home Assistant report to the plugin directory without awaiting
    void writeReport(this).catch(/* istanbul ignore next */ () => {});

    // Clean the selectDevice and selectEntity maps
    await this.ready;
    await this.clearSelect();

    // Load the cached states from storage to the in-memory cache before processing the entities. This is needed to have the latest available state of entities when they turn to unavailable.
    // istanbul ignore else cause if the platform is ready then the context is defined
    if (this.context) await this.stateCache.load(this.context);

    // Pre-check the config
    for (const entityId of this.config.splitEntities) {
      if (!this.ha.hassEntities.has(entityId))
        this.log.warn(`Split entity "${CYAN}${entityId}${wr}" set in splitEntities not found in Home Assistant. Please check your configuration.`);
      if (this.ha.hassEntities.has(entityId) && this.ha.hassEntities.get(entityId)?.device_id === null)
        this.log.warn(`Split entity "${CYAN}${entityId}${wr}" set in splitEntities is an individual entity. Please check your configuration.`);
    }

    // *********************************************************************************************************
    // ************************************* Scan the individual entities **************************************
    // *********************************************************************************************************

    for (const entity of Array.from(this.ha.hassEntities.values()).filter(
      (entity) => isIndividualEntity(entity) && !isDisabled(entity) && (!isHidden(entity) || !this.config.discardHiddenEntities),
    )) {
      const [domain, name] = entity.entity_id.split('.');
      // Skip not supported domains.
      if (!this.supportedDomains.includes(domain)) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db} has unsupported domain ${CYAN}${domain}${db}. Skipping...`);
        continue;
      }
      // Get the entity state. If the entity is disabled, it doesn't have a state, we skip it.
      const hassState = this.ha.hassStates.get(entity.entity_id);
      if (!hassState) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db}: state not found. Skipping...`);
        continue;
      }
      if (hassState.state === 'unavailable' && hassState.attributes?.['restored'] === true) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db}: state unavailable and restored. Skipping...`);
        continue;
      }
      // If the entity doesn't have a valid name, we skip it.
      const entityName = getEntityName(this, entity);
      if (!isValidString(entityName, 1)) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db} has no valid name. Skipping...`);
        continue;
      }
      // If the entity has an already registered name, we skip it.
      if (this.hasDeviceName(entityName)) {
        this.duplicatedEntities++;
        this.log.warn(`Individual entity "${CYAN}${entityName}${wr}" already exists as a registered device. Please change the name in Home Assistant`);
        continue;
      }
      // Apply area and label filters before the select and validation
      if (!satisfiesAreaFilter(this, entity)) {
        this.filteredEntities++;
        this.log.info(`Individual entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${entityName}${nf} is not in the area "${CYAN}${this.config.filterByArea}${nf}". Skipping...`);
        continue;
      }
      // Apply area and label filters before the select and validation
      if (!satisfiesLabelFilter(this, entity)) {
        this.filteredEntities++;
        this.log.info(
          `Individual entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${entityName}${nf} doesn't have the label "${CYAN}${this.config.filterByLabel}${nf}". Skipping...`,
        );
        continue;
      }
      // Pre validate the domains
      if (!this.validateEntity('', entity.entity_id, true)) {
        this.unselectedEntities++;
        continue;
      }
      // Set the selects and validate.
      this.setSelectDevice(entity.id, entityName, undefined, 'hub');
      this.setSelectEntity(entityName, entity.entity_id, 'hub');
      if (!this.validateDevice([entityName, entity.entity_id, entity.id], true)) {
        this.unselectedEntities++;
        continue;
      }
      // Check name length and log a warning if it's too long for Matter, but we will try to register it anyway with the truncated name.
      if (entityName.length > 32) {
        this.longNameEntities++;
        this.log.warn(
          `Individual entity "${CYAN}${entityName}${wr}" has a name that exceeds Matter’s 32-character limit (${entityName.length}). Matterbridge will truncate the name, but it's recommended to change it in Home Assistant to avoid issues.`,
        );
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
      mutableDevice.setLogLevel(this.log.logLevel);
      mutableDevice.addDeviceTypes('', bridgedNode);

      // Lookup and add helpers domain entity.
      if (this.supportedHelpersDomains.includes(domain)) addHelperEntity(this, mutableDevice, entity, hassState, true);
      // Set the device mode for the Rvc.
      if (domain === 'vacuum' && this.config.enableServerRvc) mutableDevice.setMode('server');
      // Lookup and add core domains entity.
      if (this.supportedCoreDomains.includes(domain)) addControlEntity(this, mutableDevice, entity, hassState, this.commandHandler.bind(this), this.subscribeHandler.bind(this));
      // Lookup and add sensor domain entity.
      if (domain === 'sensor') addSensorEntity(this, mutableDevice, entity, hassState, this.airQualityRegex, name.includes('battery'));
      // Lookup and add binary_sensor domain entity.
      if (domain === 'binary_sensor') addBinarySensorEntity(this, mutableDevice, entity, hassState);
      // Lookup and add event domain entity.
      if (domain === 'event') addEventEntity(this, mutableDevice, entity, hassState);
      // Lookup and add button domain entity.
      if (domain === 'button') addButtonEntity(this, mutableDevice, entity, hassState);
      // Add PowerSource with battery feature if the entity is a battery
      if (mutableDevice.get().deviceTypes.includes(powerSource)) {
        mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Ok, 200);
      }

      if (entity.platform === 'template' || entity.platform === 'group') {
        mutableDevice.setComposedType(`Hass Template`);
        mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`);
      }

      // Register the device (individual entity) if we have found a supported domain
      if (mutableDevice.get().deviceTypes.length > 1 || mutableDevice.size() > 1) {
        try {
          mutableDevice.create(this.config.controllerStrategy === 'Merge');
          mutableDevice.logMutableDevice();
          this.log.debug(`Registering device ${dn}${entityName}${db}...`);
          await this.registerDevice(mutableDevice.getEndpoint());
          // istanbul ignore next cause is not testable
          if (!this.dryRun && !mutableDevice.getEndpoint().owner) throw new Error(`Endpoint not created`);
          this.matterbridgeDevices.set(entity.entity_id, mutableDevice.getEndpoint());
          this.endpointNames.set(entity.entity_id, this.config.controllerStrategy === 'Merge' ? '' : entity.entity_id);
        } catch (error) {
          this.failedEntities++;
          inspectError(this.log, `Failed to register device ${dn}${entityName}${er}`, error);
          await this.clearDeviceSelect(entity.id);
          await this.clearEntitySelect(entityName);
        }
      } else {
        this.log.debug(`Removing device ${dn}${entityName}${db}...`);
        await this.clearDeviceSelect(entity.id);
        await this.clearEntitySelect(entityName);
      }
      mutableDevice.destroy();
    } // End of individual entities loop

    this.log.debug(`Individual entities endpoint map(${this.matterbridgeDevices.size}/${this.endpointNames.size}):`);
    for (const [entity, endpoint] of this.endpointNames) {
      // istanbul ignore next cause is always main endpoint for individual entities
      this.log.debug(`- individual entity ${CYAN}${entity}${db} mapped to endpoint ${CYAN}${endpoint === '' ? 'main' : endpoint}${db}`);
    }

    // *********************************************************************************************************
    // ******************************************* Scan the devices ********************************************
    // *********************************************************************************************************

    for (const device of Array.from(this.ha.hassDevices.values()).filter((device) => !isDisabled(device))) {
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
        this.duplicatedDevices++;
        this.log.warn(`Device "${CYAN}${deviceName}${wr}" already exists as a registered device. Please change the name in Home Assistant`);
        continue;
      }
      // Apply area and label filters before the select and validation
      if (!satisfiesAreaFilter(this, device)) {
        this.filteredDevices++;
        this.log.info(`Device ${CYAN}${deviceName}${nf} is not in the area "${CYAN}${this.config.filterByArea}${nf}". Skipping...`);
        continue;
      }
      const deviceHasValidLabelFilterEntities = Array.from(this.ha.hassEntities.values()).some((e) => e.device_id === device.id && !isDisabled(e) && satisfiesLabelFilter(this, e));
      if (!satisfiesLabelFilter(this, device) && !deviceHasValidLabelFilterEntities) {
        this.filteredDevices++;
        this.log.info(`Device ${CYAN}${deviceName}${nf} doesn't have the label "${CYAN}${this.config.filterByLabel}${nf}". Skipping...`);
        continue;
      }
      // Set the device selects and validate the device.
      this.setSelectDevice(device.id, deviceName, undefined, 'hub');
      if (!this.validateDevice([deviceName, device.id], true)) {
        this.unselectedDevices++;
        continue;
      }
      // Check name length and log a warning if it's too long for Matter, but we will try to register it anyway with the truncated name.
      if (deviceName.length > 32) {
        this.longNameDevices++;
        this.log.warn(
          `Device "${CYAN}${deviceName}${wr}" has a name that exceeds Matter’s 32-character limit (${deviceName.length}). Matterbridge will truncate the name, but it's recommended to change it in Home Assistant to avoid issues.`,
        );
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
      mutableDevice.setLogLevel(this.log.logLevel);
      mutableDevice.addDeviceTypes('', bridgedNode);
      if (battery) {
        mutableDevice.addDeviceTypes('', powerSource);
        mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Ok, 200); // Add PowerSource with battery feature
      }
      mutableDevice.setComposedType('Hass Device');
      mutableDevice.setConfigUrl(`${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/devices/device/${device.id}`);

      // *******************************************************************************************************************
      // Scan entities that belong to this device for supported domains and services and add them to the Matterbridge device
      // *******************************************************************************************************************

      let hasRvc = false;
      for (const entity of Array.from(this.ha.hassEntities.values()).filter(
        (entity) => entity.device_id === device.id && !isDisabled(entity) && (!isHidden(entity) || !this.config.discardHiddenEntities),
      )) {
        this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} labels ${CYAN}${entity.labels?.join(', ') ?? ''}${db}...`);
        const [domain, _name] = entity.entity_id.split('.');
        const entityName = entity.name ?? entity.original_name ?? deviceName;
        let endpointName = entity.entity_id;
        // Skip not supported domains.
        if (!this.supportedDomains.includes(domain)) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} has unsupported domain ${CYAN}${domain}${db}. Skipping...`);
          continue;
        }
        // Get the entity state. If the entity is disabled, it doesn't have a state, we skip it.
        const hassState = this.ha.hassStates.get(entity.entity_id);
        if (!hassState) {
          this.log.debug(`Device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db}: state not found. Skipping...`);
          continue;
        }
        if (hassState.state === 'unavailable' && hassState.attributes?.['restored'] === true) {
          this.log.debug(`Device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db}: state unavailable and restored. Skipping...`);
          continue;
        }
        // Apply area and label filters before the select and validation
        if (deviceHasValidLabelFilterEntities && !satisfiesLabelFilter(this, entity)) {
          this.filteredEntities++;
          this.log.info(`Device ${CYAN}${deviceName}${nf} entity ${CYAN}${entity.entity_id}${nf} doesn't have the label "${CYAN}${this.config.filterByLabel}${nf}". Skipping...`);
          continue;
        }
        // Set the entity selects and validate the entity.
        this.setSelectDeviceEntity(device.id, entity.entity_id, entityName, 'component');
        this.setSelectEntity(entityName, entity.entity_id, 'component');
        if (isSplitEntity(this, entity)) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} name ${CYAN}${entityName}${db} is a splitEntity. Skipping...`);
          continue; // Skip split entities from the main device
        }
        if (!this.validateEntity(deviceName, entity.entity_id, true)) {
          this.unselectedEntities++;
          continue;
        }
        // Set the entity mode for the Rvc.
        if (domain === 'vacuum' && this.config.enableServerRvc) {
          hasRvc = true;
          mutableDevice.setMode('server');
          // istanbul ignore else
          if (!battery) mutableDevice.addDeviceTypes('', powerSource); // Temporary fix for vacuum without battery and enableServerRvc
        }
        // Lookup and add helpers domain entity.
        const eHelper = addHelperEntity(this, mutableDevice, entity, hassState, false);
        if (eHelper !== undefined) {
          endpointName = eHelper;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Lookup and add core domains entity.
        const eControl = addControlEntity(this, mutableDevice, entity, hassState, this.commandHandler.bind(this), this.subscribeHandler.bind(this));
        if (eControl !== undefined) {
          endpointName = eControl;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Lookup and add sensor domain entity.
        const eSensor = addSensorEntity(this, mutableDevice, entity, hassState, this.airQualityRegex, battery);
        if (eSensor !== undefined) {
          endpointName = eSensor;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Lookup and add binary_sensor domain entity.
        const eBinarySensor = addBinarySensorEntity(this, mutableDevice, entity, hassState);
        if (eBinarySensor !== undefined) {
          endpointName = eBinarySensor;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Lookup and add event domain entity.
        const eEvent = addEventEntity(this, mutableDevice, entity, hassState);
        if (eEvent !== undefined) {
          endpointName = eEvent;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Lookup and add button domain entity.
        const eButton = addButtonEntity(this, mutableDevice, entity, hassState);
        if (eButton !== undefined) {
          endpointName = eButton;
          this.endpointNames.set(entity.entity_id, endpointName); // Set the endpoint name for the entity
        }
        // Found a supported entity domain
        if (mutableDevice.has(endpointName))
          this.log.debug(`Creating endpoint ${CYAN}${entity.entity_id}${db} for device ${idn}${device.name}${rs}${db} id ${CYAN}${device.id}${db}...`);
        else {
          await this.clearEntitySelect(entityName);
          this.log.debug(`Deleting endpoint ${CYAN}${entity.entity_id}${db} for device ${idn}${device.name}${rs}${db} id ${CYAN}${device.id}${db}...`);
        }
      } // hassEntities

      // Register the device if we have found supported domains and entities
      if (mutableDevice.size() > 1) {
        try {
          if (this.config.enableServerRvc && hasRvc) {
            this.log.debug(`Checking server RVC for device ${dn}${device.name}${db} with enabled server RVC...`);
            for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id)) {
              const domain = entity.entity_id.split('.')[0];
              if (domain !== 'vacuum' && mutableDevice.has(entity.entity_id)) {
                this.log.warn(`Device ${dn}${device.name}${wr} has more entities with enabled server RVC. Please filter out or unselect all other entities.`);
              }
            }
          }
          this.log.debug(`Registering device ${dn}${device.name}${db}...`);
          mutableDevice.create(this.config.controllerStrategy === 'Merge');
          mutableDevice.logMutableDevice();
          await this.registerDevice(mutableDevice.getEndpoint());
          // istanbul ignore next cause is not testable
          if (!this.dryRun && !mutableDevice.getEndpoint().owner) throw new Error(`Endpoint not created`);
          this.matterbridgeDevices.set(device.id, mutableDevice.getEndpoint());
        } catch (error) {
          this.failedDevices++;
          inspectError(this.log, `Failed to register device ${dn}${device.name}${er}`, error);
          await this.clearDeviceSelect(device.id);
        }
        // Log all the remapped endpoints
        for (const remappedEndpoint of mutableDevice.getRemappedEndpoints()) {
          this.log.debug(`- Device ${CYAN}${device.name}${db} remapped endpoint ${CYAN}${remappedEndpoint}${db}`);
        }
        // Log all the split endpoints
        for (const splitEndpoint of mutableDevice.getSplitEndpoints()) {
          this.log.debug(`- Device ${CYAN}${device.name}${db} split endpoint ${CYAN}${splitEndpoint}${db}`);
        }
        // Check if some entities are mapped to remapped endpoints and set them to the main endpoint
        for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id)) {
          const endpoint = this.endpointNames.get(entity.entity_id);
          if (endpoint && mutableDevice.getRemappedEndpoints().has(endpoint)) {
            this.log.debug(`- Device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} remapped to endpoint ${CYAN}${'main'}${db}`);
            this.endpointNames.set(entity.entity_id, '');
          } else if (endpoint && !mutableDevice.getRemappedEndpoints().has(endpoint)) {
            this.log.debug(`- Device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} mapped to endpoint ${CYAN}${endpoint}${db}`);
          }
        }
      } else {
        this.log.debug(`Device ${CYAN}${device.name}${db} has no supported entities. Deleting device select...`);
        await this.clearDeviceSelect(device.id);
      }
      mutableDevice.destroy();
    } // End of devices loop

    // *********************************************************************************************************
    // ************************************ Scan the split entities  *******************************************
    // *********************************************************************************************************

    for (const entity of Array.from(this.ha.hassEntities.values()).filter(
      (entity) => isDeviceEntity(entity) && !isDisabled(entity) && (!isHidden(entity) || !this.config.discardHiddenEntities) && isSplitEntity(this, entity),
    )) {
      const [domain, name] = entity.entity_id.split('.');
      // Skip not supported domains.
      if (!this.supportedDomains.includes(domain)) {
        this.log.debug(`Split entity ${CYAN}${entity.entity_id}${db} has unsupported domain ${CYAN}${domain}${db}. Skipping...`);
        continue;
      }
      // Get the entity state. If the entity is disabled, it doesn't have a state, we skip it.
      const hassState = this.ha.hassStates.get(entity.entity_id);
      if (!hassState) {
        this.log.debug(`Split entity ${CYAN}${entity.entity_id}${db} state not found. Skipping...`);
        continue;
      }
      if (hassState.state === 'unavailable' && hassState.attributes?.['restored'] === true) {
        this.log.debug(`Split entity ${CYAN}${entity.entity_id}${db}: state unavailable and restored. Skipping...`);
        continue;
      }
      // If the entity doesn't have a valid name, we skip it.
      const entityName = getEntityName(this, entity);
      if (!isValidString(entityName, 1)) {
        this.log.debug(`Split entity ${CYAN}${entity.entity_id}${db} has no valid name. Skipping...`);
        continue;
      }
      // If the entity has an already registered name, we skip it.
      if (this.hasDeviceName(entityName)) {
        this.duplicatedEntities++;
        this.log.warn(
          `Split entity ${CYAN}${entity.entity_id}${wr} name "${CYAN}${entityName}${wr}" already exists as a registered device. Please change the name in Home Assistant.`,
        );
        continue;
      }
      // Apply area and label filters before the select and validation
      const device = entity.device_id && this.ha.hassDevices.get(entity.device_id);
      if (!device) {
        this.log.info(`Split entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${getEntityName(this, entity)}${nf} device not found. Skipping...`);
        continue;
      }
      if (!satisfiesAreaFilter(this, device)) {
        this.log.info(
          `Split entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${getEntityName(this, entity)}${nf} is not in the area "${CYAN}${this.config.filterByArea}${nf}". Skipping...`,
        );
        this.filteredEntities++;
        continue;
      }
      if (!satisfiesLabelFilter(this, device) && !satisfiesLabelFilter(this, entity)) {
        this.log.info(
          `Split entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${getEntityName(this, entity)}${nf} doesn't have the label "${CYAN}${this.config.filterByLabel}${nf}". Skipping...`,
        );
        this.filteredEntities++;
        continue;
      }
      // Pre validate the domains
      if (!this.validateEntity('', entity.entity_id, true)) {
        this.unselectedEntities++;
        continue;
      }
      // Set the selects and validate.
      this.setSelectDevice(entity.id, entityName, undefined, 'hub');
      this.setSelectEntity(entityName, entity.entity_id, 'hub');
      if (!this.validateDevice([entityName, entity.entity_id, entity.id], true)) {
        this.unselectedEntities++;
        continue;
      }
      // Check name length and log a warning if it's too long for Matter, but we will try to register it anyway with the truncated name.
      if (entityName.length > 32) {
        this.longNameEntities++;
        this.log.warn(
          `Split entity "${CYAN}${entityName}${wr}" has a name that exceeds Matter’s 32-character limit (${entityName.length}). Matterbridge will truncate the name, but it's recommended to change it in Home Assistant to avoid issues.`,
        );
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
      mutableDevice.setLogLevel(this.log.logLevel);
      mutableDevice.addDeviceTypes('', bridgedNode);

      // Lookup and add helpers domain entity.
      if (this.supportedHelpersDomains.includes(domain)) addHelperEntity(this, mutableDevice, entity, hassState, true);
      // Set the device mode for the Rvc.
      if (domain === 'vacuum' && this.config.enableServerRvc) mutableDevice.setMode('server');
      // Lookup and add core domains entity.
      if (this.supportedCoreDomains.includes(domain)) addControlEntity(this, mutableDevice, entity, hassState, this.commandHandler.bind(this), this.subscribeHandler.bind(this));
      // Lookup and add sensor domain entity.
      if (domain === 'sensor') addSensorEntity(this, mutableDevice, entity, hassState, this.airQualityRegex, name.includes('battery'));
      // Lookup and add binary_sensor domain entity.
      if (domain === 'binary_sensor') addBinarySensorEntity(this, mutableDevice, entity, hassState);
      // Lookup and add event domain entity.
      if (domain === 'event') addEventEntity(this, mutableDevice, entity, hassState);
      // Lookup and add button domain entity.
      if (domain === 'button') addButtonEntity(this, mutableDevice, entity, hassState);
      // Add PowerSource with battery feature if the entity is a battery
      if (mutableDevice.get().deviceTypes.includes(powerSource)) {
        mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Ok, 200);
      }
      mutableDevice.setComposedType('Hass Split');
      mutableDevice.setConfigUrl(
        `${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/devices/device/${entity.device_id}`,
      );

      // Register the device (split entity) if we have found a supported domain
      if (mutableDevice.get().deviceTypes.length > 1 || mutableDevice.size() > 1) {
        try {
          mutableDevice.create(this.config.controllerStrategy === 'Merge');
          mutableDevice.logMutableDevice();
          this.log.debug(`Registering device ${dn}${entityName}${db}...`);
          await this.registerDevice(mutableDevice.getEndpoint());
          // istanbul ignore next cause is not testable
          if (!this.dryRun && !mutableDevice.getEndpoint().owner) throw new Error(`Endpoint not created`);
          this.matterbridgeDevices.set(entity.entity_id, mutableDevice.getEndpoint());
          this.endpointNames.set(entity.entity_id, this.config.controllerStrategy === 'Merge' ? '' : entity.entity_id);
        } catch (error) {
          this.failedEntities++;
          inspectError(this.log, `Failed to register device ${dn}${entityName}${er}`, error);
          await this.clearDeviceSelect(entity.id);
          await this.clearEntitySelect(entityName);
        }
      } else {
        this.log.debug(`Removing device ${dn}${entityName}${db}...`);
        await this.clearDeviceSelect(entity.id);
        await this.clearEntitySelect(entityName);
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
        // istanbul ignore next cause is just a safety check, it should never happen that we have a state without an entity
        if (!entity) continue;
        // Skip unregistered entities
        if (this.endpointNames.get(entity.entity_id) === undefined) continue;
        // Skip unsupported domains
        const [domain, _name] = entity.entity_id.split('.');
        if (!this.supportedHelpersDomains.includes(domain) && !this.supportedCoreDomains.includes(domain) && domain !== 'sensor' && domain !== 'binary_sensor') continue;

        this.log.debug(`Configuring state of entity ${CYAN}${state.entity_id}${db}...`);
        await this.updateHandler(entity.device_id, entity.entity_id, state, state);
      }
      this.log.info(`Configured platform ${idn}${this.config.name}${rs}${nf}`);
    } catch (error) {
      this.log.error(`Error configuring platform ${idn}${this.config.name}${rs}${er}: ${error}`);
    }

    // Show filter messages here to avoid multiple messages during the start process
    for (const msg of this.filterMessages) {
      this.wssSendSnackbarMessage(msg.message, msg.timeout, msg.severity);
    }
    this.log.notice(`Filtered devices: ${this.filteredDevices}`);
    if (this.filteredDevices) this.wssSendSnackbarMessage(`Home Assistant: ${this.filteredDevices} devices have been discarded by filters`, 60, 'success');
    this.log.notice(`Filtered entities: ${this.filteredEntities}`);
    if (this.filteredEntities) this.wssSendSnackbarMessage(`Home Assistant: ${this.filteredEntities} entities have been discarded by filters`, 60, 'success');

    this.log.notice(`Unselected devices: ${this.unselectedDevices}`);
    if (this.unselectedDevices) this.wssSendSnackbarMessage(`Home Assistant: ${this.unselectedDevices} devices have been discarded by select`, 60, 'success');
    this.log.notice(`Unselected entities: ${this.unselectedEntities}`);
    if (this.unselectedEntities) this.wssSendSnackbarMessage(`Home Assistant: ${this.unselectedEntities} entities have been discarded by select`, 60, 'success');

    if (this.longNameDevices) this.log.warn(`Devices with long names: ${this.longNameDevices}`);
    if (this.longNameDevices) this.wssSendSnackbarMessage(`Home Assistant: ${this.longNameDevices} devices have names that exceed Matter’s 32-character limit`, 60, 'warning');
    if (this.longNameEntities) this.log.warn(`Entities with long names: ${this.longNameEntities}`);
    if (this.longNameEntities) this.wssSendSnackbarMessage(`Home Assistant: ${this.longNameEntities} entities have names that exceed Matter’s 32-character limit`, 60, 'warning');

    if (this.duplicatedDevices) this.log.warn(`Duplicated device names: ${this.duplicatedDevices}`);
    if (this.duplicatedDevices) this.wssSendSnackbarMessage(`Home Assistant: ${this.duplicatedDevices} devices have been discarded due to duplicate names`, 60, 'warning');
    if (this.duplicatedEntities) this.log.warn(`Duplicated entity names: ${this.duplicatedEntities}`);
    if (this.duplicatedEntities) this.wssSendSnackbarMessage(`Home Assistant: ${this.duplicatedEntities} entities have been discarded due to duplicate names`, 60, 'warning');

    if (this.failedDevices) this.log.error(`Failed device creation: ${this.failedDevices}`);
    if (this.failedDevices) this.wssSendSnackbarMessage(`Home Assistant: ${this.failedDevices} devices failed to be created`, 60, 'error');
    if (this.failedEntities) this.log.error(`Failed entity creation: ${this.failedEntities}`);
    if (this.failedEntities) this.wssSendSnackbarMessage(`Home Assistant: ${this.failedEntities} entities failed to be created`, 60, 'error');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  override async onChangeLoggerLevel(logLevel: LogLevel) {
    this.log.info(`Logger level changed to ${logLevel}`);
    this.ha.log.logLevel = logLevel;
    this.stateCache.log.logLevel = logLevel;
    for (const device of this.matterbridgeDevices.values()) {
      device.log.logLevel = logLevel;
    }
  }

  override async onShutdown(reason?: string) {
    // Save the state cache to restore it at the next startup.
    // istanbul ignore else cause if the platform is ready then the context is defined
    if (this.context) await this.stateCache.save(this.context);
    await super.onShutdown(reason);
    this.log.info(`Shutting down platform ${idn}${this.config.name}${rs}${nf}: ${reason}`);

    try {
      await this.ha?.close();
      this.ha?.removeAllListeners();
      this.log.info('Home Assistant connection closed');
    } catch (error) {
      this.log.error(`Error closing Home Assistant connection: ${error}`);
    }

    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();

    this.stateCache.clear();
    this.matterbridgeDevices.clear();
    this.updatingEntities.clear();
    this.offUpdatedEntities.clear();
    this.endpointNames.clear();
    this.batteryVoltageEntities.clear();
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
    // istanbul ignore next cause is just a safety check, it should never happen that we receive a command for an unregistered endpoint
    if (!entityId) return;
    data.endpoint.log.info(`${db}Received matter command ${ign}${command}${rs}${db} for endpoint ${or}${endpointName}${db}:${or}${data.endpoint?.maybeNumber}${db}`);
    const state = this.ha.hassStates.get(entityId);
    const domain = entityId.split('.')[0];
    const hassCommand = hassCommandConverter.find((cvt) => cvt.command === command && cvt.domain === domain);
    if (hassCommand) {
      if (domain === 'cover') {
        // Special handling for cover goToLiftPercentage command. When goToLiftPercentage is called with 0, we may call the open service and when called with 10000 we may call the close service.
        // This allows to support also covers not supporting the set_cover_position service.
        // istanbul ignore else cause we modify only the goToLiftPercentage command for covers
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
        const onOff = data.endpoint.getAttribute(OnOff.Cluster.id, 'onOff', data.endpoint.log) as boolean | undefined;
        if (onOff === false && ['moveToLevel', 'moveToColorTemperature', 'moveToColor', 'moveToHue', 'moveToSaturation', 'moveToHueAndSaturation'].includes(command)) {
          data.endpoint.log.debug(
            `Command ${ign}${command}${rs}${db} for domain ${CYAN}${domain}${db} entity ${CYAN}${entityId}${db} received while the light is off => skipping it`,
          );
          // Add the entity to the set of entities that may (we assume options.executeIfOff) have received an update while being off, so when the light will be turned on we will apply the last updates received while it was off.
          this.offUpdatedEntities.add(entityId);
          return; // Skip the command if the light is off. Matter will store the values in the clusters and we apply them when the light is turned on
        }

        // Turn off the light if level <= minLevel. Not managed by the hassCommandConverter since it's a special case for lights that we can manage better here to avoid calling the turn_on service.
        if (command === 'moveToLevelWithOnOff' && data.request['level'] <= (data.endpoint.getAttribute(LevelControl.Cluster.id, 'minLevel') ?? 1)) {
          data.endpoint.log.debug(
            `Command ${ign}${command}${rs}${db} for domain ${CYAN}${domain}${db} entity ${CYAN}${entityId}${db} received with level = minLevel => turn off the light`,
          );
          await this.ha.callService('light', 'turn_off', entityId);
          return;
        }

        if (
          onOff === false &&
          (command === 'on' ||
            command === 'toggle' ||
            (command === 'moveToLevelWithOnOff' && data.request['level'] > (data.endpoint.getAttribute(LevelControl.Cluster.id, 'minLevel') ?? 1)))
        ) {
          // We need to add the current Matter cluster attributes since we are turning on the light and it was off
          const serviceAttributes: Record<string, HomeAssistantPrimitive> = {};

          // In Matter level is 1-254 for feature Lightning while in Home Assistant brightness is 1-255
          const brightness = data.endpoint.hasAttributeServer(LevelControl.Cluster.id, 'currentLevel')
            ? Math.round((data.endpoint.getAttribute(LevelControl.Cluster.id, 'currentLevel') / 254) * 255)
            : undefined;
          if (isValidNumber(brightness, 1, 255) && this.offUpdatedEntities.has(entityId)) serviceAttributes['brightness'] = brightness;
          // The moveToLevelWithOnOff command has a request with level so we use it instead of the stored currentLevel attribute we use for the other commands on and toggle.
          if (command === 'moveToLevelWithOnOff' && isValidNumber(data.request['level'], 2, 254)) serviceAttributes['brightness'] = Math.round((data.request['level'] / 254) * 255);

          // The actual color mode is determined by the colorMode attribute of the ColorControl cluster. In Home Assistant we need to pass only a single color attribute without the 'color_mode' attribute.
          const colorMode: ColorControl.ColorMode | undefined =
            data.endpoint.hasClusterServer(ColorControl.Cluster.id) && data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'colorMode')
              ? data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorMode')
              : undefined;

          if (
            colorMode === ColorControl.ColorMode.ColorTemperatureMireds &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'colorTemperatureMireds') &&
            this.offUpdatedEntities.has(entityId)
          ) {
            // In Matter color temperature is represented in mireds while in Home Assistant it's represented in kelvin. We need to convert it before calling the service and also clamp it to the supported range if the attributes are available.
            const color_temp = data.endpoint.getAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds');
            // istanbul ignore else
            if (isValidNumber(color_temp))
              serviceAttributes['color_temp_kelvin'] =
                state && state.attributes.min_color_temp_kelvin && state.attributes.max_color_temp_kelvin
                  ? clamp(miredsToKelvin(color_temp, 'floor'), state.attributes.min_color_temp_kelvin, state.attributes.max_color_temp_kelvin)
                  : // istanbul ignore next cause is just a safety check, it should never happen that we don't have the min and max color temp attributes
                    miredsToKelvin(color_temp, 'floor');
          }

          if (
            colorMode === ColorControl.ColorMode.CurrentHueAndCurrentSaturation &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentHue') &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentSaturation') &&
            this.offUpdatedEntities.has(entityId)
          ) {
            // In Matter the hue in degrees shall be related to the CurrentHue attribute by the relationship:
            // Hue = "CurrentHue" * 360 / 254
            // where CurrentHue is in the range from 0 to 254 inclusive.
            // In Matter the saturation (on a scale from 0.0 to 1.0) shall be related to the CurrentSaturation attribute by the relationship:
            // Saturation = "CurrentSaturation" / 254
            // where CurrentSaturation is in the range from 0 to 254 inclusive.
            // istanbul ignore next cause codecov is not able to detect it as covered but it is
            const hs_color = [
              Math.round((data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentHue') / 254) * 360),
              Math.round((data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentSaturation') / 254) * 100),
            ];
            // istanbul ignore else
            if (isValidArray(hs_color, 2)) serviceAttributes['hs_color'] = hs_color;
          }

          if (
            colorMode === ColorControl.ColorMode.CurrentXAndCurrentY &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentX') &&
            data.endpoint.hasAttributeServer(ColorControl.Cluster.id, 'currentY') &&
            this.offUpdatedEntities.has(entityId)
          ) {
            // In Matter xy_color is represented with two attributes currentX and currentY range 0-65279 while in Home Assistant it's represented with a single attribute xy_color with an array of two values range 0-1.
            // istanbul ignore next cause codecov is not able to detect it as covered but it is
            const xy_color = convertMatterXYToHA(data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentX'), data.endpoint.getAttribute(ColorControl.Cluster.id, 'currentY'));
            // istanbul ignore else
            if (isValidArray(xy_color, 2)) serviceAttributes['xy_color'] = xy_color;
          }

          // Transition time is not present in on off toggle commands. In Matter is represented in 1/10th of a second while in Home Assistant it's represented in seconds, so we need to convert it before calling the service.
          if (isValidNumber(data.request?.transitionTime, 1)) serviceAttributes['transition'] = Math.round(data.request.transitionTime / 10);

          // Call the light.turn_on service with the attributes we found on the Matter clusters.
          this.log.debug(
            `Command ${ign}${command}${rs}${db} for domain ${CYAN}${domain}${db} entity ${CYAN}${entityId}${db} received while the light is off => turn on the light with attributes: ${debugStringify(serviceAttributes)}`,
          );
          await this.ha.callService('light', 'turn_on', entityId, serviceAttributes);
          // Remove the entity from the set of entities that have received an update while being off, since we are applying now the updates when turning on the light.
          this.offUpdatedEntities.delete(entityId);
          return;
        }
      }
      // Normal execution for all the other commands and domains, we use the converter if present to get the service attributes and then call the service.
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
  ): void {
    const state = this.ha.hassStates.get(entity.entity_id);
    let endpoint: MatterbridgeEndpoint | undefined;
    if (isDeviceEntity(entity)) {
      // Device entity
      const matterbridgeDevice = this.matterbridgeDevices.get(entity.device_id);
      if (!matterbridgeDevice) {
        this.log.debug(`Subscribe handler: Matterbridge device ${entity.device_id} for ${entity.entity_id} not found`);
        return;
      }
      // If it has not been remapped to the main endpoint
      endpoint = matterbridgeDevice.getChildEndpointByOriginalId(entity.entity_id);
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
    if (context && !context.fabric) {
      endpoint.log.debug(
        `Subscribed attribute ${hk}${getClusterNameById(hassSubscribe.clusterId)}${db}:${hk}${hassSubscribe.attribute}${db} ` +
          `on endpoint ${or}${endpoint?.maybeId}${db}:${or}${endpoint?.maybeNumber}${db} changed for an offline update`,
      );
      return; // Skip offline updates
    }
    if ((typeof newValue !== 'object' && newValue === oldValue) || (typeof newValue === 'object' && deepEqual(newValue, oldValue))) {
      endpoint.log.debug(
        `Subscribed attribute ${hk}${getClusterNameById(hassSubscribe.clusterId)}${db}:${hk}${hassSubscribe.attribute}${db} ` +
          `on endpoint ${or}${endpoint?.maybeId}${db}:${or}${endpoint?.maybeNumber}${db} not changed`,
      );
      return; // Skip unchanged values
    }
    endpoint.log.info(
      `${db}Subscribed attribute ${hk}${getClusterNameById(hassSubscribe.clusterId)}${db}:${hk}${hassSubscribe.attribute}${db} on endpoint ${or}${endpoint?.maybeId}${db}:${or}${endpoint?.maybeNumber}${db} ` +
        `changed from ${YELLOW}${typeof oldValue === 'object' ? debugStringify(oldValue) : oldValue}${db} to ${YELLOW}${typeof newValue === 'object' ? debugStringify(newValue) : newValue}${db}`,
    );
    const value = hassSubscribe.converter ? hassSubscribe.converter(newValue) : newValue;
    // istanbul ignore else
    if (hassSubscribe.converter)
      endpoint.log.debug(`Converter: ${typeof newValue === 'object' ? debugStringify(newValue) : newValue} => ${typeof value === 'object' ? debugStringify(value) : value}`);
    const domain = entity.entity_id.split('.')[0];
    // prettier-ignore
    if (value !== null) {
      if (hassSubscribe.attribute === 'occupiedHeatingSetpoint' && state && state.state === 'heat_cool') {
        void this.ha.callService(domain, hassSubscribe.service, entity.entity_id, { target_temp_low: value, target_temp_high: state.attributes['target_temp_high'] }).catch(/* istanbul ignore next */ () => {});
      } else if (hassSubscribe.attribute === 'occupiedCoolingSetpoint' && state && state.state === 'heat_cool') {
        void this.ha.callService(domain, hassSubscribe.service, entity.entity_id, { target_temp_low: state.attributes['target_temp_low'], target_temp_high: value }).catch(/* istanbul ignore next */ () => {});
      } else void this.ha.callService(domain, hassSubscribe.service, entity.entity_id, { [hassSubscribe.with]: value }).catch(/* istanbul ignore next */ () => {});
    }
    // The converter returns null for fan turn_on with percentage 0 => call turn_off
    else void this.ha.callService(domain, 'turn_off', entity.entity_id).catch(/* istanbul ignore next */ () => {});
  }

  async updateHandler(deviceId: string | null, entityId: string, old_state: HassState, new_state: HassState): Promise<void> {
    const matterbridgeDevice = this.matterbridgeDevices.has(entityId) ? this.matterbridgeDevices.get(entityId) : this.matterbridgeDevices.get(deviceId ?? entityId);
    if (!matterbridgeDevice) {
      // istanbul ignore else
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
    // Set the device reachable attribute to false if the new state is unavailable and skip the update since the device is unreachable. Cache the last state of the entity to be able to create it on restart.
    if (old_state.state !== 'unavailable' && new_state.state === 'unavailable') {
      this.stateCache.add(old_state);
      await matterbridgeDevice.setAttribute(BridgedDeviceBasicInformation.Cluster, 'reachable', false, matterbridgeDevice.log);
      endpoint.log.debug(
        `Received update for entity ${CYAN}${entityId}${db} but the new state is unavailable, skipping the update and waiting for the device to become reachable again...`,
      );
      return;
    }
    // Set the device reachable attribute to true if the new state is available and remove the cached state since the device is reachable again.
    if (old_state.state === 'unavailable' && new_state.state !== 'unavailable') {
      this.stateCache.remove(old_state.entity_id);
      await matterbridgeDevice.setAttribute(BridgedDeviceBasicInformation.Cluster, 'reachable', true, matterbridgeDevice.log);
    }
    // Set the device reachable attribute to false if the new state is unavailable and skip the update since the device is unreachable. From onConfigure().
    if (old_state.state === 'unavailable' && new_state.state === 'unavailable') {
      await matterbridgeDevice.setAttribute(BridgedDeviceBasicInformation.Cluster, 'reachable', false, matterbridgeDevice.log);
      endpoint.log.debug(
        `Received update for entity ${CYAN}${entityId}${db} but the new state is unavailable, skipping the update and waiting for the device to become reachable again...`,
      );
      return;
    }
    matterbridgeDevice.log.info(
      `${db}Received update event from Home Assistant device ${idn}${matterbridgeDevice?.deviceName}${rs}${db} entity ${CYAN}${entityId}${db} ` +
        `from ${YELLOW}${old_state.state}${db} with ${debugStringify(old_state.attributes)}${db} to ${YELLOW}${new_state.state}${db} with ${debugStringify(new_state.attributes)}`,
    );
    const domain = entityId.split('.')[0];
    if (['automation', 'scene', 'script', 'input_button', 'button'].includes(domain)) {
      // No update for individual entities (automation, scene, script) only for input_boolean that maintains the state
      return;
    } else if (domain === 'sensor') {
      // Convert to the airquality sensor if the entity is an air quality sensor with regex
      if (this.airQualityRegex && this.airQualityRegex.test(entityId)) {
        new_state.attributes['state_class'] = 'measurement';
        new_state.attributes['device_class'] = 'aqi';
        this.log.debug(`Converting entity ${CYAN}${entityId}${db} to air quality sensor`);
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
      const hassBinarySensorConverter = hassDomainBinarySensorsConverter.find((s) => s.domain === domain && s.withDeviceClass === (new_state.attributes['device_class'] ?? 'door'));
      if (hassBinarySensorConverter) {
        const convertedValue = hassBinarySensorConverter.converter(new_state.state);
        endpoint.log.debug(
          `Converting binary_sensor ${new_state.attributes['device_class']} value "${new_state.state}" to ${CYAN}${typeof convertedValue === 'object' ? debugStringify(convertedValue) : convertedValue}${db}`,
        );
        // istanbul ignore else
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
    } else if (domain === 'select' || domain === 'input_select') {
      const currentMode = new_state.attributes['options']?.indexOf(new_state.state);
      if (currentMode >= 0) await endpoint.setAttribute(ModeSelect.Cluster.id, 'currentMode', currentMode + 1, endpoint.log);
      else endpoint.log.debug(`Update ${CYAN}${new_state.attributes['options']?.join(', ')}${db} >>> ${CYAN}${new_state.state}${db} not supported for entity ${entityId}`);
    } else {
      // Update state of the device
      const hassUpdateState = hassUpdateStateConverter.filter((updateState) => updateState.domain === domain && updateState.state === new_state.state);
      if (hassUpdateState.length > 0) {
        for (const update of hassUpdateState) {
          // istanbul ignore else
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
      endpoint.log.debug(`*Processing update event from Home Assistant device ${idn}${matterbridgeDevice?.deviceName}${rs}${db} entity ${CYAN}${entityId}${db}`);
      this.updatingEntities.set(entityId, (this.updatingEntities.get(entityId) || 0) + 1);
      const hassUpdateAttributes = hassUpdateAttributeConverter.filter((updateAttribute) => updateAttribute.domain === domain);
      if (hassUpdateAttributes.length > 0) {
        // console.error('Processing update attributes: ', hassUpdateAttributes.length);
        for (const update of hassUpdateAttributes) {
          if ((this.updatingEntities.get(entityId) || 0) > 1) {
            endpoint.log.debug(`**Stop processing update event from Home Assistant device ${idn}${matterbridgeDevice?.deviceName}${rs}${db} entity ${CYAN}${entityId}${db}`);
            break;
          }
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
      endpoint.log.debug(`*Processed update event from Home Assistant device ${idn}${matterbridgeDevice?.deviceName}${rs}${db} entity ${CYAN}${entityId}${db}`);
      this.updatingEntities.set(entityId, (this.updatingEntities.get(entityId) || 0) - 1);
    }
  }

  /**
   * Validates if an entity is allowed based on the entity blacklist, the entity whitelist and device entity blacklist configurations.
   *
   * @param {string} deviceName - The device to which the entity belongs.
   * @param {string} entity_id - The entity_id to validate.
   * @param {boolean} [log] - Whether to log the validation result.
   * @returns {boolean} - Returns true if the entity is allowed, false otherwise.
   */
  override validateEntity(deviceName: string, entity_id: string, log: boolean = true): boolean {
    if (isValidArray(this.config.entityBlackList, 1) && this.config.entityBlackList.find((e) => e === getDomain(entity_id))) {
      // istanbul ignore else
      if (log) this.log.info(`Skipping entity ${CYAN}${entity_id}${nf} because in entityBlackList`);
      return false;
    }
    if (isValidArray(this.config.entityWhiteList, 1) && !this.config.entityWhiteList.find((e) => e === getDomain(entity_id))) {
      // istanbul ignore else
      if (log) this.log.info(`Skipping entity ${CYAN}${entity_id}${nf} because not in entityWhiteList`);
      return false;
    }
    if (
      isValidObject(this.config.deviceEntityBlackList, 1) &&
      deviceName in this.config.deviceEntityBlackList &&
      (this.config.deviceEntityBlackList as Record<string, string[]>)[deviceName].includes(entity_id)
    ) {
      // istanbul ignore else
      if (log) this.log.info(`Skipping entity ${CYAN}${entity_id}${nf} for device ${CYAN}${deviceName}${nf} because in deviceEntityBlackList`);
      return false;
    }
    return true;
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
