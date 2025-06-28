/**
 * @description This file contains the class HomeAssistantPlatform.
 * @file src\platform.ts
 * @author Luca Liguori
 * @created 2024-09-13
 * @version 1.0.0
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
 * limitations under the License. *
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Node.js imports
import path from 'node:path';
import { promises as fs } from 'node:fs';

// matterbridge imports
import {
  Matterbridge,
  PlatformConfig,
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  bridgedNode,
  colorTemperatureLight,
  extendedColorLight,
  onOffOutlet,
  smokeCoAlarm,
  waterLeakDetector,
  waterFreezeDetector,
  contactSensor,
  powerSource,
} from 'matterbridge';
import { AnsiLogger, LogLevel, dn, idn, ign, nf, rs, wr, db, or, debugStringify, YELLOW, CYAN, hk, er } from 'matterbridge/logger';
import { deepEqual, isValidArray, isValidBoolean, isValidNumber, isValidString, waiter } from 'matterbridge/utils';
import { OnOff, BridgedDeviceBasicInformation, SmokeCoAlarm, PowerSource } from 'matterbridge/matter/clusters';
import { ClusterRegistry } from 'matterbridge/matter/types';

// Plugin imports
import { HassDevice, HassEntity, HassState, HomeAssistant, HassConfig as HassConfig, HomeAssistantPrimitive, HassServices, HassArea, HassLabel } from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';
import {
  hassCommandConverter,
  hassDomainAttributeConverter,
  hassDomainBinarySensorsConverter,
  hassDomainConverter,
  hassDomainSensorsConverter,
  hassSubscribeConverter,
  hassUpdateAttributeConverter,
  hassUpdateStateConverter,
} from './converters.js';

/**
 * HomeAssistantPlatform class extends the MatterbridgeDynamicPlatform class.
 * It initializes the Home Assistant connection, fetches data, subscribes to events,
 * and creates Matterbridge devices based on Home Assistant entities and devices.
 * It also handles updates from Home Assistant and converts them to Matterbridge commands.
 */
export class HomeAssistantPlatform extends MatterbridgeDynamicPlatform {
  /** Home Assistant instance */
  ha: HomeAssistant;

  /** Convert the label filter in the config from name to label_id */
  labelIdFilter: string = '';

  /** Bridged devices map with key (without the postfix) device.id for devices and entity.entity_id for individual entities */
  matterbridgeDevices = new Map<string, MatterbridgeEndpoint>();

  /**
   * Constructor for the HomeAssistantPlatform class.
   * It initializes the platform, verifies the Matterbridge version, and sets up the Home Assistant connection.
   *
   * @param {Matterbridge} matterbridge - The Matterbridge instance.
   * @param {AnsiLogger} log - The logger instance.
   * @param {PlatformConfig} config - The platform configuration.
   */
  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.0.6')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.0.6". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info(`Initializing platform: ${CYAN}${this.config.name}${nf} version: ${CYAN}${this.config.version}${rs}`);

    if (!isValidString(config.host, 1) || !isValidString(config.token, 1)) {
      throw new Error('Host and token must be defined in the configuration');
    }

    this.config.namePostfix = isValidString(this.config.namePostfix, 1, 3) ? this.config.namePostfix : '';
    this.config.postfix = isValidString(this.config.postfix, 1, 3) ? this.config.postfix : '';
    this.config.reconnectTimeout = isValidNumber(config.reconnectTimeout, 30) ? config.reconnectTimeout : undefined;
    this.config.reconnectRetries = isValidNumber(config.reconnectRetries, 0) ? config.reconnectRetries : undefined;
    this.config.certificatePath = isValidString(config.certificatePath, 1) ? config.certificatePath : undefined;
    this.config.rejectUnauthorized = isValidBoolean(config.rejectUnauthorized) ? config.rejectUnauthorized : undefined;
    if (config.individualEntityWhiteList) delete config.individualEntityWhiteList;
    if (config.individualEntityBlackList) delete config.individualEntityBlackList;

    this.ha = new HomeAssistant(
      config.host,
      config.token,
      config.reconnectTimeout as number | undefined,
      config.reconnectRetries as number | undefined,
      config.certificatePath as string | undefined,
      config.rejectUnauthorized as boolean | undefined,
    );

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
        const subscriptionId = await this.ha.subscribe();
        this.log.info(`Subscribed to Home Assistant events successfully with id ${subscriptionId}`);
      } catch (error) {
        this.log.error(`Error subscribing to Home Assistant events: ${error}`);
      }
    });

    this.ha.on('disconnected', () => {
      this.log.warn('Disconnected from Home Assistant');
    });

    this.ha.on('error', (error: string) => {
      this.log.error(`Error from Home Assistant: ${error}`);
    });

    this.ha.on('subscribed', () => {
      this.log.info(`Subscribed to Home Assistant events`);
    });

    this.ha.on('config', (_config: HassConfig) => {
      this.log.info('Configuration received from Home Assistant');
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
    await fs.mkdir(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-hass'), { recursive: true });

    // Wait for Home Assistant to be connected and fetch devices and entities and subscribe events
    this.log.info(`Connecting to Home Assistant at ${CYAN}${this.config.host}${nf}...`);
    try {
      await this.ha.connect();
      this.log.info(`Connected to Home Assistant at ${CYAN}${this.config.host}${nf}`);
    } catch (error) {
      this.log.error(`Error connecting to Home Assistant: ${error}`);
    }
    const check = () => {
      return this.ha.connected && this.ha.hassConfig !== null && this.ha.hassServices !== null;
    };
    await waiter('Home Assistant connected', check, true, 30000, 1000); // Wait for 30 seconds with 1 second interval and throw error if not connected

    // Save devices, entities, states, config and services to a local file without awaiting
    this.savePayload(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-hass', 'homeassistant.json'));

    // Clean the selectDevice and selectEntity maps
    await this.ready;
    await this.clearSelect();

    // Scan individual entities (domain automation, scene, script and helpers input_boolean) and create Matterbridge devices
    for (const entity of Array.from(this.ha.hassEntities.values())) {
      const [domain, name] = entity.entity_id.split('.');
      if (entity.platform === 'template') {
        if (domain !== 'switch') continue;
      } else {
        if (!['automation', 'scene', 'script', 'input_boolean', 'input_button'].includes(domain)) continue;
      }
      if (entity.device_id !== null) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db} is a device entity. Skipping...`);
        continue;
      }
      const entityName = entity.name ?? entity.original_name;
      if (!isValidString(entityName, 1)) {
        this.log.debug(`Individual entity ${CYAN}${entity.entity_id}${db} has no valid name. Skipping...`);
        continue;
      }
      this.setSelectDevice(entity.id, entityName, undefined, 'hub');
      this.setSelectEntity(entityName, entity.entity_id, 'hub');
      if (!this.validateDevice([entityName, entity.entity_id, entity.id], true)) continue;
      if (this.hasDeviceName(entityName)) {
        this.log.warn(`Individual entity ${CYAN}${entityName}${wr} already exists as a registered device. Please change the name in Home Assistant`);
        continue;
      }
      if (!this.isValidAreaLabel(entity.area_id, entity.labels)) {
        this.log.debug(
          `Individual entity ${CYAN}${entityName}${db} is not in the area "${CYAN}${this.config.filterByArea}${db}" or doesn't have the label "${CYAN}${this.config.filterByLabel}${db}". Skipping...`,
        );
        continue;
      }

      this.log.info(`Creating device for individual entity ${idn}${entityName}${rs}${nf} domain ${CYAN}${domain}${nf} name ${CYAN}${name}${nf}`);
      // Create a Mutable device with bridgedNode and the BridgedDeviceBasicInformationCluster
      const mutableDevice = new MutableDevice(
        this.matterbridge,
        entityName + (isValidString(this.config.namePostfix, 1, 3) ? ' ' + this.config.namePostfix : ''),
        isValidString(this.config.postfix, 1, 3) ? entity.id.slice(0, 32 - this.config.postfix.length) + this.config.postfix : entity.id.slice(0, 32),
        0xfff1,
        'HomeAssistant',
        domain,
      );
      mutableDevice.addDeviceTypes('', bridgedNode);
      if (domain === 'automation') mutableDevice.composedType = `Hass Automation`;
      else if (domain === 'scene') mutableDevice.composedType = `Hass Scene`;
      else if (domain === 'script') mutableDevice.composedType = `Hass Script`;
      else if (domain === 'input_boolean') mutableDevice.composedType = `Hass Boolean`;
      else if (domain === 'input_button') mutableDevice.composedType = `Hass Button`;
      else if (domain === 'switch') mutableDevice.composedType = `Hass Template`;
      const matterbridgeDevice = await mutableDevice.createMainEndpoint();
      if (domain === 'automation')
        matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/automation/dashboard`;
      else if (domain === 'scene')
        matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/scene/dashboard`;
      else if (domain === 'script')
        matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/script/dashboard`;
      else matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`;
      await mutableDevice.createClusters('');

      // Create the child endpoint with onOffOutlet and the OnOffCluster
      mutableDevice.addDeviceTypes(entity.entity_id, onOffOutlet);
      mutableDevice.setFriendlyName(entity.entity_id, entityName);
      const child = await mutableDevice.createChildEndpoint(entity.entity_id);
      await mutableDevice.createClusters(entity.entity_id);
      child.addCommandHandler('on', async () => {
        if (domain === 'automation') {
          await this.ha.callService(domain, 'trigger', entity.entity_id);
        } else if (domain === 'input_button') {
          await this.ha.callService(domain, 'press', entity.entity_id);
        } else {
          await this.ha.callService(domain, 'turn_on', entity.entity_id);
        }
        if (domain !== 'input_boolean' && domain !== 'switch') {
          // We revert the state after 500ms except for input_boolean and switch template
          setTimeout(() => {
            child.setAttribute(OnOff.Cluster.id, 'onOff', false, child.log);
          }, 500);
        }
      });
      child.addCommandHandler('off', async () => {
        // We don't revert only for input_boolean and switch template
        if (domain === 'input_boolean' || domain === 'switch') await this.ha.callService(domain, 'turn_off', entity.entity_id);
      });

      this.log.debug(`Registering device ${dn}${entityName}${db}...`);
      mutableDevice.logMutableDevice();
      await this.registerDevice(mutableDevice.getEndpoint());
      this.matterbridgeDevices.set(entity.entity_id, mutableDevice.getEndpoint());
    } // End of individual entities scan

    // Scan devices and entities and create Matterbridge devices
    for (const device of Array.from(this.ha.hassDevices.values())) {
      const deviceName = device.name_by_user ?? device.name;
      const entitiesCount = Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id).length;
      if (device.entry_type === 'service') {
        this.log.debug(`Device ${CYAN}${deviceName}${db} is a service. Skipping...`);
        continue;
      }
      if (!isValidString(deviceName, 1)) {
        this.log.debug(`Device ${CYAN}${deviceName}${db} has not valid name. Skipping...`);
        continue;
      }
      if (entitiesCount === 0) {
        this.log.debug(`Device ${CYAN}${deviceName}${db} has no entities. Skipping...`);
        continue;
      }
      this.setSelectDevice(device.id, deviceName, undefined, 'hub');
      if (!this.validateDevice([deviceName, device.id], true)) continue;
      if (this.hasDeviceName(deviceName)) {
        this.log.warn(`Device ${CYAN}${deviceName}${wr} already exists as a registered device. Please change the name in Home Assistant`);
        continue;
      }
      if (!this.isValidAreaLabel(device.area_id, device.labels)) {
        this.log.debug(
          `Device ${CYAN}${deviceName}${db} is not in the area "${CYAN}${this.config.filterByArea}${db}" or doesn't have the label "${CYAN}${this.config.filterByLabel}${db}". Skipping...`,
        );
        continue;
      }
      this.log.info(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
      // this.log.debug(`Lookup device ${CYAN}${device.name}${db} id ${CYAN}${device.id}${db}`);

      // Create a Mutable device
      const mutableDevice = new MutableDevice(
        this.matterbridge,
        deviceName + (isValidString(this.config.namePostfix, 1, 3) ? ' ' + this.config.namePostfix : ''),
        isValidString(this.config.postfix, 1, 3) ? device.id.slice(0, 32 - this.config.postfix.length) + this.config.postfix : device.id.slice(0, 32),
        0xfff1,
        'HomeAssistant',
        device.model ?? 'Unknown',
      );
      mutableDevice.addDeviceTypes('', bridgedNode);
      mutableDevice.composedType = 'Hass Device';
      const matterbridgeDevice = await mutableDevice.createMainEndpoint();
      matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/devices/device/${device.id}`;
      await mutableDevice.createClusters('');

      // Scan entities that belong to this device for supported domains and services and add them to the Matterbridge device
      for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id)) {
        this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db}`);
        const domain = entity.entity_id.split('.')[0];

        // Get the device state. If the entity is disabled, it doesn't have a state, we skip it.
        const hassState = this.ha.hassStates.get(entity.entity_id);
        if (!hassState) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db} disabled by ${entity.disabled_by}: state not found. Skipping...`);
          continue;
        }

        // Check if the entity is in the area and has the label if applyFiltersToDeviceEntities is enabled
        if (this.config.applyFiltersToDeviceEntities && !this.isValidAreaLabel(entity.area_id, entity.labels)) {
          this.log.debug(
            `Device ${CYAN}${deviceName}${db} entity ${CYAN}${entity.entity_id}${db} is not in the area "${CYAN}${this.config.filterByArea}${db}" or doesn't have the label "${CYAN}${this.config.filterByLabel}${db}". Skipping...`,
          );
          continue;
        }

        // Add device type and clusterIds for supported domains of the current entity. Skip the entity if no supported domains are found.
        const hassDomains = hassDomainConverter.filter((d) => d.domain === domain);
        if (hassDomains.length > 0) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} domain ${CYAN}${CYAN}${domain}${db} entity ${CYAN}${entity.entity_id}${db}`);
          const entityName = entity.name ?? entity.original_name ?? deviceName;
          this.setSelectDeviceEntity(device.id, entity.entity_id, entityName, 'component');
          this.setSelectEntity(entityName, entity.entity_id, 'component');
          if (!this.validateEntity(deviceName, entity.entity_id, true)) continue;
          hassDomains.forEach((hassDomain) => {
            if (hassDomain.deviceType) mutableDevice.addDeviceTypes(entity.entity_id, hassDomain.deviceType);
            if (hassDomain.clusterId) mutableDevice.addClusterServerIds(entity.entity_id, hassDomain.clusterId);
            if (hassDomain.deviceType && isValidString(hassState.attributes['friendly_name']))
              mutableDevice.setFriendlyName(entity.entity_id, hassState.attributes['friendly_name']);
          });
        } else {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} domain ${CYAN}${CYAN}${domain}${db} entity ${CYAN}${entity.entity_id}${db}: domain not found`);
          continue;
        }

        // Add device types and clusterIds for supported attributes of the current entity state
        this.log.debug(`- state ${debugStringify(hassState)}`);

        // Look for supported attributes of the current entity
        for (const [key, value] of Object.entries(hassState.attributes)) {
          this.log.debug(`- attribute ${CYAN}${key}${db} value ${typeof value === 'object' && value ? debugStringify(value) : value}`);
          hassDomainAttributeConverter
            .filter((d) => d.domain === domain && d.withAttribute === key)
            .forEach((hassDomainAttribute) => {
              this.log.debug(
                `+ attribute device ${CYAN}${hassDomainAttribute.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomainAttribute.clusterId)?.name}${db}`,
              );
              mutableDevice.addDeviceTypes(entity.entity_id, hassDomainAttribute.deviceType);
              mutableDevice.addClusterServerIds(entity.entity_id, hassDomainAttribute.clusterId);
            });
        }

        // Look for supported sensors of the current entity
        hassDomainSensorsConverter
          .filter((d) => d.domain === domain)
          .forEach((hassDomainSensor) => {
            this.log.debug(`- sensor ${CYAN}${hassDomainSensor.domain}${db} stateClass ${hassDomainSensor.withStateClass} deviceClass ${hassDomainSensor.withDeviceClass}`);
            if (hassState.attributes['state_class'] === hassDomainSensor.withStateClass && hassState.attributes['device_class'] === hassDomainSensor.withDeviceClass) {
              this.log.debug(`+ sensor device ${CYAN}${hassDomainSensor.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomainSensor.clusterId)?.name}${db}`);
              mutableDevice.addDeviceTypes(entity.entity_id, hassDomainSensor.deviceType);
              mutableDevice.addClusterServerIds(entity.entity_id, hassDomainSensor.clusterId);
              if (isValidString(hassState.attributes['friendly_name'])) mutableDevice.setFriendlyName(entity.entity_id, hassState.attributes['friendly_name']);
            }
          });

        // Look for supported binary_sensors of the current entity
        hassDomainBinarySensorsConverter
          .filter((d) => d.domain === domain)
          .forEach((hassDomainBinarySensor) => {
            this.log.debug(`- binary_sensor ${CYAN}${hassDomainBinarySensor.domain}${db} deviceClass ${hassDomainBinarySensor.withDeviceClass}`);
            if (hassState.attributes['device_class'] === hassDomainBinarySensor.withDeviceClass) {
              this.log.debug(
                `+ binary_sensor device ${CYAN}${hassDomainBinarySensor.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomainBinarySensor.clusterId)?.name}${db}`,
              );
              mutableDevice.addDeviceTypes(entity.entity_id, hassDomainBinarySensor.deviceType);
              mutableDevice.addClusterServerIds(entity.entity_id, hassDomainBinarySensor.clusterId);
              if (isValidString(hassState.attributes['friendly_name'])) mutableDevice.setFriendlyName(entity.entity_id, hassState.attributes['friendly_name']);
            }
          });

        // Create a child endpoint for the entity if we found supported domains and attributes
        if (!mutableDevice.has(entity.entity_id)) continue;
        this.log.info(`Creating endpoint ${CYAN}${entity.entity_id}${nf} for device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
        const child = await mutableDevice.createChildEndpoint(entity.entity_id);

        // For some clusters we need to set the features and to set the default values for the fixed attributes
        const deviceTypeCodes = mutableDevice.get(entity.entity_id).deviceTypes.map((d) => d.code);

        // Special case for powerSource.
        if (deviceTypeCodes.includes(powerSource.code)) {
          this.log.debug(`= powerSource battery device ${CYAN}${entity.entity_id}${db} state ${CYAN}${hassState.state}${db}`);
          mutableDevice.addClusterServerPowerSource(entity.entity_id, PowerSource.BatChargeLevel.Ok, 200);
        }

        // Special case for binary_sensor domain: configure the BooleanState cluster default values for contactSensor.
        if (domain === 'binary_sensor' && deviceTypeCodes.includes(contactSensor.code)) {
          this.log.debug(`= contactSensor device ${CYAN}${entity.entity_id}${db} state ${CYAN}${hassState.state}${db}`);
          mutableDevice.addClusterServerBooleanState(entity.entity_id, hassState.state === 'on' ? false : true);
        }

        // Special case for binary_sensor domain: configure the BooleanState cluster default value for waterLeakDetector/waterFreezeDetector.
        if (domain === 'binary_sensor' && (deviceTypeCodes.includes(waterLeakDetector.code) || deviceTypeCodes.includes(waterFreezeDetector.code))) {
          this.log.debug(`= waterLeakDetector/waterFreezeDetector device ${CYAN}${entity.entity_id}${db} state ${CYAN}${hassState.state}${db}`);
          mutableDevice.addClusterServerBooleanState(entity.entity_id, hassState.state === 'on' ? true : false);
        }

        // Special case for binary_sensor domain: configure the SmokeCoAlarm cluster default values with feature SmokeAlarm for device_class smoke.
        if (domain === 'binary_sensor' && hassState.attributes.device_class === 'smoke' && mutableDevice.get(entity.entity_id).deviceTypes[0].code === smokeCoAlarm.code) {
          this.log.debug(`= smokeCoAlarm SmokeAlarm device ${CYAN}${entity.entity_id}${db} state ${CYAN}${hassState.state}${db}`);
          mutableDevice.addClusterServerSmokeAlarmSmokeCoAlarm(entity.entity_id, hassState.state === 'on' ? SmokeCoAlarm.AlarmState.Critical : SmokeCoAlarm.AlarmState.Normal);
        }

        // Special case for binary_sensor domain: configure the SmokeCoAlarm cluster default values with feature CoAlarm for device_class carbon_monoxide.
        if (
          domain === 'binary_sensor' &&
          hassState.attributes.device_class === 'carbon_monoxide' &&
          mutableDevice.get(entity.entity_id).deviceTypes[0].code === smokeCoAlarm.code
        ) {
          this.log.debug(`= smokeCoAlarm CoAlarm device ${CYAN}${entity.entity_id}${db} state ${CYAN}${hassState.state}${db}`);
          mutableDevice.addClusterServerCoAlarmSmokeCoAlarm(entity.entity_id, hassState.state === 'on' ? SmokeCoAlarm.AlarmState.Critical : SmokeCoAlarm.AlarmState.Normal);
        }

        // Special case for light domain: configure the ColorControl cluster default values. Real values will be updated by the configure with the Home Assistant states. Here we need the fixed attributes to be set.
        if (domain === 'light' && (deviceTypeCodes.includes(colorTemperatureLight.code) || deviceTypeCodes.includes(extendedColorLight.code))) {
          this.log.debug(
            `= colorControl device ${CYAN}${entity.entity_id}${db} supported_color_modes: ${CYAN}${hassState.attributes['supported_color_modes']}${db} min_mireds: ${CYAN}${hassState.attributes['min_mireds']}${db} max_mireds: ${CYAN}${hassState.attributes['max_mireds']}${db}`,
          );
          if (
            isValidArray(hassState.attributes['supported_color_modes']) &&
            !hassState.attributes['supported_color_modes'].includes('xy') &&
            !hassState.attributes['supported_color_modes'].includes('hs') &&
            !hassState.attributes['supported_color_modes'].includes('rgb') &&
            !hassState.attributes['supported_color_modes'].includes('rgbw') &&
            !hassState.attributes['supported_color_modes'].includes('rgbww') &&
            hassState.attributes['supported_color_modes'].includes('color_temp')
          ) {
            mutableDevice.addClusterServerColorTemperatureColorControl(
              entity.entity_id,
              hassState.attributes['color_temp'] ?? 250,
              hassState.attributes['min_mireds'] ?? 147,
              hassState.attributes['max_mireds'] ?? 500,
            );
          } else {
            mutableDevice.addClusterServerColorControl(
              entity.entity_id,
              hassState.attributes['color_temp'] ?? 250,
              hassState.attributes['min_mireds'] ?? 147,
              hassState.attributes['max_mireds'] ?? 500,
            );
          }
        }

        // Special case for climate domain: configure the Thermostat cluster default values and features. Real values will be updated by the configure with the Home Assistant states. Here we need the fixed attributes to be set.
        if (domain === 'climate') {
          if (isValidArray(hassState?.attributes['hvac_modes']) && hassState.attributes['hvac_modes'].includes('heat_cool')) {
            this.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${hassState.attributes['hvac_modes']}${db}`);
            mutableDevice.addClusterServerAutoModeThermostat(
              entity.entity_id,
              hassState.attributes['current_temperature'] ?? 23,
              hassState.attributes['target_temp_low'] ?? 21,
              hassState.attributes['target_temp_high'] ?? 25,
              hassState.attributes['min_temp'] ?? 0,
              hassState.attributes['max_temp'] ?? 50,
            );
          } else if (
            isValidArray(hassState?.attributes['hvac_modes']) &&
            hassState.attributes['hvac_modes'].includes('heat') &&
            !hassState.attributes['hvac_modes'].includes('cool')
          ) {
            this.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${hassState.attributes['hvac_modes']}${db}`);
            mutableDevice.addClusterServerHeatingThermostat(
              entity.entity_id,
              hassState.attributes['current_temperature'] ?? 23,
              hassState.attributes['temperature'] ?? 21,
              hassState.attributes['min_temp'] ?? 0,
              hassState.attributes['max_temp'] ?? 50,
            );
          } else if (
            isValidArray(hassState?.attributes['hvac_modes']) &&
            hassState.attributes['hvac_modes'].includes('cool') &&
            !hassState.attributes['hvac_modes'].includes('heat')
          ) {
            this.log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${hassState.attributes['hvac_modes']}${db}`);
            mutableDevice.addClusterServerCoolingThermostat(
              entity.entity_id,
              hassState.attributes['current_temperature'] ?? 23,
              hassState.attributes['temperature'] ?? 21,
              hassState.attributes['min_temp'] ?? 0,
              hassState.attributes['max_temp'] ?? 50,
            );
          }
        }

        // Add all the clusters to the child endpoint
        await mutableDevice.createClusters(entity.entity_id);

        // Add Matter command handlers to the child endpoint for supported domains and services
        const hassCommands = hassCommandConverter.filter((c) => c.domain === domain);
        if (hassCommands.length > 0) {
          hassCommands.forEach((hassCommand) => {
            this.log.debug(`- command: ${CYAN}${hassCommand.command}${db}`);
            child.addCommandHandler(hassCommand.command, async (data) => {
              this.commandHandler(matterbridgeDevice, data.endpoint, data.request, data.attributes, hassCommand.command);
            });
          });
        }

        // Subscribe to the Matter writable attributes
        const hassSubscribed = hassSubscribeConverter.filter((s) => s.domain === domain);
        if (hassSubscribed.length > 0) {
          for (const hassSubscribe of hassSubscribed) {
            const check = child.hasAttributeServer(hassSubscribe.clusterId, hassSubscribe.attribute);
            this.log.debug(`- subscribe: ${CYAN}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${CYAN}${hassSubscribe.attribute}${db} check ${CYAN}${check}${db}`);
            if (!check) continue;
            child.subscribeAttribute(
              hassSubscribe.clusterId,
              hassSubscribe.attribute,
              (newValue: any, oldValue: any, context) => {
                if (context && context.offline === true) {
                  matterbridgeDevice?.log.debug(
                    `Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} ` +
                      `on endpoint ${or}${child?.maybeId}${db}:${or}${child?.maybeNumber}${db} changed for an offline update`,
                  );
                  return; // Skip offline updates
                }
                if ((typeof newValue !== 'object' && newValue === oldValue) || (typeof newValue === 'object' && deepEqual(newValue, oldValue))) {
                  matterbridgeDevice?.log.debug(
                    `Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} ` +
                      `on endpoint ${or}${child?.maybeId}${db}:${or}${child?.maybeNumber}${db} not changed`,
                  );
                  return;
                }
                matterbridgeDevice?.log.info(
                  `${db}Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} on endpoint ${or}${child?.maybeId}${db}:${or}${child?.maybeNumber}${db} ` +
                    `changed from ${YELLOW}${typeof oldValue === 'object' ? debugStringify(oldValue) : oldValue}${db} to ${YELLOW}${typeof newValue === 'object' ? debugStringify(newValue) : newValue}${db}`,
                );
                const value = hassSubscribe.converter ? hassSubscribe.converter(newValue) : newValue;
                matterbridgeDevice?.log.debug(
                  `Converter(${hassSubscribe.converter !== undefined}): ${typeof newValue === 'object' ? debugStringify(newValue) : newValue} => ${typeof value === 'object' ? debugStringify(value) : value}`,
                );
                if (value !== null) this.ha.callService(domain, hassSubscribe.service, entity.entity_id, { [hassSubscribe.with]: value });
                else this.ha.callService(domain, 'turn_off', entity.entity_id);
              },
              child.log,
            );
          }
        }
      } // hassEntities

      // Register the device if we have found supported domains and entities
      if (matterbridgeDevice && matterbridgeDevice.getChildEndpoints().length > 0) {
        this.log.debug(`Registering device ${dn}${device.name}${db}...`);
        mutableDevice.logMutableDevice();
        await this.registerDevice(mutableDevice.getEndpoint());
        this.matterbridgeDevices.set(device.id, mutableDevice.getEndpoint());
      } else {
        this.log.debug(`Device ${CYAN}${device.name}${db} has no supported entities. Deleting device select...`);
        this.clearDeviceSelect(device.id);
      }
    } // hassDevices
  }

  override async onConfigure() {
    await super.onConfigure();
    this.log.info(`Configuring platform ${idn}${this.config.name}${rs}${nf}...`);
    try {
      for (const state of Array.from(this.ha.hassStates.values())) {
        const entity = this.ha.hassEntities.get(state.entity_id);
        const deviceId = entity?.device_id;
        if (deviceId) {
          this.log.debug(`Configuring state ${CYAN}${state.entity_id}${db} for device ${CYAN}${deviceId}${db}`);
          this.updateHandler(deviceId, state.entity_id, state, state);
        } else {
          this.log.debug(`Configuring state on individual entity ${CYAN}${state.entity_id}${db}`);
          this.updateHandler(null, state.entity_id, state, state);
        }
      }
      this.log.info(`Configured platform ${idn}${this.config.name}${rs}${nf}`);
    } catch (error) {
      this.log.error(`Error configuring platform ${idn}${this.config.name}${rs}${er}: ${error}`);
    }
  }

  override async onChangeLoggerLevel(logLevel: LogLevel) {
    this.log.info(`Logger level changed to ${logLevel}`);
    for (const device of this.matterbridgeDevices.values()) {
      device.log.logLevel = logLevel;
    }
  }

  override async onShutdown(reason?: string) {
    await super.onShutdown(reason);
    this.log.info(`Shutting down platform ${idn}${this.config.name}${rs}${nf}: ${reason ?? ''}`);

    try {
      await this.ha.close();
      this.log.info('Home Assistant connection closed');
    } catch (error) {
      this.log.error(`Error closing Home Assistant connection: ${error}`);
    }
    this.ha.removeAllListeners();

    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();

    this.matterbridgeDevices.clear();
  }

  async commandHandler(mbDevice: MatterbridgeEndpoint | undefined, endpoint: MatterbridgeEndpoint, request: Record<string, any>, attributes: Record<string, any>, command: string) {
    if (!mbDevice) {
      this.log.error(`Command handler: Matterbridge device not found`);
      return;
    }
    mbDevice.log.info(
      `${db}Received matter command ${ign}${command}${rs}${db} from device ${idn}${mbDevice?.deviceName}${rs}${db} for endpoint ${or}${endpoint?.id}:${endpoint?.number}${db}`,
    );
    const entityId = endpoint?.number ? mbDevice.getChildEndpoint(endpoint.number)?.uniqueStorageKey : undefined;
    if (!entityId) return;
    const domain = entityId.split('.')[0];
    const hassCommand = hassCommandConverter.find((cvt) => cvt.command === command && cvt.domain === domain);
    if (hassCommand) {
      // console.log('Command:', command, 'Domain:', domain, 'HassCommand:', hassCommand, 'Request:', request, 'Attributes:', attributes);
      const serviceAttributes: Record<string, HomeAssistantPrimitive> = hassCommand.converter ? hassCommand.converter(request, attributes) : undefined;
      await this.ha.callService(hassCommand.domain, hassCommand.service, entityId, serviceAttributes);
    } else {
      mbDevice.log.warn(`Command ${ign}${command}${rs}${wr} not supported for domain ${CYAN}${domain}${wr} entity ${CYAN}${entityId}${wr}`);
    }
  }

  /*
  subscribeHandler(
    child: MatterbridgeEndpoint,
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
    // Skip offline updates and unchanged values
    if (context.offline === true || (typeof newValue !== 'object' && newValue === oldValue) || (typeof newValue === 'object' && deepEqual(newValue, oldValue))) return;
    child.log.info(
      `${db}Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} on endpoint ${or}${child.maybeId}${db}:${or}${child.maybeNumber}${db} ` +
        `changed from ${YELLOW}${typeof oldValue === 'object' ? debugStringify(oldValue) : oldValue}${db} to ${YELLOW}${typeof newValue === 'object' ? debugStringify(newValue) : newValue}${db}`,
    );
    const value = hassSubscribe.converter ? hassSubscribe.converter(newValue) : newValue;
    if (value !== null) this.ha.callService(hassSubscribe.domain, 'turn_on', entity.entity_id, { [hassSubscribe.with]: value });
    else this.ha.callService(hassSubscribe.domain, 'turn_off', entity.entity_id);
    child.log.debug(
      `*Converter(${hassSubscribe.converter !== undefined}): ${typeof newValue === 'object' ? debugStringify(newValue) : newValue} => ${typeof value === 'object' ? debugStringify(value) : value}`,
    );
  }
  */

  async updateHandler(deviceId: string | null, entityId: string, old_state: HassState, new_state: HassState) {
    const matterbridgeDevice = this.matterbridgeDevices.get(deviceId ?? entityId);
    if (!matterbridgeDevice) {
      this.log.debug(`Update handler: Matterbridge device ${deviceId} for ${entityId} not found`);
      return;
    }
    const endpoint = matterbridgeDevice.getChildEndpointByName(entityId) || matterbridgeDevice.getChildEndpointByName(entityId.replaceAll('.', ''));
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
      // Update sensors of the device
      const hassSensorConverter = hassDomainSensorsConverter.find(
        (s) => s.domain === domain && s.withStateClass === new_state.attributes['state_class'] && s.withDeviceClass === new_state.attributes['device_class'],
      );
      if (hassSensorConverter) {
        const convertedValue = hassSensorConverter.converter(parseFloat(new_state.state));
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
    } else {
      // Update state of the device
      const hassUpdateState = hassUpdateStateConverter.find((updateState) => updateState.domain === domain && updateState.state === new_state.state);
      if (hassUpdateState) {
        await endpoint.setAttribute(hassUpdateState.clusterId, hassUpdateState.attribute, hassUpdateState.value, matterbridgeDevice.log);
      } else {
        endpoint.log.warn(`Update state ${CYAN}${domain}${wr}:${CYAN}${new_state.state}${wr} not supported for entity ${entityId}`);
      }
      // Some devices wrongly update attributes even if the state is off. Provisionally we will skip the update of attributes in this case.
      if (new_state.state === 'off') {
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
  private savePayload(filename: string) {
    const payload = {
      devices: Array.from(this.ha.hassDevices.values()),
      entities: Array.from(this.ha.hassEntities.values()),
      areas: Array.from(this.ha.hassAreas.values()),
      labels: Array.from(this.ha.hassLabels.values()),
      states: Array.from(this.ha.hassStates.values()),
      config: this.ha.hassConfig,
      services: this.ha.hassServices,
    };
    fs.writeFile(filename, JSON.stringify(payload, null, 2))
      .then(() => {
        this.log.debug(`Payload successfully written to ${filename}`);
        return;
      })
      .catch((error) => {
        this.log.error(`Error writing payload to file ${filename}: ${error}`);
      });
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
}
