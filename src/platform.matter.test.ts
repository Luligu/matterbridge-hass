// src\platform.matter.test.ts

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// Import necessary modules and types
import { jest } from '@jest/globals';
import { rmSync } from 'node:fs';
import path from 'node:path';

// matter.js
import { Endpoint, DeviceTypeId, VendorId, ServerNode, LogFormat as MatterLogFormat, LogLevel as MatterLogLevel, Environment, MdnsService, Lifecycle } from 'matterbridge/matter';
import { RootEndpoint, AggregatorEndpoint } from 'matterbridge/matter/endpoints';

// Matterbridge
import { capitalizeFirstLetter, Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { AnsiLogger, CYAN, nf, rs, TimestampFormat, LogLevel, idn, db, or, hk } from 'matterbridge/logger';

// Home Assistant Plugin
import { HomeAssistantPlatform } from './platform';
import { HassConfig, HassDevice, HassEntity, HassServices, HassState, HomeAssistant } from './homeAssistant';
import { BooleanState, FanControl, OnOff, SmokeCoAlarm } from 'matterbridge/matter/clusters';

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
    // console.log('mockLog.fatal', message, parameters);
  }),
  error: jest.fn((message: string, ...parameters: any[]) => {
    log.error(message, ...parameters);
    // console.log('mockLog.error', message, parameters);
  }),
  warn: jest.fn((message: string, ...parameters: any[]) => {
    log.warn(message, ...parameters);
    // console.log('mockLog.warn', message, parameters);
  }),
  notice: jest.fn((message: string, ...parameters: any[]) => {
    log.notice(message, ...parameters);
    // console.log('mockLog.notice', message, parameters);
  }),
  info: jest.fn((message: string, ...parameters: any[]) => {
    log.info(message, ...parameters);
    // console.log('mockLog.info', message, parameters);
  }),
  debug: jest.fn((message: string, ...parameters: any[]) => {
    log.debug(message, ...parameters);
    // console.log('mockLog.debug', message, parameters);
  }),
} as unknown as AnsiLogger;

const mockMatterbridge = {
  matterbridgeDirectory: './jest/matterbridge',
  matterbridgePluginDirectory: './jest/plugins',
  systemInformation: { ipv4Address: undefined, ipv6Address: undefined, osRelease: 'xx.xx.xx.xx.xx.xx', nodeVersion: '22.1.10' },
  matterbridgeVersion: '3.0.4',
  log: mockLog,
  getDevices: jest.fn(() => {
    // console.log('getDevices called');
    return [];
  }),
  getPlugins: jest.fn(() => {
    // console.log('getDevices called');
    return [];
  }),
  addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
    await aggregator.add(device);
  }),
  removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
    // console.log('removeBridgedEndpoint called');
  }),
  removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {
    // console.log('removeAllBridgedEndpoints called');
  }),
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
  return Promise.resolve();
});

const closeSpy = jest.spyOn(HomeAssistant.prototype, 'close').mockImplementation(() => {
  console.log(`Mocked close`);
  return Promise.resolve();
});

const subscribeSpy = jest.spyOn(HomeAssistant.prototype, 'subscribe').mockImplementation(() => {
  console.log(`Mocked subscribe`);
  return Promise.resolve();
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
    return Promise.resolve({});
  });

const setAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'setAttribute');
const updateAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'updateAttribute');
const subscribeAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'subscribeAttribute');
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

  afterEach(async () => {});

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
    aggregator = new Endpoint(AggregatorEndpoint, { id: NAME + 'AggregatorNode' });
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
    haPlatform.ha.connected = true; // Simulate a connected Home Assistant instance
    haPlatform.ha.hassConfig = {} as HassConfig; // Simulate a Home Assistant configuration
    haPlatform.ha.hassServices = {} as HassServices; // Simulate a Home Assistant services

    await haPlatform.onStart('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(haPlatform.matterbridgeDevices.size).toBe(0);
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
      attributes: { preset_mode: 'high', percentage: 50, friendly_name: 'Fan Fan' },
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
    expect(subscribeAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'speedSetting', expect.anything(), expect.anything());
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}FanControl${db}.${hk}fanMode$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}FanControl${db}.${hk}percentSetting$Changed${db}`),
    );
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Subscribed endpoint ${or}${child.id}${db}:${or}${child.number}${db} attribute ${hk}FanControl${db}.${hk}speedSetting$Changed${db}`),
    );

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state ${CYAN}${fanDeviceEntityState.entity_id}${db} for device ${CYAN}${fanDevice.id}${db}`));
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Auto, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'percentCurrent', 50, expect.anything());
    expect(setAttributeSpy).toHaveBeenCalledWith(FanControl.Cluster.id, 'speedCurrent', 50, expect.anything());

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

    jest.clearAllMocks();
    await haPlatform.onConfigure();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for async updateHandler operations to complete
    expect(mockLog.debug).toHaveBeenCalledWith(
      expect.stringContaining(`Configuring state ${CYAN}${smokeDeviceEntityState.entity_id}${db} for device ${CYAN}${smokeDevice.id}${db}`),
    );
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'expressedState', SmokeCoAlarm.ExpressedState.Normal, expect.anything()); // SmokeCoAlarm.ExpressedState.Normal

    jest.clearAllMocks();
    haPlatform.updateHandler(smokeDevice.id, smokeDeviceEntityState.entity_id, smokeDeviceEntityState, { ...smokeDeviceEntityState, state: 'on' }); // 'on' for smoke, 'off' for no smoke
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'expressedState', SmokeCoAlarm.ExpressedState.SmokeAlarm, expect.anything()); // SmokeCoAlarm.ExpressedState.SmokeAlarm

    jest.clearAllMocks();
    haPlatform.updateHandler(smokeDevice.id, smokeDeviceEntityState.entity_id, smokeDeviceEntityState, { ...smokeDeviceEntityState, state: 'off' }); // 'on' for smoke, 'off' for no smoke
    expect(setAttributeSpy).toHaveBeenCalledWith(SmokeCoAlarm.Cluster.id, 'expressedState', SmokeCoAlarm.ExpressedState.Normal, expect.anything()); // SmokeCoAlarm.ExpressedState.Normal

    haPlatform.matterbridgeDevices.delete(smokeDevice.id);
    haPlatform.ha.hassDevices.delete(smokeDevice.id);
    haPlatform.ha.hassEntities.delete(smokeDeviceEntity.entity_id);
    haPlatform.ha.hassStates.delete(smokeDeviceEntityState.entity_id);
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
  });
});
