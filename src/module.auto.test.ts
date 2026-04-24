// src\module.matter.test.ts

/* eslint-disable no-console */

const NAME = 'PlatformAuto';
const MATTER_PORT = 6200;
const MATTER_CREATE_ONLY = true;
const MATTER_PAUSE = 10;
const HOMEDIR = path.join('.cache', 'jest', NAME);

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { jest } from '@jest/globals';
import { MatterbridgeEndpoint, onOffMountedSwitch, onOffOutlet } from 'matterbridge';
import {
  addDevice,
  addVirtualEndpointMatterbridgeSpy,
  aggregator,
  createServerNode,
  createTestEnvironment,
  deleteDevice,
  destroyTestEnvironment,
  flushAsync,
  flushServerNode,
  log,
  loggerDebugSpy,
  loggerErrorSpy,
  loggerFatalSpy,
  loggerInfoSpy,
  loggerNoticeSpy,
  loggerWarnSpy,
  server,
  setDebug,
  setupTest,
  startServerNode,
  stopServerNode,
} from 'matterbridge/jestutils';
import { CYAN, db, dn, idn, LogLevel, nf, rs } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter/types';

import { createUniqueId, generateArea, generateDevice, generateEntity, generateLabel, generateState, getDomain, getEntityName, getName } from './helpers.js';
import { HassConfig, HassContext, HassEntity, HassServices, HassState, HomeAssistant } from './homeAssistant.js';
import type { HomeAssistantPlatform as HomeAssistantPlatformType, HomeAssistantPlatformConfig } from './module.js';
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

const savePayloadMock = jest.fn(async () => undefined);
const writeReportMock = jest.fn(async () => '');

jest.unstable_mockModule('./payload.js', () => ({
  savePayload: savePayloadMock,
}));

jest.unstable_mockModule('./report.js', () => ({
  writeReport: writeReportMock,
}));

const { HomeAssistantPlatform } = await import('./module.js');

const addClusterServerBatteryPowerSourceSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerBatteryPowerSource');
const addClusterServerBooleanStateSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerBooleanState');
const addClusterServerSmokeAlarmSmokeCoAlarmSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerSmokeAlarmSmokeCoAlarm');
const addClusterServerCoAlarmSmokeCoAlarmSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerCoAlarmSmokeCoAlarm');
const addClusterServerColorTemperatureColorControlSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerColorTemperatureColorControl');
const addClusterServerColorControlSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerColorControl');
const addClusterServerAutoModeThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerAutoModeThermostat');
const addClusterServerHeatingThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerHeatingThermostat');
const addClusterServerCoolingThermostatSpy = jest.spyOn(MutableDevice.prototype, 'addClusterServerCoolingThermostat');
const addVacuumSpy = jest.spyOn(MutableDevice.prototype, 'addVacuum');
const addSelectSpy = jest.spyOn(MutableDevice.prototype, 'addSelect');

MatterbridgeEndpoint.logLevel = LogLevel.DEBUG; // Set the log level for MatterbridgeEndpoint to DEBUG

// Setup the test environment
await setupTest(NAME, false);

describe('Matterbridge ' + NAME, () => {
  let haPlatform: HomeAssistantPlatformType;

  const mockMatterbridge = {
    matterbridgeDirectory: HOMEDIR + '/.matterbridge',
    matterbridgePluginDirectory: HOMEDIR + '/Matterbridge',
    systemInformation: {
      ipv4Address: undefined,
      ipv6Address: undefined,
      osRelease: 'xx.xx.xx.xx.xx.xx',
      nodeVersion: '22.1.10',
    },
    matterbridgeVersion: '3.7.5',
    log,
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      await addDevice(aggregator, device, 1, 0);
    }),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      await deleteDevice(aggregator, device, 1, 0);
    }),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {
      for (const device of aggregator.parts) {
        await deleteDevice(aggregator, device, 1, 0);
      }
    }),
    addVirtualEndpoint: jest.fn(async (pluginName: string, name: string, type: 'light' | 'outlet' | 'switch' | 'mounted_switch', callback: () => Promise<void>) => {
      console.log(`Mocked addVirtualEndpoint: pluginName ${pluginName} name ${name} type ${type}`);
      const device = new MatterbridgeEndpoint([onOffMountedSwitch, onOffOutlet], { id: name.replaceAll(' ', '') + ':' + type })
        .createDefaultBridgedDeviceBasicInformationClusterServer(name, createUniqueId(), VendorId(0xfff1), 'Matterbridge', 'Matterbridge Virtual Device')
        .addRequiredClusterServers();
      await addDevice(aggregator, device, 1, 0);
    }),
  } as any;

  const mockConfig: HomeAssistantPlatformConfig = JSON.parse(readFileSync(path.join('.', 'matterbridge-hass.config.json'), 'utf-8'));
  mockConfig.token = 'long-lived token'; // Replace with a valid long-lived token for actual testing

  beforeAll(async () => {
    // Setup the Matter test environment
    await createTestEnvironment();
    // Create the server node and aggregator
    await createServerNode(MATTER_PORT);
    // Start the server node and aggregator
    if (!MATTER_CREATE_ONLY) await startServerNode();
  });

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanup();
    await setDebug(false);
  });

  afterAll(async () => {
    // Stop or flush the server node depending on the create-only mode
    if (MATTER_CREATE_ONLY) await flushServerNode();
    else await stopServerNode();
    // Destroy the Matter test environment
    await destroyTestEnvironment();

    // Restore all mocks
    jest.restoreAllMocks();

    // logKeepAlives(log);
  });

  async function cleanup() {
    // Clean the test environment
    if (haPlatform) {
      // Reset start messages
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
      // Reset platform state
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
      haPlatform.ha.hassServices = {} as HassServices;
      haPlatform.ha.hassConfig = {} as HassConfig;
      await haPlatform.clearSelect();
      await haPlatform.unregisterAllDevices();
    }
    expect(aggregator.parts.size).toBe(0);

    // Reset the mock configuration to default values
    mockConfig.filterByArea = '';
    mockConfig.filterByLabel = '';
    mockConfig.whiteList = [];
    mockConfig.blackList = [];
    mockConfig.entityWhiteList = [];
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

  it('should initialize the HomeAssistantPlatform (mandatory)', async () => {
    haPlatform = new HomeAssistantPlatform(mockMatterbridge, log, mockConfig);
    expect(haPlatform).toBeDefined();
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.endpointNames.size).toBe(0);
    haPlatform.name = mockConfig.name;
    haPlatform.type = mockConfig.type as 'DynamicPlatform';
    haPlatform.version = mockConfig.version;
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
    haPlatform.ha.hassConfig = {} as HassConfig; // Simulate Home Assistant configuration
    haPlatform.ha.hassServices = {} as HassServices; // Simulate Home Assistant services
  });

  it('should call onStart and not register an individual entity if the domain is blacklisted', async () => {
    // await setDebug(true);
    const entity = generateEntity(haPlatform.ha, 'Test Entity Scene', 'scene', null, null, [], 'unknown');
    haPlatform.config.entityBlackList = ['scene'];
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Skipping entity ${CYAN}${entity.entity_id}${nf} because in entityBlackList`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(0);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and not register a split entity if the domain is not whitelisted', async () => {
    // await setDebug(true);
    const device = generateDevice(haPlatform.ha, 'Test Device', null, []);
    const entity = generateEntity(haPlatform.ha, 'Test Scene', 'scene', device, null, [], 'unknown');
    haPlatform.config.entityWhiteList = ['automation'];
    haPlatform.config.splitEntities = [entity.entity_id];
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Skipping entity ${CYAN}${entity.entity_id}${nf} because not in entityWhiteList`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(0);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and not register an individual entity if is not in the area', async () => {
    // await setDebug(true);
    const areaSelect = generateArea(haPlatform.ha, 'Test Area');
    const entity = generateEntity(haPlatform.ha, 'Test Entity Scene', 'scene', null, null, [], 'unknown');
    haPlatform.config.filterByArea = areaSelect.name;
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      `Individual entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${getEntityName(haPlatform, entity)}${nf} is not in the area "${CYAN}${haPlatform.config.filterByArea}${nf}". Skipping...`,
    );
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(0);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and not register a device entity if is not in the area', async () => {
    // await setDebug(true);
    const areaSelect = generateArea(haPlatform.ha, 'Test Area');
    const device = generateDevice(haPlatform.ha, 'Test Device');
    const entity = generateEntity(haPlatform.ha, 'Test Entity Scene', 'scene', device, null, [], 'unknown');
    haPlatform.config.filterByArea = areaSelect.name;
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Device ${CYAN}${device.name}${nf} is not in the area "${CYAN}${haPlatform.config.filterByArea}${nf}". Skipping...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(0);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and not register a split entity if is not in the area', async () => {
    // await setDebug(true);
    const areaSelect = generateArea(haPlatform.ha, 'Test Area');
    const device = generateDevice(haPlatform.ha, 'Test Device');
    const entity = generateEntity(haPlatform.ha, 'Test Entity Scene', 'scene', device, null, [], 'unknown');
    haPlatform.config.filterByArea = areaSelect.name;
    haPlatform.config.splitEntities = [entity.entity_id];
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      `Split entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${getEntityName(haPlatform, entity)}${nf} is not in the area "${CYAN}${haPlatform.config.filterByArea}${nf}". Skipping...`,
    );
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(0);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register a split entity if the device has the label filter', async () => {
    // await setDebug(true);
    const labelSelect = generateLabel(haPlatform.ha, 'Test Label');
    const device = generateDevice(haPlatform.ha, 'Test Device', null, [labelSelect.label_id]);
    const entity = generateEntity(haPlatform.ha, 'Test Entity Scene', 'scene', device, null, [], 'unknown');
    haPlatform.config.filterByLabel = labelSelect.name;
    haPlatform.config.splitEntities = [entity.entity_id];
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.get(entity.entity_id)).toBeDefined();
    expect(haPlatform.endpointNames.size).toBe(1);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBe('');
    expect(aggregator.parts.size).toBe(1);
  });

  it('should call onStart and register a split entity if it has the label filter', async () => {
    // await setDebug(true);
    const labelSelect = generateLabel(haPlatform.ha, 'Test Label');
    const device = generateDevice(haPlatform.ha, 'Test Device');
    const entity = generateEntity(haPlatform.ha, 'Test Entity Scene', 'scene', device, null, [labelSelect.label_id], 'unknown');
    haPlatform.config.filterByLabel = labelSelect.name;
    haPlatform.config.splitEntities = [entity.entity_id];
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.get(entity.entity_id)).toBeDefined();
    expect(haPlatform.endpointNames.size).toBe(1);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBe('');
    expect(aggregator.parts.size).toBe(1);
  });

  it('should call onStart and not register a split entity if it has not the label filter', async () => {
    // await setDebug(true);
    const labelSelect = generateLabel(haPlatform.ha, 'Test Label');
    const device = generateDevice(haPlatform.ha, 'Test Device');
    const entity = generateEntity(haPlatform.ha, 'Test Entity Scene', 'scene', device, null, [], 'unknown');
    haPlatform.config.filterByLabel = labelSelect.name;
    haPlatform.config.splitEntities = [entity.entity_id];
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      `Split entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${getEntityName(haPlatform, entity)}${nf} doesn't have the label "${CYAN}${haPlatform.config.filterByLabel}${nf}". Skipping...`,
    );
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(0);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and not register a split entity if the device does not exist', async () => {
    // await setDebug(true);
    const device = generateDevice(haPlatform.ha, 'Test Device');
    const entity = generateEntity(haPlatform.ha, 'Test Entity Scene', 'scene', device, null, [], 'unknown');
    haPlatform.config.splitEntities = [entity.entity_id];
    haPlatform.ha.hassDevices.delete(device.id); // Simulate the device not existing
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Split entity ${CYAN}${entity.entity_id}${nf} name ${CYAN}${getEntityName(haPlatform, entity)}${nf} device not found. Skipping...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(0);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register the individual entities with Merge strategy', async () => {
    // await setDebug(true);
    const individualEntities: { generatedEntity?: HassEntity; generatedState?: HassState; name: string; domain: string; state: string; attributes: Record<string, any> }[] = [
      { name: 'Scene', domain: 'scene', state: 'unknown', attributes: {} },
      { name: 'Temperature', domain: 'sensor', state: '20.5', attributes: { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' } },
      { name: 'Humidity', domain: 'sensor', state: '50', attributes: { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' } },
      { name: 'Pressure', domain: 'sensor', state: '1013', attributes: { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' } },
    ];
    for (const entityData of individualEntities) {
      entityData.generatedEntity = generateEntity(haPlatform.ha, entityData.name, entityData.domain as any, undefined, null, [], entityData.state);
      entityData.generatedState = generateState(haPlatform.ha, entityData.generatedEntity, entityData.state, entityData.attributes);
    }

    haPlatform.config.controllerStrategy = 'Merge';
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    for (const entityData of individualEntities) {
      if (!entityData.generatedEntity) throw new Error('Entity not generated');
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `Creating device for individual entity ${idn}${entityData.name}${rs}${nf} domain ${CYAN}${getDomain(entityData.generatedEntity)}${nf} name ${CYAN}${getName(entityData.generatedEntity)}${nf}`,
      );
      expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${getEntityName(haPlatform, entityData.generatedEntity)}${db}...`);
      expect(loggerDebugSpy).toHaveBeenCalledWith(`- individual entity ${CYAN}${entityData.generatedEntity.entity_id}${db} mapped to endpoint ${CYAN}main${db}`);
    }
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(individualEntities.length);
    expect(haPlatform.matterbridgeDevices.size).toBe(individualEntities.length);
    expect(haPlatform.endpointNames.size).toBe(individualEntities.length);
    for (const entityData of individualEntities) {
      if (!entityData.generatedEntity) throw new Error('Entity not generated');
      expect(haPlatform.matterbridgeDevices.has(entityData.generatedEntity.entity_id)).toBe(true);
      expect(haPlatform.matterbridgeDevices.get(entityData.generatedEntity.entity_id)).toBeDefined();
      expect(haPlatform.endpointNames.get(entityData.generatedEntity.entity_id)).toBe('');
    }
    expect(aggregator.parts.size).toBe(individualEntities.length);
  });

  it('should call onStart and register the individual entities with Matter strategy', async () => {
    // await setDebug(true);
    const individualEntities: { generatedEntity?: HassEntity; generatedState?: HassState; name: string; domain: string; state: string; attributes: Record<string, any> }[] = [
      { name: 'Scene', domain: 'scene', state: 'unknown', attributes: {} },
      { name: 'Temperature', domain: 'sensor', state: '20.5', attributes: { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' } },
      { name: 'Humidity', domain: 'sensor', state: '50', attributes: { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' } },
      { name: 'Pressure', domain: 'sensor', state: '1013', attributes: { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' } },
    ];
    for (const entityData of individualEntities) {
      entityData.generatedEntity = generateEntity(haPlatform.ha, entityData.name, entityData.domain as any, undefined, null, [], entityData.state);
      entityData.generatedState = generateState(haPlatform.ha, entityData.generatedEntity, entityData.state, entityData.attributes);
    }

    haPlatform.config.controllerStrategy = 'Matter';
    await haPlatform.onStart('Test reason');
    // No warnings or errors
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    for (const entityData of individualEntities) {
      if (!entityData.generatedEntity) throw new Error('Entity not generated');
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        `Creating device for individual entity ${idn}${entityData.name}${rs}${nf} domain ${CYAN}${getDomain(entityData.generatedEntity)}${nf} name ${CYAN}${getName(entityData.generatedEntity)}${nf}`,
      );
      expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${getEntityName(haPlatform, entityData.generatedEntity)}${db}...`);
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        `- individual entity ${CYAN}${entityData.generatedEntity.entity_id}${db} mapped to endpoint ${CYAN}${entityData.generatedEntity.entity_id}${db}`,
      );
    }
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(individualEntities.length);
    expect(haPlatform.matterbridgeDevices.size).toBe(individualEntities.length);
    expect(haPlatform.endpointNames.size).toBe(individualEntities.length);
    for (const entityData of individualEntities) {
      if (!entityData.generatedEntity) throw new Error('Entity not generated');
      expect(haPlatform.matterbridgeDevices.has(entityData.generatedEntity.entity_id)).toBe(true);
      expect(haPlatform.matterbridgeDevices.get(entityData.generatedEntity.entity_id)).toBeDefined();
      expect(haPlatform.endpointNames.get(entityData.generatedEntity.entity_id)).toBe(entityData.generatedEntity.entity_id);
    }
    expect(aggregator.parts.size).toBe(individualEntities.length);
  });

  it('should call onStart and register a device with one entity switch that has split label', async () => {
    const areaSelect = generateArea(haPlatform.ha, 'Test Area');
    const labelSelect = generateLabel(haPlatform.ha, 'Select Label');
    const labelSplit = generateLabel(haPlatform.ha, 'Split Label');
    const device = generateDevice(haPlatform.ha, 'Test Device', areaSelect.area_id, [labelSelect.label_id, labelSplit.label_id]);
    const entity = generateEntity(haPlatform.ha, 'Test Entity', 'switch', device, null, [labelSplit.label_id], 'on');
    haPlatform.config.filterByArea = areaSelect.name;
    haPlatform.config.filterByLabel = labelSelect.name;
    haPlatform.config.splitByLabel = labelSplit.name;
    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      `Creating device for split entity ${idn}${getEntityName(haPlatform, entity)}${rs}${nf} domain ${CYAN}${getDomain(entity)}${nf} name ${CYAN}${getName(entity)}${nf}`,
    );
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${getEntityName(haPlatform, entity)}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledWith(mockConfig.name, haPlatform.matterbridgeDevices.get(entity.entity_id));
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.has(entity.entity_id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.get(entity.entity_id)).toBeDefined();
    expect(haPlatform.endpointNames.size).toBe(1);
    expect(haPlatform.endpointNames.get(entity.entity_id)).toBe('');
    expect(aggregator.parts.size).toBe(1);
  });

  it('should call onStart and register a device with three entities', async () => {
    const device = generateDevice(haPlatform.ha, 'Climate Device');
    const temperature = generateEntity(haPlatform.ha, 'Temperature', 'sensor', device);
    const humidity = generateEntity(haPlatform.ha, 'Humidity', 'sensor', device);
    const pressure = generateEntity(haPlatform.ha, 'Pressure', 'sensor', device);
    generateState(haPlatform.ha, temperature, '20.5', { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' });
    generateState(haPlatform.ha, humidity, '50', { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' });
    generateState(haPlatform.ha, pressure, '1013', { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' });

    haPlatform.config.controllerStrategy = 'Matter';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(temperature.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(humidity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(pressure.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(3);
    expect(haPlatform.endpointNames.get(temperature.entity_id)).toBe(temperature.entity_id);
    expect(haPlatform.endpointNames.get(humidity.entity_id)).toBe(humidity.entity_id);
    expect(haPlatform.endpointNames.get(pressure.entity_id)).toBe(pressure.entity_id);
    expect(aggregator.parts.size).toBe(1);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(3);
  });

  it('should call onStart and register a device with three entities if the device has label filter', async () => {
    const labelFilter = generateLabel(haPlatform.ha, 'Label Filter');
    const device = generateDevice(haPlatform.ha, 'Climate Device', null, [labelFilter.label_id]);
    const temperature = generateEntity(haPlatform.ha, 'Temperature', 'sensor', device);
    const humidity = generateEntity(haPlatform.ha, 'Humidity', 'sensor', device);
    const pressure = generateEntity(haPlatform.ha, 'Pressure', 'sensor', device);
    generateState(haPlatform.ha, temperature, '20.5', { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' });
    generateState(haPlatform.ha, humidity, '50', { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' });
    generateState(haPlatform.ha, pressure, '1013', { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' });

    haPlatform.config.filterByLabel = labelFilter.name;
    haPlatform.config.controllerStrategy = 'Matter';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(temperature.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(humidity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(pressure.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(3);
    expect(haPlatform.endpointNames.get(temperature.entity_id)).toBe(temperature.entity_id);
    expect(haPlatform.endpointNames.get(humidity.entity_id)).toBe(humidity.entity_id);
    expect(haPlatform.endpointNames.get(pressure.entity_id)).toBe(pressure.entity_id);
    expect(aggregator.parts.size).toBe(1);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(3);
  });

  it('should call onStart and register a device with three entities if one entity has label filter', async () => {
    const labelFilter = generateLabel(haPlatform.ha, 'Label Filter');
    const device = generateDevice(haPlatform.ha, 'Climate Device');
    const temperature = generateEntity(haPlatform.ha, 'Temperature', 'sensor', device, null, [labelFilter.label_id]);
    const humidity = generateEntity(haPlatform.ha, 'Humidity', 'sensor', device);
    const pressure = generateEntity(haPlatform.ha, 'Pressure', 'sensor', device);
    generateState(haPlatform.ha, temperature, '20.5', { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' });
    generateState(haPlatform.ha, humidity, '50', { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' });
    generateState(haPlatform.ha, pressure, '1013', { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' });

    haPlatform.config.filterByLabel = labelFilter.name;
    haPlatform.config.controllerStrategy = 'Matter';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(temperature.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(humidity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(pressure.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(1);
    expect(haPlatform.endpointNames.get(temperature.entity_id)).toBe(temperature.entity_id);
    expect(haPlatform.endpointNames.get(humidity.entity_id)).toBeUndefined();
    expect(haPlatform.endpointNames.get(pressure.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(1);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(1);
  });

  it('should call onStart and register a device with three entities if it has label filter and one entity has label filter', async () => {
    const labelFilter = generateLabel(haPlatform.ha, 'Label Filter');
    const device = generateDevice(haPlatform.ha, 'Climate Device', null, [labelFilter.label_id]);
    const temperature = generateEntity(haPlatform.ha, 'Temperature', 'sensor', device, null, [labelFilter.label_id]);
    const humidity = generateEntity(haPlatform.ha, 'Humidity', 'sensor', device);
    const pressure = generateEntity(haPlatform.ha, 'Pressure', 'sensor', device);
    generateState(haPlatform.ha, temperature, '20.5', { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' });
    generateState(haPlatform.ha, humidity, '50', { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' });
    generateState(haPlatform.ha, pressure, '1013', { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' });

    haPlatform.config.filterByLabel = labelFilter.name;
    haPlatform.config.controllerStrategy = 'Matter';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(haPlatform.matterbridgeDevices.size).toBe(1);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(temperature.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(humidity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(pressure.entity_id)).toBe(false);
    expect(haPlatform.endpointNames.size).toBe(1);
    expect(haPlatform.endpointNames.get(temperature.entity_id)).toBe(temperature.entity_id);
    expect(haPlatform.endpointNames.get(humidity.entity_id)).toBeUndefined();
    expect(haPlatform.endpointNames.get(pressure.entity_id)).toBeUndefined();
    expect(aggregator.parts.size).toBe(1);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(1);
  });

  it('should call onStart and register an individual entity, a device with two entities, one normal and one split with Merge strategy', async () => {
    const device = generateDevice(haPlatform.ha, 'Climate Device');
    const temperatureIndividualEntity = generateEntity(haPlatform.ha, 'Temperature', 'sensor');
    const humidityDeviceEntity = generateEntity(haPlatform.ha, 'Humidity', 'sensor', device);
    const pressureSplitEntity = generateEntity(haPlatform.ha, 'Pressure', 'sensor', device);
    generateState(haPlatform.ha, temperatureIndividualEntity, '20.5', { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' });
    generateState(haPlatform.ha, humidityDeviceEntity, '50', { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' });
    generateState(haPlatform.ha, pressureSplitEntity, '1013', { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' });

    haPlatform.config.splitEntities = [pressureSplitEntity.entity_id];
    haPlatform.config.controllerStrategy = 'Merge';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${temperatureIndividualEntity.original_name}${db}...`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${pressureSplitEntity.original_name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(3);
    expect(haPlatform.matterbridgeDevices.size).toBe(3);
    expect(haPlatform.matterbridgeDevices.has(temperatureIndividualEntity.entity_id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(humidityDeviceEntity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(pressureSplitEntity.entity_id)).toBe(true);
    expect(haPlatform.endpointNames.size).toBe(3);
    expect(haPlatform.endpointNames.get(temperatureIndividualEntity.entity_id)).toBe('');
    expect(haPlatform.endpointNames.get(humidityDeviceEntity.entity_id)).toBe('');
    expect(haPlatform.endpointNames.get(pressureSplitEntity.entity_id)).toBe('');
    expect(aggregator.parts.size).toBe(3);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(0);

    jest.clearAllMocks();
    haPlatform.filterMessages.length = 0;
    await haPlatform.onConfigure();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
  });

  it('should call onStart and register a remote individual entity, a media_player device with two remote entities, one normal and one split with Merge strategy', async () => {
    const virtualLabel = generateLabel(haPlatform.ha, 'Virtual Label');
    const device = generateDevice(haPlatform.ha, 'TV Device');
    const remoteIndividualEntity = generateEntity(haPlatform.ha, 'Individual remote', 'remote');
    const remoteDeviceEntity = generateEntity(haPlatform.ha, 'Device remote entity', 'remote', device);
    const mediaplayerDeviceEntity = generateEntity(haPlatform.ha, 'Device media player entity', 'media_player', device, null, [virtualLabel.label_id]);
    const remoteSplitEntity = generateEntity(haPlatform.ha, 'Split remote entity', 'remote', device);
    generateState(haPlatform.ha, remoteIndividualEntity, 'on');
    generateState(haPlatform.ha, remoteDeviceEntity, 'on');
    generateState(haPlatform.ha, mediaplayerDeviceEntity, 'on', { supported_features: 448439 });
    generateState(haPlatform.ha, remoteSplitEntity, 'on');

    haPlatform.config.splitEntities = [remoteSplitEntity.entity_id];
    haPlatform.config.virtualControlLabel = virtualLabel.name;
    haPlatform.config.controllerStrategy = 'Merge';

    // await setDebug(true);

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${remoteIndividualEntity.original_name}${db}...`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${remoteSplitEntity.original_name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addVirtualEndpoint).toHaveBeenCalledTimes(9);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(3);
    expect(haPlatform.matterbridgeDevices.size).toBe(3);
    expect(haPlatform.matterbridgeDevices.has(remoteIndividualEntity.entity_id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(remoteDeviceEntity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(mediaplayerDeviceEntity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(remoteSplitEntity.entity_id)).toBe(true);
    expect(haPlatform.endpointNames.size).toBe(4);
    expect(haPlatform.endpointNames.get(remoteIndividualEntity.entity_id)).toBe('');
    expect(haPlatform.endpointNames.get(remoteDeviceEntity.entity_id)).toBe('remote.device_remote_entity');
    expect(haPlatform.endpointNames.get(mediaplayerDeviceEntity.entity_id)).toBe('media_player.device_media_player_entity');
    expect(haPlatform.endpointNames.get(remoteSplitEntity.entity_id)).toBe('');
    expect(aggregator.parts.size).toBe(12);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(2);

    jest.clearAllMocks();
    haPlatform.filterMessages.length = 0;
    await haPlatform.onConfigure();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
  });

  it('should call onStart and register a input_select individual entity, a device with two remote entities, one normal and one split with Merge strategy', async () => {
    const virtualLabel = generateLabel(haPlatform.ha, 'Virtual Label');
    const device = generateDevice(haPlatform.ha, 'Select Device');
    const inputSelectIndividualEntity = generateEntity(haPlatform.ha, 'Individual input_select', 'input_select', null, null, [virtualLabel.label_id]);
    const selectDeviceEntity = generateEntity(haPlatform.ha, 'Device select entity', 'select', device, null, [virtualLabel.label_id]);
    const selectSplitEntity = generateEntity(haPlatform.ha, 'Split select entity', 'select', device, null, [virtualLabel.label_id]);
    generateState(haPlatform.ha, inputSelectIndividualEntity, 'Led On', { options: ['Led On', 'Led Off'], friendly_name: 'Individual input_select Led' });
    generateState(haPlatform.ha, selectDeviceEntity, 'Led Off', { options: ['Led On', 'Led Off'], friendly_name: 'Device select entity Led' });
    generateState(haPlatform.ha, selectSplitEntity, 'invalid', { options: ['Led On', 'Led Off'], friendly_name: 'Split select entity Led' });

    haPlatform.config.splitEntities = [selectSplitEntity.entity_id];
    haPlatform.config.virtualControlLabel = virtualLabel.name;
    haPlatform.config.controllerStrategy = 'Merge';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${inputSelectIndividualEntity.original_name}${db}...`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${selectSplitEntity.original_name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addVirtualEndpoint).toHaveBeenCalledTimes(6);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(3);
    expect(addSelectSpy).toHaveBeenCalledTimes(3);
    expect(haPlatform.matterbridgeDevices.size).toBe(3);
    expect(haPlatform.matterbridgeDevices.has(inputSelectIndividualEntity.entity_id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(selectDeviceEntity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(selectSplitEntity.entity_id)).toBe(true);
    expect(haPlatform.endpointNames.size).toBe(3);
    expect(haPlatform.endpointNames.get(inputSelectIndividualEntity.entity_id)).toBe('');
    expect(haPlatform.endpointNames.get(selectDeviceEntity.entity_id)).toBe('');
    expect(haPlatform.endpointNames.get(selectSplitEntity.entity_id)).toBe('');
    expect(aggregator.parts.size).toBe(9);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(0);

    jest.clearAllMocks();
    haPlatform.filterMessages.length = 0;
    await haPlatform.onConfigure();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerFatalSpy).not.toHaveBeenCalled();
  });

  it('should call onStart and not register an individual entity, a device with two entities, one normal and one split with discardHiddenEntities enabled', async () => {
    const device = generateDevice(haPlatform.ha, 'Climate Device');
    const temperatureIndividualEntity = generateEntity(haPlatform.ha, 'Temperature', 'sensor');
    const humidityDeviceEntity = generateEntity(haPlatform.ha, 'Humidity', 'sensor', device);
    const pressureSplitEntity = generateEntity(haPlatform.ha, 'Pressure', 'sensor', device);
    generateState(haPlatform.ha, temperatureIndividualEntity, '20.5', { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' });
    generateState(haPlatform.ha, humidityDeviceEntity, '50', { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' });
    generateState(haPlatform.ha, pressureSplitEntity, '1013', { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' });
    temperatureIndividualEntity.hidden_by = 'user';
    humidityDeviceEntity.hidden_by = 'user';
    pressureSplitEntity.hidden_by = 'user';

    haPlatform.config.splitEntities = [pressureSplitEntity.entity_id];
    haPlatform.config.discardHiddenEntities = true;
    haPlatform.config.controllerStrategy = 'Merge';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(0);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
    expect(haPlatform.endpointNames.size).toBe(0);
    expect(aggregator.parts.size).toBe(0);
  });

  it('should call onStart and register an individual entity, a device with two entities, one normal and one split with Matter strategy', async () => {
    const device = generateDevice(haPlatform.ha, 'Climate Device');
    const temperatureIndividualEntity = generateEntity(haPlatform.ha, 'Temperature', 'sensor');
    const humidityDeviceEntity = generateEntity(haPlatform.ha, 'Humidity', 'sensor', device);
    const pressureSplitEntity = generateEntity(haPlatform.ha, 'Pressure', 'sensor', device);
    generateState(haPlatform.ha, temperatureIndividualEntity, '20.5', { state_class: 'measurement', device_class: 'temperature', unit_of_measurement: '°C' });
    generateState(haPlatform.ha, humidityDeviceEntity, '50', { state_class: 'measurement', device_class: 'humidity', unit_of_measurement: '%' });
    generateState(haPlatform.ha, pressureSplitEntity, '1013', { state_class: 'measurement', device_class: 'pressure', unit_of_measurement: 'hPa' });

    haPlatform.config.splitEntities = [pressureSplitEntity.entity_id];
    haPlatform.config.controllerStrategy = 'Matter';

    await haPlatform.onStart('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${temperatureIndividualEntity.original_name}${db}...`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(loggerDebugSpy).toHaveBeenCalledWith(`Registering device ${dn}${pressureSplitEntity.original_name}${db}...`);
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Started platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalledTimes(3);
    expect(haPlatform.matterbridgeDevices.size).toBe(3);
    expect(haPlatform.matterbridgeDevices.has(temperatureIndividualEntity.entity_id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(device.id)).toBe(true);
    expect(haPlatform.matterbridgeDevices.has(humidityDeviceEntity.entity_id)).toBe(false);
    expect(haPlatform.matterbridgeDevices.has(pressureSplitEntity.entity_id)).toBe(true);
    expect(haPlatform.endpointNames.size).toBe(3);
    expect(haPlatform.endpointNames.get(temperatureIndividualEntity.entity_id)).toBe(temperatureIndividualEntity.entity_id);
    expect(haPlatform.endpointNames.get(humidityDeviceEntity.entity_id)).toBe(humidityDeviceEntity.entity_id);
    expect(haPlatform.endpointNames.get(pressureSplitEntity.entity_id)).toBe(pressureSplitEntity.entity_id);
    expect(aggregator.parts.size).toBe(3);
    const endpoint = haPlatform.matterbridgeDevices.get(device.id);
    expect(endpoint).toBeDefined();
    expect(endpoint?.getChildEndpoints().length).toBe(1);
  });

  it('should call onShutdown and unregister (mandatory)', async () => {
    mockConfig.unregisterOnShutdown = true;
    await haPlatform.onShutdown('Test reason');
    expect(loggerInfoSpy).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.removeAllBridgedEndpoints).toHaveBeenCalled();
  });
});
