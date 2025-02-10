/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * This file contains the class HomeAssistantPlatform.
 *
 * @file src\platform.ts
 * @author Luca Liguori
 * @date 2024-09-13
 * @version 0.0.3
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

import {
  bridgedNode,
  colorTemperatureLight,
  Matterbridge,
  MatterbridgeColorControlServer,
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  MatterbridgeThermostatServer,
  onOffOutlet,
  PlatformConfig,
} from 'matterbridge';
import { AnsiLogger, LogLevel, dn, idn, ign, nf, rs, wr, db, or, debugStringify, YELLOW, CYAN, hk } from 'matterbridge/logger';
import { deepEqual, isValidArray, isValidString, waiter } from 'matterbridge/utils';
import { NodeStorage, NodeStorageManager } from 'matterbridge/storage';

import { Thermostat, OnOff, ColorControl } from 'matterbridge/matter/clusters';
import { ClusterRegistry } from 'matterbridge/matter/types';

import path from 'path';
import { promises as fs } from 'fs';

import { HassDevice, HassEntity, HassState, HomeAssistant, HassConfig as HassConfig, HomeAssistantPrimitive, HassServices } from './homeAssistant.js';
import { MutableDevice, getClusterServerObj } from './mutableDevice.js';
import {
  hassCommandConverter,
  hassDomainAttributeConverter,
  hassDomainConverter,
  hassDomainSensorsConverter,
  hassSubscribeConverter,
  hassUpdateAttributeConverter,
  hassUpdateStateConverter,
} from './converters.js';

export class HomeAssistantPlatform extends MatterbridgeDynamicPlatform {
  // NodeStorageManager
  nodeStorageManager?: NodeStorageManager;
  nodeStorage?: NodeStorage;

  // Home Assistant
  ha: HomeAssistant;

  // Matterbridge devices
  matterbridgeDevices = new Map<string, MatterbridgeEndpoint>(); // Without the postfix
  bridgedHassDevices = new Map<string, HassDevice>(); // Only the bridged devices from Home Assistant
  bridgedHassEntities = new Map<string, HassEntity>(); // Only the bridged individual entities from Home Assistant

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('2.1.4')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "2.1.4". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info(`Initializing platform: ${CYAN}${this.config.name}${nf} version: ${CYAN}${this.config.version}${rs}`);

    if (!isValidString(config.host, 1) || !isValidString(config.token, 1)) {
      throw new Error('Host and token must be defined in the configuration');
    }

    this.ha = new HomeAssistant(config.host, config.token);

    this.ha.on('connected', (ha_version: HomeAssistantPrimitive) => {
      this.log.notice(`Connected to Home Assistant ${ha_version}`);
    });

    this.ha.on('disconnected', () => {
      this.log.warn('Disconnected from Home Assistant');
    });

    this.ha.on('subscribed', () => {
      this.log.info(`Subscribed to Home Assistant events`);
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.ha.on('config', (config: HassConfig) => {
      this.log.info('Configuration received from Home Assistant');
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.ha.on('services', (services: HassServices) => {
      this.log.info('Services received from Home Assistant');
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.ha.on('devices', (devices: HassDevice[]) => {
      this.log.info('Devices received from Home Assistant');
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.ha.on('entities', (entities: HassEntity[]) => {
      this.log.info('Entities received from Home Assistant');
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.ha.on('states', (states: HassState[]) => {
      this.log.info('States received from Home Assistant');
    });

    this.ha.on('event', this.updateHandler.bind(this));
  }

  override async onStart(reason?: string) {
    this.log.info(`Starting platform ${idn}${this.config.name}${rs}${nf}: ${reason ?? ''}`);

    // create NodeStorageManager
    this.nodeStorageManager = new NodeStorageManager({
      dir: path.join(this.matterbridge.matterbridgeDirectory, 'matterbridge-hass'),
      writeQueue: false,
      expiredInterval: undefined,
      logging: false,
      forgiveParseErrors: true,
    });
    this.nodeStorage = await this.nodeStorageManager.createStorage('devices');

    // Create the plugin directory inside the Matterbridge plugin directory
    await fs.mkdir(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-hass'), { recursive: true });

    // Wait for Home Assistant to be connected and fetch devices and entities and subscribe events
    await this.ha.connect();
    const check = () => {
      return this.ha.connected && this.ha.devicesReceived && this.ha.entitiesReceived && this.ha.subscribed;
    };
    await waiter('Home Assistant connected', check, true, 10000, 1000); // Wait for 10 seconds with 1 second interval and throw error if not connected

    // Save devices, entities, states, config and services to a local file
    const payload = {
      devices: Array.from(this.ha.hassDevices.values()),
      entities: Array.from(this.ha.hassEntities.values()),
      states: Array.from(this.ha.hassStates.values()),
      config: this.ha.hassConfig,
      services: this.ha.hassServices,
    };
    fs.writeFile(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-hass', 'homeassistant.json'), JSON.stringify(payload, null, 2))
      .then(() => {
        this.log.debug('Payload successfully written to homeassistant.json');
      })
      .catch((error) => {
        this.log.error('Error writing payload to file:', error);
      });

    // Scan individual entities (domain automation, scene, script and helpers input_boolean) and create Matterbridge devices
    for (const entity of Array.from(this.ha.hassEntities.values())) {
      const [domain, name] = entity.entity_id.split('.');
      if (!['automation', 'scene', 'script', 'input_boolean'].includes(domain)) continue;
      const entityName = entity.name ?? entity.original_name;
      if (!isValidString(entityName)) continue;
      if (entityName && this.selectEntity) this.selectEntity.set(entity.id, { name: entity.entity_id, description: entityName, icon: 'hub' });
      if (
        isValidArray(this.config.individualEntityWhiteList, 1) &&
        !this.config.individualEntityWhiteList.includes(entityName) &&
        !this.config.individualEntityWhiteList.includes(entity.entity_id)
      )
        continue;
      if (
        isValidArray(this.config.individualEntityBlackList, 1) &&
        (this.config.individualEntityBlackList.includes(entityName) || this.config.individualEntityBlackList.includes(entity.entity_id))
      )
        continue;
      if (this.hasDeviceName(entityName)) {
        this.log.warn(`Entity ${CYAN}${entityName}${nf} already exists as a registered device. Please change the name in Home Assistant`);
        continue;
      }

      this.log.info(`Creating device for individual entity ${idn}${entityName}${rs}${nf} domain ${CYAN}${domain}${nf} name ${CYAN}${name}${nf}`);
      // Create a Mutable device with bridgedNode and the BridgedDeviceBasicInformationCluster
      const mutableDevice = new MutableDevice(
        this.matterbridge,
        entityName + (isValidString(this.config.namePostfix, 1, 3) ? ' ' + this.config.namePostfix : ''),
        isValidString(this.config.serialPostfix, 1, 3) ? entity.id.slice(0, 29) + this.config.serialPostfix : entity.id,
        0xfff1,
        'HomeAssistant',
        domain,
      );
      mutableDevice.addDeviceTypes('', bridgedNode);
      mutableDevice.composedType = 'HomeAssistant';
      const matterbridgeDevice = await mutableDevice.createMainEndpoint();
      if (domain === 'automation') matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://')}/config/automation/dashboard`;
      else if (domain === 'scene') matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://')}/config/scene/dashboard`;
      else if (domain === 'script') matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://')}/config/script/dashboard`;
      else if (domain === 'input_boolean') matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://')}/config/helpers`;
      await mutableDevice.createClusters('');

      // Create the child endpoint with onOffOutlet and the OnOffCluster
      mutableDevice.addDeviceTypes(entity.entity_id, onOffOutlet);
      mutableDevice.setFriendlyName(entity.entity_id, entityName);
      const child = await mutableDevice.createChildEndpoint(entity.entity_id);
      await mutableDevice.createClusters(entity.entity_id);
      child.addCommandHandler('on', async () => {
        // child.setAttribute(OnOff.Cluster.id, 'onOff', true, child.log); // No need with behavior
        await this.ha.callService(domain, domain === 'automation' ? 'trigger' : 'turn_on', entity.entity_id);
        if (domain !== 'input_boolean') {
          // We revert the state after 500ms except for input_boolean
          setTimeout(() => {
            child.setAttribute(OnOff.Cluster.id, 'onOff', false, child.log);
          }, 500);
        }
      });
      child.addCommandHandler('off', async () => {
        // child.setAttribute(OnOff.Cluster.id, 'onOff', false, child.log); // No need with behavior
        // We update hass only for input_boolean
        if (domain === 'input_boolean') await this.ha.callService(domain, 'turn_off', entity.entity_id);
      });

      this.log.debug(`Registering device ${dn}${entityName}${db}...`);
      mutableDevice.logMutableDevice();
      await this.registerDevice(mutableDevice.getEndpoint());
      this.matterbridgeDevices.set(entity.entity_id, mutableDevice.getEndpoint());
      this.bridgedHassEntities.set(entity.entity_id, entity);
    }

    // Scan devices and entities and create Matterbridge devices
    for (const device of Array.from(this.ha.hassDevices.values())) {
      const deviceName = device.name_by_user ?? device.name;
      const entitiesCount = Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id).length;
      if (deviceName && entitiesCount > 0 && this.selectDevice) this.selectDevice.set(device.id, { serial: device.id, name: deviceName, icon: 'hub' });
      if (!isValidString(deviceName) || !this.validateDevice([deviceName, device.id], true)) continue;
      if (this.hasDeviceName(deviceName)) {
        this.log.warn(`Device ${CYAN}${deviceName}${nf} already exists as a registered device. Please change the name in Home Assistant`);
        continue;
      }
      this.log.info(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
      // this.log.debug(`Lookup device ${CYAN}${device.name}${db} id ${CYAN}${device.id}${db}`);

      // Create a Mutable device
      const mutableDevice = new MutableDevice(
        this.matterbridge,
        deviceName + (isValidString(this.config.namePostfix, 1, 3) ? ' ' + this.config.namePostfix : ''),
        isValidString(this.config.serialPostfix, 1, 3) ? device.id.slice(0, 29) + this.config.serialPostfix : device.id,
        0xfff1,
        'HomeAssistant',
        device.model ?? 'Unknown',
      );
      mutableDevice.addDeviceTypes('', bridgedNode);
      mutableDevice.composedType = 'HomeAssistant';
      const matterbridgeDevice = await mutableDevice.createMainEndpoint();
      matterbridgeDevice.configUrl = `${(this.config.host as string | undefined)?.replace('ws://', 'http://')}/config/devices/device/${device.id}`;

      // Scan entities for supported domains and services and add them to the Matterbridge device
      for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id)) {
        this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db}`);
        if (!this.validateEntity(deviceName, entity.entity_id, true)) continue;
        const domain = entity.entity_id.split('.')[0];

        // Get the device state
        const hassState = this.ha.hassStates.get(entity.entity_id);
        if (!hassState) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} entity ${CYAN}${entity.entity_id}${db}: state not found`);
          continue;
        }

        // Add device type and clusterIds for supported domains of the current entity. Skip the entity if no supported domains are found.
        const hassDomains = hassDomainConverter.filter((d) => d.domain === domain);
        if (hassDomains.length > 0) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} domain ${CYAN}${CYAN}${domain}${db} entity ${CYAN}${entity.entity_id}${db}`);
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

        // Look for supported attributes of the current entity state
        for (const [key, value] of Object.entries(hassState.attributes)) {
          this.log.debug(`- attribute ${CYAN}${key}${db} value ${typeof value === 'object' && value ? debugStringify(value) : value}`);
          const hassDomainAttributes = hassDomainAttributeConverter.filter((d) => d.domain === domain && d.with === key);
          hassDomainAttributes.forEach((hassDomainAttribute) => {
            this.log.debug(`+ attribute device ${CYAN}${hassDomainAttribute.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomainAttribute.clusterId)?.name}${db}`);
            mutableDevice.addDeviceTypes(entity.entity_id, hassDomainAttribute.deviceType);
            mutableDevice.addClusterServerIds(entity.entity_id, hassDomainAttribute.clusterId);
          });
        }

        // Look for supported sensors of the current entity state
        const hassDomainSensors = hassDomainSensorsConverter.filter((d) => d.domain === domain);
        hassDomainSensors.forEach((hassDomainSensor) => {
          this.log.debug(`- sensor ${CYAN}${hassDomainSensor.domain}${db} stateClass ${hassDomainSensor.withStateClass} deviceClass ${hassDomainSensor.withDeviceClass}`);
          if (hassState.attributes['state_class'] === hassDomainSensor.withStateClass && hassState.attributes['device_class'] === hassDomainSensor.withDeviceClass) {
            this.log.debug(`+ sensor device ${CYAN}${hassDomainSensor.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomainSensor.clusterId)?.name}${db}`);
            mutableDevice.addDeviceTypes(entity.entity_id, hassDomainSensor.deviceType);
            mutableDevice.addClusterServerIds(entity.entity_id, hassDomainSensor.clusterId);
            if (isValidString(hassState.attributes['friendly_name'])) mutableDevice.setFriendlyName(entity.entity_id, hassState.attributes['friendly_name']);
          }
        });

        // Create a child endpoint for the entity if we found supported domains and attributes
        if (!mutableDevice.has(entity.entity_id)) continue;
        this.log.info(`Creating endpoint ${CYAN}${entity.entity_id}${nf} for device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
        const child = await mutableDevice.createChildEndpoint(entity.entity_id);

        // Special case for light domain: configure the color control cluster
        if (domain === 'light' && mutableDevice.get(entity.entity_id).deviceTypes[0] === colorTemperatureLight) {
          if (
            isValidArray(hassState.attributes['supported_color_modes']) &&
            !hassState.attributes['supported_color_modes'].includes('xy') &&
            !hassState.attributes['supported_color_modes'].includes('hs') &&
            !hassState.attributes['supported_color_modes'].includes('rgb') &&
            hassState.attributes['supported_color_modes'].includes('color_temp')
          ) {
            mutableDevice.addClusterServerObjs(
              entity.entity_id,
              getClusterServerObj(ColorControl.Cluster.id, MatterbridgeColorControlServer.with(ColorControl.Feature.ColorTemperature), {
                colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
                enhancedColorMode: ColorControl.EnhancedColorMode.ColorTemperatureMireds,
                colorCapabilities: { xy: false, hueSaturation: false, colorLoop: false, enhancedHue: false, colorTemperature: true },
                options: {
                  executeIfOff: false,
                },
                numberOfPrimaries: null,
                colorTemperatureMireds: hassState.attributes['max_mireds'] as number | undefined,
                colorTempPhysicalMinMireds: hassState.attributes['min_mireds'] as number | undefined,
                colorTempPhysicalMaxMireds: hassState.attributes['max_mireds'] as number | undefined,
                coupleColorTempToLevelMinMireds: hassState.attributes['min_mireds'] as number | undefined,
                remainingTime: 0,
                startUpColorTemperatureMireds: null,
              }),
            );
          } else {
            mutableDevice.addClusterServerObjs(
              entity.entity_id,
              getClusterServerObj(
                ColorControl.Cluster.id,
                MatterbridgeColorControlServer.with(ColorControl.Feature.ColorTemperature, ColorControl.Feature.HueSaturation, ColorControl.Feature.Xy),
                {
                  colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                  enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
                  colorCapabilities: { xy: true, hueSaturation: true, colorLoop: false, enhancedHue: false, colorTemperature: true },
                  options: {
                    executeIfOff: false,
                  },
                  numberOfPrimaries: null,
                  colorTemperatureMireds: hassState.attributes['max_mireds'] as number | undefined,
                  colorTempPhysicalMinMireds: hassState.attributes['min_mireds'] as number | undefined,
                  colorTempPhysicalMaxMireds: hassState.attributes['max_mireds'] as number | undefined,
                  coupleColorTempToLevelMinMireds: hassState.attributes['min_mireds'] as number | undefined,
                  remainingTime: 0,
                  startUpColorTemperatureMireds: null,
                },
              ),
            );
          }
        }

        // Special case for climate domain: configure the thermostat cluster
        if (domain === 'climate') {
          if (isValidArray(hassState?.attributes['hvac_modes']) && hassState.attributes['hvac_modes'].includes('heat_cool')) {
            mutableDevice.addClusterServerObjs(
              entity.entity_id,
              getClusterServerObj(Thermostat.Cluster.id, MatterbridgeThermostatServer.with(Thermostat.Feature.AutoMode, Thermostat.Feature.Heating, Thermostat.Feature.Cooling), {
                localTemperature: hassState.attributes['current_temperature'] as number | undefined,
                systemMode: Thermostat.SystemMode.Auto,
                controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
                // Thermostat.Feature.Heating
                occupiedHeatingSetpoint: ((hassState.attributes['target_temp_low'] as number | undefined) ?? 21) * 100,
                minHeatSetpointLimit: ((hassState.attributes['min_temp'] as number | undefined) ?? 0) * 100,
                absMinHeatSetpointLimit: ((hassState.attributes['min_temp'] as number | undefined) ?? 0) * 100,
                maxHeatSetpointLimit: ((hassState.attributes['max_temp'] as number | undefined) ?? 50) * 100,
                absMaxHeatSetpointLimit: ((hassState.attributes['max_temp'] as number | undefined) ?? 50) * 100,
                // Thermostat.Feature.Cooling
                occupiedCoolingSetpoint: ((hassState.attributes['target_temp_high'] as number | undefined) ?? 25) * 100,
                minCoolSetpointLimit: ((hassState.attributes['min_temp'] as number | undefined) ?? 0) * 100,
                absMinCoolSetpointLimit: ((hassState.attributes['min_temp'] as number | undefined) ?? 0) * 100,
                maxCoolSetpointLimit: ((hassState.attributes['max_temp'] as number | undefined) ?? 50) * 100,
                absMaxCoolSetpointLimit: ((hassState.attributes['max_temp'] as number | undefined) ?? 50) * 100,
                // Thermostat.Feature.AutoMode
                minSetpointDeadBand: 1 * 100,
                thermostatRunningMode: Thermostat.ThermostatRunningMode.Off,
              }),
            );
          } else if (
            isValidArray(hassState?.attributes['hvac_modes']) &&
            hassState.attributes['hvac_modes'].includes('heat') &&
            !hassState.attributes['hvac_modes'].includes('cool')
          ) {
            mutableDevice.addClusterServerObjs(
              entity.entity_id,
              getClusterServerObj(Thermostat.Cluster.id, MatterbridgeThermostatServer.with(Thermostat.Feature.Heating), {
                localTemperature: hassState.attributes['current_temperature'] as number | undefined,
                systemMode: Thermostat.SystemMode.Heat,
                controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.HeatingOnly,
                // Thermostat.Feature.Heating
                occupiedHeatingSetpoint: ((hassState.attributes['temperature'] as number | undefined) ?? 21) * 100,
                minHeatSetpointLimit: ((hassState.attributes['min_temp'] as number | undefined) ?? 0) * 100,
                absMinHeatSetpointLimit: ((hassState.attributes['min_temp'] as number | undefined) ?? 0) * 100,
                maxHeatSetpointLimit: ((hassState.attributes['max_temp'] as number | undefined) ?? 50) * 100,
                absMaxHeatSetpointLimit: ((hassState.attributes['max_temp'] as number | undefined) ?? 50) * 100,
              }),
            );
          } else if (
            isValidArray(hassState?.attributes['hvac_modes']) &&
            hassState.attributes['hvac_modes'].includes('cool') &&
            !hassState.attributes['hvac_modes'].includes('heat')
          ) {
            mutableDevice.addClusterServerObjs(
              entity.entity_id,
              getClusterServerObj(Thermostat.Cluster.id, MatterbridgeThermostatServer.with(Thermostat.Feature.Cooling), {
                localTemperature: hassState.attributes['current_temperature'] as number | undefined,
                systemMode: Thermostat.SystemMode.Cool,
                controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingOnly,
                // Thermostat.Feature.Cooling
                occupiedCoolingSetpoint: ((hassState.attributes['temperature'] as number | undefined) ?? 25) * 100,
                minCoolSetpointLimit: ((hassState.attributes['min_temp'] as number | undefined) ?? 0) * 100,
                absMinCoolSetpointLimit: ((hassState.attributes['min_temp'] as number | undefined) ?? 0) * 100,
                maxCoolSetpointLimit: ((hassState.attributes['max_temp'] as number | undefined) ?? 50) * 100,
                absMaxCoolSetpointLimit: ((hassState.attributes['max_temp'] as number | undefined) ?? 50) * 100,
              }),
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
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
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
              (newValue: any, oldValue: any) => {
                if ((typeof newValue !== 'object' && newValue === oldValue) || (typeof newValue === 'object' && deepEqual(newValue, oldValue))) {
                  matterbridgeDevice?.log.debug(
                    `Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} ` +
                      `on endpoint ${or}${child?.name}${db}:${or}${child?.number}${db} not changed`,
                  );
                  return;
                }
                matterbridgeDevice?.log.info(
                  `${db}Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} on endpoint ${or}${child?.name}${db}:${or}${child?.number}${db} ` +
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

      // Add all the clusters to the device
      await mutableDevice.createClusters('');

      // Register the device if we have found supported domains and entities
      if (matterbridgeDevice && matterbridgeDevice.getChildEndpoints().length > 0) {
        this.log.debug(`Registering device ${dn}${device.name}${db}...`);
        mutableDevice.logMutableDevice();
        await this.registerDevice(mutableDevice.getEndpoint());
        this.matterbridgeDevices.set(device.id, mutableDevice.getEndpoint());
        this.bridgedHassDevices.set(device.id, device);
      }
    } // hassDevices
  }

  override async onConfigure() {
    await super.onConfigure();
    this.log.info(`Configuring platform ${idn}${this.config.name}${rs}${nf}`);
    try {
      for (const state of Array.from(this.ha.hassStates.values())) {
        const entity = this.ha.hassEntities.get(state.entity_id);
        const deviceId = entity?.device_id;
        if (deviceId && this.bridgedHassDevices.has(deviceId)) {
          this.log.debug(`Configuring state ${CYAN}${state.entity_id}${db} for device ${CYAN}${deviceId}${db}` /* , state*/);
          this.updateHandler(deviceId, state.entity_id, state, state);
        }
      }
    } catch (error) {
      this.log.error(`Error configuring platform: ${error}`);
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

    this.ha.close();
    this.ha.removeAllListeners();

    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();

    this.matterbridgeDevices.clear();
    this.bridgedHassDevices.clear();
    this.bridgedHassEntities.clear();
  }

  async commandHandler(mbDevice: MatterbridgeEndpoint | undefined, endpoint: MatterbridgeEndpoint, request: any, attributes: any, command: string) {
    if (!mbDevice) {
      this.log.error(`Command handler: Matterbridge device not found`);
      return;
    }
    mbDevice.log.info(
      `${db}Received matter command ${ign}${command}${rs}${db} from device ${idn}${mbDevice?.deviceName}${rs}${db} for endpoint ${or}${endpoint.name}:${endpoint.number}${db}`,
    );
    const entityId = endpoint.number ? mbDevice.getChildEndpoint(endpoint.number)?.uniqueStorageKey : undefined;
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
  subscribeHandler(deviceId: string, entityId: string, child: MatterbridgeDevice, clusterId: ClusterId, attribute: string, newValue: any, oldValue: any) {
    child.log.info(
      `${db}Subscribed attribute ${hk}${ClusterRegistry.get(clusterId)?.name}${db}:${hk}${attribute}${db} on endpoint ${or}${child?.name}${db}:${or}${child?.number}${db} ` +
        `changed from ${YELLOW}${typeof oldValue === 'object' ? debugStringify(oldValue) : oldValue}${db} to ${YELLOW}${typeof newValue === 'object' ? debugStringify(newValue) : newValue}${db}`,
    );
    const value = hassSubscribe.converter ? hassSubscribe.converter(newValue) : newValue;
    if (value !== null) this.ha.callServiceAsync(domain, 'turn_on', entity.entity_id, { [hassSubscribe.with]: value });
    else this.ha.callServiceAsync(domain, 'turn_off', entity.entity_id);
    child.log.debug(
      `*Converter(${hassSubscribe.converter !== undefined}): ${typeof newValue === 'object' ? debugStringify(newValue) : newValue} => ${typeof value === 'object' ? debugStringify(value) : value}`,
    );
  }
  */

  async updateHandler(deviceId: string | null, entityId: string, old_state: HassState, new_state: HassState) {
    const matterbridgeDevice = this.matterbridgeDevices.get(deviceId ?? entityId);
    if (!matterbridgeDevice) return;
    const endpoint = matterbridgeDevice.getChildEndpointByName(entityId) || matterbridgeDevice.getChildEndpointByName(entityId.replaceAll('.', ''));
    if (!endpoint) return;
    matterbridgeDevice.log.info(
      `${db}Received update event from Home Assistant device ${idn}${matterbridgeDevice?.deviceName}${rs}${db} entity ${CYAN}${entityId}${db} ` +
        `from ${YELLOW}${old_state.state}${db} with ${debugStringify(old_state.attributes)}${db} to ${YELLOW}${new_state.state}${db} with ${debugStringify(new_state.attributes)}`,
    );
    const domain = entityId.split('.')[0];
    if (['automation', 'scene', 'script'].includes(domain)) {
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
    } else {
      // Update state of the device
      const hassUpdateState = hassUpdateStateConverter.find((updateState) => updateState.domain === domain && updateState.state === new_state.state);
      if (hassUpdateState) {
        await endpoint.setAttribute(hassUpdateState.clusterId, hassUpdateState.attribute, hassUpdateState.value, matterbridgeDevice.log);
      } else {
        endpoint.log.warn(`Update state ${CYAN}${domain}${wr}:${CYAN}${new_state.state}${wr} not supported for entity ${entityId}`);
      }
      // Update attributes of the device
      const hassUpdateAttributes = hassUpdateAttributeConverter.filter((updateAttribute) => updateAttribute.domain === domain);
      if (hassUpdateAttributes.length > 0) {
        // console.log('Processing update attributes: ', hassUpdateAttributes.length);
        for (const update of hassUpdateAttributes) {
          // console.log('- processing update attribute', update.with, 'value', new_state.attributes[update.with]);
          const value = new_state.attributes[update.with];
          if (value !== null) {
            // console.log('-- converting update attribute value', update.converter(value));
            const convertedValue = update.converter(value, new_state);
            endpoint.log.debug(`Converting attribute ${update.with} value ${value} to ${CYAN}${convertedValue}${db}`);
            if (convertedValue !== null) await endpoint.setAttribute(update.clusterId, update.attribute, convertedValue, endpoint.log);
          }
        }
      }
    }
  }
}
