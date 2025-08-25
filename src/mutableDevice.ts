/**
 * @description This file contains the class MutableDevice.
 * @file src\mutableDevice.ts
 * @author Luca Liguori
 * @created 2024-12-08
 * @version 1.3.0
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
  MatterbridgeEndpointCommands,
  CommandHandlerData,
  MatterbridgeFanControlServer,
} from 'matterbridge';
import { db, debugStringify, idn, ign, rs, CYAN } from 'matterbridge/logger';
import { ActionContext, AtLeastOne, Behavior } from 'matterbridge/matter';
import { VendorId, ClusterId, Semtag, ClusterRegistry } from 'matterbridge/matter/types';
import { BooleanState, BridgedDeviceBasicInformation, ColorControl, FanControl, PowerSource, SmokeCoAlarm, Thermostat } from 'matterbridge/matter/clusters';
import { BooleanStateServer, BridgedDeviceBasicInformationServer, PowerSourceServer } from 'matterbridge/matter/behaviors';

interface ClusterServerObj {
  id: ClusterId;
  type: Behavior.Type;
  options: Behavior.Options;
}

interface CommandHandler {
  endpointName: string;
  command: keyof MatterbridgeEndpointCommands;
  handler: (data: CommandHandlerData, endpointName: string, command: keyof MatterbridgeEndpointCommands) => void | Promise<void>;
}

interface SubscribeHandler {
  endpointName: string;
  clusterId: ClusterId;
  attribute: string;
  listener: (newValue: unknown, oldValue: unknown, context: ActionContext, endpointName: string, clusterId: ClusterId, attribute: string) => void;
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
  commandHandlers: CommandHandler[];
  subscribeHandlers: SubscribeHandler[];
}

/**
 * Creates a cluster server object with the specified cluster ID, type, and options.
 *
 * @template T - The type of the behavior.
 * @param {ClusterId} clusterId - The unique identifier for the cluster.
 * @param {T} type - The type of the behavior.
 * @param {Behavior.Options<T>} options - The options associated with the behavior type.
 *
 * @returns {{ id: ClusterId, type: T, options: Behavior.Options<T> }} The constructed cluster server object.
 */
export function getClusterServerObj<T extends Behavior.Type>(clusterId: ClusterId, type: T, options: Behavior.Options<T>): ClusterServerObj {
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
  configUrl: string | undefined = undefined;

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

  /**
   * Returns the number of elements in the mutable device.
   *
   * @returns {number} The size of the mutable device.
   */
  size(): number {
    return this.mutableDevice.size;
  }

  /**
   * Checks if the specified endpoint exists in the mutable device.
   *
   * @param {string} endpoint - The endpoint to check for existence.
   *
   * @returns {boolean} `true` if the endpoint exists; otherwise, `false`.
   */
  has(endpoint: string): boolean {
    return this.mutableDevice.has(endpoint);
  }

  /**
   * Retrieves the mutable device interface for the specified endpoint.
   * Throws an error if the device for the given endpoint is not defined.
   *
   * @param {string} endpoint - The endpoint identifier. Defaults to an empty string if not provided.
   *
   * @returns {MutableDeviceInterface} The `MutableDeviceInterface` associated with the endpoint.
   * @throws {Error} If the device for the specified endpoint is not defined.
   */
  get(endpoint: string = ''): MutableDeviceInterface {
    if (this.mutableDevice.get(endpoint) === undefined) throw new Error(`Device ${endpoint} is not defined`);
    return this.mutableDevice.get(endpoint) as MutableDeviceInterface;
  }

  /**
   * Retrieves the Matterbridge endpoint for the specified endpoint.
   * Throws an error if the endpoint is not defined.
   *
   * @param {string} endpoint - The endpoint identifier. Defaults to an empty string if not provided.
   *
   * @returns {MatterbridgeEndpoint} The `MatterbridgeEndpoint` associated with the endpoint.
   * @throws {Error} If the endpoint is not defined.
   */
  getEndpoint(endpoint: string = ''): MatterbridgeEndpoint {
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
        commandHandlers: [],
        subscribeHandlers: [],
      });
    }
    return this.mutableDevice.get(endpoint) as MutableDeviceInterface;
  }

  /**
   * Sets the friendly name for the specified endpoint.
   *
   * Initializes the endpoint if it does not exist, assigns the provided friendly name,
   * and returns the current instance for method chaining.
   *
   * @param {string} endpoint - The identifier of the endpoint to update.
   * @param {string} friendlyName - The new friendly name to assign to the endpoint.
   *
   * @returns {this} The current instance for chaining.
   */
  setFriendlyName(endpoint: string, friendlyName: string): this {
    const device = this.initializeEndpoint(endpoint);
    device.friendlyName = friendlyName;
    return this;
  }

  /**
   * Sets the composed type for the specified endpoint.
   *
   * @param {string} composedType - The new composed type to assign to the endpoint.
   *
   * @returns {this} The current instance for chaining.
   */
  setComposedType(composedType: string): this {
    this.composedType = composedType;
    return this;
  }

  /**
   * Sets the configuration URL for the device.
   *
   * The value is later applied to the main `MatterbridgeEndpoint` when clusters are created
   * (see `createClusters('')`) so that controllers can discover a link to an external
   * configuration page or UI for this bridged device.
   *
   * @param {string} configUrl - Absolute or relative URL pointing to a configuration resource.
   * @returns {this} The current instance for method chaining.
   */
  setConfigUrl(configUrl: string): this {
    this.configUrl = configUrl;
    return this;
  }

  /**
   * Adds one or more semantic tags to the specified endpoint.
   *
   * Initializes the endpoint if it does not yet exist and appends the provided
   * {@link Semtag} entries to the endpoint's tag list (order preserved; duplicates allowed).
   *
   * @param {string} endpoint - Endpoint identifier ('' for main endpoint).
   * @param {...Semtag[]} tagList - One or more semantic tag entries to add.
   * @returns {this} The current instance for chaining.
   */
  addTagLists(endpoint: string, ...tagList: Semtag[]): this {
    const device = this.initializeEndpoint(endpoint);
    device.tagList.push(...tagList);
    return this;
  }

  /**
   * Adds one or more Matter device types to the specified endpoint.
   *
   * No de-duplication is performed here; duplicate or superset pruning occurs later
   * in {@link removeDuplicatedAndSupersetDeviceTypes} during creation.
   *
   * @param {string} endpoint - Endpoint identifier ('' for main endpoint).
   * @param {...DeviceTypeDefinition[]} deviceTypes - Device type definitions to append.
   * @returns {this} The current instance for chaining.
   */
  addDeviceTypes(endpoint: string, ...deviceTypes: DeviceTypeDefinition[]): this {
    const device = this.initializeEndpoint(endpoint);
    device.deviceTypes.push(...deviceTypes);
    return this;
  }

  /**
   * Adds one or more cluster server IDs (simple form) to the specified endpoint.
   *
   * If a full cluster server object for the same ID is later added via
   * {@link addClusterServerObjs}, the raw ID will be removed during consolidation
   * in {@link removeDuplicatedClusterServers}.
   *
   * @param {string} endpoint - Endpoint identifier ('' for main endpoint).
   * @param {...ClusterId[]} clusterServerIds - Cluster server IDs to append.
   * @returns {this} The current instance for chaining.
   */
  addClusterServerIds(endpoint: string, ...clusterServerIds: ClusterId[]): this {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersIds.push(...clusterServerIds);
    return this;
  }

  /**
   * Adds one or more cluster server objects (typed behaviors with options) to the endpoint.
   *
   * When a cluster server object is present its raw ID counterpart (if previously added)
   * will be discarded later by {@link removeDuplicatedClusterServers} to avoid duplicates.
   *
   * @param {string} endpoint - Endpoint identifier ('' for main endpoint).
   * @param {...ClusterServerObj[]} clusterServerObj - One or more cluster server object descriptors.
   * @returns {this} The current instance for chaining.
   */
  addClusterServerObjs(endpoint: string, ...clusterServerObj: ClusterServerObj[]): this {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(...clusterServerObj);
    return this;
  }

  /**
   * Registers a command handler for a specific command on the given endpoint.
   *
   * The handler is invoked after endpoint creation (during {@link createClusters}) when the
   * command is executed via the `MatterbridgeEndpoint` behavior API.
   *
   * @param {string} endpoint - Endpoint identifier ('' for main endpoint).
   * @param {keyof MatterbridgeEndpointCommands} command - Command name to listen for.
   * @param {(data: CommandHandlerData, endpointName: string, command: keyof MatterbridgeEndpointCommands) => void | Promise<void>} handler - Async/sync handler.
   * @returns {this} The current instance for chaining.
   */
  addCommandHandler(
    endpoint: string,
    command: keyof MatterbridgeEndpointCommands,
    handler: (data: CommandHandlerData, endpointName: string, command: keyof MatterbridgeEndpointCommands) => void | Promise<void>,
  ): this {
    const device = this.initializeEndpoint(endpoint);
    device.commandHandlers.push({ endpointName: endpoint, command, handler });
    return this;
  }

  /**
   * Registers a subscription callback for attribute changes on a cluster server.
   *
   * The listener is attached during {@link createClusters}; it receives the new value,
   * old value, the action context, plus endpoint/cluster/attribute identifiers.
   *
   * @param {string} endpoint - Endpoint identifier ('' for main endpoint).
   * @param {ClusterId} clusterId - Cluster ID whose attribute is observed.
   * @param {string} attribute - Attribute name within the cluster.
   * @param {(newValue: unknown, oldValue: unknown, context: ActionContext, endpointName: string, clusterId: ClusterId, attribute: string) => void} listener - Change listener.
   * @returns {this} The current instance for chaining.
   */
  addSubscribeHandler(
    endpoint: string,
    clusterId: ClusterId,
    attribute: string,
    listener: (newValue: unknown, oldValue: unknown, context: ActionContext, endpointName: string, clusterId: ClusterId, attribute: string) => void,
  ): this {
    const device = this.initializeEndpoint(endpoint);
    device.subscribeHandlers.push({ endpointName: endpoint, clusterId, attribute, listener });
    return this;
  }

  addClusterServerBatteryPowerSource(endpoint: string, batChargeLevel: PowerSource.BatChargeLevel, batPercentRemaining: number | null): this {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(PowerSource.Cluster.id, PowerSourceServer.with(PowerSource.Feature.Battery), {
        status: PowerSource.PowerSourceStatus.Active,
        order: 0,
        description: 'Primary battery',
        batReplacementNeeded: false,
        batReplaceability: PowerSource.BatReplaceability.Unspecified,
        batVoltage: null,
        batPercentRemaining,
        batChargeLevel,
      }),
    );
    return this;
  }

  addClusterServerBooleanState(endpoint: string, stateValue: boolean): this {
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
    return this;
  }

  addClusterServerSmokeAlarmSmokeCoAlarm(endpoint: string, smokeState: SmokeCoAlarm.AlarmState): this {
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
    return this;
  }

  addClusterServerCoAlarmSmokeCoAlarm(endpoint: string, coState: SmokeCoAlarm.AlarmState): this {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(
        SmokeCoAlarm.Cluster.id,
        MatterbridgeSmokeCoAlarmServer.with(SmokeCoAlarm.Feature.CoAlarm).enable({
          events: {
            smokeAlarm: false,
            interconnectSmokeAlarm: false,
            coAlarm: true,
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
          coState,
          expressedState: SmokeCoAlarm.ExpressedState.Normal,
          batteryAlert: SmokeCoAlarm.AlarmState.Normal,
          deviceMuted: SmokeCoAlarm.MuteState.NotMuted,
          testInProgress: false,
          hardwareFaultAlert: false,
          endOfServiceAlert: SmokeCoAlarm.EndOfService.Normal,
        },
      ),
    );
    return this;
  }

  addClusterServerColorTemperatureColorControl(endpoint: string, colorTemperatureMireds: number, colorTempPhysicalMinMireds: number, colorTempPhysicalMaxMireds: number): this {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(ColorControl.Cluster.id, MatterbridgeColorControlServer.with(ColorControl.Feature.ColorTemperature), {
        colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
        enhancedColorMode: ColorControl.EnhancedColorMode.ColorTemperatureMireds,
        colorCapabilities: {
          xy: false,
          hueSaturation: false,
          colorLoop: false,
          enhancedHue: false,
          colorTemperature: true,
        },
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
    return this;
  }

  addClusterServerColorControl(endpoint: string, colorTemperatureMireds: number, colorTempPhysicalMinMireds: number, colorTempPhysicalMaxMireds: number): this {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(
        ColorControl.Cluster.id,
        MatterbridgeColorControlServer.with(ColorControl.Feature.ColorTemperature, ColorControl.Feature.HueSaturation, ColorControl.Feature.Xy),
        {
          colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
          enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
          colorCapabilities: {
            xy: true,
            hueSaturation: true,
            colorLoop: false,
            enhancedHue: false,
            colorTemperature: true,
          },
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
    return this;
  }

  addClusterServerAutoModeThermostat(
    endpoint: string,
    localTemperature: number,
    occupiedHeatingSetpoint: number,
    occupiedCoolingSetpoint: number,
    minSetpointLimit: number,
    maxSetpointLimit: number,
  ): this {
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
    return this;
  }

  addClusterServerHeatingThermostat(endpoint: string, localTemperature: number, occupiedHeatingSetpoint: number, minSetpointLimit: number, maxSetpointLimit: number): this {
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
    return this;
  }

  addClusterServerCoolingThermostat(endpoint: string, localTemperature: number, occupiedCoolingSetpoint: number, minSetpointLimit: number, maxSetpointLimit: number): this {
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
    return this;
  }

  addClusterServerCompleteFanControl(
    endpoint: string,
    fanMode: FanControl.FanMode = FanControl.FanMode.Off,
    fanModeSequence: FanControl.FanModeSequence = FanControl.FanModeSequence.OffLowMedHighAuto,
    percentSetting: number = 0,
    percentCurrent: number = 0,
    rockSupport: { rockLeftRight: boolean; rockUpDown: boolean; rockRound: boolean } = { rockLeftRight: false, rockUpDown: false, rockRound: true },
    rockSetting: { rockLeftRight: boolean; rockUpDown: boolean; rockRound: boolean } = { rockLeftRight: false, rockUpDown: false, rockRound: true },
    airflowDirection: FanControl.AirflowDirection = FanControl.AirflowDirection.Forward,
  ): this {
    const device = this.initializeEndpoint(endpoint);
    device.clusterServersObjs.push(
      getClusterServerObj(
        FanControl.Cluster.id,
        MatterbridgeFanControlServer.with(FanControl.Feature.Auto, FanControl.Feature.Step, FanControl.Feature.Rocking, FanControl.Feature.AirflowDirection),
        {
          // Base fan control attributes
          fanMode, // Writable and persistent attribute
          fanModeSequence, // Fixed attribute
          percentSetting, // Writable attribute
          percentCurrent,
          // Rocking feature
          rockSupport, // Fixed attribute
          rockSetting, // Writable attribute
          // AirflowDirection feature
          airflowDirection, // Writable attribute
        },
      ),
    );
    return this;
  }

  addBridgedDeviceBasicInformationClusterServer(): this {
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
    return this;
  }

  private createUniqueId(param1: string, param2: string, param3: string, param4: string) {
    const hash = createHash('md5');
    hash.update(param1 + param2 + param3 + param4);
    return hash.digest('hex');
  }

  /**
   * Create the mutable device.
   *
   * @param {boolean} remap - Whether to remap the not overlapping child endpoints to the main endpoint. Default is false.
   *
   * @returns {MatterbridgeEndpoint} The main MatterbridgeEndpoint.
   */
  create(remap: boolean = false): MatterbridgeEndpoint {
    // Remove duplicates and superset device types on all endpoints
    this.removeDuplicatedAndSupersetDeviceTypes();
    // Filter out duplicate clusters and clusters objects on all endpoints
    this.removeDuplicatedClusterServers();
    if (remap) {
      // Scan the child endpoints for the same device types and clusters
      for (const [endpoint, device] of Array.from(this.mutableDevice.entries()).filter(([endpoint]) => endpoint !== '')) {
        // console.log(`Remapping endpoint ${endpoint}...`);
        let remapEndpoint = true;
        for (const deviceType of device.deviceTypes) {
          const duplicatedDeviceTypes = Array.from(this.mutableDevice.entries())
            .filter(([e, _d]) => e !== endpoint)
            .find(([_e, d]) => d.deviceTypes.includes(deviceType));
          if (duplicatedDeviceTypes) {
            // console.log(`Remapping endpoint ${endpoint} failed due to duplicated device type ${deviceType.code} in ${duplicatedDeviceTypes[0]}`);
            remapEndpoint = false;
          }
        }
        for (const clusterServerId of device.clusterServersIds) {
          const duplicatedClusterServersIds = Array.from(this.mutableDevice.entries())
            .filter(([e, _d]) => e !== endpoint)
            .find(([_e, d]) => d.clusterServersIds.includes(clusterServerId) || d.clusterServersObjs.find((obj) => obj.id === clusterServerId));
          if (duplicatedClusterServersIds) {
            // console.log(`Remapping endpoint ${endpoint} failed due to duplicated cluster server id ${clusterServerId} in ${duplicatedClusterServersIds[0]}`);
            remapEndpoint = false;
          }
        }
        for (const clusterServerObjs of device.clusterServersObjs) {
          const duplicatedClusterServersObjs = Array.from(this.mutableDevice.entries())
            .filter(([e, _d]) => e !== endpoint)
            .find(([_e, d]) => d.clusterServersIds.includes(clusterServerObjs.id) || d.clusterServersObjs.find((obj) => obj.id === clusterServerObjs.id));
          if (duplicatedClusterServersObjs) {
            // console.log(`Remapping endpoint ${endpoint} failed due to duplicated cluster server object id ${clusterServerObjs.id} in ${duplicatedClusterServersObjs[0]}`);
            remapEndpoint = false;
          }
        }
        if (remapEndpoint) {
          const mainDevice = this.get('');
          mainDevice.deviceTypes.push(...device.deviceTypes);
          mainDevice.clusterServersIds.push(...device.clusterServersIds);
          mainDevice.clusterServersObjs.push(...device.clusterServersObjs);
          mainDevice.clusterClientsIds.push(...device.clusterClientsIds);
          mainDevice.clusterClientsObjs.push(...device.clusterClientsObjs);
          mainDevice.commandHandlers.push(...device.commandHandlers);
          mainDevice.subscribeHandlers.push(...device.subscribeHandlers);
          this.mutableDevice.delete(endpoint);
          // console.log(`Remapped endpoint ${endpoint} to main endpoint`);
        }
      }
    }
    this.createMainEndpoint();
    this.createChildEndpoints();
    for (const [endpoint] of this.mutableDevice) {
      this.createClusters(endpoint);
    }
    return this.getEndpoint();
  }

  private removeDuplicatedAndSupersetDeviceTypes() {
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
    return this;
  }

  private createMainEndpoint() {
    // Remove duplicates and superset device types on all endpoints
    this.removeDuplicatedAndSupersetDeviceTypes();

    // Create the mutable device for the main endpoint
    const mainDevice = this.mutableDevice.get('') as MutableDeviceInterface;
    mainDevice.friendlyName = this.deviceName;
    mainDevice.endpoint = new MatterbridgeEndpoint(mainDevice.deviceTypes as AtLeastOne<DeviceTypeDefinition>, { uniqueStorageKey: this.deviceName }, true);
    mainDevice.endpoint.log.logName = this.deviceName;
    return mainDevice.endpoint;
  }

  private createChildEndpoints() {
    // Remove duplicates and superset device types on all endpoints
    this.removeDuplicatedAndSupersetDeviceTypes();

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
      device.endpoint.log.logName = device.friendlyName;
    }
    return this;
  }

  private removeDuplicatedClusterServers() {
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
    return this;
  }

  private createClusters(endpoint: string) {
    // Filter out duplicate clusters and clusters objects on all endpoints
    this.removeDuplicatedClusterServers();

    if (endpoint === '') {
      // Get the main endpoint
      const mainDevice = this.get(endpoint);
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
      if (this.composedType) mainDevice.endpoint.addFixedLabel('composed', this.composedType);
      // Set the configUrl of the main endpoint
      if (this.configUrl) mainDevice.endpoint.configUrl = this.configUrl;
      // Add the command handlers
      for (const commandHandler of mainDevice.commandHandlers) {
        mainDevice.endpoint.addCommandHandler(commandHandler.command, async (data) => {
          await commandHandler.handler(data, commandHandler.endpointName, commandHandler.command);
        });
      }
      // Add the subscribe handlers
      for (const subscribeHandler of mainDevice.subscribeHandlers) {
        mainDevice.endpoint.subscribeAttribute(
          subscribeHandler.clusterId,
          subscribeHandler.attribute,
          (newValue: unknown, oldValue: unknown, context: ActionContext) => {
            subscribeHandler.listener(newValue, oldValue, context, subscribeHandler.endpointName, subscribeHandler.clusterId, subscribeHandler.attribute);
          },
          mainDevice.endpoint.log,
        );
      }
      return this;
    }

    // Add clusters to the child endpoints
    const device = this.get(endpoint);
    if (!device.endpoint) throw new Error('Child endpoint is not defined');
    // Add the cluster objects to the child endpoint
    for (const clusterServerObj of device.clusterServersObjs) {
      device.endpoint.behaviors.require(clusterServerObj.type, clusterServerObj.options);
    }
    // Add the cluster ids to the child endpoint
    device.endpoint.addClusterServers(device.clusterServersIds);
    // Add the required clusters to the child endpoint
    device.endpoint.addRequiredClusterServers();
    // Add the command handlers
    for (const commandHandler of device.commandHandlers) {
      device.endpoint.addCommandHandler(commandHandler.command, async (data) => {
        commandHandler.handler(data, commandHandler.endpointName, commandHandler.command);
      });
    }
    // Add the subscribe handlers
    for (const subscribeHandler of device.subscribeHandlers) {
      device.endpoint.subscribeAttribute(
        subscribeHandler.clusterId,
        subscribeHandler.attribute,
        (newValue: unknown, oldValue: unknown, context: ActionContext) => {
          subscribeHandler.listener(newValue, oldValue, context, subscribeHandler.endpointName, subscribeHandler.clusterId, subscribeHandler.attribute);
        },
        device.endpoint.log,
      );
    }

    return this;
  }

  /**
   * Log the mutable device information.
   *
   * @returns {this} - The current instance of the MutableDevice class.
   */
  logMutableDevice(): this {
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
          `clusterServersIds: ${debugStringify(clusterServersIds)}${db} clusterServersObjs: ${debugStringify(clusterServersObjsIds)}${db} ` +
          `commandHandlers: ${debugStringify(device.commandHandlers)}${db} subscribeHandlers: ${debugStringify(device.subscribeHandlers)}${db}`,
      );
    }
    return this;
  }
}
