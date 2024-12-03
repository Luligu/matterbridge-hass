/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * This file contains the class HomeAssistantPlatform.
 *
 * @file src\platform.ts
 * @author Luca Liguori
 * @date 2024-09-13
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

import {
  AtLeastOne,
  bridgedNode,
  ClusterId,
  ClusterRegistry,
  ColorControl,
  ColorControlCluster,
  colorTemperatureLight,
  DeviceTypeDefinition,
  DeviceTypes,
  dimmableLight,
  DoorLock,
  DoorLockCluster,
  Endpoint,
  EndpointOptions,
  FanControl,
  FanControlCluster,
  LevelControlCluster,
  Matterbridge,
  MatterbridgeDevice,
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  OnOffCluster,
  onOffLight,
  onOffSwitch,
  PlatformConfig,
} from 'matterbridge';
import { AnsiLogger, LogLevel, dn, idn, ign, nf, rs, wr, db, or, debugStringify, YELLOW, CYAN, hk } from 'matterbridge/logger';
import { isValidArray, isValidNumber, isValidString, waiter } from 'matterbridge/utils';
import { NodeStorage, NodeStorageManager } from 'matterbridge/storage';
import path from 'path';
import { promises as fs } from 'fs';
import { HassDevice, HassEntity, HassEntityState, HomeAssistant, HomeAssistantConfig, HomeAssistantPrimitive, HomeAssistantServices } from './homeAssistant.js';

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
  
  { domain: 'fan', state: 'on', clusterId: FanControlCluster.id, attribute: 'fanMode', value: FanControl.FanMode.On },
  { domain: 'fan', state: 'off', clusterId: FanControlCluster.id, attribute: 'fanMode', value: FanControl.FanMode.Off },
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
  { domain: 'light', with: 'color_temp', clusterId: ColorControlCluster.id, attribute: 'colorTemperatureMireds', converter: (value: number) => ( isValidNumber(value, 0, 65279) ? value : null ) },
  { domain: 'light', with: 'hs_color', clusterId: ColorControlCluster.id, attribute: 'currentHue', converter: (value: number[]) => ( isValidArray(value, 2, 2) && isValidNumber(value[0], 0, 360) ? Math.round(value[0] / 360 * 254) : null ) },
  { domain: 'light', with: 'hs_color', clusterId: ColorControlCluster.id, attribute: 'currentSaturation', converter: (value: number[]) => ( isValidArray(value, 2, 2) && isValidNumber(value[1], 0, 100) ? Math.round(value[1] / 100 * 254) : null ) },
  { domain: 'light', with: 'xy_color', clusterId: ColorControlCluster.id, attribute: 'currentX', converter: (value: number[]) => ( isValidArray(value, 2, 2) && isValidNumber(value[0], 0, 1) ? value[0] : null ) },
  { domain: 'light', with: 'xy_color', clusterId: ColorControlCluster.id, attribute: 'currentY', converter: (value: number[]) => ( isValidArray(value, 2, 2) && isValidNumber(value[1], 0, 1) ? value[1] : null ) },

  { domain: 'fan', with: 'percentage', clusterId: FanControlCluster.id, attribute: 'percentCurrent', converter: (value: number) => (isValidNumber(value, 1, 100) ? Math.round(value) : null) },
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
];

// Convert Home Assistant domains to Matterbridge device types and clusterIds
const hassDomainConverter: { domain: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId }[] = [
  { domain: 'switch', deviceType: onOffSwitch, clusterId: OnOffCluster.id },
  { domain: 'light', deviceType: onOffLight, clusterId: OnOffCluster.id },
  { domain: 'lock', deviceType: DeviceTypes.DOOR_LOCK, clusterId: DoorLockCluster.id },
  { domain: 'fan', deviceType: DeviceTypes.FAN, clusterId: FanControlCluster.id },
];

// Convert Home Assistant domains attributes to Matterbridge device types and clusterIds
const hassDomainAttributeConverter: { domain: string; attribute: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId }[] = [
  { domain: 'light', attribute: 'brightness', deviceType: dimmableLight, clusterId: LevelControlCluster.id },
  { domain: 'light', attribute: 'color_temp', deviceType: colorTemperatureLight, clusterId: ColorControlCluster.id },
  { domain: 'light', attribute: 'hs_color', deviceType: colorTemperatureLight, clusterId: ColorControlCluster.id },
  { domain: 'light', attribute: 'xy_color', deviceType: colorTemperatureLight, clusterId: ColorControlCluster.id },
];

// Convert Home Assistant domains services to Matterbridge commands for device types
// prettier-ignore
const hassCommandConverter: { command: string; deviceType: DeviceTypeDefinition; domain: string; service: string; converter?: any }[] = [
  { command: 'on', deviceType: onOffSwitch, domain: 'switch', service: 'turn_on' },
  { command: 'off', deviceType: onOffSwitch, domain: 'switch', service: 'turn_off' },
  { command: 'toggle', deviceType: onOffSwitch, domain: 'switch', service: 'toggle' },

  { command: 'on', deviceType: onOffLight, domain: 'light', service: 'turn_on' },
  { command: 'off', deviceType: onOffLight, domain: 'light', service: 'turn_off' },
  { command: 'toggle', deviceType: onOffLight, domain: 'light', service: 'toggle' },
  { command: 'moveToLevel', deviceType: onOffLight, domain: 'light', service: 'turn_on', converter: (request: any) => { return { brightness: Math.round(request.level / 254 * 255) } } },
  { command: 'moveToLevelWithOnOff', deviceType: onOffLight, domain: 'light', service: 'turn_on', converter: (request: any) => { return { brightness: Math.round(request.level / 254 * 255) } } },
  { command: 'moveToColorTemperature', deviceType: onOffLight, domain: 'light', service: 'turn_on', converter: (request: any) => { return { color_temp: request.colorTemperatureMireds } } },
  { command: 'moveToColor', deviceType: onOffLight, domain: 'light', service: 'turn_on', converter: (request: any) => { return { xy_color: [request.colorX, request.colorY] } } },
  { command: 'moveToHue', deviceType: onOffLight, domain: 'light', service: 'turn_on', converter: (request: any, attributes: any) => { return { hs_color: [Math.round(request.hue / 254 * 360), Math.round(attributes.currentSaturation.value / 254 * 100)] } } },
  { command: 'moveToSaturation', deviceType: onOffLight, domain: 'light', service: 'turn_on', converter: (request: any, attributes: any) => { return { hs_color: [Math.round(attributes.currentHue.value / 254 * 360), Math.round(request.saturation / 254 * 100)] } } },
  { command: 'moveToHueAndSaturation', deviceType: onOffLight, domain: 'light', service: 'turn_on', converter: (request: any) => { return { hs_color: [Math.round(request.hue / 254 * 360), Math.round(request.saturation / 254 * 100)] } } },
  
  { command: 'lockDoor', deviceType: DeviceTypes.DOOR_LOCK, domain: 'lock', service: 'lock' },
  { command: 'unlockDoor', deviceType: DeviceTypes.DOOR_LOCK, domain: 'lock', service: 'unlock' },
];

// Convert Home Assistant domains services to Matterbridge commands for device types
// prettier-ignore
const hassSubscribeConverter: { domain: string; with: string; clusterId: ClusterId; attribute: string; converter?: any }[] = [
  { domain: 'fan', with: 'preset_mode', clusterId: FanControlCluster.id, attribute: 'fanMode' },
  { domain: 'fan', with: 'percentage', clusterId: FanControlCluster.id, attribute: 'percentSetting' },
]

export class HomeAssistantPlatform extends MatterbridgeDynamicPlatform {
  // NodeStorageManager
  private nodeStorageManager?: NodeStorageManager;
  private nodeStorage?: NodeStorage;

  // Config
  private host: string;
  private token: string;
  private whiteList: string[];
  private blackList: string[];

  // Home Assistant
  private ha: HomeAssistant;
  private hassDevices: HassDevice[] = [];
  private hassEntities: HassEntity[] = [];
  private hassStates: HassEntityState[] = [];
  private hassServices: HomeAssistantServices | null = null;
  private hassConfig: HomeAssistantConfig | null = null;

  private matterbridgeDevices = new Map<string, MatterbridgeDevice>();
  private bridgedHassDevices = new Map<string, HassDevice>();

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

    this.host = (config.host as string) ?? '';
    this.token = (config.token as string) ?? '';
    this.whiteList = (config.whiteList as string[]) ?? [];
    this.blackList = (config.blackList as string[]) ?? [];

    if (this.host === '' || this.token === '') {
      throw new Error('Host and token must be defined in the configuration');
    }

    this.ha = new HomeAssistant(this.host, this.token);

    this.ha.on('connected', (ha_version: HomeAssistantPrimitive) => {
      this.log.notice(`Connected to Home Assistant ${ha_version}`);
    });

    this.ha.on('disconnected', () => {
      this.log.warn('Disconnected from Home Assistant');
    });

    this.ha.on('subscribed', () => {
      this.log.info(`Subscribed to Home Assistant events`);
    });

    this.ha.on('config', (config: HomeAssistantConfig) => {
      this.log.info('Configuration received from Home Assistant');
      this.hassConfig = config;
    });

    this.ha.on('services', (services: HomeAssistantServices) => {
      this.log.info('Services received from Home Assistant');
      this.hassServices = services;
    });

    this.ha.on('devices', (devices: HassDevice[]) => {
      this.log.info('Devices received from Home Assistant');
      this.hassDevices = devices;
    });

    this.ha.on('entities', (entities: HassEntity[]) => {
      this.log.info('Entities received from Home Assistant');
      this.hassEntities = entities;
    });

    this.ha.on('states', (states: HassEntityState[]) => {
      this.log.info('States received from Home Assistant');
      this.hassStates = states;
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
      devices: this.hassDevices,
      entities: this.hassEntities,
      states: this.hassStates,
      config: this.hassConfig,
      services: this.hassServices,
    };
    fs.writeFile(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-hass', 'homeassistant.json'), JSON.stringify(payload, null, 2))
      .then(() => {
        this.log.debug('Payload successfully written to homeassistant.json');
      })
      .catch((error) => {
        this.log.error('Error writing payload to file:', error);
      });

    // Scan devices and entities and create Matterbridge devices
    for (const device of this.hassDevices) {
      const name = device.name_by_user ?? device.name ?? 'Unknown';
      if (!isValidString(device.name) || !this.validateWhiteBlackList(device.name)) continue;

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
      };

      // Scan entities for supported domains and services and add them to the Matterbridge device
      for (const entity of this.hassEntities) {
        // this.hassEntities.forEach(async (entity) => {
        if (entity.device_id !== device.id) continue;

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
        let supported_color_modes: string[] = [];
        const hassState = this.hassStates.find((s) => s.entity_id === entity.entity_id);
        if (hassState) {
          this.log.debug(`- state ${debugStringify(hassState)}`);
          for (const [key, value] of Object.entries(hassState.attributes)) {
            this.log.debug(`- attribute ${CYAN}${key}${db} value ${typeof value === 'object' && value ? debugStringify(value) : value}`);
            const hassDomainAttributes = hassDomainAttributeConverter.filter((d) => d.domain === domain && d.attribute === key);
            hassDomainAttributes.forEach((hassDomainAttribute) => {
              deviceType = hassDomainAttribute.deviceType;
              clusterIds.set(hassDomainAttribute.clusterId, hassDomainAttribute.clusterId);
            });
            if (key === 'supported_color_modes') {
              supported_color_modes = value as string[];
            }
          }
        } else {
          this.log.debug(`Lookup device ${CYAN}${device.name}${db} domain ${CYAN}${CYAN}${domain}${db} entity ${CYAN}${entity.entity_id}${db}: state not found`);
        }

        // Create the device if not already created
        if (!mbDevice) await createdDevice();
        let child: Endpoint | undefined = undefined;
        if (deviceType) {
          child = mbDevice?.addChildDeviceTypeWithClusterServer(entity.entity_id, [deviceType], Array.from(clusterIds.values()));
          // Special case for light domain: configure the color control cluster
          if (domain === 'light' && deviceType === colorTemperatureLight) {
            await mbDevice?.configureColorControlCluster(
              supported_color_modes.includes('hs') || supported_color_modes.includes('rgb'),
              supported_color_modes.includes('xy') || supported_color_modes.includes('rgb'),
              supported_color_modes.includes('color_temp'),
              undefined,
              child,
            );
            if (supported_color_modes.includes('color_temp') && hassState?.attributes['min_mireds'] && hassState?.attributes['max_mireds']) {
              await mbDevice?.setAttribute(ColorControlCluster.id, 'colorTempPhysicalMinMireds', hassState?.attributes['min_mireds'], mbDevice.log, child);
              await mbDevice?.setAttribute(ColorControlCluster.id, 'colorTempPhysicalMaxMireds', hassState?.attributes['max_mireds'], mbDevice.log, child);
            }
          }
        }

        // Add Matter command handlers for supported domains and services
        const hassCommands = hassCommandConverter.filter((c) => c.domain === domain);
        if (hassCommands.length > 0) {
          hassCommands.forEach((hassCommand) => {
            this.log.debug(`- command: ${CYAN}${hassCommand.command}${db}`);
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            mbDevice?.addCommandHandler(hassCommand.command, async (data) => {
              this.commandHandler(mbDevice, data.endpoint, data.request, data.attributes, hassCommand.command);
            });
          });
        }

        // Subscribe to the Matter writable attributes
        const hassSubscribed = hassSubscribeConverter.filter((s) => s.domain === domain);
        if (hassSubscribed.length > 0) {
          hassSubscribed.forEach((hassSubscribe) => {
            this.log.debug(`- subscribe: ${CYAN}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${CYAN}${hassSubscribe.attribute}${db}`);
            mbDevice?.subscribeAttribute(
              hassSubscribe.clusterId,
              hassSubscribe.attribute,
              (newValue: any, oldValue: any) => {
                mbDevice?.log.info(
                  `${db}Endpoint ${or}${child?.name}${db}:${or}${child?.number}${db} subscribed attribute ${hk}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${hk}${hassSubscribe.attribute}${db} changed from ${YELLOW}${oldValue}${db} to ${YELLOW}${newValue}${db}`,
                );
              },
              mbDevice?.log,
              child,
            );
          });
        }
      } // hassEntities

      // Register the device if we have found supported domains and services
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
      this.hassStates = await this.ha.fetchAsync('get_states');
      this.hassStates?.forEach((state) => {
        const entity = this.hassEntities.find((entity) => entity.entity_id === state.entity_id);
        const deviceId = entity?.device_id;
        if (deviceId && this.bridgedHassDevices.has(deviceId)) {
          this.log.debug(`Configuring state ${CYAN}${state.entity_id}${nf} for device ${idn}${deviceId}${rs}${nf}` /* , state*/);
          this.updateHandler(deviceId, state.entity_id, state, state);
        }
      });
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
    if (!mbDevice) return;
    this.log.info(
      `${db}Received matter command ${ign}${command}${rs}${db} from device ${idn}${mbDevice?.deviceName}${rs}${db} for endpoint ${or}${endpoint.name}:${endpoint.number}${db}`,
    );
    const entityId = endpoint.number ? mbDevice.getChildEndpoint(endpoint.number)?.uniqueStorageKey : undefined;
    if (!entityId) return;
    const domain = entityId.split('.')[0];
    const hassCommand = hassCommandConverter.find((update) => update.command === command && update.domain === domain);
    if (hassCommand) {
      // console.log('Command:', command, 'Domain:', domain, 'HassCommand:', hassCommand, 'Request:', request, 'Attributes:', attributes);
      const serviceAttributes: Record<string, HomeAssistantPrimitive> = hassCommand.converter ? hassCommand.converter(request, attributes) : undefined;
      this.ha.callService(hassCommand.domain, hassCommand.service, entityId, serviceAttributes);
    } else {
      this.log.warn(`Command ${ign}${command}${rs}${wr} not supported for domain ${CYAN}${domain}${wr} entity ${CYAN}${entityId}${wr}`);
    }
  }

  async updateHandler(deviceId: string, entityId: string, old_state: HassEntityState, new_state: HassEntityState) {
    const mbDevice = this.matterbridgeDevices.get(deviceId);
    if (!mbDevice) return;
    const endpoint = mbDevice.getChildEndpointByName(entityId);
    if (!endpoint) return;
    this.log.info(
      `${db}Received update event from Home Assistant device ${idn}${mbDevice?.deviceName}${rs}${db} entity ${CYAN}${entityId}${db} ` +
        `from ${YELLOW}${old_state.state}${db} with ${debugStringify(old_state.attributes)}${db} to ${YELLOW}${new_state.state}${db} with ${debugStringify(new_state.attributes)}`,
    );
    const domain = entityId.split('.')[0];
    // Update state of the device
    const hassUpdateState = hassUpdateStateConverter.find((updateState) => updateState.domain === domain && updateState.state === new_state.state);
    if (hassUpdateState) {
      await mbDevice.setAttribute(hassUpdateState.clusterId, hassUpdateState.attribute, hassUpdateState.value, mbDevice.log, endpoint);
    } else {
      this.log.warn(`Update ${CYAN}${domain}${wr}:${CYAN}${new_state.state}${wr} not supported for entity ${entityId}`);
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
          const convertedValue = update.converter(value);
          if (convertedValue !== null) await mbDevice.setAttribute(update.clusterId, update.attribute, convertedValue, mbDevice.log, endpoint);
        }
      }
    }
  }

  validateWhiteBlackList(entityName: string) {
    if (this.whiteList.length > 0 && !this.whiteList.find((name) => name === entityName)) {
      this.log.warn(`Skipping ${dn}${entityName}${wr} because not in whitelist`);
      return false;
    }
    if (this.blackList.length > 0 && this.blackList.find((name) => name === entityName)) {
      this.log.warn(`Skipping ${dn}${entityName}${wr} because in blacklist`);
      return false;
    }
    return true;
  }
}
