// src\platform.matter.test.ts

/* eslint-disable no-console */

import { rmSync } from 'node:fs';
import path from 'node:path';

import { jest } from '@jest/globals';
import { Endpoint, DeviceTypeId, VendorId, ServerNode, LogFormat as MatterLogFormat, LogLevel as MatterLogLevel, Environment, MdnsService, Lifecycle } from 'matterbridge/matter';
import { RootEndpoint, AggregatorEndpoint } from 'matterbridge/matter/endpoints';
import { Matterbridge, MatterbridgeEndpoint, occupancySensor, PlatformConfig } from 'matterbridge';
import { AnsiLogger, CYAN, nf, rs, TimestampFormat, LogLevel, idn, db, or, hk } from 'matterbridge/logger';
import { PowerSource, BooleanState, FanControl, OnOff, LevelControl, SmokeCoAlarm, ColorControl, Thermostat, OccupancySensing } from 'matterbridge/matter/clusters';

// Home Assistant Plugin
import { HomeAssistantPlatform } from './platform.js';
import { HassConfig, HassContext, HassDevice, HassEntity, HassServices, HassState, HomeAssistant } from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';

let loggerLogSpy: jest.SpiedFunction<typeof AnsiLogger.prototype.log>;
let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
let consoleDebugSpy: jest.SpiedFunction<typeof console.log>;
let consoleInfoSpy: jest.SpiedFunction<typeof console.log>;
let consoleWarnSpy: jest.SpiedFunction<typeof console.log>;
let consoleErrorSpy: jest.SpiedFunction<typeof console.log>;
const debug = false; // Set to true to enable debug logging

if (!debug) {
  loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {});
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {});
  consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((...args: any[]) => {});
  consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation((...args: any[]) => {});
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation((...args: any[]) => {});
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: any[]) => {});
} else {
  loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log');
  consoleLogSpy = jest.spyOn(console, 'log');
  consoleDebugSpy = jest.spyOn(console, 'debug');
  consoleInfoSpy = jest.spyOn(console, 'info');
  consoleWarnSpy = jest.spyOn(console, 'warn');
  consoleErrorSpy = jest.spyOn(console, 'error');
}

const MATTER_PORT = 6001;
const NAME = 'Hass';

/**
 * Waits for the `isOnline` property to become `true`.
 * This function checks the `isOnline` property of the provided server node at regular intervals until it becomes `true` or the specified timeout is reached.
 * If the timeout is reached before `isOnline` becomes `true`, the promise is rejected with an error.
 *
 * @param {ServerNode<ServerNode.RootEndpoint>} server - The server node to check for online status.
 * @param {number} timeout - The maximum time to wait in milliseconds.
 * @returns {Promise<void>} A promise that resolves when `isOnline` becomes `true` or rejects if the timeout is reached.
 */
async function waitForOnline(server: ServerNode<ServerNode.RootEndpoint>, timeout = 10000): Promise<void> {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const checkOnline = () => {
      if (server.lifecycle.isOnline) {
        resolve();
      } else if (Date.now() - start >= timeout) {
        reject(new Error('Timeout waiting for server.lifecycle.isOnline to become true'));
      } else {
        setTimeout(checkOnline, 100); // Check every 100ms
      }
    };
    // Start checking immediately
    checkOnline();
  });
}

const mockLog = {
  fatal: jest.fn((message: string, ...parameters: any[]) => {
    log.fatal(message, ...parameters);
  }),
  error: jest.fn((message: string, ...parameters: any[]) => {
    log.error(message, ...parameters);
  }),
  warn: jest.fn((message: string, ...parameters: any[]) => {
    log.warn(message, ...parameters);
  }),
  notice: jest.fn((message: string, ...parameters: any[]) => {
    log.notice(message, ...parameters);
  }),
  info: jest.fn((message: string, ...parameters: any[]) => {
    log.info(message, ...parameters);
  }),
  debug: jest.fn((message: string, ...parameters: any[]) => {
    log.debug(message, ...parameters);
  }),
} as unknown as AnsiLogger;

const mockMatterbridge = {
  matterbridgeDirectory: './jest/matterbridge',
  matterbridgePluginDirectory: './jest/plugins',
  systemInformation: {
    ipv4Address: undefined,
    ipv6Address: undefined,
    osRelease: 'xx.xx.xx.xx.xx.xx',
    nodeVersion: '22.1.10',
  },
  matterbridgeVersion: '3.0.6',
  log: mockLog,
  getDevices: jest.fn(() => {
    return [];
  }),
  getPlugins: jest.fn(() => {
    return [];
  }),
  addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
    await aggregator.add(device);
  }),
  removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
  removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
} as unknown as Matterbridge;

const mockConfig = {
  name: 'matterbridge-hass',
  type: 'DynamicPlatform',
  host: 'http://homeassistant.local:8123',
  token: 'long-lived token',
  certificatePath: undefined,
  rejectUnauthorized: true,
  reconnectTimeout: 60,
  reconnectRetries: 10,
  filterByArea: '',
  filterByLabel: '',
  whiteList: [],
  blackList: [],
  entityBlackList: [],
  deviceEntityBlackList: {},
  debug: false,
  unregisterOnShutdown: false,
} as PlatformConfig;

const connectSpy = jest.spyOn(HomeAssistant.prototype, 'connect').mockImplementation(() => {
  console.log(`Mocked connect`);
  return Promise.resolve('2025.1.0'); // Simulate a successful connection with a version string
});

const closeSpy = jest.spyOn(HomeAssistant.prototype, 'close').mockImplementation(() => {
  console.log(`Mocked close`);
  return Promise.resolve();
});

const subscribeSpy = jest.spyOn(HomeAssistant.prototype, 'subscribe').mockImplementation(() => {
  console.log(`Mocked subscribe`);
  return Promise.resolve(1); // Simulate a successful subscription with a subscription ID
});

const fetchDataSpy = jest.spyOn(HomeAssistant.prototype, 'fetchData').mockImplementation(() => {
  console.log(`Mocked fetchData`);
  return Promise.resolve();
});

const fetchSpy = jest.spyOn(HomeAssistant.prototype, 'fetch').mockImplementation((api: string) => {
  console.log(`Mocked fetchAsync: ${api}`);
  return Promise.resolve();
});

const callServiceSpy = jest
  .spyOn(HomeAssistant.prototype, 'callService')
  .mockImplementation((domain: string, service: string, entityId: string, serviceData: Record<string, any> = {}) => {
    console.log(`Mocked callServiceAsync: domain ${domain} service ${service} entityId ${entityId}`);
    return Promise.resolve({ context: {} as HassContext, response: undefined });
  });

const setAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'setAttribute');
const updateAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'updateAttribute');
const subscribeAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'subscribeAttribute');

const addClusterServerPowerSourceSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerPowerSource');
const addClusterServerBooleanStateSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerBooleanState');
const addClusterServerSmokeAlarmSmokeCoAlarmSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerSmokeAlarmSmokeCoAlarm');
const addClusterServerCoAlarmSmokeCoAlarmSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerCoAlarmSmokeCoAlarm');
const addClusterServerColorTemperatureColorControlSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerColorTemperatureColorControl');
const addClusterServerColorControlSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerColorControl');
const addClusterServerAutoModeThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerAutoModeThermostat');
const addClusterServerHeatingThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerHeatingThermostat');
const addClusterServerCoolingThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerCoolingThermostat');

MatterbridgeEndpoint.logLevel = LogLevel.DEBUG; // Set the log level for MatterbridgeEndpoint to DEBUG

let haPlatform: HomeAssistantPlatform;
const log = new AnsiLogger({
  logName: NAME,
  logTimestampFormat: TimestampFormat.TIME_MILLIS,
  logLevel: LogLevel.DEBUG,
});

const environment = Environment.default;
let server: ServerNode<ServerNode.RootEndpoint>;
let aggregator: Endpoint<AggregatorEndpoint>;
let device: MatterbridgeEndpoint;

describe('Matterbridge ' + NAME, () => {
  beforeAll(async () => {
    // Cleanup the matter environment
    rmSync(path.join('jest', NAME), { recursive: true, force: true });
    // Setup the matter environment
    environment.vars.set('log.level', MatterLogLevel.DEBUG);
    environment.vars.set('log.format', MatterLogFormat.ANSI);
    environment.vars.set('path.root', path.join('jest', NAME));
    environment.vars.set('runtime.signals', false);
    environment.vars.set('runtime.exitcode', false);
  }, 30000);

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Restore all mocks
    jest.restoreAllMocks();
  });

  test('create the server node', async () => {
    // Create the server node
    server = await ServerNode.create({
      id: NAME + 'ServerNode',

      productDescription: {
        name: NAME + 'ServerNode',
        deviceType: DeviceTypeId(RootEndpoint.deviceType),
        vendorId: VendorId(0xfff1),
        productId: 0x8000,
      },

      // Provide defaults for the BasicInformation cluster on the Root endpoint
      basicInformation: {
        vendorId: VendorId(0xfff1),
        vendorName: 'Matterbridge',
        productId: 0x8000,
        productName: 'Matterbridge ' + NAME,
        nodeLabel: NAME + 'ServerNode',
        hardwareVersion: 1,
        softwareVersion: 1,
        reachable: true,
      },

      network: {
        port: MATTER_PORT,
      },
    });
    expect(server).toBeDefined();
    expect(server.lifecycle.isReady).toBeTruthy();
  });

  test('create the aggregator node', async () => {
    aggregator = new Endpoint(AggregatorEndpoint, {
      id: NAME + 'AggregatorNode',
    });
    expect(aggregator).toBeDefined();
  });

  test('add the aggregator node to the server', async () => {
    expect(server).toBeDefined();
    expect(aggregator).toBeDefined();
    await server.add(aggregator);
    expect(server.parts.has(aggregator.id)).toBeTruthy();
    expect(server.parts.has(aggregator)).toBeTruthy();
    expect(aggregator.lifecycle.isReady).toBeTruthy();
  });

  test('start the server node', async () => {
    // Run the server
    await server.start();
    expect(server.lifecycle.isReady).toBeTruthy();
    expect(server.lifecycle.isOnline).toBeTruthy();
    // Wait for the server to be online
    await waitForOnline(server);
  });

  it('should initialize the HomeAssistantPlatform', async () => {
    haPlatform = new HomeAssistantPlatform(mockMatterbridge, mockLog, mockConfig);
    expect(haPlatform).toBeDefined();
    expect(mockLog.info).toHaveBeenCalledWith(`Initializing platform: ${CYAN}${haPlatform.config.name}${nf} version: ${CYAN}${haPlatform.config.version}${rs}`);
    expect(mockLog.info).toHaveBeenCalledWith(`Initialized platform: ${CYAN}${haPlatform.config.name}${nf} version: ${CYAN}${haPlatform.config.version}${rs}`);
  });

  it('should call onStart', async () => {
    haPlatform.haSubscriptionId = 1;
    haPlatform.ha.connected = true; // Simulate a connected Home Assistant instance
    haPlatform.ha.hassConfig = {} as HassConfig; // Simulate a Home Assistant configuration
    haPlatform.ha.hassServices = {} as HassServices; // Simulate a Home Assistant services

    await haPlatform.onStart('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
  });

  it('should call onStart and register a PowerSource device', async () => {
    const batteryDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e922f00ee7c',
      labels: [],
      name: 'Battery Sensor',
      name_by_user: null,
    } as unknown as HassDevice;

    const batteryAlertEntity = {
      area_id: null,
      device_id: batteryDevice.id,
      entity_category: null,
      entity_id: 'binary_sensor.battery',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Battery Sensor',
    } as unknown as HassEntity;

    const batteryLevelEntity = {
      area_id: null,
      device_id: batteryDevice.id,
      entity_category: null,
      entity_id: 'sensor.battery',
      has_entity_name: true,
      id: '0b25a337c543edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Battery Sensor',
    } as unknown as HassEntity;

    const batteryDeviceEntityState = {
      entity_id: batteryAlertEntity.entity_id,
      state: 'off', // On means low, Off means normal
      attributes: {
        device_class: 'battery',
        friendly_name: 'Battery Alert Sensor',
      },
    } as unknown as HassState;

    const batteryLevelEntityState = {
      entity_id: batteryLevelEntity.entity_id,
      state: 50,
      attributes: {
        state_class: 'measurement',
        device_class: 'battery',
        friendly_name: 'Battery Percentage Sensor',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(batteryDevice.id, batteryDevice);
    haPlatform.ha.hassEntities.set(batteryAlertEntity.entity_id, batteryAlertEntity);
    haPlatform.ha.hassEntities.set(batteryLevelEntity.entity_id, batteryLevelEntity);
    haPlatform.ha.hassStates.set(batteryDeviceEntityState.entity_id, batteryDeviceEntityState);
    haPlatform.ha.hassStates.set(batteryLevelEntityState.entity_id, batteryLevelEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(batteryDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(batteryDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(batteryAlertEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(child.getAttribute(PowerSource.Cluster.id, 'batChargeLevel')).toBe(PowerSource.BatChargeLevel.Ok);
    expect(child.getAttribute(PowerSource.Cluster.id, 'batPercentRemaining')).toBe(200);
    expect(addClusterServerPowerSourceSpy).toHaveBeenCalledWith(batteryAlertEntity.entity_id, PowerSource.BatChargeLevel.Ok, 200);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${batteryDeviceEntityState.entity_id}${db} for device ${CYAN}${batteryDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 100, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(batteryDevice.id, batteryDeviceEntityState.entity_id, batteryDeviceEntityState, { ...batteryDeviceEntityState, state: 'on' }); // On means low, Off means normal
    haPlatform.updateHandler(batteryDevice.id, batteryLevelEntityState.entity_id, batteryLevelEntityState, { ...batteryLevelEntityState, state: '100' }); // On means low, Off means normal
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Critical, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 200, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(batteryDevice.id, batteryDeviceEntityState.entity_id, batteryDeviceEntityState, { ...batteryDeviceEntityState, state: 'off' }); // On means low, Off means normal
    haPlatform.updateHandler(batteryDevice.id, batteryLevelEntityState.entity_id, batteryLevelEntityState, { ...batteryLevelEntityState, state: '25' }); // On means low, Off means normal
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 50, expect.anything());

    haPlatform.matterbridgeDevices.delete(batteryDevice.id);
    haPlatform.ha.hassDevices.delete(batteryDevice.id);
    haPlatform.ha.hassEntities.delete(batteryAlertEntity.entity_id);
    haPlatform.ha.hassStates.delete(batteryDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a Switch device', async () => {
    const switchDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee6a',
      labels: [],
      name: 'Switch',
      name_by_user: null,
    } as unknown as HassDevice;

    const switchDeviceEntity = {
      area_id: null,
      device_id: switchDevice.id,
      entity_category: null,
      entity_id: 'switch.switch',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0aa',
      labels: [],
      name: null,
      original_name: 'Switch',
    } as unknown as HassEntity;

    const switchDeviceEntityState = {
      entity_id: switchDeviceEntity.entity_id,
      state: 'on',
      attributes: { device_class: 'outlet', friendly_name: 'Switch Switch' },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(switchDevice.id, switchDevice);
    haPlatform.ha.hassEntities.set(switchDeviceEntity.entity_id, switchDeviceEntity);
    haPlatform.ha.hassStates.set(switchDeviceEntityState.entity_id, switchDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(switchDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(switchDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(switchDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${switchDeviceEntityState.entity_id}${db} for device ${CYAN}${switchDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());

    haPlatform.matterbridgeDevices.delete(switchDevice.id);
    haPlatform.ha.hassDevices.delete(switchDevice.id);
    haPlatform.ha.hassEntities.delete(switchDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(switchDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register an Color Temperature Light device', async () => {
    const lightDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00cc6b',
      labels: [],
      name: 'Color Temperature Light',
      name_by_user: null,
    } as unknown as HassDevice;

    const lightDeviceEntity = {
      area_id: null,
      device_id: lightDevice.id,
      entity_category: null,
      entity_id: 'light.light_ct',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450cc2b0aa',
      labels: [],
      name: null,
      original_name: 'Color Temperature Light',
    } as unknown as HassEntity;

    const lightDeviceEntityState = {
      entity_id: lightDeviceEntity.entity_id,
      state: 'on',
      attributes: {
        device_class: 'light',
        supported_color_modes: ['onoff', 'brightness', 'color_temp'],
        color_mode: 'color_temp',
        brightness: 100,
        color_temp: 200, // Color temperature in mireds
        min_mireds: 153, // Minimum mireds (6500K)
        max_mireds: 400, // Maximum mireds (2500K)
        friendly_name: 'Light Light Ct',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(lightDevice.id, lightDevice);
    haPlatform.ha.hassEntities.set(lightDeviceEntity.entity_id, lightDeviceEntity);
    haPlatform.ha.hassStates.set(lightDeviceEntityState.entity_id, lightDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(lightDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(lightDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(lightDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(addClusterServerColorTemperatureColorControlSpy).toHaveBeenCalledWith(lightDeviceEntity.entity_id, 200, 153, 400);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${lightDeviceEntityState.entity_id}${db} for device ${CYAN}${lightDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(LevelControl.Cluster.id, 'currentLevel', 100, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'colorTemperatureMireds', 200, expect.anything());

    haPlatform.matterbridgeDevices.delete(lightDevice.id);
    haPlatform.ha.hassDevices.delete(lightDevice.id);
    haPlatform.ha.hassEntities.delete(lightDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(lightDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register an Rgb Light device', async () => {
    const lightDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee6b',
      labels: [],
      name: 'Light',
      name_by_user: null,
    } as unknown as HassDevice;

    const lightDeviceEntity = {
      area_id: null,
      device_id: lightDevice.id,
      entity_category: null,
      entity_id: 'light.light',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0aa',
      labels: [],
      name: null,
      original_name: 'Light',
    } as unknown as HassEntity;

    const lightDeviceEntityState = {
      entity_id: lightDeviceEntity.entity_id,
      state: 'on',
      attributes: {
        device_class: 'light',
        supported_color_modes: ['onoff', 'brightness', 'rgb'],
        color_mode: 'hs',
        brightness: 100,
        hs_color: [180, 50], // Hue and Saturation
        rgb_color: [255, 255, 255],
        friendly_name: 'Light Light',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(lightDevice.id, lightDevice);
    haPlatform.ha.hassEntities.set(lightDeviceEntity.entity_id, lightDeviceEntity);
    haPlatform.ha.hassStates.set(lightDeviceEntityState.entity_id, lightDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(lightDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(lightDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(lightDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(addClusterServerColorControlSpy).toHaveBeenCalledWith(lightDeviceEntity.entity_id, 250, 147, 500);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${lightDeviceEntityState.entity_id}${db} for device ${CYAN}${lightDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(LevelControl.Cluster.id, 'currentLevel', 100, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'currentHue', 127, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'currentSaturation', 127, expect.anything());

    haPlatform.matterbridgeDevices.delete(lightDevice.id);
    haPlatform.ha.hassDevices.delete(lightDevice.id);
    haPlatform.ha.hassEntities.delete(lightDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(lightDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a Fan device', async () => {
    const fanDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee7a',
      labels: [],
      name: 'Fan',
      name_by_user: null,
    } as unknown as HassDevice;

    const fanDeviceEntity = {
      area_id: null,
      device_id: fanDevice.id,
      entity_category: null,
      entity_id: 'fan.fan',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ab',
      labels: [],
      name: null,
      original_name: 'Fan',
    } as unknown as HassEntity;

    const fanDeviceEntityState = {
      entity_id: fanDeviceEntity.entity_id,
      state: 'on',
      attributes: {
        preset_mode: 'high',
        percentage: 50,
        friendly_name: 'Fan Fan',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(fanDevice.id, fanDevice);
    haPlatform.ha.hassEntities.set(fanDeviceEntity.entity_id, fanDeviceEntity);
    haPlatform.ha.hassStates.set(fanDeviceEntityState.entity_id, fanDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(fanDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(fanDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(fanDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'percentSetting', expect.anything(), expect.anything());
    // expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'speedSetting', expect.anything(), expect.anything());
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}FanControl${db}.${hk}fanMode$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}FanControl${db}.${hk}percentSetting$Changed${db}`),
    );
    /*
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}FanControl${db}.${hk}speedSetting$Changed${db}`),
    );
    */

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state ${CYAN}${fanDeviceEntityState.entity_id}${db} for device ${CYAN}${fanDevice.id}${db}`));
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Auto, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'percentCurrent', 50, expect.anything());
    // expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'speedCurrent', 50, expect.anything());

    // Simulate a not changed in fan mode and call the event handler
    await child.act((agent) => agent['fanControl'].events['fanMode$Changed'].emit(FanControl.FanMode.Medium, FanControl.FanMode.Medium, { ...agent.context, offline: false }));
    // Simulate a change in fan mode and call the event handler
    await child.act((agent) => agent['fanControl'].events['fanMode$Changed'].emit(FanControl.FanMode.Medium, FanControl.FanMode.Auto, { ...agent.context, offline: false }));
    // Simulate a change in fan mode and call the event handler with wrong parameter
    await child.act((agent) => agent['fanControl'].events['fanMode$Changed'].emit(FanControl.FanMode.Smart + 1, FanControl.FanMode.Auto, { ...agent.context, offline: false }));

    haPlatform.matterbridgeDevices.delete(fanDevice.id);
    haPlatform.ha.hassDevices.delete(fanDevice.id);
    haPlatform.ha.hassEntities.delete(fanDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(fanDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a Climate device', async () => {
    const climateDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee7a',
      labels: [],
      name: 'Climate',
      name_by_user: null,
    } as unknown as HassDevice;

    const climateDeviceEntity = {
      area_id: null,
      device_id: climateDevice.id,
      entity_category: null,
      entity_id: 'climate.climate_auto',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ab',
      labels: [],
      name: null,
      original_name: 'Climate',
    } as unknown as HassEntity;

    const climateDeviceEntityState = {
      entity_id: climateDeviceEntity.entity_id,
      state: 'heat_cool',
      attributes: {
        hvac_modes: ['heat_cool'],
        hvac_mode: 'heat_cool',
        current_temperature: 20,
        target_temp_low: 10,
        target_temp_high: 30,
        friendly_name: 'Climate Climate auto',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(climateDevice.id, climateDevice);
    haPlatform.ha.hassEntities.set(climateDeviceEntity.entity_id, climateDeviceEntity);
    haPlatform.ha.hassStates.set(climateDeviceEntityState.entity_id, climateDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(climateDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(climateDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(climateDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'systemMode', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'occupiedHeatingSetpoint', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'occupiedCoolingSetpoint', expect.anything(), expect.anything());
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}Thermostat${db}.${hk}systemMode$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}Thermostat${db}.${hk}occupiedHeatingSetpoint$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}Thermostat${db}.${hk}occupiedCoolingSetpoint$Changed${db}`),
    );

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${climateDeviceEntityState.entity_id}${db} for device ${CYAN}${climateDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'systemMode', Thermostat.SystemMode.Auto, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'occupiedHeatingSetpoint', 1000, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'occupiedCoolingSetpoint', 3000, expect.anything());

    // Simulate a not changed in fan mode and call the event handler
    await child.act((agent) => agent['thermostat'].events['systemMode$Changed'].emit(Thermostat.SystemMode.Auto, Thermostat.SystemMode.Auto, { ...agent.context, offline: false }));
    // Simulate a change in fan mode and call the event handler
    await child.act((agent) => agent['thermostat'].events['systemMode$Changed'].emit(Thermostat.SystemMode.Cool, Thermostat.SystemMode.Auto, { ...agent.context, offline: false }));
    // Simulate a change in fan mode and call the event handler with wrong parameter
    await child.act((agent) =>
      agent['thermostat'].events['systemMode$Changed'].emit(Thermostat.SystemMode.Heat + 1, Thermostat.SystemMode.Auto, { ...agent.context, offline: false }),
    );

    haPlatform.matterbridgeDevices.delete(climateDevice.id);
    haPlatform.ha.hassDevices.delete(climateDevice.id);
    haPlatform.ha.hassEntities.delete(climateDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(climateDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a Contact device', async () => {
    const contactDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee7c',
      labels: [],
      name: 'Contact Sensor',
      name_by_user: null,
    } as unknown as HassDevice;

    const contactDeviceEntity = {
      area_id: null,
      device_id: contactDevice.id,
      entity_category: null,
      entity_id: 'binary_sensor.door_contact',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Contact Sensor',
    } as unknown as HassEntity;

    const contactDeviceEntityState = {
      entity_id: contactDeviceEntity.entity_id,
      state: 'on', // 'on' for open, 'off' for closed
      attributes: { device_class: 'door', friendly_name: 'Contact Sensor' },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(contactDevice.id, contactDevice);
    haPlatform.ha.hassEntities.set(contactDeviceEntity.entity_id, contactDeviceEntity);
    haPlatform.ha.hassStates.set(contactDeviceEntityState.entity_id, contactDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(contactDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(contactDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(contactDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(child.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Contact Sensor: true = closed or contact, false = open or no contact
    expect(addClusterServerBooleanStateSpy).toHaveBeenCalledWith(contactDeviceEntity.entity_id, false);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${contactDeviceEntityState.entity_id}${db} for device ${CYAN}${contactDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(contactDevice.id, contactDeviceEntityState.entity_id, contactDeviceEntityState, { ...contactDeviceEntityState, state: 'off' }); // 'on' for open, 'off' for closed
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', true, expect.anything()); // Contact Sensor: true = closed or contact, false = open or no contact

    jest.clearAllMocks();
    haPlatform.updateHandler(contactDevice.id, contactDeviceEntityState.entity_id, contactDeviceEntityState, { ...contactDeviceEntityState, state: 'on' }); // 'on' for open, 'off' for closed
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything()); // Contact Sensor: true = closed or contact, false = open or no contact

    haPlatform.matterbridgeDevices.delete(contactDevice.id);
    haPlatform.ha.hassDevices.delete(contactDevice.id);
    haPlatform.ha.hassEntities.delete(contactDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(contactDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a Leak device', async () => {
    const leakDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee7c',
      labels: [],
      name: 'Leak Sensor',
      name_by_user: null,
    } as unknown as HassDevice;

    const leakDeviceEntity = {
      area_id: null,
      device_id: leakDevice.id,
      entity_category: null,
      entity_id: 'binary_sensor.leak_sensor',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Leak Sensor',
    } as unknown as HassEntity;

    const leakDeviceEntityState = {
      entity_id: leakDeviceEntity.entity_id,
      state: 'off', // 'on' for leak, 'off' for no leak
      attributes: { device_class: 'moisture', friendly_name: 'Leak Sensor' },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(leakDevice.id, leakDevice);
    haPlatform.ha.hassEntities.set(leakDeviceEntity.entity_id, leakDeviceEntity);
    haPlatform.ha.hassStates.set(leakDeviceEntityState.entity_id, leakDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(leakDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(leakDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(leakDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(child.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Water Leak Detector: true = leak, false = no leak
    expect(addClusterServerBooleanStateSpy).toHaveBeenCalledWith(leakDeviceEntity.entity_id, false);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state ${CYAN}${leakDeviceEntityState.entity_id}${db} for device ${CYAN}${leakDevice.id}${db}`));
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything()); // Water Leak Detector: true = leak, false = no leak

    jest.clearAllMocks();
    haPlatform.updateHandler(leakDevice.id, leakDeviceEntityState.entity_id, leakDeviceEntityState, { ...leakDeviceEntityState, state: 'on' }); // 'on' for leak, 'off' for no leak
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', true, expect.anything()); // Water Leak Detector: true = leak, false = no leak

    jest.clearAllMocks();
    haPlatform.updateHandler(leakDevice.id, leakDeviceEntityState.entity_id, leakDeviceEntityState, { ...leakDeviceEntityState, state: 'off' }); // 'on' for leak, 'off' for no leak
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything()); // Water Leak Detector: true = leak, false = no leak

    haPlatform.matterbridgeDevices.delete(leakDevice.id);
    haPlatform.ha.hassDevices.delete(leakDevice.id);
    haPlatform.ha.hassEntities.delete(leakDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(leakDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a Presence device', async () => {
    const presenceDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd83398f83188759ed7329e97df00ee7c',
      labels: [],
      name: 'Presence Sensor',
      name_by_user: null,
    } as unknown as HassDevice;

    const presenceDeviceEntity = {
      area_id: null,
      device_id: presenceDevice.id,
      entity_category: null,
      entity_id: 'binary_sensor.door_contact',
      has_entity_name: true,
      id: '0b33a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Presence Sensor',
    } as unknown as HassEntity;

    const presenceDeviceEntityState = {
      entity_id: presenceDeviceEntity.entity_id,
      state: 'off', // 'on' for detected, 'off' for not detected
      attributes: {
        device_class: 'presence',
        friendly_name: 'Presence Sensor',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(presenceDevice.id, presenceDevice);
    haPlatform.ha.hassEntities.set(presenceDeviceEntity.entity_id, presenceDeviceEntity);
    haPlatform.ha.hassStates.set(presenceDeviceEntityState.entity_id, presenceDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(presenceDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(presenceDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(presenceDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(child.deviceType).toBe(occupancySensor.code);
    expect(child.getAttribute(OccupancySensing.Cluster.id, 'occupancy')).toEqual({ occupied: false }); // Presence Sensor: true = detected, false = not detected

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${presenceDeviceEntityState.entity_id}${db} for device ${CYAN}${presenceDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(OccupancySensing.Cluster.id, 'occupancy', { occupied: false }, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(presenceDevice.id, presenceDeviceEntityState.entity_id, presenceDeviceEntityState, { ...presenceDeviceEntityState, state: 'on' }); // 'on' for detected, 'off' for not detected
    expect(setAttributeSpy).toHaveBeenCalledWith(OccupancySensing.Cluster.id, 'occupancy', { occupied: true }, expect.anything()); // Presence Sensor: { occupied: boolean }

    jest.clearAllMocks();
    haPlatform.updateHandler(presenceDevice.id, presenceDeviceEntityState.entity_id, presenceDeviceEntityState, { ...presenceDeviceEntityState, state: 'off' }); // 'on' for detected, 'off' for not detected
    expect(setAttributeSpy).toHaveBeenCalledWith(OccupancySensing.Cluster.id, 'occupancy', { occupied: false }, expect.anything()); // Presence Sensor: { occupied: boolean }

    haPlatform.matterbridgeDevices.delete(presenceDevice.id);
    haPlatform.ha.hassDevices.delete(presenceDevice.id);
    haPlatform.ha.hassEntities.delete(presenceDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(presenceDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a Smoke device', async () => {
    const smokeDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee7c',
      labels: [],
      name: 'Smoke Sensor',
      name_by_user: null,
    } as unknown as HassDevice;

    const smokeDeviceEntity = {
      area_id: null,
      device_id: smokeDevice.id,
      entity_category: null,
      entity_id: 'binary_sensor.smoke_sensor',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Smoke Sensor',
    } as unknown as HassEntity;

    const smokeDeviceEntityState = {
      entity_id: smokeDeviceEntity.entity_id,
      state: 'off', // 'on' for smoke, 'off' for no smoke
      attributes: { device_class: 'smoke', friendly_name: 'Smoke Sensor' },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(smokeDevice.id, smokeDevice);
    haPlatform.ha.hassEntities.set(smokeDeviceEntity.entity_id, smokeDeviceEntity);
    haPlatform.ha.hassStates.set(smokeDeviceEntityState.entity_id, smokeDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(smokeDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(smokeDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(smokeDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(child.getAttribute(SmokeCoAlarm.Cluster.id, 'smokeState')).toBe(SmokeCoAlarm.ExpressedState.Normal);
    expect(child.getAttribute(SmokeCoAlarm.Cluster.id, 'coState')).toBe(undefined);
    expect(addClusterServerSmokeAlarmSmokeCoAlarmSpy).toHaveBeenCalledWith(smokeDeviceEntity.entity_id, SmokeCoAlarm.ExpressedState.Normal);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${smokeDeviceEntityState.entity_id}${db} for device ${CYAN}${smokeDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'smokeState', SmokeCoAlarm.AlarmState.Normal, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(smokeDevice.id, smokeDeviceEntityState.entity_id, smokeDeviceEntityState, { ...smokeDeviceEntityState, state: 'on' }); // 'on' for smoke, 'off' for no smoke
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'smokeState', SmokeCoAlarm.AlarmState.Critical, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(smokeDevice.id, smokeDeviceEntityState.entity_id, smokeDeviceEntityState, { ...smokeDeviceEntityState, state: 'off' }); // 'on' for smoke, 'off' for no smoke
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'smokeState', SmokeCoAlarm.AlarmState.Normal, expect.anything());

    haPlatform.matterbridgeDevices.delete(smokeDevice.id);
    haPlatform.ha.hassDevices.delete(smokeDevice.id);
    haPlatform.ha.hassEntities.delete(smokeDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(smokeDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a Carbon Monoxide device', async () => {
    const coDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: '560898f83188759ed7329e97df00ee7c',
      labels: [],
      name: 'Carbon Monoxide Sensor',
      name_by_user: null,
    } as unknown as HassDevice;

    const coDeviceEntity = {
      area_id: null,
      device_id: coDevice.id,
      entity_category: null,
      entity_id: 'binary_sensor.co_sensor',
      has_entity_name: true,
      id: '5625a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Carbon Monoxide Sensor',
    } as unknown as HassEntity;

    const coDeviceEntityState = {
      entity_id: coDeviceEntity.entity_id,
      state: 'off', // 'on' for co, 'off' for no co
      attributes: {
        device_class: 'carbon_monoxide',
        friendly_name: 'Carbon Monoxide Sensor',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(coDevice.id, coDevice);
    haPlatform.ha.hassEntities.set(coDeviceEntity.entity_id, coDeviceEntity);
    haPlatform.ha.hassStates.set(coDeviceEntityState.entity_id, coDeviceEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(coDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(coDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(coDeviceEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(child.getAttribute(SmokeCoAlarm.Cluster.id, 'smokeState')).toBe(undefined);
    expect(child.getAttribute(SmokeCoAlarm.Cluster.id, 'coState')).toBe(SmokeCoAlarm.AlarmState.Normal);
    expect(addClusterServerCoAlarmSmokeCoAlarmSpy).toHaveBeenCalledWith(coDeviceEntity.entity_id, SmokeCoAlarm.AlarmState.Normal);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state ${CYAN}${coDeviceEntityState.entity_id}${db} for device ${CYAN}${coDevice.id}${db}`));
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'coState', SmokeCoAlarm.AlarmState.Normal, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(coDevice.id, coDeviceEntityState.entity_id, coDeviceEntityState, { ...coDeviceEntityState, state: 'on' }); // 'on' for co, 'off' for no co
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'coState', SmokeCoAlarm.AlarmState.Critical, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(coDevice.id, coDeviceEntityState.entity_id, coDeviceEntityState, { ...coDeviceEntityState, state: 'off' }); // 'on' for co, 'off' for no co
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'coState', SmokeCoAlarm.AlarmState.Normal, expect.anything());

    haPlatform.matterbridgeDevices.delete(coDevice.id);
    haPlatform.ha.hassDevices.delete(coDevice.id);
    haPlatform.ha.hassEntities.delete(coDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(coDeviceEntityState.entity_id);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async storage number persist operations to complete
    await device.delete();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onConfigure', async () => {
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Configuring platform ${idn}${mockConfig.name}${rs}${nf}...`);
    expect(mockLog.info).toHaveBeenCalledWith(`Configured platform ${idn}${mockConfig.name}${rs}${nf}`);
  });

  it('should call onShutdown with reason', async () => {
    await haPlatform.onShutdown('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Home Assistant connection closed`);
  });

  test('close the server node', async () => {
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(server).toBeDefined();
    expect(server.lifecycle.isReady).toBeTruthy();
    expect(server.lifecycle.isOnline).toBeTruthy();
    await server.close();
    expect(server.lifecycle.isReady).toBeTruthy();
    expect(server.lifecycle.isOnline).toBeFalsy();
  });

  test('stop the mDNS service', async () => {
    expect(server).toBeDefined();
    await server.env.get(MdnsService)[Symbol.asyncDispose]();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for async operations in matter.js to complete
  });
});
