// src\module.matter.test.ts

/* eslint-disable no-console */

const MATTER_PORT = 6200;
const NAME = 'PlatformAuto';
const HOMEDIR = path.join('.cache', 'jest', NAME);
const MATTER_CREATE_ONLY = true;
const MATTER_PAUSE = 50;

import path from 'node:path';

import { jest } from '@jest/globals';
import { MatterbridgeEndpoint } from 'matterbridge';
import {
  addDevice,
  aggregator,
  createTestEnvironment,
  deleteDevice,
  destroyTestEnvironment,
  flushAsync,
  log,
  loggerDebugSpy,
  loggerInfoSpy,
  server,
  setupTest,
  startServerNode,
  stopServerNode,
} from 'matterbridge/jestutils';
import { CYAN, db, dn, idn, LogLevel, nf, rs } from 'matterbridge/logger';

import { generateArea, generateDevice, generateEntity, generateLabel, generateState } from './helpers.js';
import { HassConfig, HassContext, HassServices, HomeAssistant } from './homeAssistant.js';
import { HomeAssistantPlatform, HomeAssistantPlatformConfig } from './module.js';
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
  console.log(`Mocked fetch: ${api}`);
  return Promise.resolve();
});

const callServiceSpy = jest
  .spyOn(HomeAssistant.prototype, 'callService')
  .mockImplementation((domain: string, service: string, entityId: string, serviceData: Record<string, any> = {}) => {
    console.log(`Mocked callService: domain ${domain} service ${service} entityId ${entityId}`);
    return Promise.resolve({ context: {} as HassContext, response: undefined });
  });

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

describe('Matterbridge ' + NAME, () => {
  let haPlatform: HomeAssistantPlatform;

  const mockMatterbridge = {
    matterbridgeDirectory: HOMEDIR + '/.matterbridge',
    matterbridgePluginDirectory: HOMEDIR + '/Matterbridge',
    systemInformation: {
      ipv4Address: undefined,
      ipv6Address: undefined,
      osRelease: 'xx.xx.xx.xx.xx.xx',
      nodeVersion: '22.1.10',
    },
    matterbridgeVersion: '3.7.2',
    log,
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      await addDevice(aggregator, device, MATTER_PAUSE);
    }),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      await deleteDevice(aggregator, device, MATTER_PAUSE);
    }),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {
      for (const device of aggregator.parts) {
        await deleteDevice(aggregator, device, MATTER_PAUSE);
      }
    }),
    addVirtualEndpoint: jest.fn(async (pluginName: string, name: string, type: 'light' | 'outlet' | 'switch' | 'mounted_switch', callback: () => Promise<void>) => {}),
  } as any;

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
    whiteList: [],
    blackList: [],
    entityBlackList: [],
    deviceEntityBlackList: {},
    splitEntities: [],
    splitByLabel: '',
    splitNameStrategy: 'Entity name',
    controllerStrategy: 'Merge',
    namePostfix: '',
    postfix: '',
    airQualityRegex: '',
    enableServerRvc: false,
    debug: true,
    unregisterOnShutdown: false,
  };

  beforeAll(async () => {
    // Setup the Matter test environment
    createTestEnvironment(NAME, MATTER_CREATE_ONLY);
    // Start the server node and aggregator
    await startServerNode(NAME, MATTER_PORT, undefined, MATTER_CREATE_ONLY);
  });

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
    await flushAsync(undefined, undefined, MATTER_PAUSE);
  });

  afterAll(async () => {
    // Stop the server node
    await stopServerNode(server, MATTER_CREATE_ONLY);
    // Destroy the Matter test environment
    await destroyTestEnvironment(MATTER_CREATE_ONLY);

    // Restore all mocks
    jest.restoreAllMocks();

    // logKeepAlives(log);
  });

  async function cleanup() {
    // Clean the test environment
    if (haPlatform) {
      haPlatform.matterbridgeDevices.clear();
      haPlatform.endpointNames.clear();
      haPlatform.batteryVoltageEntities.clear();
      haPlatform.updatingEntities.clear();
      haPlatform.offUpdatedEntities.clear();
      haPlatform.ha.hassDevices.clear();
      haPlatform.ha.hassEntities.clear();
      haPlatform.ha.hassStates.clear();
      haPlatform.ha.hassAreas.clear();
      haPlatform.ha.hassLabels.clear();
    }
    for (const device of Array.from(aggregator.parts)) {
      await deleteDevice(aggregator, device, MATTER_PAUSE);
    }
    expect(aggregator.parts.size).toBe(0);

    // Clean the platform environment
    if (haPlatform) {
      await haPlatform.clearSelect();
      await haPlatform.unregisterAllDevices();

      haPlatform.filterMessages.length = 0;
      haPlatform.filteredDevices = 0;
      haPlatform.filteredEntities = 0;
      haPlatform.unselectedDevices = 0;
      haPlatform.unselectedEntities = 0;
      haPlatform.duplicatedDevices = 0;
      haPlatform.duplicatedEntities = 0;
      haPlatform.longNameDevices = 0;
      haPlatform.longNameEntities = 0;
      haPlatform.failedDevices = 0;
      haPlatform.failedEntities = 0;
    }

    mockConfig.filterByArea = '';
    mockConfig.filterByLabel = '';
    mockConfig.whiteList = [];
    mockConfig.blackList = [];
    mockConfig.entityBlackList = [];
    mockConfig.deviceEntityBlackList = {};
    mockConfig.splitEntities = [];
    mockConfig.splitByLabel = '';
    mockConfig.splitNameStrategy = 'Entity name';
    mockConfig.controllerStrategy = 'Merge';
    mockConfig.namePostfix = '';
    mockConfig.postfix = '';
    mockConfig.airQualityRegex = '';
    mockConfig.enableServerRvc = false;
    mockConfig.debug = true;
    mockConfig.unregisterOnShutdown = false;
  }

  it('should initialize the HomeAssistantPlatform', async () => {
    haPlatform = new HomeAssistantPlatform(mockMatterbridge, log, mockConfig);
    expect(haPlatform).toBeDefined();
    // addMatterbridgePlatform(haPlatform);
    // @ts-expect-error - setMatterNode is intentionally private
    haPlatform.setMatterNode?.(
      mockMatterbridge.addBridgedEndpoint,
      mockMatterbridge.removeBridgedEndpoint,
      mockMatterbridge.removeAllBridgedEndpoints,
      mockMatterbridge.addVirtualEndpoint,
    );
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Initializing platform: ${CYAN}${haPlatform.config.name}${nf} version: ${CYAN}${haPlatform.config.version}${rs}`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Initialized platform: ${CYAN}${haPlatform.config.name}${nf} version: ${CYAN}${haPlatform.config.version}${rs}`);
    haPlatform.haSubscriptionId = 1;
    haPlatform.ha.connected = true; // Simulate a connected Home Assistant instance
    haPlatform.ha.hassConfig = {} as HassConfig; // Simulate a Home Assistant configuration
    haPlatform.ha.hassServices = {} as HassServices; // Simulate a Home Assistant services
  });

  it('should call onStart and register a device with one entity switch that has split label', async () => {
    const device = generateDevice('Test Device');
    const entity = generateEntity('Test Entity', 'switch', device);
    const state = generateState(entity, 'on');
    const areaSelect = generateArea('Test Area');
    const labelSelect = generateLabel('Select Label');
    const labelSplit = generateLabel('Split Label');
    device.area_id = areaSelect.area_id;
    device.labels = [labelSelect.label_id];
    entity.labels = [labelSplit.label_id];
    haPlatform.config.filterByArea = areaSelect.name;
    haPlatform.config.filterByLabel = labelSelect.name;
    haPlatform.config.splitByLabel = labelSplit.name;
    haPlatform.ha.hassDevices.set(device.id, device);
    haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    haPlatform.ha.hassStates.set(state.entity_id, state);
    haPlatform.ha.hassAreas.set(areaSelect.area_id, areaSelect);
    haPlatform.ha.hassLabels.set(labelSelect.label_id, labelSelect);
    haPlatform.ha.hassLabels.set(labelSplit.label_id, labelSplit);
    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining(`Creating device for split entity`));
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(aggregator.parts.size).toBe(1);
  });

  it('should call onStart and register a device with three entities', async () => {
    const device = generateDevice('Climate Device');
    const temperature = generateEntity('Temperature', 'sensor', device);
    const humidity = generateEntity('Humidity', 'sensor', device);
    const pressure = generateEntity('Pressure', 'sensor', device);
    const temperatureState = generateState(temperature, '20.5', { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' });
    const humidityState = generateState(humidity, '50', { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' });
    const pressureState = generateState(pressure, '1013', { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' });

    haPlatform.ha.hassDevices.set(device.id, device);

    haPlatform.ha.hassEntities.set(temperature.entity_id, temperature);
    haPlatform.ha.hassEntities.set(humidity.entity_id, humidity);
    haPlatform.ha.hassEntities.set(pressure.entity_id, pressure);

    haPlatform.ha.hassStates.set(temperatureState.entity_id, temperatureState);
    haPlatform.ha.hassStates.set(humidityState.entity_id, humidityState);
    haPlatform.ha.hassStates.set(pressureState.entity_id, pressureState);

    haPlatform.config.controllerStrategy = 'Matter';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(aggregator.parts.size).toBe(1);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(3);
  });

  it('should call onShutdown and unregister', async () => {
    mockConfig.unregisterOnShutdown = true;
    await haPlatform.onShutdown('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.removeAllBridgedEndpoints).toHaveBeenCalled();
  });
});
