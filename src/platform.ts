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
  DeviceTypes,
  DoorLock,
  DoorLockCluster,
  Endpoint,
  Matterbridge,
  MatterbridgeDevice,
  MatterbridgeDynamicPlatform,
  OnOffCluster,
  onOffSwitch,
  PlatformConfig,
} from 'matterbridge';
import { AnsiLogger, LogLevel, dn, idn, ign, nf, rs, wr, db, or, debugStringify, YELLOW } from 'matterbridge/logger';
import { isValidString, waiter } from 'matterbridge/utils';
import { NodeStorage, NodeStorageManager } from 'matterbridge/storage';

import path from 'path';
import { promises as fs } from 'fs';

import { HassDevice, HassEntity, HassEntityState, HomeAssistant, HomeAssistantConfig, HomeAssistantServices } from './homeAssistant.js';
import { BLUE } from 'node-ansi-logger';

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

    this.ha.on('connected', (ha_version: string) => {
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
      dir: path.join(this.matterbridge.matterbridgeDirectory, 'matterbridge-homeassistant'),
      writeQueue: false,
      expiredInterval: undefined,
      logging: false,
      forgiveParseErrors: true,
    });
    this.nodeStorage = await this.nodeStorageManager.createStorage('devices');

    // Create the plugin directory inside the Matterbridge plugin directory
    await fs.mkdir(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-homeassistant'), { recursive: true });

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
    };
    fs.writeFile(path.join(this.matterbridge.matterbridgePluginDirectory, 'matterbridge-homeassistant', 'homeassistant.json'), JSON.stringify(payload, null, 2))
      .then(() => {
        this.log.debug('Payload successfully written to homeassistant.json');
      })
      .catch((error) => {
        this.log.error('Error writing payload to file:', error);
      });

    // Scan devices and entities and create Matterbridge devices
    this.ha.hassDevices.forEach((device) => {
      if (!device.name || !this.validateWhiteBlackList(device.name)) return;

      // Create a new Matterbridge device
      let mbDevice: MatterbridgeDevice | undefined;
      const createdDevice = () => {
        this.log.info(`Creating device ${idn}${device.name}${rs}${nf} id ${device.id}`);
        const mbDevice = new MatterbridgeDevice(bridgedNode, undefined, this.config.debug as boolean);
        mbDevice.createDefaultBridgedDeviceBasicInformationClusterServer(
          device.name ?? 'Unknown',
          device.id + (isValidString(this.config.postfix, 1, 3) ? '-' + this.config.postfix : ''),
          0xfff1,
          'HomeAssistant',
          device.model ?? 'Unknown',
        );
        return mbDevice;
      };

      // Scan entities and add them to the device
      this.ha.hassEntities.forEach((entity) => {
        if (entity.device_id !== device.id) return;
        if (entity.entity_id.startsWith('switch.')) {
          // console.log('device', device);
          // console.log('entity', entity);
          if (!mbDevice) mbDevice = createdDevice();
          this.log.debug(`- entity ${entity.entity_id} ${dn}${entity.name ?? entity.original_name}${db}` /* , entity*/);
          mbDevice.addChildDeviceTypeWithClusterServer(entity.entity_id, [onOffSwitch]);

          // Add command handlers
          mbDevice.addCommandHandler('on', async (data) => {
            this.commandHandler(mbDevice, data.endpoint, 'on', entity);
          });
          mbDevice.addCommandHandler('off', async (data) => {
            this.commandHandler(mbDevice, data.endpoint, 'off', entity);
          });
          mbDevice.addCommandHandler('toggle', async (data) => {
            this.commandHandler(mbDevice, data.endpoint, 'toggle', entity);
          });
        } else if (entity.entity_id.startsWith('lock.')) {
          console.log('device', device);
          console.log('entity', entity);
          if (!mbDevice) mbDevice = createdDevice();
          this.log.debug(`- entity ${entity.entity_id} ${dn}${entity.name ?? entity.original_name}${db}` /* , entity*/);
          mbDevice.addChildDeviceTypeWithClusterServer(entity.entity_id, [DeviceTypes.DOOR_LOCK]);

          // Add command handlers
          mbDevice.addCommandHandler('lockDoor', async (data) => {
            this.commandHandler(mbDevice, data.endpoint, 'lockDoor', entity);
          });
          mbDevice.addCommandHandler('unlockDoor', async (data) => {
            this.commandHandler(mbDevice, data.endpoint, 'unlockDoor', entity);
          });
        }
      });

      // Register the device
      if (mbDevice && mbDevice.getChildEndpoints().length > 0) {
        this.log.debug(`Registering device ${dn}${device.name}${db}...` /* , device*/);
        this.registerDevice(mbDevice);
        this.matterbridgeDevices.set(device.id, mbDevice);
      }
    });
  }

  override async onConfigure() {
    this.log.info(`Configuring platform ${idn}${this.config.name}${rs}${nf}`);
    try {
      this.ha.hassStates = await this.ha.fetchAsync('get_states');
      this.ha.hassStates?.forEach((state) => {
        const deviceId = this.ha.hassEntities.get(state.entity_id)?.device_id;
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
      `${db}Received command ${ign}${command}${rs}${db} from device ${dn}${mbDevice?.deviceName}${db} for endpoint ${or}${endpoint.name}:${endpoint.number}${db} entity ${entity.entity_id}`,
    );
    if (entity.entity_id.startsWith('switch.')) {
      if (command === 'on') {
        this.ha.callService('switch', 'turn_on', entity.entity_id);
      } else if (command === 'off') {
        this.ha.callService('switch', 'turn_off', entity.entity_id);
      } else if (command === 'toggle') {
        this.ha.callService('switch', 'toggle', entity.entity_id);
      }
    } else if (entity.entity_id.startsWith('lock.')) {
      if (command === 'lockDoor') {
        this.ha.callService('lock', 'lock', entity.entity_id);
      } else if (command === 'unlockDoor') {
        this.ha.callService('lock', 'unlock', entity.entity_id);
      }
    }
  }

  private updateHandler(deviceId: string, entityId: string, old_state: HassEntityState, new_state: HassEntityState) {
    // eslint-disable
    // prettier-ignore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateConverter: { domain: string; state: string; clusterId: ClusterId; attribute: string; value: any }[] = [
      { domain: 'switch', state: 'on', clusterId: OnOffCluster.id, attribute: 'onOff', value: true },
      { domain: 'switch', state: 'off', clusterId: OnOffCluster.id, attribute: 'onOff', value: false },
      { domain: 'lock', state: 'locked', clusterId: DoorLockCluster.id, attribute: 'lockState', value: DoorLock.LockState.Locked },
      { domain: 'lock', state: 'unlocked', clusterId: DoorLockCluster.id, attribute: 'lockState', value: DoorLock.LockState.Unlocked },
      { domain: 'lock', state: 'locking', clusterId: DoorLockCluster.id, attribute: 'lockState', value: DoorLock.LockState.NotFullyLocked },
      { domain: 'lock', state: 'unlocking', clusterId: DoorLockCluster.id, attribute: 'lockState', value: DoorLock.LockState.NotFullyLocked },
    ];
    // eslint-enable

    const mbDevice = this.matterbridgeDevices.get(deviceId);
    if (!mbDevice) return;
    const endpoint = mbDevice.getChildEndpointByName(entityId);
    if (!endpoint) return;
    this.log.info(
      `${db}Received event from Home Assistant device ${idn}${mbDevice?.deviceName}${rs}${db} entity ${BLUE}${entityId}${db} ` +
        `from ${YELLOW}${old_state.state}${db} with ${debugStringify(old_state.attributes)}${db} to ${YELLOW}${new_state.state}${db} with ${debugStringify(new_state.attributes)}`,
    );
    const domain = entityId.split('.')[0];
    const update = updateConverter.find((update) => update.domain === domain && update.state === new_state.state);
    if (update) {
      mbDevice.setAttribute(update.clusterId, update.attribute, update.value, mbDevice.log, endpoint);
    }
    /*
    if (entityId.startsWith('switch.')) {
      mbDevice.setAttribute(OnOffCluster.id, 'onOff', new_state.state === 'on', mbDevice.log, endpoint);
      // console.log('deviceId', deviceId, 'entityId', entityId, 'state', new_state);
    } else if (entityId.startsWith('lock.')) {
      mbDevice.setAttribute(DoorLockCluster.id, 'lockState', new_state.state === 'locked' ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked, mbDevice.log, endpoint);
      console.log('deviceId', deviceId, 'entityId', entityId, 'state', new_state);
    }
      */
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
