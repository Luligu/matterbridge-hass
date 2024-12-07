/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * This file contains the class HomeAssistantPlatform.
 *
 * @file src\platform.ts
 * @author Luca Liguori
 * @date 2024-09-13
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

import {
  AtLeastOne,
  bridgedNode,
  ClusterId,
  ClusterRegistry,
  ColorControl,
  ColorControlCluster,
  colorTemperatureLight,
  coverDevice,
  DeviceTypeDefinition,
  dimmableLight,
  DoorLock,
  DoorLockCluster,
  doorLockDevice,
  Endpoint,
  EndpointOptions,
  FanControl,
  FanControlCluster,
  fanDevice,
  LevelControlCluster,
  Matterbridge,
  MatterbridgeDevice,
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  OnOffCluster,
  onOffLight,
  onOffOutlet,
  PlatformConfig,
  WindowCoveringCluster,
  WindowCovering,
  thermostatDevice,
  ThermostatCluster,
  Thermostat,
} from 'matterbridge';
import { AnsiLogger, LogLevel, dn, idn, ign, nf, rs, wr, db, or, debugStringify, YELLOW, CYAN, hk, gn } from 'matterbridge/logger';
import { deepEqual, isValidArray, isValidNumber, isValidObject, isValidString, waiter } from 'matterbridge/utils';
import { NodeStorage, NodeStorageManager } from 'matterbridge/storage';
import path from 'path';
import { promises as fs } from 'fs';
import { HassDevice, HassEntity, HassState, HomeAssistant, HassConfig as HassConfig, HomeAssistantPrimitive, HassServices } from './homeAssistant.js';

// Update Home Assistant state to Matterbridge device states
// prettier-ignore
const hassUpdateStateConverter: { domain: string; state: string; clusterId: ClusterId; attribute: string; value: any }[] = [
  { domain: 'switch', state: 'on', clusterId: OnOffCluster.id, attribute: 'onOff', value: true },
  { domain: 'switch', state: 'off', clusterId: OnOffCluster.id, attribute: 'onOff', value: false },
  
  { domain: 'light', state: 'on', clusterId: OnOffCluster.id, attribute: 'onOff', value: true },
  { domain: 'light', state: 'off', clusterId: OnOffCluster.id, attribute: 'onOff', value: false },
  
  { domain: 'lock', state: 'locked', clusterId: DoorLockCluster.id, attribute: 'lockState', value: DoorLock.LockState.Locked },
  { domain: 'lock', state: 'locking', clusterId: DoorLockCluster.id, attribute: 'lockState', value: DoorLock.LockState.NotFullyLocked },
  { domain: 'lock', state: 'unlocking', clusterId: DoorLockCluster.id, attribute: 'lockState', value: DoorLock.LockState.NotFullyLocked },
  { domain: 'lock', state: 'unlocked', clusterId: DoorLockCluster.id, attribute: 'lockState', value: DoorLock.LockState.Unlocked },
  
  { domain: 'fan', state: 'on', clusterId: FanControlCluster.id, attribute: 'fanMode', value: FanControl.FanMode.Auto },
  { domain: 'fan', state: 'off', clusterId: FanControlCluster.id, attribute: 'fanMode', value: FanControl.FanMode.Off },

  { domain: 'cover', state: 'opening', clusterId: WindowCoveringCluster.id, attribute: 'operationalStatus', value: { global: WindowCovering.MovementStatus.Opening, lift: WindowCovering.MovementStatus.Opening, tilt: 0 } },
  { domain: 'cover', state: 'open', clusterId: WindowCoveringCluster.id, attribute: 'operationalStatus', value: { global: WindowCovering.MovementStatus.Stopped, lift: WindowCovering.MovementStatus.Stopped, tilt: 0 } },
  { domain: 'cover', state: 'close', clusterId: WindowCoveringCluster.id, attribute: 'operationalStatus', value: { global: WindowCovering.MovementStatus.Stopped, lift: WindowCovering.MovementStatus.Stopped, tilt: 0 } },
  { domain: 'cover', state: 'closing', clusterId: WindowCoveringCluster.id, attribute: 'operationalStatus', value: { global: WindowCovering.MovementStatus.Closing, lift: WindowCovering.MovementStatus.Closing, tilt: 0 } },

  { domain: 'climate', state: 'off', clusterId: ThermostatCluster.id, attribute: 'systemMode', value: Thermostat.SystemMode.Off },
  { domain: 'climate', state: 'heat', clusterId: ThermostatCluster.id, attribute: 'systemMode', value: Thermostat.SystemMode.Heat },
  { domain: 'climate', state: 'cool', clusterId: ThermostatCluster.id, attribute: 'systemMode', value: Thermostat.SystemMode.Cool },
];

// Update Home Assistant attributes to Matterbridge device attributes
// prettier-ignore
const hassUpdateAttributeConverter: { domain: string; with: string; clusterId: ClusterId; attribute: string; converter: any }[] = [
  { domain: 'light', with: 'brightness', clusterId: LevelControlCluster.id, attribute: 'currentLevel', converter: (value: number) => (isValidNumber(value, 1, 255) ? Math.round(value / 255 * 254) : null) },
  { domain: 'light', with: 'color_mode', clusterId: ColorControlCluster.id, attribute: 'colorMode', converter: (value: string) => {
      if( isValidString(value, 2, 10) ) {
        if (value === 'hs' || value === 'rgb') return ColorControl.ColorMode.CurrentHueAndCurrentSaturation;
        else if (value === 'xy') return ColorControl.ColorMode.CurrentXAndCurrentY;
        else if (value === 'color_temp') return ColorControl.ColorMode.ColorTemperatureMireds;
        else return null;
      } else {
        return null;
      }
    } 
  },
  { domain: 'light', with: 'color_temp', clusterId: ColorControlCluster.id, attribute: 'colorTemperatureMireds', converter: (value: number, state: HassState) => ( isValidNumber(value, 0, 65279) && state.attributes['color_mode'] === 'color_temp' ? value : null ) },
  { domain: 'light', with: 'hs_color', clusterId: ColorControlCluster.id, attribute: 'currentHue', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[0], 0, 360) && (state.attributes['color_mode'] === 'hs' || state.attributes['color_mode'] === 'rgb') ? Math.round(value[0] / 360 * 254) : null ) },
  { domain: 'light', with: 'hs_color', clusterId: ColorControlCluster.id, attribute: 'currentSaturation', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[1], 0, 100) && (state.attributes['color_mode'] === 'hs' || state.attributes['color_mode'] === 'rgb') ? Math.round(value[1] / 100 * 254) : null ) },
  { domain: 'light', with: 'xy_color', clusterId: ColorControlCluster.id, attribute: 'currentX', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[0], 0, 1) && state.attributes['color_mode'] === 'xy' ? value[0] : null ) },
  { domain: 'light', with: 'xy_color', clusterId: ColorControlCluster.id, attribute: 'currentY', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[1], 0, 1) && state.attributes['color_mode'] === 'xy' ? value[1] : null ) },

  { domain: 'fan', with: 'percentage', clusterId: FanControlCluster.id, attribute: 'percentCurrent', converter: (value: number) => (isValidNumber(value, 1, 100) ? Math.round(value) : null) },
  { domain: 'fan', with: 'percentage', clusterId: FanControlCluster.id, attribute: 'speedCurrent', converter: (value: number) => (isValidNumber(value, 1, 100) ? Math.round(value) : null) },
  { domain: 'fan', with: 'preset_mode', clusterId: FanControlCluster.id, attribute: 'fanMode', converter: (value: string) => {
    if( isValidString(value, 3, 6) ) {
      if (value === 'low') return FanControl.FanMode.Low;
      else if (value === 'medium') return FanControl.FanMode.Medium;
      else if (value === 'high') return FanControl.FanMode.High;
      else if (value === 'auto') return FanControl.FanMode.Auto;
      else return null;
    } else {
      return null;
    }
  } },
  // Matter WindowCovering: 0 = open 10000 = closed
  { domain: 'cover', with: 'current_position', clusterId: WindowCoveringCluster.id, attribute: 'currentPositionLiftPercent100ths', converter: (value: number) => (isValidNumber(value, 0, 100) ? Math.round(10000 - value * 100) : null) },
  { domain: 'cover', with: 'current_position', clusterId: WindowCoveringCluster.id, attribute: 'targetPositionLiftPercent100ths', converter: (value: number) => (isValidNumber(value, 0, 100) ? Math.round(10000 - value * 100) : null) },

  { domain: 'climate', with: 'temperature', clusterId: ThermostatCluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'heat' ? value * 100 : null) },
  { domain: 'climate', with: 'temperature', clusterId: ThermostatCluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'cool' ? value * 100 : null) },
  { domain: 'climate', with: 'current_temperature', clusterId: ThermostatCluster.id, attribute: 'localTemperature', converter: (value: number) => (isValidNumber(value) ? value * 100 : null) },
];

// Convert Home Assistant domains to Matterbridge device types and clusterIds
// prettier-ignore
const hassDomainConverter: { domain: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId }[] = [
  { domain: 'switch',   deviceType: onOffOutlet,      clusterId: OnOffCluster.id },
  { domain: 'light',    deviceType: onOffLight,       clusterId: OnOffCluster.id },
  { domain: 'lock',     deviceType: doorLockDevice,   clusterId: DoorLockCluster.id },
  { domain: 'fan',      deviceType: fanDevice,        clusterId: FanControlCluster.id },
  { domain: 'cover',    deviceType: coverDevice,      clusterId: WindowCoveringCluster.id },
  { domain: 'climate',  deviceType: thermostatDevice, clusterId: ThermostatCluster.id },
];

// Convert Home Assistant domains attributes to Matterbridge device types and clusterIds
// prettier-ignore
const hassDomainAttributeConverter: { domain: string; with: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId }[] = [
  { domain: 'light',    with: 'brightness',  deviceType: dimmableLight,          clusterId: LevelControlCluster.id },
  { domain: 'light',    with: 'color_temp',  deviceType: colorTemperatureLight,  clusterId: ColorControlCluster.id },
  { domain: 'light',    with: 'hs_color',    deviceType: colorTemperatureLight,  clusterId: ColorControlCluster.id },
  { domain: 'light',    with: 'xy_color',    deviceType: colorTemperatureLight,  clusterId: ColorControlCluster.id },
];

// Convert Home Assistant domains services to Matterbridge commands for device types
// prettier-ignore
const hassCommandConverter: { command: string; domain: string; service: string; converter?: any }[] = [
  { command: 'on',                      domain: 'switch', service: 'turn_on' },
  { command: 'off',                     domain: 'switch', service: 'turn_off' },
  { command: 'toggle',                  domain: 'switch', service: 'toggle' },

  { command: 'on',                      domain: 'light', service: 'turn_on' },
  { command: 'off',                     domain: 'light', service: 'turn_off' },
  { command: 'toggle',                  domain: 'light', service: 'toggle' },
  { command: 'moveToLevel',             domain: 'light', service: 'turn_on', converter: (request: any) => { return { brightness: Math.round(request.level / 254 * 255) } } },
  { command: 'moveToLevelWithOnOff',    domain: 'light', service: 'turn_on', converter: (request: any) => { return { brightness: Math.round(request.level / 254 * 255) } } },
  { command: 'moveToColorTemperature',  domain: 'light', service: 'turn_on', converter: (request: any) => { return { color_temp: request.colorTemperatureMireds } } },
  { command: 'moveToColor',             domain: 'light', service: 'turn_on', converter: (request: any) => { return { xy_color: [request.colorX, request.colorY] } } },
  { command: 'moveToHue',               domain: 'light', service: 'turn_on', converter: (request: any, attributes: any) => { return { hs_color: [Math.round(request.hue / 254 * 360), Math.round(attributes.currentSaturation.value / 254 * 100)] } } },
  { command: 'moveToSaturation',        domain: 'light', service: 'turn_on', converter: (request: any, attributes: any) => { return { hs_color: [Math.round(attributes.currentHue.value / 254 * 360), Math.round(request.saturation / 254 * 100)] } } },
  { command: 'moveToHueAndSaturation',  domain: 'light', service: 'turn_on', converter: (request: any) => { return { hs_color: [Math.round(request.hue / 254 * 360), Math.round(request.saturation / 254 * 100)] } } },
  
  { command: 'lockDoor',                domain: 'lock', service: 'lock' },
  { command: 'unlockDoor',              domain: 'lock', service: 'unlock' },

  { command: 'upOrOpen',                domain: 'cover', service: 'open_cover' },
  { command: 'downOrClose',             domain: 'cover', service: 'close_cover' },
  { command: 'stopMotion',              domain: 'cover', service: 'stop_cover' },
  { command: 'goToLiftPercentage',      domain: 'cover', service: 'set_cover_position', converter: (request: any) => { return { position: Math.round(100 - request.liftPercent100thsValue / 100) } } },
];

// Convert Home Assistant domains services and attributes to Matterbridge subscribed cluster / attributes.
// Returning null will send turn_off service to Home Assistant instead of turn_on with attributes.
// prettier-ignore
const hassSubscribeConverter: { domain: string; service: string; with: string; clusterId: ClusterId; attribute: string; converter?: any }[] = [
  { domain: 'fan',      service: 'turn_on',         with: 'preset_mode',  clusterId: FanControlCluster.id,  attribute: 'fanMode', converter: (value: FanControl.FanMode) => {
    if( isValidNumber(value, FanControl.FanMode.Off, FanControl.FanMode.Smart) ) {
      if (value === FanControl.FanMode.Low) return 'low';
      else if (value === FanControl.FanMode.Medium) return 'medium';
      else if (value === FanControl.FanMode.High) return 'high';
      else if (value === FanControl.FanMode.Auto || value === FanControl.FanMode.Smart || value === FanControl.FanMode.On) return 'auto';
      else return null;
    } else {
      return null;
    }
  }},
  { domain: 'fan',      service: 'turn_on',         with: 'percentage',   clusterId: FanControlCluster.id,  attribute: 'percentSetting' },
  { domain: 'fan',      service: 'turn_on',         with: 'percentage',   clusterId: FanControlCluster.id,  attribute: 'speedSetting' },

  { domain: 'climate',  service: 'set_hvac_mode',   with: 'hvac_mode',    clusterId: ThermostatCluster.id,  attribute: 'systemMode', converter: (value: number) => {
    if( isValidNumber(value, Thermostat.SystemMode.Off, Thermostat.SystemMode.Heat) ) {
      if (value === Thermostat.SystemMode.Auto) return 'auto';
      else if (value === Thermostat.SystemMode.Cool) return 'cool';
      else if (value === Thermostat.SystemMode.Heat) return 'heat';
      else return null;
    } else {
      return null;
    }
  }},
  { domain: 'climate',  service: 'set_temperature', with: 'temperature',  clusterId: ThermostatCluster.id,  attribute: 'occupiedHeatingSetpoint', converter: (value: number) => { return value / 100 } },
  { domain: 'climate',  service: 'set_temperature', with: 'temperature',  clusterId: ThermostatCluster.id,  attribute: 'occupiedCoolingSetpoint', converter: (value: number) => { return value / 100 } },
]

export class HomeAssistantPlatform extends MatterbridgeDynamicPlatform {
  // NodeStorageManager
  nodeStorageManager?: NodeStorageManager;
  nodeStorage?: NodeStorage;

  // Home Assistant
  ha: HomeAssistant;

  // Matterbridge devices
  matterbridgeDevices = new Map<string, MatterbridgeDevice>();
  bridgedHassDevices = new Map<string, HassDevice>(); // Only the bridged devices from Home Assistant

  async createMutableDevice(definition: DeviceTypeDefinition | AtLeastOne<DeviceTypeDefinition>, options: EndpointOptions = {}, debug = false): Promise<MatterbridgeDevice> {
    let device: MatterbridgeDevice;
    if (this.matterbridge.edge === true) device = new MatterbridgeEndpoint(definition, options, debug) as unknown as MatterbridgeDevice;
    else device = new MatterbridgeDevice(definition, options, debug);
    return device;
  }

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('1.6.5')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "1.6.5". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info(`Initializing platform: ${CYAN}${this.config.name}${nf} version: ${CYAN}${this.config.version}${rs}`);

    if (!isValidString(config.host, 1) || !isValidString(config.token, 1)) {
      throw new Error('Host and token must be defined in the configuration');
    }

    this.ha = new HomeAssistant(config.host, config.token, (config.reconnectTimeout as number | undefined) ?? 60);

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
    this.ha.connect();
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

    // Scan devices and entities and create Matterbridge devices
    for (const device of Array.from(this.ha.hassDevices.values())) {
      const name = device.name_by_user ?? device.name ?? 'Unknown';
      if (!this._validateDeviceWhiteBlackList(device)) continue;

      let mbDevice: MatterbridgeDevice | undefined;

      // Create a new Matterbridge device
      const createdDevice = async () => {
        this.log.info(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
        this.bridgedHassDevices.set(device.id, device);
        mbDevice = await this.createMutableDevice(bridgedNode, { uniqueStorageKey: device.id }, this.config.debug as boolean);
        mbDevice.log.logName = name;
        mbDevice.createDefaultBridgedDeviceBasicInformationClusterServer(
          name,
          device.id + (isValidString(this.config.postfix, 1, 3) ? '-' + this.config.postfix : ''),
          0xfff1,
          'HomeAssistant',
          device.model ?? 'Unknown',
        );
        return mbDevice;
      };

      // Scan entities for supported domains and services and add them to the Matterbridge device
      for (const entity of Array.from(this.ha.hassEntities.values()).filter((e) => e.device_id === device.id)) {
        if (!this._validateEntityBlackList(name, entity.entity_id)) continue;

        const domain = entity.entity_id.split('.')[0];
        let deviceType: DeviceTypeDefinition | undefined;
        const clusterIds = new Map<ClusterId, ClusterId>();

        // Add device type and clusterIds for supported domains of the current entity. Skip the entity if no supported domains are found.
        const hassDomains = hassDomainConverter.filter((d) => d.domain === domain);
        if (hassDomains.length > 0) {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} domain ${CYAN}${CYAN}${domain}${db} entity ${CYAN}${entity.entity_id}${db}`);
          hassDomains.forEach((hassDomain) => {
            deviceType = hassDomain.deviceType;
            clusterIds.set(hassDomain.clusterId, hassDomain.clusterId);
          });
        } else {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} domain ${CYAN}${CYAN}${domain}${db} entity ${CYAN}${entity.entity_id}${db}: domain not found`);
          continue;
        }

        // Add device types and clusterIds for supported attributes of the current entity state
        const hassState = this.ha.hassStates.get(entity.entity_id);
        if (hassState) {
          this.log.debug(`- state ${debugStringify(hassState)}`);
          for (const [key, value] of Object.entries(hassState.attributes)) {
            this.log.debug(`- attribute ${CYAN}${key}${db} value ${typeof value === 'object' && value ? debugStringify(value) : value}`);
            const hassDomainAttributes = hassDomainAttributeConverter.filter((d) => d.domain === domain && d.with === key);
            hassDomainAttributes.forEach((hassDomainAttribute) => {
              deviceType = hassDomainAttribute.deviceType;
              clusterIds.set(hassDomainAttribute.clusterId, hassDomainAttribute.clusterId);
            });
          }
        } else {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} domain ${CYAN}${CYAN}${domain}${db} entity ${CYAN}${entity.entity_id}${db}: state not found`);
          continue;
        }

        // Create the device if not already created
        if (!mbDevice) mbDevice = await createdDevice();
        let child: MatterbridgeDevice;
        if (deviceType) {
          child = mbDevice.addChildDeviceType(entity.entity_id, [deviceType], undefined, this.config.debug as boolean);
          child.log.logName = entity.entity_id;
          // Special case for light domain: configure the color control cluster
          if (domain === 'light' && deviceType === colorTemperatureLight) {
            if (
              isValidArray(hassState.attributes['supported_color_modes']) &&
              (hassState.attributes['supported_color_modes'].includes('hs') || hassState.attributes['supported_color_modes'].includes('rgb')) &&
              !hassState.attributes['supported_color_modes'].includes('color_temp')
            ) {
              child.createHsColorControlClusterServer();
            } else if (
              isValidArray(hassState.attributes['supported_color_modes']) &&
              !hassState.attributes['supported_color_modes'].includes('hs') &&
              !hassState.attributes['supported_color_modes'].includes('rgb') &&
              hassState.attributes['supported_color_modes'].includes('color_temp')
            ) {
              child.createCtColorControlClusterServer(
                hassState.attributes['max_mireds'] as number | undefined,
                hassState.attributes['min_mireds'] as number | undefined,
                hassState.attributes['max_mireds'] as number | undefined,
              );
            } else
              child.createDefaultColorControlClusterServer(
                undefined,
                undefined,
                undefined,
                undefined,
                hassState.attributes['max_mireds'] as number | undefined,
                hassState.attributes['min_mireds'] as number | undefined,
                hassState.attributes['max_mireds'] as number | undefined,
              );
            clusterIds.delete(ColorControlCluster.id);
          }
          // Special case for climate domain: configure the thermostat cluster
          if (domain === 'climate') {
            if (isValidArray(hassState?.attributes['hvac_modes']) && hassState.attributes['hvac_modes'].includes('heat') && !hassState.attributes['hvac_modes'].includes('cool'))
              child.createDefaultHeatingThermostatClusterServer(
                hassState?.attributes['current_temperature'] as number | undefined,
                hassState?.attributes['temperature'] as number | undefined,
                hassState?.attributes['min_temp'] as number | undefined,
                hassState?.attributes['max_temp'] as number | undefined,
              );
            else if (
              isValidArray(hassState?.attributes['hvac_modes']) &&
              hassState.attributes['hvac_modes'].includes('cool') &&
              !hassState.attributes['hvac_modes'].includes('heat')
            )
              child.createDefaultCoolingThermostatClusterServer(
                hassState?.attributes['current_temperature'] as number | undefined,
                hassState?.attributes['temperature'] as number | undefined,
                hassState?.attributes['min_temp'] as number | undefined,
                hassState?.attributes['max_temp'] as number | undefined,
              );
            else child.createDefaultHeatingThermostatClusterServer(hassState?.attributes['current_temperature'] as number | undefined);
            clusterIds.delete(ThermostatCluster.id);
          }
          child.addClusterServerFromList(child, Array.from(clusterIds.values()));
          child.addRequiredClusterServers(child);

          // Add Matter command handlers the the child endpoint for supported domains and services
          const hassCommands = hassCommandConverter.filter((c) => c.domain === domain);
          if (hassCommands.length > 0) {
            hassCommands.forEach((hassCommand) => {
              this.log.debug(`- command: ${CYAN}${hassCommand.command}${db}`);
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              child.addCommandHandler(hassCommand.command, async (data) => {
                this.commandHandler(mbDevice, data.endpoint, data.request, data.attributes, hassCommand.command);
              });
            });
          }

          // Subscribe to the Matter writable attributes
          const hassSubscribed = hassSubscribeConverter.filter((s) => s.domain === domain);
          if (hassSubscribed.length > 0) {
            for (const hassSubscribe of hassSubscribed) {
              const check = child.getClusterServerById(hassSubscribe.clusterId)?.isAttributeSupportedByName(hassSubscribe.attribute);
              this.log.debug(`- subscribe: ${CYAN}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${CYAN}${hassSubscribe.attribute}${db} check ${CYAN}${check}${db}`);
              if (!check) continue;

              child.subscribeAttribute(
                hassSubscribe.clusterId,
                hassSubscribe.attribute,
                (newValue: any, oldValue: any) => {
                  if ((typeof newValue !== 'object' && newValue === oldValue) || (typeof newValue === 'object' && deepEqual(newValue, oldValue))) {
                    mbDevice?.log.debug(
                      `*Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} ` +
                        `on endpoint ${or}${child?.name}${db}:${or}${child?.number}${db} not changed`,
                    );
                    return;
                  }
                  mbDevice?.log.info(
                    `${db}Subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} on endpoint ${or}${child?.name}${db}:${or}${child?.number}${db} ` +
                      `changed from ${YELLOW}${typeof oldValue === 'object' ? debugStringify(oldValue) : oldValue}${db} to ${YELLOW}${typeof newValue === 'object' ? debugStringify(newValue) : newValue}${db}`,
                  );
                  const value = hassSubscribe.converter ? hassSubscribe.converter(newValue) : newValue;
                  mbDevice?.log.debug(
                    `*Converter(${hassSubscribe.converter !== undefined}): ${typeof newValue === 'object' ? debugStringify(newValue) : newValue} => ${typeof value === 'object' ? debugStringify(value) : value}`,
                  );
                  if (value !== null) this.ha.callServiceAsync(domain, hassSubscribe.service, entity.entity_id, { [hassSubscribe.with]: value });
                  else this.ha.callServiceAsync(domain, 'turn_off', entity.entity_id);
                },
                child.log,
              );
            }
          }
        } // deviceType
      } // hassEntities

      // Register the device if we have found supported domains and entities
      if (mbDevice && mbDevice.getChildEndpoints().length > 0) {
        this.log.debug(`Registering device ${dn}${device.name}${db}...`);
        await this.registerDevice(mbDevice);
        this.matterbridgeDevices.set(device.id, mbDevice);
      }
    } // hassDevices
  }

  override async onConfigure() {
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
  }

  override async onShutdown(reason?: string) {
    this.log.info(`Shutting down platform ${idn}${this.config.name}${rs}${nf}: ${reason ?? ''}`);

    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }

  async commandHandler(mbDevice: MatterbridgeDevice | undefined, endpoint: Endpoint, request: any, attributes: any, command: string) {
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
      await this.ha.callServiceAsync(hassCommand.domain, hassCommand.service, entityId, serviceAttributes);
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

  async updateHandler(deviceId: string, entityId: string, old_state: HassState, new_state: HassState) {
    // this.hassEntityStates.set(entityId, new_state);
    const mbDevice = this.matterbridgeDevices.get(deviceId);
    if (!mbDevice) return;
    const endpoint = mbDevice.getChildEndpointByName(entityId) || mbDevice.getChildEndpointByName(entityId.replaceAll('.', ''));
    if (!endpoint) return;
    mbDevice.log.info(
      `${db}Received update event from Home Assistant device ${idn}${mbDevice?.deviceName}${rs}${db} entity ${CYAN}${entityId}${db} ` +
        `from ${YELLOW}${old_state.state}${db} with ${debugStringify(old_state.attributes)}${db} to ${YELLOW}${new_state.state}${db} with ${debugStringify(new_state.attributes)}`,
    );
    const domain = entityId.split('.')[0];
    // Update state of the device
    const hassUpdateState = hassUpdateStateConverter.find((updateState) => updateState.domain === domain && updateState.state === new_state.state);
    if (hassUpdateState) {
      await mbDevice.setAttribute(hassUpdateState.clusterId, hassUpdateState.attribute, hassUpdateState.value, mbDevice.log, endpoint);
    } else {
      mbDevice.log.warn(`Update ${CYAN}${domain}${wr}:${CYAN}${new_state.state}${wr} not supported for entity ${entityId}`);
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
          if (convertedValue !== null) await mbDevice.setAttribute(update.clusterId, update.attribute, convertedValue, mbDevice.log, endpoint);
        }
      }
    }
  }

  _validateDeviceWhiteBlackList(device: Pick<HassDevice, 'id' | 'name' | 'name_by_user'>) {
    if (isValidArray(this.config.whiteList, 1) && !this._matchStringListWithDevice(this.config.whiteList, device)) {
      this.log.warn(`Skipping device ${dn}${device}${wr} because not in whitelist`);
      return false;
    }
    if (isValidArray(this.config.blackList, 1) && this._matchStringListWithDevice(this.config.blackList, device)) {
      this.log.warn(`Skipping device ${dn}${device}${wr} because in blacklist`);
      return false;
    }
    return true;
  }

  _validateEntityBlackList(device: string, entity: string) {
    if (isValidArray(this.config.entityBlackList, 1) && this.config.entityBlackList.find((e) => e === entity)) {
      this.log.warn(`Skipping entity ${gn}${entity}${wr} because in entityBlackList`);
      return false;
    }
    if (
      isValidObject(this.config.deviceEntityBlackList, 1) &&
      device in this.config.deviceEntityBlackList &&
      (this.config.deviceEntityBlackList as Record<string, string[]>)[device].includes(entity)
    ) {
      this.log.warn(`Skipping entity ${gn}${entity}${wr} for device ${dn}${device}${wr} because in deviceEntityBlackList`);
      return false;
    }
    return true;
  }

  _matchStringListWithDevice(stringList: unknown[], device: Pick<HassDevice, 'id' | 'name' | 'name_by_user'>) {
    return stringList.some((s) => s === device.name_by_user || s === device.name || s === device.id);
  }
}
