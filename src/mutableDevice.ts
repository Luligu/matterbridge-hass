/**
 * This file contains the class MutableDevice.
 *
 * @file src\mutableDevice.ts
 * @author Luca Liguori
 * @date 2024-12-08
 * @version 1.0.0
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

// Node.js imports
import { createHash, randomBytes } from 'node:crypto';

// Matterbridge imports
import {
  Matterbridge,
  MatterbridgeEndpoint,
  MatterbridgeSmokeCoAlarmServer,
  DeviceTypeDefinition,
  colorTemperatureLight,
  colorTemperatureSwitch,
  dimmableLight,
  dimmableOutlet,
  dimmableSwitch,
  extendedColorLight,
  onOffLight,
  onOffOutlet,
  onOffSwitch,
  MatterbridgeColorControlServer,
  MatterbridgeThermostatServer,
} from 'matterbridge';
import { db, debugStringify, idn, ign, rs, CYAN } from 'matterbridge/logger';

// @matter imorts
import { AtLeastOne, Behavior } from 'matterbridge/matter';
import { VendorId, ClusterId, Semtag, ClusterRegistry } from 'matterbridge/matter/types';
import { BooleanState, BridgedDeviceBasicInformation, ColorControl, SmokeCoAlarm, Thermostat } from 'matterbridge/matter/clusters';
import { BooleanStateServer, BridgedDeviceBasicInformationServer } from 'matterbridge/matter/behaviors';

interface ClusterServerObj {
  id: ClusterId;
  type: Behavior.Type;
  options: Behavior.Options;
}

interface MutableDeviceInterface {
  endpoint?: MatterbridgeEndpoint;
  friendlyName: string;
  tagList: Semtag[];
  deviceTypes: DeviceTypeDefinition[];
  clusterServersIds: ClusterId[];
  clusterServersObjs: ClusterServerObj[];
  clusterClientsIds: ClusterId[];
  clusterClientsObjs: ClusterServerObj[];
}

export function getClusterServerObj<T extends Behavior.Type>(clusterId: ClusterId, type: T, options: Behavior.Options<T>) {
  return { id: clusterId, type, options };
}

export class MutableDevice {
  protected readonly mutableDevice = new Map<string, MutableDeviceInterface>();
  protected readonly matterbridge: Matterbridge;

  deviceName: string;
  serialNumber: string;
  vendorId: VendorId;
  vendorName: string;
  productName: string;
  softwareVersion: number;
  softwareVersionString: string;
  hardwareVersion: number;
  hardwareVersionString: string;

  composedType: string | undefined = undefined;

  constructor(
    matterbridge: Matterbridge,
    deviceName: string,
    serialNumber?: string,
    vendorId = 0xfff1,
    vendorName = 'Matterbridge',
    productName = 'Matterbridge Device',
    softwareVersion?: number,
    softwareVersionString?: string,
    hardwareVersion?: number,
    hardwareVersionString?: string,
  ) {
    this.matterbridge = matterbridge;
    this.deviceName = deviceName;
    this.serialNumber = serialNumber ?? '0x' + randomBytes(8).toString('hex');
    this.vendorId = VendorId(vendorId);
    this.vendorName = vendorName;
    this.productName = productName;
    this.softwareVersion = softwareVersion ?? parseInt(matterbridge.matterbridgeVersion.replace(/\D/g, ''));
    this.softwareVersionString = softwareVersionString ?? matterbridge.matterbridgeVersion;
    this.hardwareVersion = hardwareVersion ?? parseInt(this.matterbridge.systemInformation.nodeVersion.replace(/\D/g, ''));
    this.hardwareVersionString = hardwareVersionString ?? this.matterbridge.systemInformation.nodeVersion;
    this.initializeEndpoint('');
  }

  has(endpoint: string): boolean {
    return this.mutableDevice.has(endpoint);
  }

  get(endpoint = ''): MutableDeviceInterface {
    if (this.mutableDevice.get(endpoint) === undefined) throw new Error(`Device ${endpoint} is not defined`);
    return this.mutableDevice.get(endpoint) as MutableDeviceInterface;
  }

  getEndpoint(endpoint = ''): MatterbridgeEndpoint {
    if (this.mutableDevice.get(endpoint)?.endpoint === undefined) throw new Error(`Device ${endpoint} endpoint is not defined`);
    return this.mutableDevice.get(endpoint)?.endpoint as MatterbridgeEndpoint;
  }

  private initializeEndpoint(endpoint: string) {
    if (!this.mutableDevice.has(endpoint)) {
      this.mutableDevice.set(endpoint, {
        friendlyName: endpoint,
        tagList: [],
        deviceTypes: [],
        clusterServersIds: [],
        clusterServersObjs: [],
        clusterClientsIds: [],
        clusterClientsObjs: [],
      });
    }
    return this.mutableDevice.get(endpoint) as MutableDeviceInterface;
  }

  setFriendlyName(endpoint: string, friendlyName: string) {
    const device = this.initializeEndpoint(endpoint);
    device.friendlyName = friendlyName;
    return this;
  }

  addTagLists(endpoint: string, ...tagList: Semtag[]) {
    const device = this.initializeEndpoint(endpoint);
    device.tagList.push(...tagList);
  }

  addDeviceTypes(endpoint: string, ...deviceTypes: DeviceTypeDefinition[]) {
    const device = this.initializeEndpoint(endpoint);
    device.deviceTypes.push(...deviceTypes);
  }

  addClusterServerIds(endpoint: string, ...clusterServerIds: ClusterId[]) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersIds.push(...clusterServerIds);
  }

  addClusterServerObjs(endpoint: string, ...clusterServerObj: ClusterServerObj[]) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(...clusterServerObj);
  }

  addClusterServerBooleanState(endpoint: string, stateValue: boolean) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(
        BooleanState.Cluster.id,
        BooleanStateServer.enable({
          events: { stateChange: true },
        }),
        {
          stateValue,
        },
      ),
    );
  }

  addClusterServerSmokeCoAlarm(endpoint: string, smokeState: SmokeCoAlarm.ExpressedState) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(
        SmokeCoAlarm.Cluster.id,
        MatterbridgeSmokeCoAlarmServer.with(SmokeCoAlarm.Feature.SmokeAlarm).enable({
          events: {
            smokeAlarm: true,
            interconnectSmokeAlarm: false,
            coAlarm: false,
            interconnectCoAlarm: false,
            lowBattery: true,
            hardwareFault: true,
            endOfService: true,
            selfTestComplete: true,
            alarmMuted: true,
            muteEnded: true,
            allClear: true,
          },
        }),
        {
          smokeState,
          expressedState: SmokeCoAlarm.ExpressedState.Normal,
          batteryAlert: SmokeCoAlarm.AlarmState.Normal,
          deviceMuted: SmokeCoAlarm.MuteState.NotMuted,
          testInProgress: false,
          hardwareFaultAlert: false,
          endOfServiceAlert: SmokeCoAlarm.EndOfService.Normal,
        },
      ),
    );
  }

  addClusterServerColorTemperatureColorControl(endpoint: string, colorTemperatureMireds: number, colorTempPhysicalMinMireds: number, colorTempPhysicalMaxMireds: number) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(ColorControl.Cluster.id, MatterbridgeColorControlServer.with(ColorControl.Feature.ColorTemperature), {
        colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
        enhancedColorMode: ColorControl.EnhancedColorMode.ColorTemperatureMireds,
        colorCapabilities: { xy: false, hueSaturation: false, colorLoop: false, enhancedHue: false, colorTemperature: true },
        options: {
          executeIfOff: false,
        },
        numberOfPrimaries: null,
        colorTemperatureMireds,
        colorTempPhysicalMinMireds,
        colorTempPhysicalMaxMireds,
        coupleColorTempToLevelMinMireds: colorTempPhysicalMinMireds,
        remainingTime: 0,
        startUpColorTemperatureMireds: null,
      }),
    );
  }

  addClusterServerColorControl(endpoint: string, colorTemperatureMireds: number, colorTempPhysicalMinMireds: number, colorTempPhysicalMaxMireds: number) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
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
          currentX: 0,
          currentY: 0,
          currentHue: 0,
          currentSaturation: 0,
          colorTemperatureMireds,
          colorTempPhysicalMinMireds,
          colorTempPhysicalMaxMireds,
          coupleColorTempToLevelMinMireds: colorTempPhysicalMinMireds,
          remainingTime: 0,
          startUpColorTemperatureMireds: null,
        },
      ),
    );
  }

  addClusterServerAutoModeThermostat(
    endpoint: string,
    localTemperature: number,
    occupiedHeatingSetpoint: number,
    occupiedCoolingSetpoint: number,
    minSetpointLimit: number,
    maxSetpointLimit: number,
  ) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(Thermostat.Cluster.id, MatterbridgeThermostatServer.with(Thermostat.Feature.AutoMode, Thermostat.Feature.Heating, Thermostat.Feature.Cooling), {
        localTemperature: localTemperature * 100,
        systemMode: Thermostat.SystemMode.Auto,
        controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingAndHeating,
        // Thermostat.Feature.Heating
        occupiedHeatingSetpoint: occupiedHeatingSetpoint * 100,
        minHeatSetpointLimit: minSetpointLimit * 100,
        absMinHeatSetpointLimit: minSetpointLimit * 100,
        maxHeatSetpointLimit: maxSetpointLimit * 100,
        absMaxHeatSetpointLimit: maxSetpointLimit * 100,
        // Thermostat.Feature.Cooling
        occupiedCoolingSetpoint: occupiedCoolingSetpoint * 100,
        minCoolSetpointLimit: minSetpointLimit * 100,
        absMinCoolSetpointLimit: minSetpointLimit * 100,
        maxCoolSetpointLimit: maxSetpointLimit * 100,
        absMaxCoolSetpointLimit: maxSetpointLimit * 100,
        // Thermostat.Feature.AutoMode
        minSetpointDeadBand: 1 * 100,
        thermostatRunningMode: Thermostat.ThermostatRunningMode.Off,
      }),
    );
  }
  addClusterServerHeatingThermostat(endpoint: string, localTemperature: number, occupiedHeatingSetpoint: number, minSetpointLimit: number, maxSetpointLimit: number) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(Thermostat.Cluster.id, MatterbridgeThermostatServer.with(Thermostat.Feature.Heating), {
        localTemperature: localTemperature * 100,
        systemMode: Thermostat.SystemMode.Heat,
        controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.HeatingOnly,
        // Thermostat.Feature.Heating
        occupiedHeatingSetpoint: occupiedHeatingSetpoint * 100,
        minHeatSetpointLimit: minSetpointLimit * 100,
        absMinHeatSetpointLimit: minSetpointLimit * 100,
        maxHeatSetpointLimit: maxSetpointLimit * 100,
        absMaxHeatSetpointLimit: maxSetpointLimit * 100,
      }),
    );
  }
  addClusterServerCoolingThermostat(endpoint: string, localTemperature: number, occupiedCoolingSetpoint: number, minSetpointLimit: number, maxSetpointLimit: number) {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(Thermostat.Cluster.id, MatterbridgeThermostatServer.with(Thermostat.Feature.Cooling), {
        localTemperature: localTemperature * 100,
        systemMode: Thermostat.SystemMode.Cool,
        controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingOnly,
        // Thermostat.Feature.Cooling
        occupiedCoolingSetpoint: occupiedCoolingSetpoint * 100,
        minCoolSetpointLimit: minSetpointLimit * 100,
        absMinCoolSetpointLimit: minSetpointLimit * 100,
        maxCoolSetpointLimit: maxSetpointLimit * 100,
        absMaxCoolSetpointLimit: maxSetpointLimit * 100,
      }),
    );
  }

  private createUniqueId(param1: string, param2: string, param3: string, param4: string) {
    const hash = createHash('md5');
    hash.update(param1 + param2 + param3 + param4);
    return hash.digest('hex');
  }

  addBridgedDeviceBasicInformationClusterServer() {
    const device = this.getEndpoint('');
    device.log.logName = this.deviceName;
    device.deviceName = this.deviceName;
    device.serialNumber = this.serialNumber;
    device.uniqueId = this.createUniqueId(this.deviceName, this.serialNumber, this.vendorName, this.productName);
    device.productId = undefined;
    device.productName = this.productName;
    device.vendorId = this.vendorId;
    device.vendorName = this.vendorName;
    device.softwareVersion = this.softwareVersion;
    device.softwareVersionString = this.softwareVersionString;
    device.hardwareVersion = this.hardwareVersion;
    device.hardwareVersionString = this.hardwareVersionString;

    this.addClusterServerObjs(
      '',
      getClusterServerObj(BridgedDeviceBasicInformation.Cluster.id, BridgedDeviceBasicInformationServer, {
        vendorId: this.vendorId,
        vendorName: this.vendorName.slice(0, 32),
        productName: this.productName.slice(0, 32),
        productLabel: this.deviceName.slice(0, 64),
        nodeLabel: this.deviceName.slice(0, 32),
        serialNumber: this.serialNumber.slice(0, 32),
        uniqueId: this.createUniqueId(this.deviceName, this.serialNumber, this.vendorName, this.productName),
        softwareVersion: this.softwareVersion,
        softwareVersionString: this.softwareVersionString.slice(0, 64),
        hardwareVersion: this.hardwareVersion,
        hardwareVersionString: this.hardwareVersionString.slice(0, 64),
        reachable: true,
      }),
    );
  }

  async create() {
    await this.createMainEndpoint();
    await this.createChildEndpoints();
    for (const [endpoint] of this.mutableDevice) {
      await this.createClusters(endpoint);
    }
    const mainDevice = this.mutableDevice.get('') as MutableDeviceInterface;
    return mainDevice.endpoint as MatterbridgeEndpoint;
  }

  private removeDuplicateAndSupersetDeviceTypes() {
    // Remove duplicates and superset device types on all endpoints
    for (const device of this.mutableDevice.values()) {
      const deviceTypesMap = new Map<number, DeviceTypeDefinition>();
      device.deviceTypes.forEach((deviceType) => {
        deviceTypesMap.set(deviceType.code, deviceType);
      });
      if (deviceTypesMap.has(onOffSwitch.code) && deviceTypesMap.has(dimmableSwitch.code)) deviceTypesMap.delete(onOffSwitch.code);
      if (deviceTypesMap.has(onOffSwitch.code) && deviceTypesMap.has(colorTemperatureSwitch.code)) deviceTypesMap.delete(onOffSwitch.code);
      if (deviceTypesMap.has(dimmableSwitch.code) && deviceTypesMap.has(colorTemperatureSwitch.code)) deviceTypesMap.delete(dimmableSwitch.code);

      if (deviceTypesMap.has(onOffOutlet.code) && deviceTypesMap.has(dimmableOutlet.code)) deviceTypesMap.delete(onOffOutlet.code);

      if (deviceTypesMap.has(onOffLight.code) && deviceTypesMap.has(dimmableLight.code)) deviceTypesMap.delete(onOffLight.code);
      if (deviceTypesMap.has(onOffLight.code) && deviceTypesMap.has(colorTemperatureLight.code)) deviceTypesMap.delete(onOffLight.code);
      if (deviceTypesMap.has(onOffLight.code) && deviceTypesMap.has(extendedColorLight.code)) deviceTypesMap.delete(onOffLight.code);

      if (deviceTypesMap.has(dimmableLight.code) && deviceTypesMap.has(colorTemperatureLight.code)) deviceTypesMap.delete(dimmableLight.code);
      if (deviceTypesMap.has(dimmableLight.code) && deviceTypesMap.has(extendedColorLight.code)) deviceTypesMap.delete(dimmableLight.code);

      if (deviceTypesMap.has(colorTemperatureLight.code) && deviceTypesMap.has(extendedColorLight.code)) deviceTypesMap.delete(colorTemperatureLight.code);
      device.deviceTypes = Array.from(deviceTypesMap.values());
    }
  }

  async createMainEndpoint() {
    // Remove duplicates and superset device types on all endpoints
    this.removeDuplicateAndSupersetDeviceTypes();

    // Create the mutable device for the main endpoint
    const mainDevice = this.mutableDevice.get('') as MutableDeviceInterface;
    mainDevice.friendlyName = this.deviceName;
    mainDevice.endpoint = new MatterbridgeEndpoint(mainDevice.deviceTypes as AtLeastOne<DeviceTypeDefinition>, { uniqueStorageKey: this.deviceName }, true);
    mainDevice.endpoint.log.logName = this.deviceName;
    return mainDevice.endpoint;
  }

  async createChildEndpoint(endpoint: string) {
    // Remove duplicates and superset device types on all endpoints
    this.removeDuplicateAndSupersetDeviceTypes();

    // Get the main endpoint
    const mainDevice = this.mutableDevice.get('') as MutableDeviceInterface;
    if (!mainDevice.endpoint) throw new Error('Main endpoint is not defined. Call createMainEndpoint() first.');

    // Create the child endpoint
    const device = this.mutableDevice.get(endpoint) as MutableDeviceInterface;
    if (!device) throw new Error(`Device ${endpoint} is not defined.`);
    device.endpoint = mainDevice.endpoint.addChildDeviceType(
      endpoint,
      device.deviceTypes as AtLeastOne<DeviceTypeDefinition>,
      device.tagList.length ? { tagList: device.tagList } : {},
      true,
    );
    device.endpoint.log.logName = device.friendlyName;
    return device.endpoint;
  }

  async createChildEndpoints() {
    // Remove duplicates and superset device types on all endpoints
    this.removeDuplicateAndSupersetDeviceTypes();

    // Get the main endpoint
    const mainDevice = this.mutableDevice.get('') as MutableDeviceInterface;
    if (!mainDevice.endpoint) throw new Error('Main endpoint is not defined. Call createMainEndpoint() first.');

    // Create the child endpoints
    for (const [endpoint, device] of Array.from(this.mutableDevice.entries()).filter(([endpoint]) => endpoint !== '')) {
      device.endpoint = mainDevice.endpoint.addChildDeviceType(
        endpoint,
        device.deviceTypes as AtLeastOne<DeviceTypeDefinition>,
        device.tagList.length ? { tagList: device.tagList } : {},
        true,
      );
    }
    return this;
  }

  private removeDuplicateClusterServers() {
    // Filter out duplicate clusters and clusters objects on all endpoints
    for (const device of this.mutableDevice.values()) {
      // Filter out duplicate server clusters and server clusters objects. Remove the cluster server id when a cluster server object is present.
      const deviceClusterServersIdMap = new Map<ClusterId, ClusterId>();
      device.clusterServersIds.forEach((clusterServerId) => {
        deviceClusterServersIdMap.set(clusterServerId, clusterServerId);
      });
      const deviceClusterServersObjMap = new Map<ClusterId, ClusterServerObj>();
      device.clusterServersObjs.forEach((clusterServerObj) => {
        deviceClusterServersIdMap.delete(clusterServerObj.id);
        deviceClusterServersObjMap.set(clusterServerObj.id, clusterServerObj);
      });
      device.clusterServersIds = Array.from(deviceClusterServersIdMap.values());
      device.clusterServersObjs = Array.from(deviceClusterServersObjMap.values());

      // TODO: Uncomment when they are released in matter.js
      /*
      // Filter out duplicate client clusters and client clusters objects. Remove the cluster client id when a cluster client object is present.
      const deviceClusterClientsMap = new Map<ClusterId, ClusterId>();
      device.clusterClientsIds.forEach((clusterClient) => {
        deviceClusterClientsMap.set(clusterClient, clusterClient);
      });
      const deviceClusterClientsObjMap = new Map<ClusterId, ClusterClientObj>();
      device.clusterClientsObjs.forEach((clusterClientObj) => {
        deviceClusterClientsMap.delete(clusterClientObj.id);
        deviceClusterClientsObjMap.set(clusterClientObj.id, clusterClientObj);
      });
      device.clusterClientsIds = Array.from(deviceClusterClientsMap.values());
      device.clusterClientsObjs = Array.from(deviceClusterClientsObjMap.values());
      */
    }
  }

  async createClusters(endpoint: string) {
    // Filter out duplicate clusters and clusters objects on all endpoints
    this.removeDuplicateClusterServers();

    if (endpoint === '') {
      // Get the main endpoint
      const mainDevice = this.mutableDevice.get(endpoint) as MutableDeviceInterface;
      if (!mainDevice.endpoint) throw new Error('Main endpoint is not defined');

      // Add the cluster objects to the main endpoint
      this.addBridgedDeviceBasicInformationClusterServer();
      for (const clusterServerObj of mainDevice.clusterServersObjs) {
        mainDevice.endpoint.behaviors.require(clusterServerObj.type, clusterServerObj.options);
      }
      // Add the cluster ids to the main endpoint
      mainDevice.endpoint.addClusterServers(mainDevice.clusterServersIds);
      // Add the required clusters to the main endpoint
      mainDevice.endpoint.addRequiredClusterServers();
      // Add the Fixed Label cluster to the main endpoint
      if (this.composedType) await mainDevice.endpoint.addFixedLabel('composed', this.composedType);
      return this;
    }

    // Add clusters to the child endpoints
    for (const [, device] of Array.from(this.mutableDevice.entries()).filter(([e]) => e === endpoint)) {
      if (!device.endpoint) throw new Error('Child endpoint is not defined');
      // Add the cluster objects to the child endpoint
      for (const clusterServerObj of device.clusterServersObjs) {
        device.endpoint.behaviors.require(clusterServerObj.type, clusterServerObj.options);
      }
      // Add the cluster ids to the child endpoint
      device.endpoint.addClusterServers(device.clusterServersIds);
      // Add the required clusters to the child endpoint
      device.endpoint.addRequiredClusterServers();
    }
    return this;
  }

  logMutableDevice() {
    this.matterbridge.log.debug(
      `Device ${idn}${this.deviceName}${rs}${db} serial number ${CYAN}${this.serialNumber}${rs}${db} vendor id ${CYAN}${this.vendorId}${rs}${db} ` +
        `vendor name ${CYAN}${this.vendorName}${rs}${db} product name ${CYAN}${this.productName}${rs}${db} software version ${CYAN}${this.softwareVersion}${rs}${db} ` +
        `software version string ${CYAN}${this.softwareVersionString}${rs}${db} hardware version ${CYAN}${this.hardwareVersion}${rs}${db} hardware version string ${CYAN}${this.hardwareVersionString}`,
    );
    for (const [endpoint, device] of this.mutableDevice) {
      const deviceTypes = device.deviceTypes.map((d) => '0x' + d.code.toString(16) + '-' + d.name);
      const clusterServersIds = device.clusterServersIds.map((clusterServerId) => '0x' + clusterServerId.toString(16) + '-' + ClusterRegistry.get(clusterServerId)?.name);
      const clusterServersObjsIds = device.clusterServersObjs.map(
        (clusterServerObj) => '0x' + clusterServerObj.id.toString(16) + '-' + ClusterRegistry.get(clusterServerObj.id)?.name,
      );
      this.matterbridge.log.debug(
        `- endpoint: ${ign}${endpoint === '' ? 'main' : endpoint}${rs}${db} => friendlyName ${CYAN}${device.friendlyName}${db} ` +
          `${db}tagList: ${debugStringify(device.tagList)}${db} deviceTypes: ${debugStringify(deviceTypes)}${db} ` +
          `clusterServersIds: ${debugStringify(clusterServersIds)}${db} clusterServersObjs: ${debugStringify(clusterServersObjsIds)}${db}`,
      );
    }
    return this;
  }
}
