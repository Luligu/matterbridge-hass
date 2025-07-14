// src\platform.matter.test.ts

/* eslint-disable no-console */

const MATTER_PORT = 6001;
const NAME = 'Matter';
const HOMEDIR = path.join('jest', NAME);

import { rmSync } from 'node:fs';
import path from 'node:path';

import { jest } from '@jest/globals';
import { Endpoint, DeviceTypeId, VendorId, ServerNode, LogFormat as MatterLogFormat, LogLevel as MatterLogLevel, Environment, MdnsService, Lifecycle } from 'matterbridge/matter';
import { RootEndpoint, AggregatorEndpoint } from 'matterbridge/matter/endpoints';
import { Matterbridge, MatterbridgeEndpoint, occupancySensor, PlatformConfig } from 'matterbridge';
import { AnsiLogger, CYAN, nf, rs, TimestampFormat, LogLevel, idn, db, or, hk } from 'matterbridge/logger';
import {
  PowerSource,
  BooleanState,
  FanControl,
  OnOff,
  LevelControl,
  SmokeCoAlarm,
  ColorControl,
  Thermostat,
  OccupancySensing,
  ElectricalPowerMeasurement,
  ElectricalEnergyMeasurement,
  AirQuality,
} from 'matterbridge/matter/clusters';

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
  matterbridgeDirectory: HOMEDIR + '/.matterbridge',
  matterbridgePluginDirectory: HOMEDIR + '/Matterbridge',
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
const addCommandHandlerSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'addCommandHandler');

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
const log = new AnsiLogger({ logName: NAME, logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });

const environment = Environment.default;
let server: ServerNode<ServerNode.RootEndpoint>;
let aggregator: Endpoint<AggregatorEndpoint>;
let device: MatterbridgeEndpoint;

describe('Matterbridge ' + NAME, () => {
  beforeAll(async () => {
    // Cleanup the matter environment
    rmSync(HOMEDIR, { recursive: true, force: true });

    // Setup the matter environment
    environment.vars.set('log.level', MatterLogLevel.DEBUG);
    environment.vars.set('log.format', MatterLogFormat.ANSI);
    environment.vars.set('path.root', HOMEDIR);
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
    expect(server.lifecycle.isReady).toBeTruthy();
    expect(server.lifecycle.isOnline).toBeFalsy();

    // Wait for the server to be online
    await new Promise<void>((resolve) => {
      server.lifecycle.online.on(async () => {
        resolve();
      });
      server.start();
    });

    // Check if the server is online
    expect(server.lifecycle.isReady).toBeTruthy();
    expect(server.lifecycle.isOnline).toBeTruthy();
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
    expect(mockLog.info).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
  });

  it('should call onStart and register an Air Quality Sensor device with numeric state', async () => {
    const airQualitySensorDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: 'Air Quality Sensor',
      name_by_user: null,
    } as unknown as HassDevice;
    const airQualitySensorEntity = {
      area_id: null,
      device_id: airQualitySensorDevice.id,
      entity_category: null,
      entity_id: 'sensor.air_quality_sensor',
      has_entity_name: true,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: null,
      original_name: 'Air Quality Sensor',
    } as unknown as HassEntity;
    const airQualitySensorEntityState = {
      entity_id: airQualitySensorEntity.entity_id,
      state: 200,
      attributes: {
        state_class: 'measurement',
        device_class: 'aqi',
        unit_of_measurement: 'AQI',
        friendly_name: 'Air Quality Sensor',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(airQualitySensorDevice.id, airQualitySensorDevice);
    haPlatform.ha.hassEntities.set(airQualitySensorEntity.entity_id, airQualitySensorEntity);
    haPlatform.ha.hassStates.set(airQualitySensorEntityState.entity_id, airQualitySensorEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(airQualitySensorDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(airQualitySensorDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName('AirQuality');
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    await haPlatform.onConfigure();

    expect(child.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Moderate);

    haPlatform.matterbridgeDevices.delete(airQualitySensorDevice.id);
    haPlatform.ha.hassDevices.delete(airQualitySensorDevice.id);
    haPlatform.ha.hassEntities.delete(airQualitySensorEntity.entity_id);
    haPlatform.ha.hassStates.delete(airQualitySensorEntityState.entity_id);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.ha.hassDevices.size).toBe(0);
    expect(haPlatform.ha.hassEntities.size).toBe(0);
    expect(haPlatform.ha.hassStates.size).toBe(0);

    await device.delete();
    expect(aggregator.parts.has(device)).toBeFalsy();
    expect(aggregator.parts.has(device.id)).toBeFalsy();
  });

  it('should call onStart and register an Air Quality Sensor device with text state', async () => {
    const airQualitySensorEnumDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: 'Air Quality Sensor Enum',
      name_by_user: null,
    } as unknown as HassDevice;
    const airQualitySensorEnumEntity = {
      area_id: null,
      device_id: airQualitySensorEnumDevice.id,
      entity_category: null,
      entity_id: 'sensor.air_quality_sensor_enum',
      has_entity_name: true,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: null,
      original_name: 'Air Quality Sensor Enum',
    } as unknown as HassEntity;
    const airQualitySensorEnumEntityState = {
      entity_id: airQualitySensorEnumEntity.entity_id,
      state: 'moderate', // Text/enum state instead of numeric
      attributes: {
        state_class: 'measurement',
        device_class: 'aqi',
        friendly_name: 'Air Quality Sensor Enum',
        // Note: no unit_of_measurement for enum states
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(airQualitySensorEnumDevice.id, airQualitySensorEnumDevice);
    haPlatform.ha.hassEntities.set(airQualitySensorEnumEntity.entity_id, airQualitySensorEnumEntity);
    haPlatform.ha.hassStates.set(airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(airQualitySensorEnumDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(airQualitySensorEnumDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName('AirQuality');
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    await haPlatform.onConfigure();

    expect(child.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Moderate);

    // Test different enum values
    jest.clearAllMocks();
    haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'good',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.Good, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'unhealthy',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.VeryPoor, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'hazardous',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.ExtremelyPoor, expect.anything());

    haPlatform.matterbridgeDevices.delete(airQualitySensorEnumDevice.id);
    haPlatform.ha.hassDevices.delete(airQualitySensorEnumDevice.id);
    haPlatform.ha.hassEntities.delete(airQualitySensorEnumEntity.entity_id);
    haPlatform.ha.hassStates.delete(airQualitySensorEnumEntityState.entity_id);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.ha.hassDevices.size).toBe(0);
    expect(haPlatform.ha.hassEntities.size).toBe(0);
    expect(haPlatform.ha.hassStates.size).toBe(0);

    await device.delete();
    expect(aggregator.parts.has(device)).toBeFalsy();
    expect(aggregator.parts.has(device.id)).toBeFalsy();
  });

  it('should call onStart and register an Air Quality Sensor device with regexp', async () => {
    const airQualitySensorEnumDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: 'Air Quality Sensor RegExp',
      name_by_user: null,
    } as unknown as HassDevice;
    const airQualitySensorEnumEntity = {
      area_id: null,
      device_id: airQualitySensorEnumDevice.id,
      entity_category: null,
      entity_id: 'sensor.air_quality_sensor_enum',
      has_entity_name: true,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: null,
      original_name: 'Air Quality Sensor Enum',
    } as unknown as HassEntity;
    const airQualitySensorEnumEntityState = {
      entity_id: airQualitySensorEnumEntity.entity_id,
      state: 'moderate', // Text/enum state instead of numeric
      attributes: {
        friendly_name: 'Air Quality Sensor Enum',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(airQualitySensorEnumDevice.id, airQualitySensorEnumDevice);
    haPlatform.ha.hassEntities.set(airQualitySensorEnumEntity.entity_id, airQualitySensorEnumEntity);
    haPlatform.ha.hassStates.set(airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState);

    expect((haPlatform as any).createRegexFromConfig(undefined)).toBeUndefined();
    expect((haPlatform as any).createRegexFromConfig('')).toBeUndefined();
    expect((haPlatform as any).createRegexFromConfig('sensor.air_quality_sensor_enum')).toEqual(expect.any(RegExp));
    expect((haPlatform as any).createRegexFromConfig('^sensor\\..*_air_quality$')).toEqual(expect.any(RegExp));
    expect((haPlatform as any).createRegexFromConfig('[invalid-regex-pattern')).toBeUndefined(); // Invalid regex with unclosed bracket

    haPlatform.config.airQualityRegex = 'sensor.air_quality_sensor_enum';
    haPlatform.airQualityRegex = new RegExp('sensor.air_quality_sensor_enum');

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(airQualitySensorEnumDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(airQualitySensorEnumDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName('AirQuality');
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    await haPlatform.onConfigure();

    expect(child.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Moderate);

    // Test different enum values
    jest.clearAllMocks();
    haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'fair',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.Fair, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'poor',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.Poor, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'very_poor',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.VeryPoor, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'extremely_poor',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.ExtremelyPoor, expect.anything());

    haPlatform.matterbridgeDevices.delete(airQualitySensorEnumDevice.id);
    haPlatform.ha.hassDevices.delete(airQualitySensorEnumDevice.id);
    haPlatform.ha.hassEntities.delete(airQualitySensorEnumEntity.entity_id);
    haPlatform.ha.hassStates.delete(airQualitySensorEnumEntityState.entity_id);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.ha.hassDevices.size).toBe(0);
    expect(haPlatform.ha.hassEntities.size).toBe(0);
    expect(haPlatform.ha.hassStates.size).toBe(0);
    haPlatform.config.airQualityRegex = undefined; // Reset the regex configuration
    haPlatform.airQualityRegex = undefined; // Reset the regex

    await device.delete();
    expect(aggregator.parts.has(device)).toBeFalsy();
    expect(aggregator.parts.has(device.id)).toBeFalsy();
  });

  it('should call onStart and register an Electrical Sensor device', async () => {
    const electricalSensorDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: 'Electrical Sensor',
      name_by_user: null,
    } as unknown as HassDevice;

    const electricalSensorVoltageEntity = {
      area_id: null,
      device_id: electricalSensorDevice.id,
      entity_category: null,
      entity_id: 'sensor.electrical_sensor_voltage',
      has_entity_name: true,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: null,
      original_name: 'Electrical Sensor',
    } as unknown as HassEntity;

    const electricalSensorCurrentEntity = {
      area_id: null,
      device_id: electricalSensorDevice.id,
      entity_category: null,
      entity_id: 'sensor.electrical_sensor_current',
      has_entity_name: true,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: null,
      original_name: 'Electrical Sensor Current',
    } as unknown as HassEntity;

    const electricalSensorPowerEntity = {
      area_id: null,
      device_id: electricalSensorDevice.id,
      entity_category: null,
      entity_id: 'sensor.electrical_sensor_power',
      has_entity_name: true,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: null,
      original_name: 'Electrical Sensor Power',
    } as unknown as HassEntity;

    const electricalSensorEnergyEntity = {
      area_id: null,
      device_id: electricalSensorDevice.id,
      entity_category: null,
      entity_id: 'sensor.electrical_sensor_energy',
      has_entity_name: true,
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      labels: [],
      name: null,
      original_name: 'Electrical Sensor Energy',
    } as unknown as HassEntity;

    const electricalSensorVoltageEntityState = {
      entity_id: electricalSensorVoltageEntity.entity_id,
      state: 230,
      attributes: {
        state_class: 'measurement',
        device_class: 'voltage',
        unit_of_measurement: 'V',
        friendly_name: 'Electrical Sensor Voltage',
      },
    } as unknown as HassState;

    const electricalSensorCurrentEntityState = {
      entity_id: electricalSensorCurrentEntity.entity_id,
      state: 10,
      attributes: {
        state_class: 'measurement',
        device_class: 'current',
        unit_of_measurement: 'A',
        friendly_name: 'Electrical Sensor Current',
      },
    } as unknown as HassState;

    const electricalSensorPowerEntityState = {
      entity_id: electricalSensorPowerEntity.entity_id,
      state: 23,
      attributes: {
        state_class: 'measurement',
        device_class: 'power',
        unit_of_measurement: 'W',
        friendly_name: 'Electrical Sensor Power',
      },
    } as unknown as HassState;

    const electricalSensorEnergyEntityState = {
      entity_id: electricalSensorEnergyEntity.entity_id,
      state: 100,
      attributes: {
        state_class: 'total_increasing',
        device_class: 'energy',
        unit_of_measurement: 'kWh',
        friendly_name: 'Electrical Sensor Energy',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(electricalSensorDevice.id, electricalSensorDevice);
    haPlatform.ha.hassEntities.set(electricalSensorVoltageEntity.entity_id, electricalSensorVoltageEntity);
    haPlatform.ha.hassEntities.set(electricalSensorCurrentEntity.entity_id, electricalSensorCurrentEntity);
    haPlatform.ha.hassEntities.set(electricalSensorPowerEntity.entity_id, electricalSensorPowerEntity);
    haPlatform.ha.hassEntities.set(electricalSensorEnergyEntity.entity_id, electricalSensorEnergyEntity);
    haPlatform.ha.hassStates.set(electricalSensorVoltageEntityState.entity_id, electricalSensorVoltageEntityState);
    haPlatform.ha.hassStates.set(electricalSensorCurrentEntityState.entity_id, electricalSensorCurrentEntityState);
    haPlatform.ha.hassStates.set(electricalSensorPowerEntityState.entity_id, electricalSensorPowerEntityState);
    haPlatform.ha.hassStates.set(electricalSensorEnergyEntityState.entity_id, electricalSensorEnergyEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(electricalSensorDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(electricalSensorDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName('PowerEnergy');
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    await haPlatform.onConfigure();

    expect(child.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'voltage')).toBe(230000);
    expect(child.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'activeCurrent')).toBe(10000);
    expect(child.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'activePower')).toBe(23000);
    expect(child.getAttribute(ElectricalEnergyMeasurement.Cluster.id, 'cumulativeEnergyImported').energy).toBe(100000000);

    haPlatform.matterbridgeDevices.delete(electricalSensorDevice.id);
    haPlatform.ha.hassDevices.delete(electricalSensorDevice.id);
    haPlatform.ha.hassEntities.delete(electricalSensorVoltageEntity.entity_id);
    haPlatform.ha.hassEntities.delete(electricalSensorCurrentEntity.entity_id);
    haPlatform.ha.hassEntities.delete(electricalSensorPowerEntity.entity_id);
    haPlatform.ha.hassEntities.delete(electricalSensorEnergyEntity.entity_id);
    haPlatform.ha.hassStates.delete(electricalSensorVoltageEntityState.entity_id);
    haPlatform.ha.hassStates.delete(electricalSensorCurrentEntityState.entity_id);
    haPlatform.ha.hassStates.delete(electricalSensorPowerEntityState.entity_id);
    haPlatform.ha.hassStates.delete(electricalSensorEnergyEntityState.entity_id);
    await device.delete();
  });

  it('should call onStart and register a PowerSource device', async () => {
    const batteryDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e922f00ee7c',
      labels: [],
      name: 'Temperature with Battery Sensor',
      name_by_user: null,
    } as unknown as HassDevice;

    const batteryTemperatureEntity = {
      area_id: null,
      device_id: batteryDevice.id,
      entity_category: null,
      entity_id: 'sensor.temperature',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Battery Temperature Sensor',
    } as unknown as HassEntity;

    const batteryAlertEntity = {
      area_id: null,
      device_id: batteryDevice.id,
      entity_category: null,
      entity_id: 'binary_sensor.battery',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Battery Low Sensor',
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
      original_name: 'Battery Level Sensor',
    } as unknown as HassEntity;

    const batteryVoltageEntity = {
      area_id: null,
      device_id: batteryDevice.id,
      entity_category: null,
      entity_id: 'sensor.battery_voltage',
      has_entity_name: true,
      id: '0b25a337c543edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Battery Voltage Sensor',
    } as unknown as HassEntity;

    const batteryAlertEntityState = {
      entity_id: batteryAlertEntity.entity_id,
      state: 'off', // On means low, Off means normal
      attributes: {
        device_class: 'battery',
        friendly_name: 'Battery Alert Sensor',
      },
    } as unknown as HassState;

    const batteryTemperatureEntityState = {
      entity_id: batteryTemperatureEntity.entity_id,
      state: 28.4,
      attributes: {
        state_class: 'measurement',
        device_class: 'temperature',
        friendly_name: 'Battery Temperature Sensor',
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

    const batteryVoltageEntityState = {
      entity_id: batteryVoltageEntity.entity_id,
      state: 3050,
      attributes: {
        state_class: 'measurement',
        device_class: 'voltage',
        unit_of_measurement: 'mV',
        friendly_name: 'Battery Voltage Sensor',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(batteryDevice.id, batteryDevice);
    haPlatform.ha.hassEntities.set(batteryTemperatureEntity.entity_id, batteryTemperatureEntity);
    haPlatform.ha.hassEntities.set(batteryAlertEntity.entity_id, batteryAlertEntity);
    haPlatform.ha.hassEntities.set(batteryLevelEntity.entity_id, batteryLevelEntity);
    haPlatform.ha.hassEntities.set(batteryVoltageEntity.entity_id, batteryVoltageEntity);
    haPlatform.ha.hassStates.set(batteryTemperatureEntityState.entity_id, batteryTemperatureEntityState);
    haPlatform.ha.hassStates.set(batteryAlertEntityState.entity_id, batteryAlertEntityState);
    haPlatform.ha.hassStates.set(batteryLevelEntityState.entity_id, batteryLevelEntityState);
    haPlatform.ha.hassStates.set(batteryVoltageEntityState.entity_id, batteryVoltageEntityState);

    await haPlatform.onStart('Test reason');
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(batteryDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(batteryDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    const child = device?.getChildEndpointByName(batteryTemperatureEntity.entity_id.replace('.', ''));
    expect(child).toBeDefined();
    if (!child) return;
    await child.construction.ready;
    expect(child.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(PowerSource.Cluster.id, 'batChargeLevel')).toBe(PowerSource.BatChargeLevel.Ok);
    expect(device.getAttribute(PowerSource.Cluster.id, 'batPercentRemaining')).toBe(200);
    expect(addClusterServerPowerSourceSpy).toHaveBeenCalledWith('', PowerSource.BatChargeLevel.Ok, 200);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${batteryAlertEntityState.entity_id}${db} for device ${CYAN}${batteryDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 100, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batVoltage', 3050, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(batteryDevice.id, batteryAlertEntityState.entity_id, batteryAlertEntityState, { ...batteryAlertEntityState, state: 'on' }); // On means low, Off means normal
    haPlatform.updateHandler(batteryDevice.id, batteryLevelEntityState.entity_id, batteryLevelEntityState, { ...batteryLevelEntityState, state: '100' });
    haPlatform.updateHandler(batteryDevice.id, batteryVoltageEntityState.entity_id, batteryVoltageEntityState, { ...batteryVoltageEntityState, state: '2000' });
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Critical, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 200, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batVoltage', 2000, expect.anything());

    jest.clearAllMocks();
    haPlatform.updateHandler(batteryDevice.id, batteryAlertEntityState.entity_id, batteryAlertEntityState, { ...batteryAlertEntityState, state: 'off' }); // On means low, Off means normal
    haPlatform.updateHandler(batteryDevice.id, batteryLevelEntityState.entity_id, batteryLevelEntityState, { ...batteryLevelEntityState, state: '25' });
    haPlatform.updateHandler(batteryDevice.id, batteryVoltageEntityState.entity_id, batteryVoltageEntityState, { ...batteryVoltageEntityState, state: '2900' });
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 50, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batVoltage', 2900, expect.anything());

    haPlatform.matterbridgeDevices.delete(batteryDevice.id);
    haPlatform.ha.hassDevices.delete(batteryDevice.id);
    haPlatform.ha.hassEntities.delete(batteryAlertEntity.entity_id);
    haPlatform.ha.hassEntities.delete(batteryTemperatureEntity.entity_id);
    haPlatform.ha.hassEntities.delete(batteryLevelEntity.entity_id);
    haPlatform.ha.hassEntities.delete(batteryVoltageEntity.entity_id);
    haPlatform.ha.hassStates.delete(batteryLevelEntityState.entity_id);
    haPlatform.ha.hassStates.delete(batteryVoltageEntityState.entity_id);
    haPlatform.ha.hassStates.delete(batteryAlertEntityState.entity_id);
    haPlatform.ha.hassStates.delete(batteryTemperatureEntityState.entity_id);
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
