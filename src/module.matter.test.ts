// src\module.matter.test.ts

/* eslint-disable no-console */

const MATTER_PORT = 6001;
const NAME = 'PlatformMatter';
const HOMEDIR = path.join('jest', NAME);

import path from 'node:path';

import { jest } from '@jest/globals';
import { Endpoint, ServerNode, Lifecycle } from 'matterbridge/matter';
import { AggregatorEndpoint } from 'matterbridge/matter/endpoints';
import { invokeBehaviorCommand, invokeSubscribeHandler, Matterbridge, MatterbridgeEndpoint, occupancySensor } from 'matterbridge';
import { AnsiLogger, CYAN, nf, rs, TimestampFormat, LogLevel, idn, db, or, hk, dn } from 'matterbridge/logger';
import {
  PowerSource,
  BooleanState,
  FanControl,
  OnOff,
  LevelControl,
  DoorLock,
  SmokeCoAlarm,
  ColorControl,
  Thermostat,
  OccupancySensing,
  RelativeHumidityMeasurement,
  ElectricalPowerMeasurement,
  ElectricalEnergyMeasurement,
  PressureMeasurement,
  IlluminanceMeasurement,
  AirQuality,
  TemperatureMeasurement,
  ValveConfigurationAndControl,
  RvcRunMode,
  RvcOperationalState,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
  CarbonDioxideConcentrationMeasurement,
  CarbonMonoxideConcentrationMeasurement,
  NitrogenDioxideConcentrationMeasurement,
  OzoneConcentrationMeasurement,
  FormaldehydeConcentrationMeasurement,
  RadonConcentrationMeasurement,
  Pm1ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
} from 'matterbridge/matter/clusters';
import {
  createTestEnvironment,
  flushAsync,
  startServerNode,
  stopServerNode,
  setupTest,
  loggerLogSpy,
  destroyTestEnvironment,
  logKeepAlives,
  aggregator,
  server,
  addMatterbridgePlatform,
} from 'matterbridge/jestutils';

// Home Assistant Plugin
import { HomeAssistantPlatform, HomeAssistantPlatformConfig } from './module.js';
import { HassConfig, HassContext, HassDevice, HassEntity, HassServices, HassState, HomeAssistant } from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';

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

const waitForHassRunningSpy = jest.spyOn(HomeAssistant.prototype, 'waitForHassRunning').mockImplementation(() => {
  console.log(`Mocked HomeAssistant.waitForHassRunning`);
  return Promise.resolve(true);
});

const setAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'setAttribute');
const updateAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'updateAttribute');
const subscribeAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'subscribeAttribute');
const addCommandHandlerSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'addCommandHandler');

const addClusterServerBatteryPowerSourceSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerBatteryPowerSource');
const addClusterServerBooleanStateSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerBooleanState');
const addClusterServerSmokeAlarmSmokeCoAlarmSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerSmokeAlarmSmokeCoAlarm');
const addClusterServerCoAlarmSmokeCoAlarmSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerCoAlarmSmokeCoAlarm');
const addClusterServerColorTemperatureColorControlSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerColorTemperatureColorControl');
const addClusterServerColorControlSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerColorControl');
const addClusterServerAutoModeThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerAutoModeThermostat');
const addClusterServerHeatingThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerHeatingThermostat');
const addClusterServerCoolingThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerCoolingThermostat');

MatterbridgeEndpoint.logLevel = LogLevel.DEBUG; // Set the log level for MatterbridgeEndpoint to DEBUG

// Setup the test environment
await setupTest(NAME, false);

// Cleanup the matter environment
createTestEnvironment(NAME);

describe('Matterbridge ' + NAME, () => {
  let haPlatform: HomeAssistantPlatform;
  const log = new AnsiLogger({ logName: NAME, logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG });

  let device: MatterbridgeEndpoint;

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
    matterbridgeVersion: '3.4.0',
    log: mockLog,
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      await aggregator.add(device);
      await flushAsync(undefined, undefined, 10);
    }),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
    addVirtualEndpoint: jest.fn(async (pluginName: string, name: string, type: 'light' | 'outlet' | 'switch' | 'mounted_switch', callback: () => Promise<void>) => {}),
  } as unknown as Matterbridge;

  const mockConfig: HomeAssistantPlatformConfig = {
    name: 'matterbridge-hass',
    type: 'DynamicPlatform',
    version: '1.0.0',
    host: 'http://homeassistant.local:8123',
    token: 'long-lived token',
    certificatePath: '',
    rejectUnauthorized: true,
    reconnectTimeout: 60,
    reconnectRetries: 10,
    filterByArea: '',
    filterByLabel: '',
    applyFiltersToDeviceEntities: false,
    whiteList: [],
    blackList: [],
    entityBlackList: [],
    deviceEntityBlackList: {},
    splitEntities: [],
    namePostfix: '',
    postfix: '',
    airQualityRegex: '',
    enableServerRvc: false,
    debug: false,
    unregisterOnShutdown: false,
  };

  beforeAll(async () => {
    // Create the test environment
    createTestEnvironment(NAME);
  });

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await flushAsync(1, 1, 0);
  });

  afterAll(async () => {
    // Destroy the test environment
    await destroyTestEnvironment();

    // Wait 500ms to allow single entities to reset to off
    await flushAsync();
    await flushAsync();

    // Restore all mocks
    jest.restoreAllMocks();

    // logKeepAlives(log);
  });

  async function cleanup() {
    // Clean the test environment
    haPlatform.matterbridgeDevices.clear();
    haPlatform.endpointNames.clear();
    haPlatform.batteryVoltageEntities.clear();
    haPlatform.ha.hassDevices.clear();
    haPlatform.ha.hassEntities.clear();
    haPlatform.ha.hassStates.clear();
    for (const device of aggregator.parts) {
      await device.delete();
      await flushAsync(undefined, undefined, 0);
    }
    expect(aggregator.parts.size).toBe(0);

    // Clean the platform environment
    await haPlatform.clearSelect();
    await haPlatform.unregisterAllDevices();
  }

  test('create and start the server node', async () => {
    await startServerNode(NAME, MATTER_PORT);
    expect(server).toBeDefined();
    expect(aggregator).toBeDefined();
  });

  it('should initialize the HomeAssistantPlatform', async () => {
    haPlatform = new HomeAssistantPlatform(mockMatterbridge, mockLog, mockConfig);
    expect(haPlatform).toBeDefined();
    // addMatterbridgePlatform(haPlatform);
    // @ts-expect-error - setMatterNode is intentionally private
    haPlatform.setMatterNode?.(
      mockMatterbridge.addBridgedEndpoint,
      mockMatterbridge.removeBridgedEndpoint,
      mockMatterbridge.removeAllBridgedEndpoints,
      mockMatterbridge.addVirtualEndpoint,
    );
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(airQualitySensorDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(airQualitySensorDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    await haPlatform.onConfigure();

    expect(device.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Moderate);

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(airQualitySensorEnumDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(airQualitySensorEnumDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    await haPlatform.onConfigure();

    expect(device.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Moderate);

    // Test different enum values
    jest.clearAllMocks();
    await haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'good',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.Good, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'unhealthy',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.VeryPoor, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'hazardous',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.ExtremelyPoor, expect.anything());

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(airQualitySensorEnumDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(airQualitySensorEnumDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    await haPlatform.onConfigure();

    expect(device.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Moderate);

    // Test different enum values
    jest.clearAllMocks();
    await haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'fair',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.Fair, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'poor',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.Poor, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'very_poor',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.VeryPoor, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(airQualitySensorEnumDevice.id, airQualitySensorEnumEntityState.entity_id, airQualitySensorEnumEntityState, {
      ...airQualitySensorEnumEntityState,
      state: 'extremely_poor',
    });
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.ExtremelyPoor, expect.anything());

    haPlatform.config.airQualityRegex = undefined; // Reset the regex configuration
    haPlatform.airQualityRegex = undefined; // Reset the regex

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(electricalSensorDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(electricalSensorDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    await haPlatform.onConfigure();

    expect(device.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'voltage')).toBe(230000);
    expect(device.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'activeCurrent')).toBe(10000);
    expect(device.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'activePower')).toBe(23000);
    expect(device.getAttribute(ElectricalEnergyMeasurement.Cluster.id, 'cumulativeEnergyImported').energy).toBe(100000000);

    // Clean the test environment
    await cleanup();
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

    // setDebug(true);
    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(batteryDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(batteryDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(PowerSource.Cluster.id, 'batChargeLevel')).toBe(PowerSource.BatChargeLevel.Ok);
    expect(device.getAttribute(PowerSource.Cluster.id, 'batPercentRemaining')).toBe(200);
    expect(addClusterServerBatteryPowerSourceSpy).toHaveBeenCalledWith('', PowerSource.BatChargeLevel.Ok, 200);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${batteryAlertEntityState.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 100, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batVoltage', 3050, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(batteryDevice.id, batteryAlertEntityState.entity_id, batteryAlertEntityState, { ...batteryAlertEntityState, state: 'on' }); // On means low, Off means normal
    await haPlatform.updateHandler(batteryDevice.id, batteryLevelEntityState.entity_id, batteryLevelEntityState, { ...batteryLevelEntityState, state: '100' });
    await haPlatform.updateHandler(batteryDevice.id, batteryVoltageEntityState.entity_id, batteryVoltageEntityState, { ...batteryVoltageEntityState, state: '2000' });
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Critical, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 200, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batVoltage', 2000, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(batteryDevice.id, batteryAlertEntityState.entity_id, batteryAlertEntityState, { ...batteryAlertEntityState, state: 'off' }); // On means low, Off means normal
    await haPlatform.updateHandler(batteryDevice.id, batteryLevelEntityState.entity_id, batteryLevelEntityState, { ...batteryLevelEntityState, state: '25' });
    await haPlatform.updateHandler(batteryDevice.id, batteryVoltageEntityState.entity_id, batteryVoltageEntityState, { ...batteryVoltageEntityState, state: '2900' });
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batChargeLevel', PowerSource.BatChargeLevel.Ok, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batPercentRemaining', 50, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(PowerSource.Cluster.id, 'batVoltage', 2900, expect.anything());

    // Clean the test environment
    await cleanup();

    // setDebug(false);
  });

  it('should call onStart and register a double Switch device', async () => {
    const switchDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e922f00ee7c',
      labels: [],
      name: 'Double Switch',
      name_by_user: null,
    } as unknown as HassDevice;

    const switch1Entity = {
      area_id: null,
      device_id: switchDevice.id,
      entity_category: null,
      entity_id: 'switch.switch1',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Switch 1',
    } as unknown as HassEntity;

    const switch1EnergyEntity = {
      area_id: null,
      device_id: switchDevice.id,
      entity_category: null,
      entity_id: 'sensor.switch1_energy',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Switch 1 Energy',
    } as unknown as HassEntity;

    const switch2Entity = {
      area_id: null,
      device_id: switchDevice.id,
      entity_category: null,
      entity_id: 'switch.switch2',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Switch 2',
    } as unknown as HassEntity;

    const switch2EnergyEntity = {
      area_id: null,
      device_id: switchDevice.id,
      entity_category: null,
      entity_id: 'sensor.switch2_energy',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310444ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Switch 2 Energy',
    } as unknown as HassEntity;

    const switch1State = {
      entity_id: switch1Entity.entity_id,
      state: 'off',
      attributes: {
        friendly_name: 'Switch 1',
      },
    } as unknown as HassState;

    const switch1EnergyState = {
      entity_id: switch1EnergyEntity.entity_id,
      state: 1000,
      attributes: {
        state_class: 'total_increasing',
        device_class: 'energy',
        friendly_name: 'Switch 1 Energy',
      },
    } as unknown as HassState;

    const switch2State = {
      entity_id: switch2Entity.entity_id,
      state: 'off',
      attributes: {
        friendly_name: 'Switch 2',
      },
    } as unknown as HassState;

    const switch2EnergyState = {
      entity_id: switch2EnergyEntity.entity_id,
      state: 1000,
      attributes: {
        state_class: 'total_increasing',
        device_class: 'energy',
        friendly_name: 'Switch 2 Energy',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(switchDevice.id, switchDevice);
    haPlatform.ha.hassEntities.set(switch1Entity.entity_id, switch1Entity);
    haPlatform.ha.hassEntities.set(switch2Entity.entity_id, switch2Entity);
    haPlatform.ha.hassEntities.set(switch1EnergyEntity.entity_id, switch1EnergyEntity);
    haPlatform.ha.hassEntities.set(switch2EnergyEntity.entity_id, switch2EnergyEntity);
    haPlatform.ha.hassStates.set(switch1State.entity_id, switch1State);
    haPlatform.ha.hassStates.set(switch2State.entity_id, switch2State);
    haPlatform.ha.hassStates.set(switch1EnergyState.entity_id, switch1EnergyState);
    haPlatform.ha.hassStates.set(switch2EnergyState.entity_id, switch2EnergyState);

    // setDebug(true);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(switchDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(switchDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(haPlatform.batteryVoltageEntities.size).toBe(0);
    expect(haPlatform.endpointNames.size).toBe(4);

    const child1 = device?.getChildEndpointByName(switch1Entity.entity_id.replace('.', ''));
    expect(child1).toBeDefined();
    if (!child1) return;
    await child1.construction.ready;
    expect(child1.construction.status).toBe(Lifecycle.Status.Active);

    const child2 = device?.getChildEndpointByName(switch2Entity.entity_id.replace('.', ''));
    expect(child2).toBeDefined();
    if (!child2) return;
    await child2.construction.ready;
    expect(child2.construction.status).toBe(Lifecycle.Status.Active);

    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(6);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(child1.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(child2.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${switch1State.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledTimes(2);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', false, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(switchDevice.id, switch1Entity.entity_id, switch1State, { ...switch1State, state: 'on' }); // On means low, Off means normal
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(switchDevice.id, switch2Entity.entity_id, switch2State, { ...switch2State, state: 'on' }); // On means low, Off means normal
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());

    await invokeBehaviorCommand(child1, 'onOff', 'on');
    expect(child1.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(switch1Entity.entity_id.split('.')[0], 'turn_on', switch1Entity.entity_id, undefined);

    await invokeBehaviorCommand(child1, 'onOff', 'off');
    expect(child1.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(switch1Entity.entity_id.split('.')[0], 'turn_off', switch1Entity.entity_id, undefined);

    await invokeBehaviorCommand(child1, 'onOff', 'toggle');
    expect(child1.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(switch1Entity.entity_id.split('.')[0], 'toggle', switch1Entity.entity_id, undefined);

    await invokeBehaviorCommand(child2, 'onOff', 'on');
    expect(child2.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(switch2Entity.entity_id.split('.')[0], 'turn_on', switch2Entity.entity_id, undefined);

    await invokeBehaviorCommand(child2, 'onOff', 'off');
    expect(child2.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(switch2Entity.entity_id.split('.')[0], 'turn_off', switch2Entity.entity_id, undefined);

    await invokeBehaviorCommand(child2, 'onOff', 'toggle');
    expect(child2.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(switch2Entity.entity_id.split('.')[0], 'toggle', switch2Entity.entity_id, undefined);

    // Clean the test environment
    await cleanup();

    // setDebug(false);
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

    const switchEntity = {
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

    const switchState = {
      entity_id: switchEntity.entity_id,
      state: 'on',
      attributes: { device_class: 'outlet', friendly_name: 'Switch Switch' },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(switchDevice.id, switchDevice);
    haPlatform.ha.hassEntities.set(switchEntity.entity_id, switchEntity);
    haPlatform.ha.hassStates.set(switchState.entity_id, switchState);

    // setDebug(true);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(switchDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(switchDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(3);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${switchEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(switchDevice.id, switchEntity.entity_id, switchState, { ...switchState, state: 'off' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', false, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    await invokeBehaviorCommand(device, 'onOff', 'on');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(switchEntity.entity_id.split('.')[0], 'turn_on', switchEntity.entity_id, undefined);

    await invokeBehaviorCommand(device, 'onOff', 'off');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(switchEntity.entity_id.split('.')[0], 'turn_off', switchEntity.entity_id, undefined);

    await invokeBehaviorCommand(device, 'onOff', 'toggle');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(switchEntity.entity_id.split('.')[0], 'toggle', switchEntity.entity_id, undefined);

    // setDebug(false);

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and register a Valve device', async () => {
    const valveDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee6a',
      labels: [],
      name: 'Valve',
      name_by_user: null,
    } as unknown as HassDevice;

    const valveEntity = {
      area_id: null,
      device_id: valveDevice.id,
      entity_category: null,
      entity_id: 'valve.valve',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0aa',
      labels: [],
      name: null,
      original_name: 'Valve',
    } as unknown as HassEntity;

    const valveState = {
      entity_id: valveEntity.entity_id,
      state: 'open',
      attributes: { current_position: 50, friendly_name: 'Valve Valve' },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(valveDevice.id, valveDevice);
    haPlatform.ha.hassEntities.set(valveEntity.entity_id, valveEntity);
    haPlatform.ha.hassStates.set(valveState.entity_id, valveState);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(valveDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(valveDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(2);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${valveEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(ValveConfigurationAndControl.Cluster.id, 'currentState', ValveConfigurationAndControl.ValveState.Open, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ValveConfigurationAndControl.Cluster.id, 'currentLevel', 50, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(valveDevice.id, valveEntity.entity_id, valveState, { ...valveState, state: 'closing' });
    expect(setAttributeSpy).toHaveBeenCalledWith(ValveConfigurationAndControl.Cluster.id, 'currentState', ValveConfigurationAndControl.ValveState.Transitioning, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ValveConfigurationAndControl.Cluster.id, 'currentLevel', 50, expect.anything());
    expect(device.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Transitioning);
    expect(device.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentLevel')).toBe(50);

    jest.clearAllMocks();
    // @ts-expect-error type mismatch
    await haPlatform.updateHandler(valveDevice.id, valveEntity.entity_id, valveState, { ...valveState, state: 'closed', attributes: { current_position: 0 } });
    expect(setAttributeSpy).toHaveBeenCalledWith(ValveConfigurationAndControl.Cluster.id, 'currentState', ValveConfigurationAndControl.ValveState.Closed, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ValveConfigurationAndControl.Cluster.id, 'currentLevel', 0, expect.anything());
    expect(device.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Closed);
    expect(device.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentLevel')).toBe(0);

    await invokeBehaviorCommand(device, 'ValveConfigurationAndControl', 'open', { targetLevel: 100 });
    expect(device.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Open);
    expect(callServiceSpy).toHaveBeenCalledWith(valveEntity.entity_id.split('.')[0], 'set_valve_position', valveEntity.entity_id, { position: 100 });

    await invokeBehaviorCommand(device, 'ValveConfigurationAndControl', 'close');
    expect(device.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentState')).toBe(ValveConfigurationAndControl.ValveState.Closed);
    expect(callServiceSpy).toHaveBeenCalledWith(valveEntity.entity_id.split('.')[0], 'close_valve', valveEntity.entity_id, undefined);

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and register a Vacuum device', async () => {
    const vacuumDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee6a',
      labels: [],
      name: 'Vacuum',
      name_by_user: null,
    } as unknown as HassDevice;

    const vacuumEntity = {
      area_id: null,
      device_id: vacuumDevice.id,
      entity_category: null,
      entity_id: 'vacuum.vacuum',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0aa',
      labels: [],
      name: null,
      original_name: 'Vacuum',
    } as unknown as HassEntity;

    const vacuumState = {
      entity_id: vacuumEntity.entity_id,
      state: 'docked',
      attributes: { current_position: 50, friendly_name: 'Vacuum' },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(vacuumDevice.id, vacuumDevice);
    haPlatform.ha.hassEntities.set(vacuumEntity.entity_id, vacuumEntity);
    haPlatform.ha.hassStates.set(vacuumState.entity_id, vacuumState);

    // setDebug(true);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(vacuumDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(vacuumDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();

    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${vacuumDevice.name}${rs}${nf} id ${CYAN}${vacuumDevice.id}${nf}...`);
    expect(mockLog.debug).toHaveBeenCalledWith(
      `Creating endpoint ${CYAN}${vacuumEntity.entity_id}${db} for device ${idn}${vacuumDevice.name}${rs}${db} id ${CYAN}${vacuumDevice.id}${db}...`,
    );
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(4);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    // The implementation has RvcRunMode currentMode 1 = Idle 2 = Cleaning

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${vacuumEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 1, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Docked, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(vacuumDevice.id, vacuumEntity.entity_id, vacuumState, { ...vacuumState, state: 'idle' });
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 1, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Stopped, expect.anything());
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(1);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.Stopped);

    jest.clearAllMocks();
    await haPlatform.updateHandler(vacuumDevice.id, vacuumEntity.entity_id, vacuumState, { ...vacuumState, state: 'cleaning' });
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 2, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Running, expect.anything());
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(2);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.Running);

    jest.clearAllMocks();
    await haPlatform.updateHandler(vacuumDevice.id, vacuumEntity.entity_id, vacuumState, { ...vacuumState, state: 'paused' });
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 1, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Paused, expect.anything());
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(1);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.Paused);

    jest.clearAllMocks();
    await haPlatform.updateHandler(vacuumDevice.id, vacuumEntity.entity_id, vacuumState, { ...vacuumState, state: 'returning' });
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 1, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.SeekingCharger, expect.anything());
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(1);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.SeekingCharger);

    jest.clearAllMocks();
    await haPlatform.updateHandler(vacuumDevice.id, vacuumEntity.entity_id, vacuumState, { ...vacuumState, state: 'docked' });
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcRunMode.Cluster.id, 'currentMode', 1, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(RvcOperationalState.Cluster.id, 'operationalState', RvcOperationalState.OperationalState.Docked, expect.anything());
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(1);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.Docked);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'RvcRunMode', 'changeToMode', { newMode: 2 });
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(2);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.Running);
    expect(callServiceSpy).toHaveBeenCalledWith(vacuumEntity.entity_id.split('.')[0], 'start', vacuumEntity.entity_id, undefined);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'RvcOperationalState', 'pause');
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(1);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.Paused);
    expect(callServiceSpy).toHaveBeenCalledWith(vacuumEntity.entity_id.split('.')[0], 'pause', vacuumEntity.entity_id, undefined);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'RvcOperationalState', 'resume');
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(2);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.Running);
    expect(callServiceSpy).toHaveBeenCalledWith(vacuumEntity.entity_id.split('.')[0], 'start', vacuumEntity.entity_id, undefined);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'RvcOperationalState', 'goHome');
    expect(device.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(1);
    expect(device.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(RvcOperationalState.OperationalState.Docked);
    expect(callServiceSpy).toHaveBeenCalledWith(vacuumEntity.entity_id.split('.')[0], 'return_to_base', vacuumEntity.entity_id, undefined);

    // setDebug(false);

    // Clean the test environment
    await cleanup();
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
        color_temp_kelvin: 5000, // Mireds 200
        min_color_temp_kelvin: 2500, // Maximum mireds 400
        max_color_temp_kelvin: 6500, // Minimum mireds 153
        friendly_name: 'Light Light Ct',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(lightDevice.id, lightDevice);
    haPlatform.ha.hassEntities.set(lightDeviceEntity.entity_id, lightDeviceEntity);
    haPlatform.ha.hassStates.set(lightDeviceEntityState.entity_id, lightDeviceEntityState);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(lightDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(lightDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(addClusterServerColorTemperatureColorControlSpy).toHaveBeenCalledWith(lightDeviceEntity.entity_id, 153, 400);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${lightDeviceEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(LevelControl.Cluster.id, 'currentLevel', 100, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'colorTemperatureMireds', 200, expect.anything());

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(lightDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(lightDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(addClusterServerColorControlSpy).toHaveBeenCalledWith(lightDeviceEntity.entity_id, 153, 500);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${lightDeviceEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(LevelControl.Cluster.id, 'currentLevel', 100, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'currentHue', 127, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(ColorControl.Cluster.id, 'currentSaturation', 127, expect.anything());

    // Clean the test environment
    await cleanup();
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

    const fanEntity = {
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

    const fanState = {
      entity_id: fanEntity.entity_id,
      state: 'on',
      attributes: {
        preset_mode: 'high',
        percentage: 50,
        friendly_name: 'Fan Fan',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(fanDevice.id, fanDevice);
    haPlatform.ha.hassEntities.set(fanEntity.entity_id, fanEntity);
    haPlatform.ha.hassStates.set(fanState.entity_id, fanState);

    // setDebug(true);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(fanDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(fanDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(
        `= fanControl device ${CYAN}${fanEntity.entity_id}${db} preset_modes: ${CYAN}${fanState.attributes['preset_modes']}${db} direction: ${CYAN}${fanState.attributes['direction']}${db} oscillating: ${CYAN}${fanState.attributes['oscillating']}${db}`,
      ),
    );
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(2);
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'percentSetting', expect.anything(), expect.anything());
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}FanControl${db}.${hk}fanMode$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}FanControl${db}.${hk}percentSetting$Changed${db}`),
    );

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${fanEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Auto, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'percentCurrent', 50, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(fanDevice.id, fanEntity.entity_id, fanState, { ...fanState, state: 'off' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Off, expect.anything());
    expect(device.getAttribute(FanControl.Cluster.id, 'fanMode')).toBe(FanControl.FanMode.Off);

    // Simulate a not changed in fan mode and call the event handler
    jest.clearAllMocks();
    await invokeSubscribeHandler(device, FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Medium, FanControl.FanMode.Auto);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`Subscribed attribute ${hk}FanControl${db}:${hk}fanMode${db} ` + `on endpoint ${or}${device.maybeId}${db}:${or}${device.maybeNumber}${db} changed`),
    );

    // Simulate a change in percentCurrent and call the event handler
    jest.clearAllMocks();
    await invokeSubscribeHandler(device, FanControl.Cluster.id, 'percentSetting', 30, 80);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `Subscribed attribute ${hk}FanControl${db}:${hk}percentSetting${db} ` + `on endpoint ${or}${device.maybeId}${db}:${or}${device.maybeNumber}${db} changed`,
      ),
    );

    // setDebug(false);

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and register a Complete Fan device', async () => {
    const fanDevice = {
      area_id: null,
      disabled_by: null,
      entry_type: null,
      id: 'd80898f83188759ed7329e97df00ee7a',
      labels: [],
      name: 'Fan Complete',
      name_by_user: null,
    } as unknown as HassDevice;

    const fanEntity = {
      area_id: null,
      device_id: fanDevice.id,
      entity_category: null,
      entity_id: 'fan.fan_complete',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ab',
      labels: [],
      name: null,
      original_name: 'Fan Complete',
    } as unknown as HassEntity;

    const fanState = {
      entity_id: fanEntity.entity_id,
      state: 'on',
      attributes: {
        preset_mode: 'high',
        preset_modes: ['low', 'medium', 'high', 'auto', 'natural_wind', 'sleep_wind'],
        percentage: 50,
        direction: 'forward',
        oscillating: true,
        friendly_name: 'Fan complete',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(fanDevice.id, fanDevice);
    haPlatform.ha.hassEntities.set(fanEntity.entity_id, fanEntity);
    haPlatform.ha.hassStates.set(fanState.entity_id, fanState);

    // setDebug(true);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(fanDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(fanDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      expect.stringContaining(
        `= fanControl device ${CYAN}${fanEntity.entity_id}${db} preset_modes: ${CYAN}${fanState.attributes['preset_modes']}${db} direction: ${CYAN}${fanState.attributes['direction']}${db} oscillating: ${CYAN}${fanState.attributes['oscillating']}${db}`,
      ),
    );
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(0);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(4);
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'percentSetting', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'airflowDirection', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'rockSetting', expect.anything(), expect.anything());
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}FanControl${db}.${hk}fanMode$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}FanControl${db}.${hk}percentSetting$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}FanControl${db}.${hk}airflowDirection$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}FanControl${db}.${hk}rockSetting$Changed${db}`),
    );

    jest.clearAllMocks();
    console.warn(`Configuring state of entity ${CYAN}${fanEntity.entity_id}${db}...`);
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${fanEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Auto, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'percentCurrent', 50, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'airflowDirection', FanControl.AirflowDirection.Forward, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'rockSetting', { rockLeftRight: false, rockUpDown: false, rockRound: true }, expect.anything());

    jest.clearAllMocks();
    console.warn(`Updating state of entity ${CYAN}${fanEntity.entity_id}${db}...`);
    await haPlatform.updateHandler(fanDevice.id, fanEntity.entity_id, fanState, { ...fanState, state: 'off' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Off, expect.anything());
    expect(device.getAttribute(FanControl.Cluster.id, 'fanMode')).toBe(FanControl.FanMode.Off);

    jest.clearAllMocks();
    console.warn(`Subscribe state of entity ${CYAN}${fanEntity.entity_id}${db}...`);

    // Simulate a not changed in fan mode and call the event handler
    jest.clearAllMocks();
    await invokeSubscribeHandler(device, FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Medium, FanControl.FanMode.Medium);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      `Subscribed attribute ${hk}FanControl${db}:${hk}fanMode${db} ` + `on endpoint ${or}${device.maybeId}${db}:${or}${device.maybeNumber}${db} not changed`,
    );

    // Simulate a change in fan mode and call the event handler
    jest.clearAllMocks();
    await invokeSubscribeHandler(device, FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Medium, FanControl.FanMode.Auto);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`Subscribed attribute ${hk}FanControl${db}:${hk}fanMode${db} ` + `on endpoint ${or}${device.maybeId}${db}:${or}${device.maybeNumber}${db} changed`),
    );

    // Simulate a change in fan mode and call the event handler with wrong parameter
    jest.clearAllMocks();
    await invokeSubscribeHandler(device, FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Smart + 1, FanControl.FanMode.Auto);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`Subscribed attribute ${hk}FanControl${db}:${hk}fanMode${db} ` + `on endpoint ${or}${device.maybeId}${db}:${or}${device.maybeNumber}${db} changed`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, `Converter: 7 => null`);

    // Simulate a change in airflowDirection and call the event handler
    jest.clearAllMocks();
    await invokeSubscribeHandler(device, FanControl.Cluster.id, 'airflowDirection', FanControl.AirflowDirection.Reverse, FanControl.AirflowDirection.Forward);
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `Subscribed attribute ${hk}FanControl${db}:${hk}airflowDirection${db} ` + `on endpoint ${or}${device.maybeId}${db}:${or}${device.maybeNumber}${db} changed`,
      ),
    );

    // Simulate a change in rockSetting and call the event handler
    jest.clearAllMocks();
    await invokeSubscribeHandler(
      device,
      FanControl.Cluster.id,
      'rockSetting',
      { rockLeftRight: false, rockUpDown: false, rockRound: false },
      { rockLeftRight: false, rockUpDown: false, rockRound: true },
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `Subscribed attribute ${hk}FanControl${db}:${hk}rockSetting${db} ` + `on endpoint ${or}${device.maybeId}${db}:${or}${device.maybeNumber}${db} changed`,
      ),
    );

    // setDebug(false);

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(climateDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(climateDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'systemMode', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'occupiedHeatingSetpoint', expect.anything(), expect.anything());
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'occupiedCoolingSetpoint', expect.anything(), expect.anything());
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}Thermostat${db}.${hk}systemMode$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}Thermostat${db}.${hk}occupiedHeatingSetpoint$Changed${db}`,
      ),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(
        `${db}Subscribed endpoint ${or}${device.id}${db}:${or}${device.number}${db} attribute ${hk}Thermostat${db}.${hk}occupiedCoolingSetpoint$Changed${db}`,
      ),
    );

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${climateDeviceEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'systemMode', Thermostat.SystemMode.Auto, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'occupiedHeatingSetpoint', 1000, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(Thermostat.Cluster.id, 'occupiedCoolingSetpoint', 3000, expect.anything());

    // Simulate a not changed in fan mode and call the event handler
    await device.act((agent) =>
      // @ts-expect-error not typed agent
      agent['thermostat'].events['systemMode$Changed'].emit(Thermostat.SystemMode.Auto, Thermostat.SystemMode.Auto, { ...agent.context, offline: false }),
    );
    // Simulate a change in fan mode and call the event handler
    await device.act((agent) =>
      // @ts-expect-error not typed agent
      agent['thermostat'].events['systemMode$Changed'].emit(Thermostat.SystemMode.Cool, Thermostat.SystemMode.Auto, { ...agent.context, offline: false }),
    );
    // Simulate a change in fan mode and call the event handler with wrong parameter
    await device.act((agent) =>
      // @ts-expect-error not typed agent
      agent['thermostat'].events['systemMode$Changed'].emit(Thermostat.SystemMode.Heat + 1, Thermostat.SystemMode.Auto, { ...agent.context, offline: false }),
    );

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(contactDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(contactDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Contact Sensor: true = closed or contact, false = open or no contact
    expect(addClusterServerBooleanStateSpy).toHaveBeenCalledWith(contactDeviceEntity.entity_id, false);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${contactDeviceEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(contactDevice.id, contactDeviceEntityState.entity_id, contactDeviceEntityState, { ...contactDeviceEntityState, state: 'off' }); // 'on' for open, 'off' for closed
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', true, expect.anything()); // Contact Sensor: true = closed or contact, false = open or no contact

    jest.clearAllMocks();
    await haPlatform.updateHandler(contactDevice.id, contactDeviceEntityState.entity_id, contactDeviceEntityState, { ...contactDeviceEntityState, state: 'on' }); // 'on' for open, 'off' for closed
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything()); // Contact Sensor: true = closed or contact, false = open or no contact

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(leakDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(leakDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Water Leak Detector: true = leak, false = no leak
    expect(addClusterServerBooleanStateSpy).toHaveBeenCalledWith(leakDeviceEntity.entity_id, false);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${leakDeviceEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything()); // Water Leak Detector: true = leak, false = no leak

    jest.clearAllMocks();
    await haPlatform.updateHandler(leakDevice.id, leakDeviceEntityState.entity_id, leakDeviceEntityState, { ...leakDeviceEntityState, state: 'on' }); // 'on' for leak, 'off' for no leak
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', true, expect.anything()); // Water Leak Detector: true = leak, false = no leak

    jest.clearAllMocks();
    await haPlatform.updateHandler(leakDevice.id, leakDeviceEntityState.entity_id, leakDeviceEntityState, { ...leakDeviceEntityState, state: 'off' }); // 'on' for leak, 'off' for no leak
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything()); // Water Leak Detector: true = leak, false = no leak

    // Clean the test environment
    await cleanup();
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

    const presenceEntity = {
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

    const presenceState = {
      entity_id: presenceEntity.entity_id,
      state: 'off', // 'on' for detected, 'off' for not detected
      attributes: {
        device_class: 'presence',
        friendly_name: 'Presence Sensor',
      },
    } as unknown as HassState;

    haPlatform.ha.hassDevices.set(presenceDevice.id, presenceDevice);
    haPlatform.ha.hassEntities.set(presenceEntity.entity_id, presenceEntity);
    haPlatform.ha.hassStates.set(presenceState.entity_id, presenceState);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(presenceDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(presenceDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.deviceTypes.has(occupancySensor.code)).toBeTruthy();
    expect(device.getAttribute(OccupancySensing.Cluster.id, 'occupancy')).toEqual({ occupied: false }); // Presence Sensor: true = detected, false = not detected

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${presenceEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OccupancySensing.Cluster.id, 'occupancy', { occupied: false }, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(presenceDevice.id, presenceState.entity_id, presenceState, { ...presenceState, state: 'on' }); // 'on' for detected, 'off' for not detected
    expect(setAttributeSpy).toHaveBeenCalledWith(OccupancySensing.Cluster.id, 'occupancy', { occupied: true }, expect.anything()); // Presence Sensor: { occupied: boolean }

    jest.clearAllMocks();
    await haPlatform.updateHandler(presenceDevice.id, presenceState.entity_id, presenceState, { ...presenceState, state: 'off' }); // 'on' for detected, 'off' for not detected
    expect(setAttributeSpy).toHaveBeenCalledWith(OccupancySensing.Cluster.id, 'occupancy', { occupied: false }, expect.anything()); // Presence Sensor: { occupied: boolean }

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(smokeDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(smokeDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(SmokeCoAlarm.Cluster.id, 'smokeState')).toBe(SmokeCoAlarm.ExpressedState.Normal);
    expect(device.getAttribute(SmokeCoAlarm.Cluster.id, 'coState')).toBe(undefined);
    expect(addClusterServerSmokeAlarmSmokeCoAlarmSpy).toHaveBeenCalledWith(smokeDeviceEntity.entity_id, SmokeCoAlarm.ExpressedState.Normal);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${smokeDeviceEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'smokeState', SmokeCoAlarm.AlarmState.Normal, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(smokeDevice.id, smokeDeviceEntityState.entity_id, smokeDeviceEntityState, { ...smokeDeviceEntityState, state: 'on' }); // 'on' for smoke, 'off' for no smoke
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'smokeState', SmokeCoAlarm.AlarmState.Critical, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(smokeDevice.id, smokeDeviceEntityState.entity_id, smokeDeviceEntityState, { ...smokeDeviceEntityState, state: 'off' }); // 'on' for smoke, 'off' for no smoke
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'smokeState', SmokeCoAlarm.AlarmState.Normal, expect.anything());

    // Clean the test environment
    await cleanup();
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
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(coDevice.id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(coDevice.id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(SmokeCoAlarm.Cluster.id, 'smokeState')).toBe(undefined);
    expect(device.getAttribute(SmokeCoAlarm.Cluster.id, 'coState')).toBe(SmokeCoAlarm.AlarmState.Normal);
    expect(addClusterServerCoAlarmSmokeCoAlarmSpy).toHaveBeenCalledWith(coDeviceEntity.entity_id, SmokeCoAlarm.AlarmState.Normal);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${coDeviceEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'coState', SmokeCoAlarm.AlarmState.Normal, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(coDevice.id, coDeviceEntityState.entity_id, coDeviceEntityState, { ...coDeviceEntityState, state: 'on' }); // 'on' for co, 'off' for no co
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'coState', SmokeCoAlarm.AlarmState.Critical, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(coDevice.id, coDeviceEntityState.entity_id, coDeviceEntityState, { ...coDeviceEntityState, state: 'off' }); // 'on' for co, 'off' for no co
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'coState', SmokeCoAlarm.AlarmState.Normal, expect.anything());

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and register an individual entity binary_sensor Contact device', async () => {
    const contactEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'binary_sensor.door_contact',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Contact Sensor',
    } as unknown as HassEntity;

    const contactState = {
      entity_id: contactEntity.entity_id,
      state: 'on', // 'on' for open, 'off' for closed
      attributes: { device_class: 'door', friendly_name: 'Contact Sensor' },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(contactEntity.entity_id, contactEntity);
    haPlatform.ha.hassStates.set(contactState.entity_id, contactState);

    // setDebug(true);
    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(contactEntity.entity_id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(contactEntity.entity_id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(device.getChildEndpoints()).toHaveLength(0);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Contact Sensor: true = closed or contact, false = open or no contact
    expect(addClusterServerBooleanStateSpy).toHaveBeenCalledWith(contactEntity.entity_id, false);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${contactEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything());

    jest.clearAllMocks();
    await haPlatform.updateHandler(contactEntity.entity_id, contactState.entity_id, contactState, { ...contactState, state: 'off' }); // 'on' for open, 'off' for closed
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', true, expect.anything()); // Contact Sensor: true = closed or contact, false = open or no contact

    jest.clearAllMocks();
    await haPlatform.updateHandler(contactEntity.entity_id, contactState.entity_id, contactState, { ...contactState, state: 'on' }); // 'on' for open, 'off' for closed
    expect(setAttributeSpy).toHaveBeenCalledWith(BooleanState.Cluster.id, 'stateValue', false, expect.anything()); // Contact Sensor: true = closed or contact, false = open or no contact

    // Clean the test environment
    await cleanup();

    // setDebug(false);
  });

  it('should call onStart and register an individual entity sensor Temperature device', async () => {
    const temperatureEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'sensor.temperature',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Temperature Sensor',
    } as unknown as HassEntity;

    const temperatureState = {
      entity_id: temperatureEntity.entity_id,
      state: '22.6',
      attributes: { state_class: 'measurement', device_class: 'temperature', friendly_name: 'Temperature Sensor' },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(temperatureEntity.entity_id, temperatureEntity);
    haPlatform.ha.hassStates.set(temperatureState.entity_id, temperatureState);

    // setDebug(true);
    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(temperatureEntity.entity_id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(temperatureEntity.entity_id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(device.getChildEndpoints()).toHaveLength(0);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue')).toBe(null);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${temperatureEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(TemperatureMeasurement.Cluster.id, 'measuredValue', 2260, expect.anything());
    expect(device.getAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue')).toBe(2260);

    jest.clearAllMocks();
    await haPlatform.updateHandler(temperatureEntity.entity_id, temperatureState.entity_id, temperatureState, { ...temperatureState, state: '21.2' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(TemperatureMeasurement.Cluster.id, 'measuredValue', 2120, expect.anything());
    expect(device.getAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue')).toBe(2120);

    // Clean the test environment
    await cleanup();

    // setDebug(false);
  });

  it('should call onStart and register an individual entity Aqi device', async () => {
    const aqiEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'sensor.air_quality',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Air Quality Sensor',
    } as unknown as HassEntity;

    const aqiState = {
      entity_id: aqiEntity.entity_id,
      state: 'fair',
      attributes: { state_class: 'measurement', device_class: 'aqi', friendly_name: 'Air Quality Sensor' },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(aqiEntity.entity_id, aqiEntity);
    haPlatform.ha.hassStates.set(aqiState.entity_id, aqiState);

    // setDebug(true);
    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(aqiEntity.entity_id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(aqiEntity.entity_id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(device.getChildEndpoints()).toHaveLength(0);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);
    expect(device.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Unknown);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${aqiEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.Fair, expect.anything());
    expect(device.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Fair);

    jest.clearAllMocks();
    await haPlatform.updateHandler(aqiEntity.entity_id, aqiEntity.entity_id, aqiState, { ...aqiState, state: 'poor' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(AirQuality.Cluster.id, 'airQuality', AirQuality.AirQualityEnum.Poor, expect.anything());
    expect(device.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Poor);

    // Clean the test environment
    await cleanup();

    // setDebug(false);
  });

  it('should call onStart and register an individual entity switch Switch template device', async () => {
    const switchEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'switch.template_switch',
      platform: 'template',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Switch Template',
    } as unknown as HassEntity;

    const switchState = {
      entity_id: switchEntity.entity_id,
      state: 'on',
      attributes: { friendly_name: 'Switch Template' },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(switchEntity.entity_id, switchEntity);
    haPlatform.ha.hassStates.set(switchState.entity_id, switchState);

    // setDebug(true);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(switchEntity.entity_id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(switchEntity.entity_id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(device.getChildEndpoints()).toHaveLength(0);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    expect(mockLog.debug).toHaveBeenCalledWith(`+ switch device ${CYAN}MA-onoffpluginunit${db} cluster ${CYAN}OnOff${db}`);
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(3);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${switchEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);

    jest.clearAllMocks();
    await haPlatform.updateHandler(switchEntity.entity_id, switchState.entity_id, switchState, { ...switchState, state: 'off' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', false, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    await invokeBehaviorCommand(device, 'onOff', 'on');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(switchEntity.entity_id.split('.')[0], 'turn_on', switchEntity.entity_id, undefined);

    await invokeBehaviorCommand(device, 'onOff', 'off');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(switchEntity.entity_id.split('.')[0], 'turn_off', switchEntity.entity_id, undefined);

    await invokeBehaviorCommand(device, 'onOff', 'toggle');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(switchEntity.entity_id.split('.')[0], 'toggle', switchEntity.entity_id, undefined);

    // setDebug(false);

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and register an individual entity light Light template device', async () => {
    const lightEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'light.template_light',
      platform: 'template',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Light Template',
    } as unknown as HassEntity;

    const lightState = {
      entity_id: lightEntity.entity_id,
      state: 'on',
      attributes: { supported_color_modes: ['onoff'], friendly_name: 'Light Template' },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(lightEntity.entity_id, lightEntity);
    haPlatform.ha.hassStates.set(lightState.entity_id, lightState);

    // setDebug(true);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(lightEntity.entity_id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(lightEntity.entity_id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(device.getChildEndpoints()).toHaveLength(0);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    expect(mockLog.debug).toHaveBeenCalledWith(`+ light device ${CYAN}MA-onofflight${db} cluster ${CYAN}OnOff${db}`);
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(10);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${lightEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);

    jest.clearAllMocks();
    await haPlatform.updateHandler(lightEntity.entity_id, lightState.entity_id, lightState, { ...lightState, state: 'off' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', false, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'on');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, {});

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'off');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_off', lightEntity.entity_id, undefined);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'toggle');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, {});

    // setDebug(false);

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and register an individual entity light Dimmer template device', async () => {
    const lightEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'light.template_dimmer',
      platform: 'template',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Dimmer Template',
    } as unknown as HassEntity;

    const lightState = {
      entity_id: lightEntity.entity_id,
      state: 'on',
      attributes: { supported_color_modes: ['brightness'], brightness: 255, friendly_name: 'Dimmer Template' },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(lightEntity.entity_id, lightEntity);
    haPlatform.ha.hassStates.set(lightState.entity_id, lightState);

    // setDebug(true);
    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(lightEntity.entity_id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(lightEntity.entity_id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(device.getChildEndpoints()).toHaveLength(0);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    expect(mockLog.debug).toHaveBeenCalledWith(`+ light device ${CYAN}MA-onofflight${db} cluster ${CYAN}OnOff${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`+ attribute device ${CYAN}MA-dimmablelight${db} cluster ${CYAN}LevelControl${db}`);
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(10);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${lightEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);

    jest.clearAllMocks();
    await haPlatform.updateHandler(lightEntity.entity_id, lightState.entity_id, lightState, { ...lightState, state: 'off' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', false, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'on');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 255 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'off');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_off', lightEntity.entity_id, undefined);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'toggle');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 255 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevel', {
      level: 100,
      transitionTime: 0,
      optionsMask: { executeIfOff: false, coupleColorTempToLevel: false },
      optionsOverride: { executeIfOff: false, coupleColorTempToLevel: false },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(100);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 100 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevelWithOnOff', {
      level: 50,
      transitionTime: 100,
      optionsMask: { executeIfOff: false, coupleColorTempToLevel: false },
      optionsOverride: { executeIfOff: false, coupleColorTempToLevel: false },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(50);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 50, transition: 10 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'off');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_off', lightEntity.entity_id, undefined);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevel', {
      level: 100,
      transitionTime: 100,
      optionsMask: { executeIfOff: true, coupleColorTempToLevel: true },
      optionsOverride: { executeIfOff: true, coupleColorTempToLevel: true },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining('received while the light is off => skipping it'));
    expect(callServiceSpy).not.toHaveBeenCalled();

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevelWithOnOff', {
      level: 1,
      transitionTime: 100,
      optionsMask: { executeIfOff: true, coupleColorTempToLevel: true },
      optionsOverride: { executeIfOff: true, coupleColorTempToLevel: true },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(1);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining('received with level = minLevel => turn off the light'));
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_off', lightEntity.entity_id);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevel', {
      level: 100,
      transitionTime: 100,
      optionsMask: { executeIfOff: true, coupleColorTempToLevel: true },
      optionsOverride: { executeIfOff: true, coupleColorTempToLevel: true },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(100);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining('received while the light is off => skipping it'));
    expect(callServiceSpy).not.toHaveBeenCalled();

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'on');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.DEBUG, expect.stringContaining('received while the light is off => turn on the light with attributes'));
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 100 });

    // setDebug(false);

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and register an individual entity light Color Temperature template device', async () => {
    const lightEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'light.template_ct',
      platform: 'template',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Color Temperature Template',
    } as unknown as HassEntity;

    const lightState = {
      entity_id: lightEntity.entity_id,
      state: 'on',
      attributes: {
        supported_color_modes: ['color_temp'],
        brightness: 255,
        color_temp_kelvin: 5000, // Mireds 200
        min_color_temp_kelvin: 2500, // Mireds 400
        max_color_temp_kelvin: 6500, // Mireds 153
        friendly_name: 'Color Temperature Template',
      },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(lightEntity.entity_id, lightEntity);
    haPlatform.ha.hassStates.set(lightState.entity_id, lightState);

    // setDebug(true);
    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(lightEntity.entity_id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(lightEntity.entity_id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(device.getChildEndpoints()).toHaveLength(0);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    expect(mockLog.debug).toHaveBeenCalledWith(`+ light device ${CYAN}MA-onofflight${db} cluster ${CYAN}OnOff${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`+ attribute device ${CYAN}MA-dimmablelight${db} cluster ${CYAN}LevelControl${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`+ attribute device ${CYAN}MA-colortemperaturelight${db} cluster ${CYAN}ColorControl${db}`);
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(10);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${lightEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);

    jest.clearAllMocks();
    await haPlatform.updateHandler(lightEntity.entity_id, lightState.entity_id, lightState, { ...lightState, state: 'off' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', false, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'on');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 255, color_temp: 250 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'off');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_off', lightEntity.entity_id, undefined);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'toggle');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 255, color_temp: 250 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevel', {
      level: 100,
      transitionTime: 0,
      optionsMask: { executeIfOff: false, coupleColorTempToLevel: false },
      optionsOverride: { executeIfOff: false, coupleColorTempToLevel: false },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(100);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 100 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevelWithOnOff', {
      level: 50,
      transitionTime: 0,
      optionsMask: { executeIfOff: false, coupleColorTempToLevel: false },
      optionsOverride: { executeIfOff: false, coupleColorTempToLevel: false },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(50);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 50 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'colorControl', 'moveToColorTemperature', {
      colorTemperatureMireds: 200,
      transitionTime: 0,
      optionsMask: { executeIfOff: true },
      optionsOverride: { executeIfOff: true },
    });
    expect(device.getAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds')).toBe(200);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { color_temp_kelvin: 5000 });

    // setDebug(false);

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and register an individual entity light Rgb template device', async () => {
    const lightEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'light.template_rgb',
      platform: 'template',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Rgb Template',
    } as unknown as HassEntity;

    const lightState = {
      entity_id: lightEntity.entity_id,
      state: 'on',
      attributes: {
        supported_color_modes: ['color_temp', 'xy', 'hs'],
        brightness: 255,
        color_temp_kelvin: 5000, // Mireds 200
        min_color_temp_kelvin: 2500, // Mireds 400
        max_color_temp_kelvin: 6500, // Mireds 153
        hs_color: [180, 50],
        friendly_name: 'Rgb Template',
      },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(lightEntity.entity_id, lightEntity);
    haPlatform.ha.hassStates.set(lightState.entity_id, lightState);

    // setDebug(true);

    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.get(lightEntity.entity_id)).toBeDefined();
    device = haPlatform.matterbridgeDevices.get(lightEntity.entity_id) as MatterbridgeEndpoint;
    expect(device.construction.status).toBe(Lifecycle.Status.Active);
    expect(device.getChildEndpoints()).toHaveLength(0);
    expect(aggregator.parts.has(device)).toBeTruthy();
    expect(aggregator.parts.has(device.id)).toBeTruthy();
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    expect(mockLog.debug).toHaveBeenCalledWith(`+ light device ${CYAN}MA-onofflight${db} cluster ${CYAN}OnOff${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`+ attribute device ${CYAN}MA-dimmablelight${db} cluster ${CYAN}LevelControl${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`+ attribute device ${CYAN}MA-colortemperaturelight${db} cluster ${CYAN}ColorControl${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`+ attribute device ${CYAN}MA-extendedcolorlight${db} cluster ${CYAN}ColorControl${db}`);
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(10);
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(0);

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(`Configuring state of entity ${CYAN}${lightEntity.entity_id}${db}...`);
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', true, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);

    jest.clearAllMocks();
    await haPlatform.updateHandler(lightEntity.entity_id, lightState.entity_id, lightState, { ...lightState, state: 'off' });
    // await new Promise((resolve) => setTimeout(resolve, 50)); // Wait for async updateHandler operations to complete
    expect(setAttributeSpy).toHaveBeenCalledWith(OnOff.Cluster.id, 'onOff', false, expect.anything());
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'on');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 255, hs_color: [0, 0] });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'off');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(false);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_off', lightEntity.entity_id, undefined);

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'onOff', 'toggle');
    expect(device.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 255, hs_color: [0, 0] });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevel', {
      level: 100,
      transitionTime: 0,
      optionsMask: { executeIfOff: false, coupleColorTempToLevel: false },
      optionsOverride: { executeIfOff: false, coupleColorTempToLevel: false },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(100);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 100 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'levelControl', 'moveToLevelWithOnOff', {
      level: 50,
      transitionTime: 0,
      optionsMask: { executeIfOff: false, coupleColorTempToLevel: false },
      optionsOverride: { executeIfOff: false, coupleColorTempToLevel: false },
    });
    expect(device.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(50);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { brightness: 50 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'colorControl', 'moveToColorTemperature', {
      colorTemperatureMireds: 200,
      transitionTime: 0,
      optionsMask: { executeIfOff: true },
      optionsOverride: { executeIfOff: true },
    });
    expect(device.getAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds')).toBe(200);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { color_temp_kelvin: 5000 });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'colorControl', 'moveToHueAndSaturation', {
      hue: 120,
      saturation: 100,
      transitionTime: 0,
      optionsMask: { executeIfOff: true },
      optionsOverride: { executeIfOff: true },
    });
    expect(device.getAttribute(ColorControl.Cluster.id, 'currentHue')).toBe(120);
    expect(device.getAttribute(ColorControl.Cluster.id, 'currentSaturation')).toBe(100);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { hs_color: [170, 39] });

    jest.clearAllMocks();
    await invokeBehaviorCommand(device, 'colorControl', 'moveToColor', {
      colorX: 13697,
      colorY: 41877,
      transitionTime: 0,
      optionsMask: { executeIfOff: true },
      optionsOverride: { executeIfOff: true },
    });
    expect(device.getAttribute(ColorControl.Cluster.id, 'currentX')).toBe(13697);
    expect(device.getAttribute(ColorControl.Cluster.id, 'currentY')).toBe(41877);
    expect(callServiceSpy).toHaveBeenCalledWith(lightEntity.entity_id.split('.')[0], 'turn_on', lightEntity.entity_id, { xy_color: [0.209, 0.639] });

    // setDebug(false);

    // Clean the test environment
    await cleanup();
  });

  it('should call onStart and not register an unknown individual entity', async () => {
    const sensorUnknownEntity = {
      area_id: null,
      device_id: null,
      entity_category: null,
      entity_id: 'sensor.unknown',
      has_entity_name: true,
      id: '0b25a337cb83edefb1d310450ad2b0ac',
      labels: [],
      name: null,
      original_name: 'Single Entity Unknown',
    } as unknown as HassEntity;

    const sensorUnknownState = {
      entity_id: sensorUnknownEntity.entity_id,
      state: 'unknown',
      attributes: { state_class: 'unknown', device_class: 'unknown', friendly_name: 'Unknown Sensor' },
    } as unknown as HassState;

    haPlatform.ha.hassEntities.set(sensorUnknownEntity.entity_id, sensorUnknownEntity);
    haPlatform.ha.hassStates.set(sensorUnknownState.entity_id, sensorUnknownState);

    // setDebug(true);
    await haPlatform.onStart('Test reason');
    // await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async operations to complete
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);

    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Removing device ${dn}${sensorUnknownEntity.original_name}${db}...`));

    // Clean the test environment
    await cleanup();

    // setDebug(false);
  });

  it('should call onStart and register all split entities', async () => {
    const hassDevice = {
      id: '560898f83188759ed7329e97df00ee7c',
      name: 'All Domain Device',
    } as unknown as HassDevice;
    haPlatform.ha.hassDevices.set(hassDevice.id, hassDevice);

    const entities: [HassEntity, HassState][] = [
      // controls
      [switchEntity, switchState],
      [lightOnOffEntity, lightOnOffState],
      [lightDimmerEntity, lightDimmerState],
      [lightCtEntity, lightCtState],
      [lockEntity, lockState],
      [valveEntity, valveState],
      [vacuumEntity, vacuumState],
      [fanEntity, fanState],
      [fanCompleteEntity, fanCompleteState],
      [climateEntity, climateState],
      [climateHeatEntity, climateHeatState],
      [climateCoolEntity, climateCoolState],
      // sensor
      [batteryLevelEntity, batteryLevelState],
      [batteryVoltageEntity, batteryVoltageState],
      [temperatureEntity, temperatureState],
      [humidityEntity, humidityState],
      [pressureEntity, pressureState],
      [atmosphericPressureEntity, atmosphericPressureState],
      [illuminanceEntity, illuminanceState],
      [energyEntity, energyState],
      [powerEntity, powerState],
      [currentEntity, currentState],
      [voltageEntity, voltageState],
      [aqiEntity, aqiState],
      [vocEntity, vocState],
      [vocPartsEntity, vocPartsState],
      [co2Entity, co2State],
      [coSensorEntity, coSensorState],
      [no2Entity, no2State],
      [ozoneEntity, ozoneState],
      [formaldehydeEntity, formaldehydeState],
      [radonEntity, radonState],
      [pm1Entity, pm1State],
      [pm25Entity, pm25State],
      [pm10Entity, pm10State],
      // binary_sensor
      [batteryLowEntity, batteryLowState],
      [contactEntity, contactState],
      [windowEntity, windowState],
      [garageDoorEntity, garageDoorState],
      [vibrationEntity, vibrationState],
      [coldEntity, coldState],
      [moistureEntity, moistureState],
      [occupancyEntity, occupancyState],
      [motionEntity, motionState],
      [presenceEntity, presenceStateMulti],
      [smokeEntity, smokeStateMulti],
      [coEntity, coStateMulti],
      // event
      [buttonEntity, buttonState],
    ];
    for (const [e, s] of entities) {
      haPlatform.ha.hassEntities.set(e.entity_id, { ...e, device_id: hassDevice.id });
      haPlatform.ha.hassStates.set(s.entity_id, s);
    }
    haPlatform.config.splitEntities = [...entities.map(([e]) => e.entity_id)];

    // setDebug(true);

    // @ts-expect-error accessing private member for testing
    await haPlatform.checkEndpointNumbers();
    jest.clearAllMocks();

    await haPlatform.onStart('Test reason');
    await flushAsync(undefined, undefined, 100); // ensure all split entity devices created
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes((haPlatform.config.splitEntities as string[]).length);
    expect(haPlatform.matterbridgeDevices.size).toBe((haPlatform.config.splitEntities as string[]).length);
    expect(aggregator.parts.size).toBe((haPlatform.config.splitEntities as string[]).length);
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(41); // switch(3) + lightOnOff(10) + lightDimmer(10) + lightCt(10) + lock(2) + valve(2) + vacuum(4) + fan(0) + climate(0)
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(13); // fan(2) + fanComplete(4) + climateHeatCool(3) + climateHeat(2) + climateCool(2)

    for (const device of haPlatform.matterbridgeDevices.values()) {
      expect(device.getChildEndpoints().length).toBe(0); // No child endpoints for individual entities. All remapped to main.
    }
    expect(haPlatform.matterbridgeDevices.get(contactEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Contact Sensor: true = closed or contact, false = open or no contact
    expect(addClusterServerBooleanStateSpy).toHaveBeenCalledWith(contactEntity.entity_id, false);

    // No warnings or errors
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockLog.fatal).not.toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.WARN, expect.anything());
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.FATAL, expect.anything());

    // @ts-expect-error accessing private member for testing
    await haPlatform.checkEndpointNumbers();
    jest.clearAllMocks();

    haPlatform.batteryVoltageEntities.clear();
    haPlatform.batteryVoltageEntities.add(batteryVoltageEntity.entity_id); // Is mixed here so we set manually
    await haPlatform.onConfigure();
    expect(setAttributeSpy.mock.calls.length).toBeGreaterThanOrEqual((haPlatform.config.splitEntities as string[]).length);

    // No warnings or errors
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockLog.fatal).not.toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.WARN, expect.anything());
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.FATAL, expect.anything());

    // binary_sensor entities
    expect(haPlatform.matterbridgeDevices.get(batteryLowEntity.entity_id)?.getAttribute(PowerSource.Cluster.id, 'batChargeLevel')).toBe(PowerSource.BatChargeLevel.Critical); // Battery Low: true = low, false = normal
    expect(haPlatform.matterbridgeDevices.get(contactEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Contact Sensor: true = closed or contact, false = open or no contact
    expect(haPlatform.matterbridgeDevices.get(windowEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // window open -> false
    expect(haPlatform.matterbridgeDevices.get(garageDoorEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(true); // garage door closed -> true
    expect(haPlatform.matterbridgeDevices.get(vibrationEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(true); // vibration off -> true (no vibration)
    expect(haPlatform.matterbridgeDevices.get(coldEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // cold off -> false
    expect(haPlatform.matterbridgeDevices.get(moistureEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // moisture off -> false
    expect(haPlatform.matterbridgeDevices.get(occupancyEntity.entity_id)?.getAttribute(OccupancySensing.Cluster.id, 'occupancy')).toEqual({ occupied: false });
    expect(haPlatform.matterbridgeDevices.get(motionEntity.entity_id)?.getAttribute(OccupancySensing.Cluster.id, 'occupancy')).toEqual({ occupied: false });
    expect(haPlatform.matterbridgeDevices.get(presenceEntity.entity_id)?.getAttribute(OccupancySensing.Cluster.id, 'occupancy')).toEqual({ occupied: false });
    expect(haPlatform.matterbridgeDevices.get(smokeEntity.entity_id)?.getAttribute(SmokeCoAlarm.Cluster.id, 'smokeState')).toBe(SmokeCoAlarm.AlarmState.Normal);
    expect(haPlatform.matterbridgeDevices.get(coEntity.entity_id)?.getAttribute(SmokeCoAlarm.Cluster.id, 'coState')).toBe(SmokeCoAlarm.AlarmState.Normal);

    // sensor entities
    expect(haPlatform.matterbridgeDevices.get(batteryLevelEntity.entity_id)?.getAttribute(PowerSource.Cluster.id, 'batPercentRemaining')).toBe(170); // 85% *2
    expect(haPlatform.matterbridgeDevices.get(batteryVoltageEntity.entity_id)?.getAttribute(PowerSource.Cluster.id, 'batVoltage')).toBe(3700); // 3.7V -> 3700mV
    expect(haPlatform.matterbridgeDevices.get(temperatureEntity.entity_id)?.getAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue')).toBe(2260); // 22.6C *100
    expect(haPlatform.matterbridgeDevices.get(humidityEntity.entity_id)?.getAttribute(RelativeHumidityMeasurement.Cluster.id, 'measuredValue')).toBe(5630); // 56.3% *100
    expect(haPlatform.matterbridgeDevices.get(pressureEntity.entity_id)?.getAttribute(PressureMeasurement.Cluster.id, 'measuredValue')).toBe(1013);
    expect(haPlatform.matterbridgeDevices.get(atmosphericPressureEntity.entity_id)?.getAttribute(PressureMeasurement.Cluster.id, 'measuredValue')).toBe(1013);
    expect(haPlatform.matterbridgeDevices.get(illuminanceEntity.entity_id)?.getAttribute(IlluminanceMeasurement.Cluster.id, 'measuredValue')).toBe(26990);
    // PowerEnergy block
    expect(haPlatform.matterbridgeDevices.get(energyEntity.entity_id)?.getAttribute(ElectricalEnergyMeasurement.Cluster.id, 'cumulativeEnergyImported')).toEqual({
      energy: 12340000,
    });
    expect(haPlatform.matterbridgeDevices.get(powerEntity.entity_id)?.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'activePower')).toBe(100000);
    expect(haPlatform.matterbridgeDevices.get(currentEntity.entity_id)?.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'activeCurrent')).toBe(500);
    expect(haPlatform.matterbridgeDevices.get(voltageEntity.entity_id)?.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'voltage')).toBe(230000);
    // Air quality block
    expect(haPlatform.matterbridgeDevices.get(aqiEntity.entity_id)?.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Fair);
    expect(haPlatform.matterbridgeDevices.get(vocEntity.entity_id)?.getAttribute(TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(100);
    expect(haPlatform.matterbridgeDevices.get(vocPartsEntity.entity_id)?.getAttribute(TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(150);
    expect(haPlatform.matterbridgeDevices.get(co2Entity.entity_id)?.getAttribute(CarbonDioxideConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(600);
    expect(haPlatform.matterbridgeDevices.get(coSensorEntity.entity_id)?.getAttribute(CarbonMonoxideConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(30);
    expect(haPlatform.matterbridgeDevices.get(no2Entity.entity_id)?.getAttribute(NitrogenDioxideConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(15);
    expect(haPlatform.matterbridgeDevices.get(ozoneEntity.entity_id)?.getAttribute(OzoneConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(5);
    expect(haPlatform.matterbridgeDevices.get(formaldehydeEntity.entity_id)?.getAttribute(FormaldehydeConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(2);
    expect(haPlatform.matterbridgeDevices.get(radonEntity.entity_id)?.getAttribute(RadonConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(50);
    expect(haPlatform.matterbridgeDevices.get(pm1Entity.entity_id)?.getAttribute(Pm1ConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(5);
    expect(haPlatform.matterbridgeDevices.get(pm25Entity.entity_id)?.getAttribute(Pm25ConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(12);
    expect(haPlatform.matterbridgeDevices.get(pm10Entity.entity_id)?.getAttribute(Pm10ConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(20);

    // control entities
    expect(haPlatform.matterbridgeDevices.get(switchEntity.entity_id)?.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(haPlatform.matterbridgeDevices.get(lightOnOffEntity.entity_id)?.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(haPlatform.matterbridgeDevices.get(lightDimmerEntity.entity_id)?.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(haPlatform.matterbridgeDevices.get(lightDimmerEntity.entity_id)?.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(149); // brightness 150 -> ~149
    expect(haPlatform.matterbridgeDevices.get(lightCtEntity.entity_id)?.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(haPlatform.matterbridgeDevices.get(lightCtEntity.entity_id)?.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(100); // brightness 150 -> ~149
    expect(haPlatform.matterbridgeDevices.get(lightCtEntity.entity_id)?.getAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds')).toBe(500);
    expect(haPlatform.matterbridgeDevices.get(lockEntity.entity_id)?.getAttribute(DoorLock.Cluster.id, 'lockState')).toBe(DoorLock.LockState.Locked);
    expect(haPlatform.matterbridgeDevices.get(valveEntity.entity_id)?.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentState')).toBe(
      ValveConfigurationAndControl.ValveState.Open,
    );
    expect(haPlatform.matterbridgeDevices.get(valveEntity.entity_id)?.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentLevel')).toBe(50);
    expect(haPlatform.matterbridgeDevices.get(vacuumEntity.entity_id)?.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(1); // idle/docked
    expect(haPlatform.matterbridgeDevices.get(vacuumEntity.entity_id)?.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(
      RvcOperationalState.OperationalState.Docked,
    );
    expect(haPlatform.matterbridgeDevices.get(fanEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'fanMode')).toBe(FanControl.FanMode.Auto);
    expect(haPlatform.matterbridgeDevices.get(fanEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'percentCurrent')).toBe(50);
    expect(haPlatform.matterbridgeDevices.get(fanCompleteEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'fanMode')).toBe(FanControl.FanMode.Auto);
    expect(haPlatform.matterbridgeDevices.get(fanCompleteEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'percentCurrent')).toBe(50);
    expect(haPlatform.matterbridgeDevices.get(fanCompleteEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'airflowDirection')).toBe(FanControl.AirflowDirection.Forward);
    expect(haPlatform.matterbridgeDevices.get(fanCompleteEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'rockSetting')).toEqual({
      rockLeftRight: false,
      rockRound: true,
      rockUpDown: false,
    });
    expect(haPlatform.matterbridgeDevices.get(climateEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'systemMode')).toBe(Thermostat.SystemMode.Auto);
    expect(haPlatform.matterbridgeDevices.get(climateEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'occupiedHeatingSetpoint')).toBe(2000);
    expect(haPlatform.matterbridgeDevices.get(climateEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'occupiedCoolingSetpoint')).toBe(2400);
    expect(haPlatform.matterbridgeDevices.get(climateEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'localTemperature')).toBe(2200);
    expect(haPlatform.matterbridgeDevices.get(climateHeatEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'systemMode')).toBe(Thermostat.SystemMode.Heat);
    expect(haPlatform.matterbridgeDevices.get(climateHeatEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'occupiedHeatingSetpoint')).toBe(2000);
    expect(haPlatform.matterbridgeDevices.get(climateHeatEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'localTemperature')).toBe(2200);
    expect(haPlatform.matterbridgeDevices.get(climateCoolEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'systemMode')).toBe(Thermostat.SystemMode.Cool);
    expect(haPlatform.matterbridgeDevices.get(climateCoolEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'occupiedCoolingSetpoint')).toBe(2000);
    expect(haPlatform.matterbridgeDevices.get(climateCoolEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'localTemperature')).toBe(1800);

    // Clean the test environment
    await cleanup();

    // setDebug(false);
  }, 30000);

  it('should call onStart and register all individual entities', async () => {
    const entities: [HassEntity, HassState][] = [
      // controls
      [switchEntity, switchState],
      [lightOnOffEntity, lightOnOffState],
      [lightDimmerEntity, lightDimmerState],
      [lightCtEntity, lightCtState],
      [lockEntity, lockState],
      [valveEntity, valveState],
      [vacuumEntity, vacuumState],
      [fanEntity, fanState],
      [fanCompleteEntity, fanCompleteState],
      [climateEntity, climateState],
      [climateHeatEntity, climateHeatState],
      [climateCoolEntity, climateCoolState],
      // sensor
      [batteryLevelEntity, batteryLevelState],
      [batteryVoltageEntity, batteryVoltageState],
      [temperatureEntity, temperatureState],
      [humidityEntity, humidityState],
      [pressureEntity, pressureState],
      [atmosphericPressureEntity, atmosphericPressureState],
      [illuminanceEntity, illuminanceState],
      [energyEntity, energyState],
      [powerEntity, powerState],
      [currentEntity, currentState],
      [voltageEntity, voltageState],
      [aqiEntity, aqiState],
      [vocEntity, vocState],
      [vocPartsEntity, vocPartsState],
      [co2Entity, co2State],
      [coSensorEntity, coSensorState],
      [no2Entity, no2State],
      [ozoneEntity, ozoneState],
      [formaldehydeEntity, formaldehydeState],
      [radonEntity, radonState],
      [pm1Entity, pm1State],
      [pm25Entity, pm25State],
      [pm10Entity, pm10State],
      // binary_sensor
      [batteryLowEntity, batteryLowState],
      [contactEntity, contactState],
      [windowEntity, windowState],
      [garageDoorEntity, garageDoorState],
      [vibrationEntity, vibrationState],
      [coldEntity, coldState],
      [moistureEntity, moistureState],
      [occupancyEntity, occupancyState],
      [motionEntity, motionState],
      [presenceEntity, presenceStateMulti],
      [smokeEntity, smokeStateMulti],
      [coEntity, coStateMulti],
      // event
      [buttonEntity, buttonState],
    ];
    for (const [e, s] of entities) {
      haPlatform.ha.hassEntities.set(e.entity_id, { ...e });
      haPlatform.ha.hassStates.set(s.entity_id, s);
    }
    haPlatform.config.splitEntities = [...entities.map(([e]) => e.entity_id)];

    // setDebug(true);
    // @ts-expect-error accessing private member for testing
    await haPlatform.checkEndpointNumbers();
    jest.clearAllMocks();

    await haPlatform.onStart('Test reason');
    await flushAsync(undefined, undefined, 100); // ensure all split entity devices created
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes((haPlatform.config.splitEntities as string[]).length);
    expect(haPlatform.matterbridgeDevices.size).toBe((haPlatform.config.splitEntities as string[]).length);
    expect(aggregator.parts.size).toBe((haPlatform.config.splitEntities as string[]).length);
    expect(addCommandHandlerSpy).toHaveBeenCalledTimes(41); // switch(3) + lightOnOff(10) + lightDimmer(10) + lightCt(10) + lock(2) + valve(2) + vacuum(4) + fan(0) + climate(0)
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(13); // fan(2) + fanComplete(4) + climateHeatCool(3) + climateHeat(2) + climateCool(2)

    for (const device of haPlatform.matterbridgeDevices.values()) {
      expect(device.getChildEndpoints().length).toBe(0); // No child endpoints for individual entities. All remapped to main.
    }
    expect(haPlatform.matterbridgeDevices.get(contactEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Contact Sensor: true = closed or contact, false = open or no contact
    expect(addClusterServerBooleanStateSpy).toHaveBeenCalledWith(contactEntity.entity_id, false);

    // No warnings or errors
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockLog.fatal).not.toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.WARN, expect.anything());
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.FATAL, expect.anything());

    // @ts-expect-error accessing private member for testing
    await haPlatform.checkEndpointNumbers();
    jest.clearAllMocks();
    haPlatform.batteryVoltageEntities.clear();
    haPlatform.batteryVoltageEntities.add(batteryVoltageEntity.entity_id); // Is mixed here so we set manually
    await haPlatform.onConfigure();
    expect(setAttributeSpy.mock.calls.length).toBeGreaterThanOrEqual((haPlatform.config.splitEntities as string[]).length);

    // No warnings or errors
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockLog.fatal).not.toHaveBeenCalled();
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.WARN, expect.anything());
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.ERROR, expect.anything());
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.FATAL, expect.anything());

    // binary_sensor entities
    expect(haPlatform.matterbridgeDevices.get(batteryLowEntity.entity_id)?.getAttribute(PowerSource.Cluster.id, 'batChargeLevel')).toBe(PowerSource.BatChargeLevel.Critical); // Battery Low: true = low, false = normal
    expect(haPlatform.matterbridgeDevices.get(contactEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // Contact Sensor: true = closed or contact, false = open or no contact
    expect(haPlatform.matterbridgeDevices.get(windowEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // window open -> false
    expect(haPlatform.matterbridgeDevices.get(garageDoorEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(true); // garage door closed -> true
    expect(haPlatform.matterbridgeDevices.get(vibrationEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(true); // vibration off -> true (no vibration)
    expect(haPlatform.matterbridgeDevices.get(coldEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // cold off -> false
    expect(haPlatform.matterbridgeDevices.get(moistureEntity.entity_id)?.getAttribute(BooleanState.Cluster.id, 'stateValue')).toBe(false); // moisture off -> false
    expect(haPlatform.matterbridgeDevices.get(occupancyEntity.entity_id)?.getAttribute(OccupancySensing.Cluster.id, 'occupancy')).toEqual({ occupied: false });
    expect(haPlatform.matterbridgeDevices.get(motionEntity.entity_id)?.getAttribute(OccupancySensing.Cluster.id, 'occupancy')).toEqual({ occupied: false });
    expect(haPlatform.matterbridgeDevices.get(presenceEntity.entity_id)?.getAttribute(OccupancySensing.Cluster.id, 'occupancy')).toEqual({ occupied: false });
    expect(haPlatform.matterbridgeDevices.get(smokeEntity.entity_id)?.getAttribute(SmokeCoAlarm.Cluster.id, 'smokeState')).toBe(SmokeCoAlarm.AlarmState.Normal);
    expect(haPlatform.matterbridgeDevices.get(coEntity.entity_id)?.getAttribute(SmokeCoAlarm.Cluster.id, 'coState')).toBe(SmokeCoAlarm.AlarmState.Normal);

    // sensor entities
    expect(haPlatform.matterbridgeDevices.get(batteryLevelEntity.entity_id)?.getAttribute(PowerSource.Cluster.id, 'batPercentRemaining')).toBe(170); // 85% *2
    expect(haPlatform.matterbridgeDevices.get(batteryVoltageEntity.entity_id)?.getAttribute(PowerSource.Cluster.id, 'batVoltage')).toBe(3700); // 3.7V -> 3700mV
    expect(haPlatform.matterbridgeDevices.get(temperatureEntity.entity_id)?.getAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue')).toBe(2260); // 22.6C *100
    expect(haPlatform.matterbridgeDevices.get(humidityEntity.entity_id)?.getAttribute(RelativeHumidityMeasurement.Cluster.id, 'measuredValue')).toBe(5630); // 56.3% *100
    expect(haPlatform.matterbridgeDevices.get(pressureEntity.entity_id)?.getAttribute(PressureMeasurement.Cluster.id, 'measuredValue')).toBe(1013);
    expect(haPlatform.matterbridgeDevices.get(atmosphericPressureEntity.entity_id)?.getAttribute(PressureMeasurement.Cluster.id, 'measuredValue')).toBe(1013);
    expect(haPlatform.matterbridgeDevices.get(illuminanceEntity.entity_id)?.getAttribute(IlluminanceMeasurement.Cluster.id, 'measuredValue')).toBe(26990);
    // PowerEnergy block
    expect(haPlatform.matterbridgeDevices.get(energyEntity.entity_id)?.getAttribute(ElectricalEnergyMeasurement.Cluster.id, 'cumulativeEnergyImported')).toEqual({
      energy: 12340000,
    });
    expect(haPlatform.matterbridgeDevices.get(powerEntity.entity_id)?.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'activePower')).toBe(100000);
    expect(haPlatform.matterbridgeDevices.get(currentEntity.entity_id)?.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'activeCurrent')).toBe(500);
    expect(haPlatform.matterbridgeDevices.get(voltageEntity.entity_id)?.getAttribute(ElectricalPowerMeasurement.Cluster.id, 'voltage')).toBe(230000);
    // Air quality block
    expect(haPlatform.matterbridgeDevices.get(aqiEntity.entity_id)?.getAttribute(AirQuality.Cluster.id, 'airQuality')).toBe(AirQuality.AirQualityEnum.Fair);
    expect(haPlatform.matterbridgeDevices.get(vocEntity.entity_id)?.getAttribute(TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(100);
    expect(haPlatform.matterbridgeDevices.get(vocPartsEntity.entity_id)?.getAttribute(TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(150);
    expect(haPlatform.matterbridgeDevices.get(co2Entity.entity_id)?.getAttribute(CarbonDioxideConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(600);
    expect(haPlatform.matterbridgeDevices.get(coSensorEntity.entity_id)?.getAttribute(CarbonMonoxideConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(30);
    expect(haPlatform.matterbridgeDevices.get(no2Entity.entity_id)?.getAttribute(NitrogenDioxideConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(15);
    expect(haPlatform.matterbridgeDevices.get(ozoneEntity.entity_id)?.getAttribute(OzoneConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(5);
    expect(haPlatform.matterbridgeDevices.get(formaldehydeEntity.entity_id)?.getAttribute(FormaldehydeConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(2);
    expect(haPlatform.matterbridgeDevices.get(radonEntity.entity_id)?.getAttribute(RadonConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(50);
    expect(haPlatform.matterbridgeDevices.get(pm1Entity.entity_id)?.getAttribute(Pm1ConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(5);
    expect(haPlatform.matterbridgeDevices.get(pm25Entity.entity_id)?.getAttribute(Pm25ConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(12);
    expect(haPlatform.matterbridgeDevices.get(pm10Entity.entity_id)?.getAttribute(Pm10ConcentrationMeasurement.Cluster.id, 'measuredValue')).toBe(20);

    // control entities
    expect(haPlatform.matterbridgeDevices.get(switchEntity.entity_id)?.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(haPlatform.matterbridgeDevices.get(lightOnOffEntity.entity_id)?.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(haPlatform.matterbridgeDevices.get(lightDimmerEntity.entity_id)?.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(haPlatform.matterbridgeDevices.get(lightDimmerEntity.entity_id)?.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(149); // brightness 150 -> ~149
    expect(haPlatform.matterbridgeDevices.get(lightCtEntity.entity_id)?.getAttribute(OnOff.Cluster.id, 'onOff')).toBe(true);
    expect(haPlatform.matterbridgeDevices.get(lightCtEntity.entity_id)?.getAttribute(LevelControl.Cluster.id, 'currentLevel')).toBe(100); // brightness 150 -> ~149
    expect(haPlatform.matterbridgeDevices.get(lightCtEntity.entity_id)?.getAttribute(ColorControl.Cluster.id, 'colorTemperatureMireds')).toBe(500);
    expect(haPlatform.matterbridgeDevices.get(lockEntity.entity_id)?.getAttribute(DoorLock.Cluster.id, 'lockState')).toBe(DoorLock.LockState.Locked);
    expect(haPlatform.matterbridgeDevices.get(valveEntity.entity_id)?.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentState')).toBe(
      ValveConfigurationAndControl.ValveState.Open,
    );
    expect(haPlatform.matterbridgeDevices.get(valveEntity.entity_id)?.getAttribute(ValveConfigurationAndControl.Cluster.id, 'currentLevel')).toBe(50);
    expect(haPlatform.matterbridgeDevices.get(vacuumEntity.entity_id)?.getAttribute(RvcRunMode.Cluster.id, 'currentMode')).toBe(1); // idle/docked
    expect(haPlatform.matterbridgeDevices.get(vacuumEntity.entity_id)?.getAttribute(RvcOperationalState.Cluster.id, 'operationalState')).toBe(
      RvcOperationalState.OperationalState.Docked,
    );
    expect(haPlatform.matterbridgeDevices.get(fanEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'fanMode')).toBe(FanControl.FanMode.Auto);
    expect(haPlatform.matterbridgeDevices.get(fanEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'percentCurrent')).toBe(50);
    expect(haPlatform.matterbridgeDevices.get(fanCompleteEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'fanMode')).toBe(FanControl.FanMode.Auto);
    expect(haPlatform.matterbridgeDevices.get(fanCompleteEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'percentCurrent')).toBe(50);
    expect(haPlatform.matterbridgeDevices.get(fanCompleteEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'airflowDirection')).toBe(FanControl.AirflowDirection.Forward);
    expect(haPlatform.matterbridgeDevices.get(fanCompleteEntity.entity_id)?.getAttribute(FanControl.Cluster.id, 'rockSetting')).toEqual({
      rockLeftRight: false,
      rockRound: true,
      rockUpDown: false,
    });
    expect(haPlatform.matterbridgeDevices.get(climateEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'systemMode')).toBe(Thermostat.SystemMode.Auto);
    expect(haPlatform.matterbridgeDevices.get(climateEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'occupiedHeatingSetpoint')).toBe(2000);
    expect(haPlatform.matterbridgeDevices.get(climateEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'occupiedCoolingSetpoint')).toBe(2400);
    expect(haPlatform.matterbridgeDevices.get(climateEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'localTemperature')).toBe(2200);
    expect(haPlatform.matterbridgeDevices.get(climateHeatEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'systemMode')).toBe(Thermostat.SystemMode.Heat);
    expect(haPlatform.matterbridgeDevices.get(climateHeatEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'occupiedHeatingSetpoint')).toBe(2000);
    expect(haPlatform.matterbridgeDevices.get(climateHeatEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'localTemperature')).toBe(2200);
    expect(haPlatform.matterbridgeDevices.get(climateCoolEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'systemMode')).toBe(Thermostat.SystemMode.Cool);
    expect(haPlatform.matterbridgeDevices.get(climateCoolEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'occupiedCoolingSetpoint')).toBe(2000);
    expect(haPlatform.matterbridgeDevices.get(climateCoolEntity.entity_id)?.getAttribute(Thermostat.Cluster.id, 'localTemperature')).toBe(1800);

    // Clean the test environment
    await cleanup();

    // setDebug(false);
  }, 30000);

  it('should call onConfigure', async () => {
    await haPlatform.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith(`Configuring platform ${idn}${mockConfig.name}${rs}${nf}...`);
    expect(mockLog.info).toHaveBeenCalledWith(`Configured platform ${idn}${mockConfig.name}${rs}${nf}`);
  });

  it('should call onShutdown with reason', async () => {
    await haPlatform.onShutdown('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Home Assistant connection closed`);
  });

  test('close the server node', async () => {
    expect(server).toBeDefined();
    await stopServerNode(server);
  });
});

// binary_sensor
const batteryLowEntity = {
  device_id: null,
  entity_id: 'binary_sensor.battery_low',
  id: 'battery-low-entity-id',
  name: 'Battery Low Sensor',
} as unknown as HassEntity;
const batteryLowState = {
  entity_id: batteryLowEntity.entity_id,
  state: 'on', // 'on' = battery low, 'off' = battery okay
  attributes: { device_class: 'battery', friendly_name: batteryLowEntity.name },
} as unknown as HassState;

const contactEntity = {
  device_id: null,
  entity_id: 'binary_sensor.door_contact',
  id: '0b25a337cb83edefb1d310450ad2b0ac',
  name: 'Single Entity Contact Sensor',
} as unknown as HassEntity;
const contactState = {
  entity_id: contactEntity.entity_id,
  state: 'on', // 'on' for open, 'off' for closed
  attributes: { device_class: 'door', friendly_name: contactEntity.name },
} as unknown as HassState;

const windowEntity = {
  device_id: null,
  entity_id: 'binary_sensor.window_contact',
  id: 'window-entity-id',
  name: 'Window Contact Sensor',
} as unknown as HassEntity;
const windowState = {
  entity_id: windowEntity.entity_id,
  state: 'on', // 'on' = open, 'off' = closed
  attributes: { device_class: 'window', friendly_name: windowEntity.name },
} as unknown as HassState;

const garageDoorEntity = {
  device_id: null,
  entity_id: 'binary_sensor.garage_door_contact',
  id: 'garage-door-entity-id',
  name: 'Garage Door Sensor',
} as unknown as HassEntity;
const garageDoorState = {
  entity_id: garageDoorEntity.entity_id,
  state: 'off', // 'on' = open, 'off' = closed
  attributes: { device_class: 'garage_door', friendly_name: garageDoorEntity.name },
} as unknown as HassState;

const vibrationEntity = {
  device_id: null,
  entity_id: 'binary_sensor.vibration_sensor',
  id: 'vibration-entity-id',
  name: 'Vibration Sensor',
} as unknown as HassEntity;
const vibrationState = {
  entity_id: vibrationEntity.entity_id,
  state: 'off', // 'on' = vibration detected
  attributes: { device_class: 'vibration', friendly_name: vibrationEntity.name },
} as unknown as HassState;

const coldEntity = {
  device_id: null,
  entity_id: 'binary_sensor.cold_sensor',
  id: 'cold-entity-id',
  name: 'Cold Sensor',
} as unknown as HassEntity;
const coldState = {
  entity_id: coldEntity.entity_id,
  state: 'off', // 'on' = cold condition
  attributes: { device_class: 'cold', friendly_name: coldEntity.name },
} as unknown as HassState;

const moistureEntity = {
  device_id: null,
  entity_id: 'binary_sensor.moisture_sensor',
  id: 'moisture-entity-id',
  name: 'Moisture Sensor',
} as unknown as HassEntity;
const moistureState = {
  entity_id: moistureEntity.entity_id,
  state: 'off', // 'on' = moisture/leak detected
  attributes: { device_class: 'moisture', friendly_name: moistureEntity.name },
} as unknown as HassState;

const occupancyEntity = {
  device_id: null,
  entity_id: 'binary_sensor.occupancy_sensor',
  id: 'occupancy-entity-id',
  name: 'Occupancy Sensor',
} as unknown as HassEntity;
const occupancyState = {
  entity_id: occupancyEntity.entity_id,
  state: 'off', // 'on' = occupied
  attributes: { device_class: 'occupancy', friendly_name: occupancyEntity.name },
} as unknown as HassState;

const motionEntity = {
  device_id: null,
  entity_id: 'binary_sensor.motion_sensor',
  id: 'motion-entity-id',
  name: 'Motion Sensor',
} as unknown as HassEntity;
const motionState = {
  entity_id: motionEntity.entity_id,
  state: 'off', // 'on' = motion detected
  attributes: { device_class: 'motion', friendly_name: motionEntity.name },
} as unknown as HassState;

const presenceEntity = {
  device_id: null,
  entity_id: 'binary_sensor.presence_sensor',
  id: 'presence-entity-id',
  name: 'Presence Sensor',
} as unknown as HassEntity;
const presenceStateMulti = {
  entity_id: presenceEntity.entity_id,
  state: 'off', // 'on' = presence detected
  attributes: { device_class: 'presence', friendly_name: presenceEntity.name },
} as unknown as HassState;

const smokeEntity = {
  device_id: null,
  entity_id: 'binary_sensor.smoke_alarm',
  id: 'smoke-entity-id',
  name: 'Smoke Alarm',
} as unknown as HassEntity;
const smokeStateMulti = {
  entity_id: smokeEntity.entity_id,
  state: 'off', // 'on' = smoke detected
  attributes: { device_class: 'smoke', friendly_name: smokeEntity.name },
} as unknown as HassState;

const coEntity = {
  device_id: null,
  entity_id: 'binary_sensor.co_alarm',
  id: 'co-entity-id',
  name: 'CO Alarm',
} as unknown as HassEntity;
const coStateMulti = {
  entity_id: coEntity.entity_id,
  state: 'off', // 'on' = CO detected
  attributes: { device_class: 'carbon_monoxide', friendly_name: coEntity.name },
} as unknown as HassState;

// sensor
const batteryLevelEntity = {
  device_id: null,
  entity_id: 'sensor.battery_level',
  id: 'battery-level-entity-id',
  name: 'Battery Level Sensor',
} as unknown as HassEntity;
const batteryLevelState = {
  entity_id: batteryLevelEntity.entity_id,
  state: '85',
  attributes: { state_class: 'measurement', device_class: 'battery', unit_of_measurement: '%', friendly_name: batteryLevelEntity.name },
} as unknown as HassState;

const batteryVoltageEntity = {
  device_id: null,
  entity_id: 'sensor.battery_voltage',
  id: 'battery-voltage-entity-id',
  name: 'Battery Voltage Sensor',
} as unknown as HassEntity;
const batteryVoltageState = {
  entity_id: batteryVoltageEntity.entity_id,
  state: '3.7',
  attributes: { state_class: 'measurement', device_class: 'voltage', unit_of_measurement: 'V', friendly_name: batteryVoltageEntity.name },
} as unknown as HassState;

const temperatureEntity = {
  device_id: null,
  entity_id: 'sensor.temperature',
  id: 'temperature-entity-id',
  name: 'Temperature Sensor',
} as unknown as HassEntity;
const temperatureState = {
  entity_id: temperatureEntity.entity_id,
  state: '22.6',
  attributes: { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C', friendly_name: temperatureEntity.name },
} as unknown as HassState;

const humidityEntity = {
  device_id: null,
  entity_id: 'sensor.humidity',
  id: 'humidity-entity-id',
  name: 'Humidity Sensor',
} as unknown as HassEntity;
const humidityState = {
  entity_id: humidityEntity.entity_id,
  state: '56.3',
  attributes: { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%', friendly_name: humidityEntity.name },
} as unknown as HassState;

const pressureEntity = {
  device_id: null,
  entity_id: 'sensor.pressure',
  id: 'pressure-entity-id',
  name: 'Pressure Sensor',
} as unknown as HassEntity;
const pressureState = {
  entity_id: pressureEntity.entity_id,
  state: '1013',
  attributes: { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa', friendly_name: pressureEntity.name },
} as unknown as HassState;

const atmosphericPressureEntity = {
  device_id: null,
  entity_id: 'sensor.atmospheric_pressure',
  id: 'atmospheric-pressure-entity-id',
  name: 'Atmospheric Pressure Sensor',
} as unknown as HassEntity;
const atmosphericPressureState = {
  entity_id: atmosphericPressureEntity.entity_id,
  state: '1013',
  attributes: { state_class: 'measurement', device_class: 'atmospheric_pressure', unit_of_measurement: 'hPa', friendly_name: atmosphericPressureEntity.name },
} as unknown as HassState;

const illuminanceEntity = {
  device_id: null,
  entity_id: 'sensor.illuminance',
  id: 'illuminance-entity-id',
  name: 'Illuminance Sensor',
} as unknown as HassEntity;
const illuminanceState = {
  entity_id: illuminanceEntity.entity_id,
  state: '500',
  attributes: { state_class: 'measurement', device_class: 'illuminance', unit_of_measurement: 'lx', friendly_name: illuminanceEntity.name },
} as unknown as HassState;

const energyEntity = {
  device_id: null,
  entity_id: 'sensor.energy',
  id: 'energy-entity-id',
  name: 'Energy Sensor',
} as unknown as HassEntity;
const energyState = {
  entity_id: energyEntity.entity_id,
  state: '12.34',
  attributes: { state_class: 'total_increasing', device_class: 'energy', unit_of_measurement: 'kWh', friendly_name: energyEntity.name },
} as unknown as HassState;

const powerEntity = {
  device_id: null,
  entity_id: 'sensor.power',
  id: 'power-entity-id',
  name: 'Power Sensor',
} as unknown as HassEntity;
const powerState = {
  entity_id: powerEntity.entity_id,
  state: '100',
  attributes: { state_class: 'measurement', device_class: 'power', unit_of_measurement: 'W', friendly_name: powerEntity.name },
} as unknown as HassState;

const currentEntity = {
  device_id: null,
  entity_id: 'sensor.current',
  id: 'current-entity-id',
  name: 'Current Sensor',
} as unknown as HassEntity;
const currentState = {
  entity_id: currentEntity.entity_id,
  state: '0.5',
  attributes: { state_class: 'measurement', device_class: 'current', unit_of_measurement: 'A', friendly_name: currentEntity.name },
} as unknown as HassState;

const voltageEntity = {
  device_id: null,
  entity_id: 'sensor.voltage',
  id: 'voltage-entity-id',
  name: 'Voltage Sensor',
} as unknown as HassEntity;
const voltageState = {
  entity_id: voltageEntity.entity_id,
  state: '230',
  attributes: { state_class: 'measurement', device_class: 'voltage', unit_of_measurement: 'V', friendly_name: voltageEntity.name },
} as unknown as HassState;

const aqiEntity = {
  device_id: null,
  entity_id: 'sensor.air_quality',
  id: 'aqi-entity-id',
  name: 'Air Quality Sensor',
} as unknown as HassEntity;
const aqiState = {
  entity_id: aqiEntity.entity_id,
  state: 'fair',
  attributes: { state_class: 'measurement', device_class: 'aqi', friendly_name: aqiEntity.name },
} as unknown as HassState;

const vocEntity = {
  device_id: null,
  entity_id: 'sensor.volatile_organic_compounds',
  id: 'voc-entity-id',
  name: 'VOC Sensor',
} as unknown as HassEntity;
const vocState = {
  entity_id: vocEntity.entity_id,
  state: '100',
  attributes: { state_class: 'measurement', device_class: 'volatile_organic_compounds', friendly_name: vocEntity.name },
} as unknown as HassState;

const vocPartsEntity = {
  device_id: null,
  entity_id: 'sensor.volatile_organic_compounds_parts',
  id: 'voc-parts-entity-id',
  name: 'VOC Parts Sensor',
} as unknown as HassEntity;
const vocPartsState = {
  entity_id: vocPartsEntity.entity_id,
  state: '150',
  attributes: { state_class: 'measurement', device_class: 'volatile_organic_compounds_parts', friendly_name: vocPartsEntity.name },
} as unknown as HassState;

const co2Entity = {
  device_id: null,
  entity_id: 'sensor.carbon_dioxide',
  id: 'co2-sensor-entity-id',
  name: 'CO2 Sensor',
} as unknown as HassEntity;
const co2State = {
  entity_id: co2Entity.entity_id,
  state: '600',
  attributes: { state_class: 'measurement', device_class: 'carbon_dioxide', friendly_name: co2Entity.name },
} as unknown as HassState;

const coSensorEntity = {
  device_id: null,
  entity_id: 'sensor.carbon_monoxide',
  id: 'co-sensor-entity-id',
  name: 'CO Sensor',
} as unknown as HassEntity;
const coSensorState = {
  entity_id: coSensorEntity.entity_id,
  state: '30',
  attributes: { state_class: 'measurement', device_class: 'carbon_monoxide', friendly_name: coSensorEntity.name },
} as unknown as HassState;

const no2Entity = {
  device_id: null,
  entity_id: 'sensor.nitrogen_dioxide',
  id: 'no2-entity-id',
  name: 'NO2 Sensor',
} as unknown as HassEntity;
const no2State = {
  entity_id: no2Entity.entity_id,
  state: '15',
  attributes: { state_class: 'measurement', device_class: 'nitrogen_dioxide', friendly_name: no2Entity.name },
} as unknown as HassState;

const ozoneEntity = {
  device_id: null,
  entity_id: 'sensor.ozone',
  id: 'ozone-entity-id',
  name: 'Ozone Sensor',
} as unknown as HassEntity;
const ozoneState = {
  entity_id: ozoneEntity.entity_id,
  state: '5',
  attributes: { state_class: 'measurement', device_class: 'ozone', friendly_name: ozoneEntity.name },
} as unknown as HassState;

const formaldehydeEntity = {
  device_id: null,
  entity_id: 'sensor.formaldehyde',
  id: 'formaldehyde-entity-id',
  name: 'Formaldehyde Sensor',
} as unknown as HassEntity;
const formaldehydeState = {
  entity_id: formaldehydeEntity.entity_id,
  state: '2',
  attributes: { state_class: 'measurement', device_class: 'formaldehyde', friendly_name: formaldehydeEntity.name },
} as unknown as HassState;

const radonEntity = {
  device_id: null,
  entity_id: 'sensor.radon',
  id: 'radon-entity-id',
  name: 'Radon Sensor',
} as unknown as HassEntity;
const radonState = {
  entity_id: radonEntity.entity_id,
  state: '50',
  attributes: { state_class: 'measurement', device_class: 'radon', friendly_name: radonEntity.name },
} as unknown as HassState;

const pm1Entity = {
  device_id: null,
  entity_id: 'sensor.pm1',
  id: 'pm1-entity-id',
  name: 'PM1 Sensor',
} as unknown as HassEntity;
const pm1State = {
  entity_id: pm1Entity.entity_id,
  state: '5',
  attributes: { state_class: 'measurement', device_class: 'pm1', friendly_name: pm1Entity.name },
} as unknown as HassState;

const pm25Entity = {
  device_id: null,
  entity_id: 'sensor.pm25',
  id: 'pm25-entity-id',
  name: 'PM2.5 Sensor',
} as unknown as HassEntity;
const pm25State = {
  entity_id: pm25Entity.entity_id,
  state: '12',
  attributes: { state_class: 'measurement', device_class: 'pm25', friendly_name: pm25Entity.name },
} as unknown as HassState;

const pm10Entity = {
  device_id: null,
  entity_id: 'sensor.pm10',
  id: 'pm10-entity-id',
  name: 'PM10 Sensor',
} as unknown as HassEntity;
const pm10State = {
  entity_id: pm10Entity.entity_id,
  state: '20',
  attributes: { state_class: 'measurement', device_class: 'pm10', friendly_name: pm10Entity.name },
} as unknown as HassState;

// control
const switchEntity = {
  device_id: null,
  entity_id: 'switch.switch',
  id: '0b25a337cb83edefb1d310450ad2b0ac',
  name: 'Single Entity Switch',
} as unknown as HassEntity;
const switchState = {
  entity_id: switchEntity.entity_id,
  state: 'on',
  attributes: { friendly_name: switchEntity.name },
} as unknown as HassState;

const lightOnOffEntity = {
  device_id: null,
  entity_id: 'light.light_onoff',
  id: 'light-entity-id',
  name: 'Single Entity Light OnOff',
} as unknown as HassEntity;
const lightOnOffState = {
  entity_id: lightOnOffEntity.entity_id,
  state: 'on',
  attributes: { friendly_name: lightOnOffEntity.name },
} as unknown as HassState;

const lightDimmerEntity = {
  device_id: null,
  entity_id: 'light.light_dimmer',
  id: 'light-entity-id',
  name: 'Single Entity Light Dimmer',
} as unknown as HassEntity;
const lightDimmerState = {
  entity_id: lightDimmerEntity.entity_id,
  state: 'on',
  attributes: { friendly_name: lightDimmerEntity.name, brightness: 150 },
} as unknown as HassState;

const lightCtEntity = {
  device_id: null,
  entity_id: 'light.light_ct',
  id: 'light-entity-id',
  name: 'Single Entity Light CT',
} as unknown as HassEntity;
const lightCtState = {
  entity_id: lightCtEntity.entity_id,
  state: 'on',
  attributes: { friendly_name: lightCtEntity.name, brightness: 100, color_temp_kelvin: 2000, supported_color_modes: ['color_temp'], color_mode: 'color_temp' },
} as unknown as HassState;

// lock
const lockEntity = {
  device_id: null,
  entity_id: 'lock.lock',
  id: 'lock-entity-id',
  name: 'Single Entity Lock',
} as unknown as HassEntity;
const lockState = {
  entity_id: lockEntity.entity_id,
  state: 'locked',
  attributes: { friendly_name: lockEntity.name },
} as unknown as HassState;

// valve
const valveEntity = {
  device_id: null,
  entity_id: 'valve.valve',
  id: 'valve-entity-id',
  name: 'Single Entity Valve',
} as unknown as HassEntity;
const valveState = {
  entity_id: valveEntity.entity_id,
  state: 'open',
  attributes: { friendly_name: valveEntity.name, current_position: 50 },
} as unknown as HassState;

// vacuum
const vacuumEntity = {
  device_id: null,
  entity_id: 'vacuum.vacuum',
  id: 'vacuum-entity-id',
  name: 'Single Entity Vacuum',
} as unknown as HassEntity;
const vacuumState = {
  entity_id: vacuumEntity.entity_id,
  state: 'docked',
  attributes: { friendly_name: vacuumEntity.name },
} as unknown as HassState;

// fan
const fanEntity = {
  device_id: null,
  entity_id: 'fan.fan',
  id: 'fan-entity-id',
  name: 'Single Entity Fan',
} as unknown as HassEntity;
const fanState = {
  entity_id: fanEntity.entity_id,
  state: 'on',
  attributes: { friendly_name: fanEntity.name, percentage: 50, preset_modes: ['auto', 'low', 'medium', 'high'], preset_mode: 'auto' },
} as unknown as HassState;

const fanCompleteEntity = {
  device_id: null,
  entity_id: 'fan.fan_complete',
  id: 'fan-complete-entity-id',
  name: 'Single Entity Fan Complete',
} as unknown as HassEntity;
const fanCompleteState = {
  entity_id: fanCompleteEntity.entity_id,
  state: 'on',
  attributes: {
    friendly_name: fanCompleteEntity.name,
    percentage: 50,
    preset_modes: ['auto', 'low', 'medium', 'high'],
    preset_mode: 'auto',
    direction: 'forward',
    oscillate: true,
  },
} as unknown as HassState;

// climate
const climateEntity = {
  device_id: null,
  entity_id: 'climate.climate_heat_cool',
  id: 'climate-heat_cool-entity-id',
  name: 'Single Entity Climate Heat Cool',
} as unknown as HassEntity;
const climateState = {
  entity_id: climateEntity.entity_id,
  state: 'heat_cool',
  attributes: {
    friendly_name: climateEntity.name,
    hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
    target_temp_low: 20,
    target_temp_high: 24,
    current_temperature: 22,
    min_temp: 5,
    max_temp: 35,
  },
} as unknown as HassState;

const climateHeatEntity = {
  device_id: null,
  entity_id: 'climate.climate_heat',
  id: 'climate-heat-entity-id',
  name: 'Single Entity Climate Heat',
} as unknown as HassEntity;
const climateHeatState = {
  entity_id: climateHeatEntity.entity_id,
  state: 'heat',
  attributes: {
    friendly_name: climateHeatEntity.name,
    hvac_modes: ['off', 'heat'],
    temperature: 20,
    current_temperature: 22,
    min_temp: 5,
    max_temp: 35,
  },
} as unknown as HassState;

const climateCoolEntity = {
  device_id: null,
  entity_id: 'climate.climate_cool',
  id: 'climate-cool-entity-id',
  name: 'Single Entity Climate Cool',
} as unknown as HassEntity;
const climateCoolState = {
  entity_id: climateCoolEntity.entity_id,
  state: 'cool',
  attributes: {
    friendly_name: climateCoolEntity.name,
    hvac_modes: ['off', 'cool'],
    temperature: 20,
    current_temperature: 18,
    min_temp: 5,
    max_temp: 35,
  },
} as unknown as HassState;

const buttonEntity = {
  device_id: null,
  entity_id: 'event.shelly_button',
  id: 'event.shelly_button-entity-id',
  name: 'Button',
} as unknown as HassEntity;
const buttonState = {
  entity_id: buttonEntity.entity_id,
  state: 'unknown',
  attributes: {
    event_types: ['single', 'double', 'long'],
    event_type: 'single',
    device_class: 'button',
    friendly_name: 'Shelly button',
  },
} as unknown as HassState;
