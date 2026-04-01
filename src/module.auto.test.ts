// src\module.matter.test.ts

/* eslint-disable no-console */

const MATTER_PORT = 6200;
const NAME = 'PlatformAuto';
const HOMEDIR = path.join('.cache', 'jest', NAME);
const MATTER_CREATE_ONLY = true;

import path from 'node:path';

import { jest } from '@jest/globals';
import { MatterbridgeEndpoint } from 'matterbridge';
import {
  aggregator,
  createTestEnvironment,
  destroyTestEnvironment,
  flushAsync,
  log,
  loggerInfoSpy,
  server,
  setupTest,
  startServerNode,
  stopServerNode,
} from 'matterbridge/jestutils';
import { CYAN, idn, LogLevel, nf, rs } from 'matterbridge/logger';

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
  let device: MatterbridgeEndpoint;

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
      await aggregator.add(device);
      await flushAsync(undefined, undefined, 10);
    }),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      await device.delete();
      await flushAsync(undefined, undefined, 10);
    }),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {
      for (const device of aggregator.parts) {
        await device.delete();
        await flushAsync(undefined, undefined, 10);
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
    await flushAsync(1, 1, 10);
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
    for (const device of aggregator.parts) {
      await device.delete();
      await flushAsync(undefined, undefined, 0);
    }
    expect(aggregator.parts.size).toBe(0);

    // Clean the platform environment
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

    mockConfig.filterByArea = '';
    mockConfig.filterByLabel = '';
    mockConfig.whiteList = [];
    mockConfig.blackList = [];
    mockConfig.entityBlackList = [];
    mockConfig.deviceEntityBlackList = {};
    mockConfig.splitEntities = [];
    mockConfig.splitByLabel = '';
    mockConfig.splitNameStrategy = 'Entity name';
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

  it('should call onShutdown and unregister', async () => {
    mockConfig.unregisterOnShutdown = true;
    await haPlatform.onShutdown('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.removeAllBridgedEndpoints).toHaveBeenCalled();
  });
});
