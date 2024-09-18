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

import { bridgedNode, Endpoint, Matterbridge, MatterbridgeDevice, MatterbridgeDynamicPlatform, OnOffCluster, onOffSwitch, PlatformConfig } from 'matterbridge';
import { AnsiLogger, LogLevel, dn, idn, ign, nf, rs, wr, db, or, debugStringify, YELLOW } from 'matterbridge/logger';
import { isValidString, waiter } from 'matterbridge/utils';
import { NodeStorage, NodeStorageManager } from 'matterbridge/storage';

import path from 'path';

import { HassEntity, HassEntityState, HomeAssistant } from './homeAssistant.js';
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

    this.ha.on('config', () => {
      this.log.info('Configuration received from Home Assistant');
    });

    this.ha.on('states', () => {
      this.log.info('States received from Home Assistant');
    });

    this.ha.on('services', () => {
      this.log.info('Services received from Home Assistant');
    });

    this.ha.on('devices', () => {
      this.log.info('Devices received from Home Assistant');
    });

    this.ha.on('entities', () => {
      this.log.info('Entities received from Home Assistant');
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

    // Wait for Home Assistant to be connected and fetch devices and entities and subscribe events
    this.ha.connect();
    const check = () => {
      return this.ha.connected && this.ha.devicesReceived && this.ha.entitiesReceived && this.ha.subscribed;
    };
    await waiter('Home Assistant connected', check, true, 50000, 1000);

    // Scan devices and entities and create Matterbridge devices
    this.ha.hassDevices.forEach((device) => {
      if (!device.name || !this.validateWhiteBlackList(device.name)) return;

      // Create a new Matterbridge device
      let mbDevice: MatterbridgeDevice | undefined;
      const createdDevice = () => {
        this.log.info(`Creating device ${idn}${device.name}${rs}${nf} id ${device.id}` /* , device*/);
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
    }
  }

  private updateHandler(deviceId: string, entityId: string, old_state: HassEntityState, new_state: HassEntityState) {
    const mbDevice = this.matterbridgeDevices.get(deviceId);
    if (!mbDevice) return;
    const endpoint = mbDevice.getChildEndpointByName(entityId);
    if (!endpoint) return;
    this.log.info(
      `${db}Received event from Home Assistant device ${idn}${mbDevice?.deviceName}${rs}${db} entity ${BLUE}${entityId}${db} ` +
        `from ${YELLOW}${old_state.state}${db} with ${debugStringify(old_state.attributes)}${db} to ${YELLOW}${new_state.state}${db} with ${debugStringify(new_state.attributes)}`,
    );
    if (entityId.startsWith('switch.')) {
      mbDevice.setAttribute(OnOffCluster.id, 'onOff', new_state.state === 'on', mbDevice.log, endpoint);
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
