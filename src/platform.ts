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
  bridgedNode,
  ClusterId,
  ColorControl,
  ColorControlCluster,
  colorTemperatureLight,
  DeviceTypeDefinition,
  DeviceTypes,
  dimmableLight,
  DoorLock,
  DoorLockCluster,
  Endpoint,
  FanControl,
  FanControlCluster,
  LevelControlCluster,
  Matterbridge,
  MatterbridgeDevice,
  MatterbridgeDynamicPlatform,
  OnOffCluster,
  onOffLight,
  onOffSwitch,
  PlatformConfig,
} from 'matterbridge';
import { AnsiLogger, LogLevel, dn, idn, ign, nf, rs, wr, db, or, debugStringify, YELLOW, CYAN } from 'matterbridge/logger';
import { isValidNumber, isValidString, waiter } from 'matterbridge/utils';
import { NodeStorage, NodeStorageManager } from 'matterbridge/storage';

import path from 'path';
import { promises as fs } from 'fs';

import { HassDevice, HassEntity, HassEntityState, HomeAssistant, HomeAssistantConfig, HomeAssistantPrimitive, HomeAssistantServices } from './homeAssistant.js';

// eslint-disable
// prettier-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable
// prettier-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hassUpdateAttributeConverter: { domain: string; with: string; clusterId: ClusterId; attribute: string; converter: any }[] = [
  { domain: 'light', with: 'brightness', clusterId: LevelControlCluster.id, attribute: 'currentLevel', converter: (value: number) => (isValidNumber(value, 1, 255) ? (value / 255) * 254 : null) },
  { domain: 'light', with: 'color_mode', clusterId: ColorControlCluster.id, attribute: 'colorMode', converter: (value: string) => {
    if( isValidString(value, 2, 10) ) {
      if (value === 'hs') return ColorControl.ColorMode.CurrentHueAndCurrentSaturation;
      else if (value === 'xy') return ColorControl.ColorMode.CurrentXAndCurrentY;
      else if (value === 'color_temp') return ColorControl.ColorMode.ColorTemperatureMireds;
    } else return ColorControl.ColorMode.CurrentHueAndCurrentSaturation;
  } 
  },
];

const hassCommandConverter: { command: string; deviceType: DeviceTypeDefinition; domain: string; service: string }[] = [
  { command: 'on', deviceType: onOffSwitch, domain: 'switch', service: 'turn_on' },
  { command: 'off', deviceType: onOffSwitch, domain: 'switch', service: 'turn_off' },
  { command: 'toggle', deviceType: onOffSwitch, domain: 'switch', service: 'toggle' },
  { command: 'on', deviceType: onOffLight, domain: 'light', service: 'turn_on' },
  { command: 'off', deviceType: onOffLight, domain: 'light', service: 'turn_off' },
  { command: 'toggle', deviceType: onOffLight, domain: 'light', service: 'toggle' },
  { command: 'lockDoor', deviceType: DeviceTypes.DOOR_LOCK, domain: 'lock', service: 'lock' },
  { command: 'unlockDoor', deviceType: DeviceTypes.DOOR_LOCK, domain: 'lock', service: 'unlock' },
];

const hassDomainConverter: { domain: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId }[] = [
  { domain: 'switch', deviceType: onOffSwitch, clusterId: OnOffCluster.id },
  { domain: 'light', deviceType: onOffLight, clusterId: OnOffCluster.id },
  { domain: 'lock', deviceType: DeviceTypes.DOOR_LOCK, clusterId: DoorLockCluster.id },
];

const hassDomainAttributeConverter: { domain: string; attribute: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId }[] = [
  { domain: 'light', attribute: 'brightness', deviceType: dimmableLight, clusterId: LevelControlCluster.id },
  { domain: 'light', attribute: 'color_temp', deviceType: colorTemperatureLight, clusterId: ColorControlCluster.id },
  { domain: 'light', attribute: 'hs_color', deviceType: colorTemperatureLight, clusterId: ColorControlCluster.id },
  { domain: 'light', attribute: 'xy_color', deviceType: colorTemperatureLight, clusterId: ColorControlCluster.id },
];
// { min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6802, min_mireds: 147, max_mireds: 500, supported_color_modes: [ 'color_temp', 'hs', 'xy' ], color_mode: 'hs',
// brightness: 90, color_temp_kelvin: null, color_temp: null, hs_color: [ 0, 50.394 ], rgb_color: [ 255, 126, 126 ], xy_color: [ 0.528, 0.313 ],
// friendly_name: 'Light (XY, HS and CT) Light', supported_features: 32 }
// eslint-enable
// prettier-enable

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

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

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

    // Save devices, entities and states to a local file
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
    this.hassDevices.forEach((device) => {
      if (!device.name || !this.validateWhiteBlackList(device.name)) return;

      let mbDevice: MatterbridgeDevice | undefined;

      // Create a new Matterbridge device
      const createdDevice = () => {
        this.log.info(`Creating device ${idn}${device.name}${rs}${nf} id ${device.id}`);
        mbDevice = new MatterbridgeDevice(bridgedNode, undefined, this.config.debug as boolean);
        mbDevice.createDefaultBridgedDeviceBasicInformationClusterServer(
          device.name ?? 'Unknown',
          device.id + (isValidString(this.config.postfix, 1, 3) ? '-' + this.config.postfix : ''),
          0xfff1,
          'HomeAssistant',
          device.model ?? 'Unknown',
        );
      };

      // Scan entities for supported domains and services and add them to the Matterbridge device
      this.hassEntities.forEach((entity) => {
        if (entity.device_id !== device.id) return;
        const domain = entity.entity_id.split('.')[0];
        let deviceType: DeviceTypeDefinition | undefined;
        const clusterIds = new Map<ClusterId, ClusterId>();
        // this.log.debug(`***Scanning device ${device.name} entity ${entity.entity_id} domain ${CYAN}${domain}${db}`);

        // Add device type and ClusterIds for supported domains of the current entity. Skip the entity if no supported domains are found.
        const hassDomains = hassDomainConverter.filter((d) => d.domain === domain);
        if (hassDomains.length > 0) {
          hassDomains.forEach((hassDomain) => {
            deviceType = hassDomain.deviceType;
            clusterIds.set(hassDomain.clusterId, hassDomain.clusterId);
          });
        } else {
          return;
        }

        // Add device types and ClusterIds for supported attributes of the current entity state
        let supported_color_modes: string[] = [];
        const hassState = this.hassStates.find((s) => s.entity_id === entity.entity_id);
        if (hassState) {
          this.log.debug(`- entity ${CYAN}${entity.entity_id}${db} state ${debugStringify(hassState)}`);
          for (const [key, value] of Object.entries(hassState.attributes)) {
            this.log.debug(`- entity ${CYAN}${entity.entity_id}${db} attribute ${CYAN}${key}${db} value ${typeof value === 'object' && value ? debugStringify(value) : value}`);
            const hassDomainAttributes = hassDomainAttributeConverter.filter((d) => d.domain === domain && d.attribute === key);
            hassDomainAttributes.forEach((hassDomainAttribute) => {
              deviceType = hassDomainAttribute.deviceType;
              clusterIds.set(hassDomainAttribute.clusterId, hassDomainAttribute.clusterId);
            });
            if (key === 'supported_color_modes') {
              supported_color_modes = value as string[];
              this.log.debug(`- entity ${CYAN}${entity.entity_id}${db} supported_color_modes ${debugStringify(supported_color_modes)}`);
            }
          }
        }

        // Create the device if not already created
        if (!mbDevice) createdDevice();
        if (deviceType) {
          const child = mbDevice?.addChildDeviceTypeWithClusterServer(entity.entity_id, [deviceType], Array.from(clusterIds.values()));
          // Special case for light domain
          if (domain === 'light' && deviceType === colorTemperatureLight) {
            mbDevice?.configureColorControlCluster(
              supported_color_modes.includes('hs'),
              supported_color_modes.includes('xy'),
              supported_color_modes.includes('color_temp'),
              undefined,
              child,
            );
          }
        }

        // Add command handlers for supported domains and services
        const hassCommands = hassCommandConverter.filter((c) => c.domain === domain);
        if (hassCommands.length > 0) {
          hassCommands.forEach((hassCommand) => {
            this.log.debug(`- entity ${CYAN}${entity.entity_id}${db} domain ${CYAN}${domain}${db} command: ${CYAN}${hassCommand.command}${db}`);
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            mbDevice?.addCommandHandler(hassCommand.command, async (data) => {
              this.commandHandler(mbDevice, data.endpoint, hassCommand.command, entity);
            });
          });
        }
      });

      // Register the device if we have found supported domains and services
      if (mbDevice && mbDevice.getChildEndpoints().length > 0) {
        this.log.debug(`Registering device ${dn}${device.name}${db}...`);
        this.registerDevice(mbDevice);
        this.matterbridgeDevices.set(device.id, mbDevice);
      }
    });
  }

  override async onConfigure() {
    this.log.info(`Configuring platform ${idn}${this.config.name}${rs}${nf}`);
    try {
      this.hassStates = await this.ha.fetchAsync('get_states');
      this.hassStates?.forEach((state) => {
        // const deviceId = this.hassEntities.get(state.entity_id)?.device_id;
        const entity = this.hassEntities.find((entity) => entity.entity_id === state.entity_id);
        const deviceId = entity?.device_id;
        if (deviceId) this.updateHandler(deviceId, state.entity_id, state, state);
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

  private async commandHandler(mbDevice: MatterbridgeDevice | undefined, endpoint: Endpoint, command: string, entity: HassEntity) {
    if (!mbDevice) return;
    this.log.info(
      `${db}Received command ${ign}${command}${rs}${db} from device ${idn}${mbDevice?.deviceName}${rs}${db} for endpoint ${or}${endpoint.name}:${endpoint.number}${db} entity ${entity.entity_id}`,
    );
    const domain = entity.entity_id.split('.')[0];
    const hassCommand = hassCommandConverter.find((update) => update.command === command && update.domain === domain);
    if (hassCommand) {
      this.ha.callService(hassCommand.domain, hassCommand.service, entity.entity_id);
    } else {
      this.log.warn(`Command ${CYAN}${command}${wr} not supported for entity ${entity.entity_id}`);
    }
  }

  private updateHandler(deviceId: string, entityId: string, old_state: HassEntityState, new_state: HassEntityState) {
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
    const hassUpdateState = hassUpdateStateConverter.find((update) => update.domain === domain && update.state === new_state.state);
    if (hassUpdateState) {
      mbDevice.setAttribute(hassUpdateState.clusterId, hassUpdateState.attribute, hassUpdateState.value, mbDevice.log, endpoint);
    } else {
      this.log.warn(`Update ${CYAN}${domain}${wr}:${CYAN}${new_state.state}${wr} not supported for entity ${entityId}`);
    }
    // Update attributes of the device
    const hassUpdateAttributes = hassUpdateAttributeConverter.filter((update) => update.domain === domain);
    if (hassUpdateAttributes.length > 0) {
      hassUpdateAttributes.forEach((update) => {
        const value = new_state.attributes[update.with];
        if (value) {
          const convertedValue = update.converter(value);
          mbDevice.setAttribute(update.clusterId, update.attribute, convertedValue, mbDevice.log, endpoint);
        }
      });
    }
  }

  private validateWhiteBlackList(entityName: string) {
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
