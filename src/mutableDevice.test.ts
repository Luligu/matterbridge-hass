// src\mutableDevice.test.ts

const MATTER_PORT = 6000;
const NAME = 'MutableDevice';
const HOMEDIR = path.join('jest', NAME);

import path from 'node:path';
import { rmSync } from 'node:fs';

import { jest } from '@jest/globals';
import {
  Matterbridge,
  MatterbridgeEndpoint,
  bridgedNode,
  powerSource,
  electricalSensor,
  onOffOutlet,
  onOffLight,
  dimmableLight,
  colorTemperatureLight,
  onOffSwitch,
  dimmableSwitch,
  dimmableOutlet,
  colorTemperatureSwitch,
  temperatureSensor,
  optionsFor,
  extendedColorLight,
  contactSensor,
  smokeCoAlarm,
  thermostatDevice,
  invokeSubscribeHandler,
  invokeBehaviorCommand,
  roboticVacuumCleaner,
  humiditySensor,
  pressureSensor,
  fanDevice,
} from 'matterbridge';
import { AnsiLogger, LogLevel, TimestampFormat } from 'matterbridge/logger';
import {
  PowerSourceCluster,
  BridgedDeviceBasicInformationCluster,
  OnOffCluster,
  IdentifyCluster,
  GroupsCluster,
  LevelControlCluster,
  ColorControlCluster,
  DescriptorCluster,
  OnOff,
  PowerSource,
  BridgedDeviceBasicInformation,
  LevelControl,
  FixedLabel,
  Descriptor,
  SmokeCoAlarm,
  TemperatureMeasurement,
  RelativeHumidityMeasurement,
  PressureMeasurement,
  FanControl,
} from 'matterbridge/matter/clusters';
import { BridgedDeviceBasicInformationServer, LevelControlServer, OnOffServer } from 'matterbridge/matter/behaviors';
import { Endpoint, Environment, ServerNode, LogLevel as MatterLogLevel, LogFormat as MatterLogFormat, DeviceTypeId, VendorId, MdnsService } from 'matterbridge/matter';
import { AggregatorEndpoint, RootEndpoint } from 'matterbridge/matter/endpoints';

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

function setDebug(debug: boolean) {
  if (debug) {
    loggerLogSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log');
    consoleLogSpy = jest.spyOn(console, 'log');
    consoleDebugSpy = jest.spyOn(console, 'debug');
    consoleInfoSpy = jest.spyOn(console, 'info');
    consoleWarnSpy = jest.spyOn(console, 'warn');
    consoleErrorSpy = jest.spyOn(console, 'error');
  } else {
    loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation((...args: any[]) => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation((...args: any[]) => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation((...args: any[]) => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: any[]) => {});
  }
}

// Cleanup the matter environment
rmSync(HOMEDIR, { recursive: true, force: true });

describe('MutableDevice', () => {
  const environment = Environment.default;
  let server: ServerNode<ServerNode.RootEndpoint>;
  let aggregator: Endpoint<AggregatorEndpoint>;
  let device: MatterbridgeEndpoint;

  // Setup the matter environment
  environment.vars.set('log.level', MatterLogLevel.DEBUG);
  environment.vars.set('log.format', MatterLogFormat.ANSI);
  environment.vars.set('path.root', HOMEDIR);
  environment.vars.set('runtime.signals', false);
  environment.vars.set('runtime.exitcode', false);

  const mockLog = {
    fatal: jest.fn((message: string, ...parameters: any[]) => {}),
    error: jest.fn((message: string, ...parameters: any[]) => {}),
    warn: jest.fn((message: string, ...parameters: any[]) => {}),
    notice: jest.fn((message: string, ...parameters: any[]) => {}),
    info: jest.fn((message: string, ...parameters: any[]) => {}),
    debug: jest.fn((message: string, ...parameters: any[]) => {}),
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
    matterbridgeVersion: '3.0.0',
    log: new AnsiLogger({ logName: 'Matterbridge', logTimestampFormat: TimestampFormat.TIME_MILLIS, logLevel: LogLevel.DEBUG }),
    getDevices: jest.fn(() => {
      return [];
    }),
    getPlugins: jest.fn(() => {
      return [];
    }),
    addBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {}),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {}),
  } as unknown as Matterbridge;

  const subscribeAttributeSpy = jest.spyOn(MatterbridgeEndpoint.prototype, 'subscribeAttribute');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
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

  it('should initialize with an empty mutableDevice', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice).toBeInstanceOf(MutableDevice);
    expect((mutableDevice as any).matterbridge).toBe(mockMatterbridge);
    expect(mutableDevice.name()).toBe('Test Device');
    expect(mutableDevice.size()).toBe(1);
    expect((mutableDevice as any).composedType).toBeUndefined();
    expect((mutableDevice as any).configUrl).toBeUndefined();

    mutableDevice.setComposedType('Hass Device');
    expect((mutableDevice as any).composedType).toBe('Hass Device');

    mutableDevice.setConfigUrl('http://example.com/config');
    expect((mutableDevice as any).configUrl).toBe('http://example.com/config');
  });

  it('should throw error', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice).toBeInstanceOf(MutableDevice);
    expect(() => mutableDevice.get('none')).toThrow();
    expect(() => mutableDevice.getEndpoint()).toThrow();
    mutableDevice.addDeviceTypes('', bridgedNode);
    expect(mutableDevice.has('')).toBeTruthy();
    mutableDevice.addDeviceTypes('child1', onOffSwitch, dimmableSwitch, colorTemperatureSwitch);
    expect(mutableDevice.has('child1')).toBeTruthy();
    expect(mutableDevice.setFriendlyName('child1', 'Child')).toBe(mutableDevice);
    expect(() => (mutableDevice as any).createChildEndpoints()).toThrow();
    expect(() => (mutableDevice as any).createClusters('')).toThrow();
    (mutableDevice as any).createMainEndpoint();
    expect(mutableDevice.getEndpoint()).toBeDefined();
    mutableDevice.addDeviceTypes('one', temperatureSensor);
    mutableDevice.addDeviceTypes('two', temperatureSensor);
    mutableDevice.addTagLists('two', {
      mfgCode: null,
      namespaceId: 1,
      tag: 1,
      label: 'Test',
    });
    expect(() => (mutableDevice as any).createClusters('two')).toThrow();
  });

  it('should create a mutableDevice', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice).toBeInstanceOf(MutableDevice);
    expect((mutableDevice as any).matterbridge).toBe(mockMatterbridge);
    expect(mutableDevice.name()).toBe('Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode);
    const device = mutableDevice.create();
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    mutableDevice.logMutableDevice();
  });

  it('should add a BridgedDeviceBasicInformationCluster', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode);
    (mutableDevice as any).createMainEndpoint();
    mutableDevice.addBridgedDeviceBasicInformationClusterServer();

    expect(mutableDevice.has('')).toBeTruthy();
    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().tagList).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs[0].id).toBe(BridgedDeviceBasicInformation.Cluster.id);
    expect(mutableDevice.get().clusterServersObjs[0].type).toBe(BridgedDeviceBasicInformationServer);
    expect(mutableDevice.get().clusterServersObjs[0].options).toHaveProperty('uniqueId');
    mutableDevice.logMutableDevice();
  });

  it('should add a tagList', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addTagLists('', {
      mfgCode: null,
      namespaceId: 1,
      tag: 1,
      label: 'Test',
    });

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().tagList).toHaveLength(1);
    mutableDevice.logMutableDevice();
  });

  it('should add a device type', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().tagList).toHaveLength(0);
    expect(mutableDevice.get().deviceTypes).toContain(bridgedNode);
    expect(mutableDevice.get().deviceTypes).not.toContain(powerSource);
    mutableDevice.logMutableDevice();
  });

  it('should add a device types', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().tagList).toHaveLength(0);
    expect(mutableDevice.get().deviceTypes).toContain(bridgedNode);
    expect(mutableDevice.get().deviceTypes).toContain(powerSource);
    expect(mutableDevice.get().deviceTypes).not.toContain(electricalSensor);
    mutableDevice.logMutableDevice();
  });

  it('should add a cluster ids', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toContain(PowerSource.Cluster.id);
    expect(mutableDevice.get().clusterServersIds).not.toContain(BridgedDeviceBasicInformation.Cluster.id);
    mutableDevice.logMutableDevice();
  });

  it('should add a cluster objects', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id);
    mutableDevice.addClusterServerObjs('', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, {}),
    });

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(1);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
    mutableDevice.logMutableDevice();
  });

  it('should add command handler', () => {
    function mockCommandHandler(data) {
      // Mock implementation
    }

    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addCommandHandler('', 'identify', mockCommandHandler);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().commandHandlers).toHaveLength(1);
    expect(mutableDevice.get().commandHandlers[0].command).toBe('identify');
    expect(mutableDevice.get().commandHandlers[0].handler).toBe(mockCommandHandler);
    mutableDevice.logMutableDevice();
  });

  it('should add subscribe handler', () => {
    function mockSubscribeHandler(newValue, oldValue, context) {
      // Mock implementation
    }

    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addSubscribeHandler('', PowerSource.Cluster.id, 'batChargeLevel', mockSubscribeHandler);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().subscribeHandlers).toHaveLength(1);
    expect(mutableDevice.get().subscribeHandlers[0].clusterId).toBe(PowerSource.Cluster.id);
    expect(mutableDevice.get().subscribeHandlers[0].attribute).toBe('batChargeLevel');
    expect(mutableDevice.get().subscribeHandlers[0].listener).toBe(mockSubscribeHandler);
    mutableDevice.logMutableDevice();
  });

  it('should addClusterServerBooleanState', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, contactSensor);
    mutableDevice.addClusterServerBooleanState('', false);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerPowerSource', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, contactSensor);
    mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Critical, 200);
    mutableDevice.addClusterServerBatteryPowerSource('test', PowerSource.BatChargeLevel.Ok, null);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerSmokeAlarmSmokeCoAlarm', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, smokeCoAlarm);
    mutableDevice.addClusterServerSmokeAlarmSmokeCoAlarm('', SmokeCoAlarm.AlarmState.Normal);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerCoAlarmSmokeCoAlarm', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, smokeCoAlarm);
    mutableDevice.addClusterServerCoAlarmSmokeCoAlarm('', SmokeCoAlarm.AlarmState.Normal);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerColorTemperatureColorControl', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, colorTemperatureLight);
    mutableDevice.addClusterServerColorTemperatureColorControl('', 250, 153, 500);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerColorControl', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, extendedColorLight);
    mutableDevice.addClusterServerColorControl('', 250, 153, 500);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerAutoModeThermostat', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, thermostatDevice);
    mutableDevice.addClusterServerAutoModeThermostat('', 22, 18, 26, 10, 35);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerHeatingThermostat', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, thermostatDevice);
    mutableDevice.addClusterServerHeatingThermostat('', 22, 18, 10, 35);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerCoolingThermostat', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, thermostatDevice);
    mutableDevice.addClusterServerCoolingThermostat('', 22, 26, 10, 35);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addClusterServerCompleteFanControl', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, thermostatDevice);
    mutableDevice.addClusterServerCompleteFanControl('');

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);
  });

  it('should addVacuum', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, roboticVacuumCleaner);
    mutableDevice.addVacuum('');

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(3);
  });

  it('should create a MatterbridgeDevice', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addDeviceTypes('', onOffSwitch, dimmableSwitch, colorTemperatureSwitch);
    mutableDevice.addDeviceTypes('', onOffOutlet, dimmableOutlet);
    mutableDevice.addDeviceTypes('', onOffLight, dimmableLight, colorTemperatureLight, extendedColorLight);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id, OnOff.Cluster.id);
    mutableDevice.addClusterServerObjs('', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: false }),
    });

    expect(mutableDevice.get().deviceTypes).toHaveLength(13);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(3);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    expect(mutableDevice.get().deviceTypes).toHaveLength(5);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(1);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(2); // OnOff and BridgedDeviceBasicInformation

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual([
      'MA-bridgedNode',
      'MA-powerSource',
      'MA-colortemperatureswitch',
      'MA-dimmablepluginunit',
      'MA-extendedcolorlight',
    ]);
    expect(device.getAllClusterServerNames()).toEqual([
      'descriptor',
      'matterbridge',
      'onOff',
      'bridgedDeviceBasicInformation',
      'powerSource',
      'identify',
      'groups',
      'levelControl',
      'colorControl',
    ]);
  });

  it('should create a MatterbridgeDevice without server mode', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');

    mutableDevice.addDeviceTypes('', bridgedNode, powerSource, onOffSwitch);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id, OnOff.Cluster.id);

    expect(mutableDevice.get().deviceTypes).toHaveLength(3);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(2);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(0);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    expect(device.deviceTypes.get(bridgedNode.code)).toBeDefined();
    expect(device.deviceTypes.get(powerSource.code)).toBeDefined();
    expect(device.deviceTypes.get(onOffSwitch.code)).toBeDefined();
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'bridgedDeviceBasicInformation', 'powerSource', 'onOff', 'identify']);
  });

  it('should create a MatterbridgeDevice with server mode', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.setMode('server');

    mutableDevice.addDeviceTypes('', bridgedNode, powerSource, onOffSwitch);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id, OnOff.Cluster.id);

    expect(mutableDevice.get().deviceTypes).toHaveLength(3);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(2);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(0);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    expect(device.deviceTypes.get(bridgedNode.code)).toBeUndefined();
    expect(device.deviceTypes.get(powerSource.code)).toBeDefined();
    expect(device.deviceTypes.get(onOffSwitch.code)).toBeDefined();
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'powerSource', 'onOff', 'identify']);
  });

  it('should create a simple fan device', async () => {
    const subscribeHandler = jest.fn((newValue, oldValue, context, endpointName, clusterId, attribute) => {});

    // setDebug(true);

    const mutableDevice = new MutableDevice(mockMatterbridge, 'Simple Fan Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource, fanDevice);
    mutableDevice.addSubscribeHandler('', FanControl.Cluster.id, 'fanMode', subscribeHandler);
    mutableDevice.addSubscribeHandler('', FanControl.Cluster.id, 'percentSetting', subscribeHandler);
    mutableDevice.addSubscribeHandler('', FanControl.Cluster.id, 'rockSetting', subscribeHandler);
    mutableDevice.addSubscribeHandler('', FanControl.Cluster.id, 'airflowDirection', subscribeHandler);

    expect(mutableDevice.get().deviceTypes).toHaveLength(3);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(0);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    mutableDevice.logMutableDevice();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(2);

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode', 'MA-powerSource', 'MA-fan']);
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'bridgedDeviceBasicInformation', 'powerSource', 'identify', 'groups', 'fanControl']);
    expect(device.getChildEndpoints().length).toBe(0);

    expect(await aggregator.add(device)).toBe(device);

    expect(subscribeHandler).toHaveBeenCalledTimes(0);
    await device.setAttribute(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Auto);
    await device.setAttribute(FanControl.Cluster.id, 'percentSetting', 50);
    expect(subscribeHandler).toHaveBeenCalledTimes(2);

    // setDebug(false);
  });

  it('should create a composed complete fan device', async () => {
    const subscribeHandler = jest.fn((newValue, oldValue, context, endpointName, clusterId, attribute) => {});

    // setDebug(true);
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Complete Fan Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);

    mutableDevice.addDeviceTypes('fan', fanDevice);
    mutableDevice.addClusterServerCompleteFanControl('fan');
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'fanMode', subscribeHandler);
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'percentSetting', subscribeHandler);
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'rockSetting', subscribeHandler);
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'airflowDirection', subscribeHandler);
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'windSetting', subscribeHandler); // WindSetting is not only available in complete mode

    expect(mutableDevice.get('').deviceTypes).toHaveLength(2);
    expect(mutableDevice.get('fan').deviceTypes).toHaveLength(1);
    expect(mutableDevice.get('fan').clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get('fan').clusterServersObjs).toHaveLength(1);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    mutableDevice.logMutableDevice();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(4);

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode', 'MA-powerSource']);
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'bridgedDeviceBasicInformation', 'powerSource']);
    expect(device.getChildEndpoints().length).toBe(1);

    // Verify child endpoint exists and retains its clusters
    const childEndpoint = mutableDevice.getEndpoint('fan');
    expect(childEndpoint).toBeDefined();
    expect(Array.from(childEndpoint.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-fan']);
    expect(childEndpoint.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'fanControl', 'identify', 'groups']);

    expect(await aggregator.add(device)).toBe(device);

    expect(subscribeHandler).toHaveBeenCalledTimes(0);
    await childEndpoint.setAttribute(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Auto);
    await childEndpoint.setAttribute(FanControl.Cluster.id, 'percentSetting', 50);
    expect(subscribeHandler).toHaveBeenCalledTimes(2);

    // setDebug(false);
  });

  it('should create a composed complete fan device and remap', async () => {
    const subscribeHandler = jest.fn((newValue, oldValue, context, endpointName, clusterId, attribute) => {});

    // setDebug(true);
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Complete Fan Device Remap');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);

    mutableDevice.addDeviceTypes('fan', fanDevice);
    mutableDevice.addClusterServerCompleteFanControl('fan');
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'fanMode', subscribeHandler);
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'percentSetting', subscribeHandler);
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'rockSetting', subscribeHandler);
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'airflowDirection', subscribeHandler);
    mutableDevice.addSubscribeHandler('fan', FanControl.Cluster.id, 'windSetting', subscribeHandler); // WindSetting is not only available in complete mode

    expect(mutableDevice.get('').deviceTypes).toHaveLength(2);
    expect(mutableDevice.get('fan').deviceTypes).toHaveLength(1);
    expect(mutableDevice.get('fan').clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get('fan').clusterServersObjs).toHaveLength(1);

    const device = mutableDevice.create(true);
    expect(device).toBeDefined();
    mutableDevice.logMutableDevice();
    expect(subscribeAttributeSpy).toHaveBeenCalledTimes(4);

    // Verify the remap
    expect(mutableDevice.size()).toBe(1);
    expect(mutableDevice.getEndpoints().size).toBe(1);
    expect(Array.from(mutableDevice.getRemappedEndpoints())).toEqual(['fan']);

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode', 'MA-powerSource', 'MA-fan']);
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'fanControl', 'bridgedDeviceBasicInformation', 'identify', 'groups', 'powerSource']);
    expect(device.getChildEndpoints().length).toBe(0);

    expect(await aggregator.add(device)).toBe(device);

    expect(subscribeHandler).toHaveBeenCalledTimes(0);
    await device.setAttribute(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Auto);
    await device.setAttribute(FanControl.Cluster.id, 'percentSetting', 50);
    expect(subscribeHandler).toHaveBeenCalledTimes(2);

    // setDebug(false);
  });

  it('should create a MatterbridgeDevice without superset device types', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addDeviceTypes('', onOffSwitch, colorTemperatureSwitch);
    mutableDevice.addDeviceTypes('', onOffOutlet, dimmableOutlet);
    mutableDevice.addDeviceTypes('', onOffLight, colorTemperatureLight, extendedColorLight);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id, OnOff.Cluster.id);
    mutableDevice.addClusterServerObjs('', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: false }),
    });

    expect(mutableDevice.get().deviceTypes).toHaveLength(11);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(3);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    expect(mutableDevice.size()).toBe(1);
    expect(mutableDevice.getEndpoints().size).toBe(1);
    expect(mutableDevice.get().deviceTypes).toHaveLength(5);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(1);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(2); // OnOff and BridgedDeviceBasicInformation

    expect(Object.keys(device.behaviors.supported)).toHaveLength(9); // ["descriptor", "matterbridge", "onOff", "bridgedDeviceBasicInformation", "powerSource", "identify", "groups", "levelControl", "colorControl"]
    expect(device.hasClusterServer(BridgedDeviceBasicInformationCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(DescriptorCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(PowerSourceCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(IdentifyCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(GroupsCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(OnOffCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(LevelControlCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(ColorControlCluster.id)).toBeTruthy();
  });

  it('should create a MatterbridgeDevice without superset device types II', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addDeviceTypes('', onOffSwitch, colorTemperatureSwitch);
    mutableDevice.addDeviceTypes('', onOffOutlet, dimmableOutlet);
    mutableDevice.addDeviceTypes('', onOffLight, extendedColorLight);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id, OnOff.Cluster.id);
    mutableDevice.addClusterServerObjs('', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: false }),
    });

    expect(mutableDevice.get().deviceTypes).toHaveLength(10);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(3);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    expect(mutableDevice.size()).toBe(1);
    expect(mutableDevice.getEndpoints().size).toBe(1);
    expect(mutableDevice.get().deviceTypes).toHaveLength(5);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(1);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(2); // OnOff and BridgedDeviceBasicInformation

    expect(Object.keys(device.behaviors.supported)).toHaveLength(9); // ["descriptor", "matterbridge", "onOff", "bridgedDeviceBasicInformation", "powerSource", "identify", "groups", "levelControl", "colorControl"]
    expect(device.hasClusterServer(BridgedDeviceBasicInformationCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(DescriptorCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(PowerSourceCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(IdentifyCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(GroupsCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(OnOffCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(LevelControlCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(ColorControlCluster.id)).toBeTruthy();
  });

  it('should create a MatterbridgeDevice without superset device types III', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addDeviceTypes('', onOffSwitch, colorTemperatureSwitch);
    mutableDevice.addDeviceTypes('', onOffOutlet, dimmableOutlet);
    mutableDevice.addDeviceTypes('', dimmableLight, extendedColorLight);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id, OnOff.Cluster.id);
    mutableDevice.addClusterServerObjs('', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: false }),
    });

    expect(mutableDevice.get().deviceTypes).toHaveLength(10);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(3);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    expect(mutableDevice.get().deviceTypes).toHaveLength(5);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(1);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(2); // OnOff and BridgedDeviceBasicInformation

    expect(Object.keys(device.behaviors.supported)).toHaveLength(9); // ["descriptor", "matterbridge", "onOff", "bridgedDeviceBasicInformation", "powerSource", "identify", "groups", "levelControl", "colorControl"]
    expect(device.hasClusterServer(BridgedDeviceBasicInformationCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(DescriptorCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(PowerSourceCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(IdentifyCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(GroupsCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(OnOffCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(LevelControlCluster.id)).toBeTruthy();
    expect(device.hasClusterServer(ColorControlCluster.id)).toBeTruthy();
  });

  it('should create a MatterbridgeDevice with child endpoint', async () => {
    const commandHandler = jest.fn(async (data, endpointName, command) => {});
    const subscribeHandler = jest.fn((newValue, oldValue, context, endpointName, clusterId, attribute) => {});

    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device', '01233456789abcdef');
    mutableDevice.setComposedType('Hass Device');
    mutableDevice.setConfigUrl('http://example.com/config');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource, onOffLight, dimmableLight, colorTemperatureLight, extendedColorLight);
    mutableDevice.addCommandHandler('', 'identify', commandHandler);
    mutableDevice.addSubscribeHandler('', OnOff.Cluster.id, 'onOff', subscribeHandler);

    expect(mutableDevice.get().deviceTypes).toHaveLength(6);
    expect(mutableDevice.get().tagList).toHaveLength(0);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(0);
    expect(mutableDevice.get().commandHandlers).toHaveLength(1);
    expect(mutableDevice.get().subscribeHandlers).toHaveLength(1);

    mutableDevice.setFriendlyName('child1', 'Child 1');
    mutableDevice.addDeviceTypes('child1', onOffSwitch, dimmableSwitch, colorTemperatureSwitch);
    mutableDevice.addClusterServerIds('child1', OnOff.Cluster.id);
    mutableDevice.addClusterServerObjs(
      'child1',
      {
        id: OnOff.Cluster.id,
        type: OnOffServer,
        options: optionsFor(OnOffServer, { onOff: false }),
      },
      {
        id: LevelControl.Cluster.id,
        type: LevelControlServer,
        options: optionsFor(LevelControlServer, { currentLevel: 100 }),
      },
    );
    mutableDevice.addCommandHandler('child1', 'identify', commandHandler);
    mutableDevice.addSubscribeHandler('child1', OnOff.Cluster.id, 'onOff', subscribeHandler);

    expect(mutableDevice.get('child1').deviceTypes).toHaveLength(3);
    expect(mutableDevice.get('child1').tagList).toHaveLength(0);
    expect(mutableDevice.get('child1').clusterServersIds).toHaveLength(1);
    expect(mutableDevice.get('child1').clusterServersObjs).toHaveLength(2);
    expect(mutableDevice.get('child1').commandHandlers).toHaveLength(1);
    expect(mutableDevice.get('child1').subscribeHandlers).toHaveLength(1);

    mutableDevice.setFriendlyName('child2', 'Child 2');
    mutableDevice.addDeviceTypes('child2', onOffOutlet);
    mutableDevice.addClusterServerObjs('child2', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: false }),
    });
    mutableDevice.addTagLists('child2', {
      mfgCode: null,
      namespaceId: 1,
      tag: 1,
      label: 'Test',
    });
    mutableDevice.addCommandHandler('child2', 'identify', commandHandler);
    mutableDevice.addSubscribeHandler('child2', OnOff.Cluster.id, 'onOff', subscribeHandler);

    expect(mutableDevice.get('child2').deviceTypes).toHaveLength(1);
    expect(mutableDevice.get('child2').tagList).toHaveLength(1);
    expect(mutableDevice.get('child2').clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get('child2').clusterServersObjs).toHaveLength(1);
    expect(mutableDevice.get('child2').commandHandlers).toHaveLength(1);
    expect(mutableDevice.get('child2').subscribeHandlers).toHaveLength(1);

    const device = mutableDevice.create();
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    expect(device.configUrl).toBe('http://example.com/config');
    expect(mutableDevice.size()).toBe(3);
    expect(mutableDevice.getEndpoints().size).toBe(3);
    await aggregator.add(device);

    expect(mutableDevice.get().deviceTypes).toHaveLength(3);
    expect(mutableDevice.get().tagList).toHaveLength(0);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1); // BridgedDeviceBasicInformation
    expect(mutableDevice.get().commandHandlers).toHaveLength(1);
    expect(mutableDevice.get().subscribeHandlers).toHaveLength(1);
    expect(Object.keys(device.behaviors.supported)).toEqual([
      'descriptor',
      'matterbridge',
      'bridgedDeviceBasicInformation',
      'powerSource',
      'identify',
      'groups',
      'onOff',
      'levelControl',
      'colorControl',
      'fixedLabel',
    ]);
    expect(device.hasClusterServer(Descriptor.Cluster.id)).toBeTruthy();
    expect(device.hasClusterServer(BridgedDeviceBasicInformation.Cluster.id)).toBeTruthy();
    expect(device.hasClusterServer(PowerSource.Cluster.id)).toBeTruthy();
    expect(device.hasClusterServer(FixedLabel.Cluster.id)).toBeTruthy();
    expect(device.getChildEndpoints()).toHaveLength(2);

    expect(mutableDevice.get('child1').deviceTypes).toHaveLength(1);
    expect(mutableDevice.get('child1').tagList).toHaveLength(0);
    expect(mutableDevice.get('child1').clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get('child1').clusterServersObjs).toHaveLength(2);
    expect(mutableDevice.get('child1').commandHandlers).toHaveLength(1);
    expect(mutableDevice.get('child1').subscribeHandlers).toHaveLength(1);
    expect(Object.keys(mutableDevice.getEndpoint('child1').behaviors.supported)).toEqual([
      'descriptor',
      'matterbridge',
      'onOff',
      'levelControl',
      'identify',
      'groups',
      'colorControl',
    ]);

    expect(mutableDevice.get('child2').deviceTypes).toHaveLength(1);
    expect(mutableDevice.get('child2').tagList).toHaveLength(1);
    expect(mutableDevice.get('child2').clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get('child2').clusterServersObjs).toHaveLength(1);
    expect(mutableDevice.get('child2').commandHandlers).toHaveLength(1);
    expect(mutableDevice.get('child2').subscribeHandlers).toHaveLength(1);
    expect(Object.keys(mutableDevice.getEndpoint('child2').behaviors.supported)).toEqual(['descriptor', 'matterbridge', 'onOff', 'identify', 'groups']);

    expect(mutableDevice.getEndpoint()).toBeDefined();
    expect(mutableDevice.getEndpoint('child1')).toBeDefined();
    expect(mutableDevice.getEndpoint('child2')).toBeDefined();

    jest.clearAllMocks();
    await mutableDevice.getEndpoint('').executeCommandHandler('identify', { identifyTime: 10 });
    expect(commandHandler).toHaveBeenCalledWith({ endpoint: undefined, cluster: undefined, attributes: undefined, request: { identifyTime: 10 } }, '', 'identify');

    jest.clearAllMocks();
    await mutableDevice.getEndpoint('child1').executeCommandHandler('identify', { identifyTime: 10 });
    expect(commandHandler).toHaveBeenCalledWith({ endpoint: undefined, cluster: undefined, attributes: undefined, request: { identifyTime: 10 } }, 'child1', 'identify');

    jest.clearAllMocks();
    await mutableDevice.getEndpoint('child2').executeCommandHandler('identify', { identifyTime: 10 });
    expect(commandHandler).toHaveBeenCalledWith({ endpoint: undefined, cluster: undefined, attributes: undefined, request: { identifyTime: 10 } }, 'child2', 'identify');

    jest.clearAllMocks();
    await invokeSubscribeHandler(mutableDevice.getEndpoint(), OnOff.Cluster.id, 'onOff', false, true);
    expect(subscribeHandler).toHaveBeenCalledWith(false, true, expect.anything(), '', OnOff.Cluster.id, 'onOff');

    jest.clearAllMocks();
    await invokeSubscribeHandler(mutableDevice.getEndpoint('child1'), OnOff.Cluster.id, 'onOff', false, true);
    expect(subscribeHandler).toHaveBeenCalledWith(false, true, expect.anything(), 'child1', OnOff.Cluster.id, 'onOff');

    jest.clearAllMocks();
    await invokeSubscribeHandler(mutableDevice.getEndpoint('child2'), OnOff.Cluster.id, 'onOff', false, true);
    expect(subscribeHandler).toHaveBeenCalledWith(false, true, expect.anything(), 'child2', OnOff.Cluster.id, 'onOff');

    mutableDevice.logMutableDevice();
  });

  test('should remap child endpoints into main endpoint when no duplicates exist', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Remap Test Device');

    mutableDevice.addDeviceTypes('', bridgedNode);

    mutableDevice.setFriendlyName('child1', 'Child 1');
    mutableDevice.addDeviceTypes('child1', onOffLight);
    mutableDevice.addClusterServerObjs('child1', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: false }),
    });

    mutableDevice.setFriendlyName('child2', 'Child 2');
    mutableDevice.addDeviceTypes('child2', powerSource);
    mutableDevice.addClusterServerIds('child2', PowerSource.Cluster.id);

    expect(mutableDevice.size()).toBe(3); // main + 2 children before remap

    const device = mutableDevice.create(true); // remap enabled
    expect(device).toBeDefined();
    expect(mutableDevice.size()).toBe(1); // only main endpoint remains
    expect(mutableDevice.getEndpoints().size).toBe(1);
    expect(mutableDevice.getRemappedEndpoints().size).toBe(2);
    expect(Array.from(mutableDevice.getRemappedEndpoints())).toEqual(['child1', 'child2']);

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode', 'MA-onofflight', 'MA-powerSource']);
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'onOff', 'bridgedDeviceBasicInformation', 'powerSource', 'identify', 'groups']);
    expect(device.getChildEndpoints().length).toBe(0);
  });

  test('should remap child endpoints into main endpoint for climate device', () => {
    // setDebug(true);
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Remap Climate Device');

    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Ok, 200);

    mutableDevice.addDeviceTypes('temperature', temperatureSensor);
    mutableDevice.addClusterServerIds('temperature', TemperatureMeasurement.Cluster.id);
    mutableDevice.setFriendlyName('temperature', 'Temperature Sensor');

    mutableDevice.addDeviceTypes('humidity', humiditySensor);
    mutableDevice.addClusterServerIds('humidity', RelativeHumidityMeasurement.Cluster.id);
    mutableDevice.setFriendlyName('humidity', 'Humidity Sensor');

    mutableDevice.addDeviceTypes('pressure', pressureSensor);
    mutableDevice.addClusterServerIds('pressure', PressureMeasurement.Cluster.id);
    mutableDevice.setFriendlyName('pressure', 'Pressure Sensor');

    expect(mutableDevice.size()).toBe(4);
    const device = mutableDevice.create(true);
    expect(device).toBeDefined();
    expect(mutableDevice.size()).toBe(1);
    expect(mutableDevice.getEndpoints().size).toBe(1);
    expect(mutableDevice.getRemappedEndpoints().size).toBe(3);
    expect(Array.from(mutableDevice.getRemappedEndpoints())).toEqual(['temperature', 'humidity', 'pressure']);

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode', 'MA-powerSource', 'MA-tempsensor', 'MA-humiditysensor', 'MA-pressuresensor']);
    expect(device.getAllClusterServerNames()).toEqual([
      'descriptor',
      'matterbridge',
      'powerSource',
      'bridgedDeviceBasicInformation',
      'identify',
      'temperatureMeasurement',
      'relativeHumidityMeasurement',
      'pressureMeasurement',
    ]);
    expect(device.getChildEndpoints().length).toBe(0);
    // setDebug(false);
  });

  test('should partially remap child endpoints into main endpoint for climate device', () => {
    // setDebug(true);
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Remap Climate Device');

    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addClusterServerBatteryPowerSource('', PowerSource.BatChargeLevel.Ok, 200);

    mutableDevice.addDeviceTypes('temperature', temperatureSensor);
    mutableDevice.addClusterServerIds('temperature', TemperatureMeasurement.Cluster.id);
    mutableDevice.setFriendlyName('temperature', 'Temperature Sensor');

    mutableDevice.addDeviceTypes('humidity', humiditySensor);
    mutableDevice.addClusterServerIds('humidity', RelativeHumidityMeasurement.Cluster.id);
    mutableDevice.setFriendlyName('humidity', 'Humidity Sensor');

    mutableDevice.addDeviceTypes('pressure', pressureSensor);
    mutableDevice.addClusterServerIds('pressure', PressureMeasurement.Cluster.id);
    mutableDevice.setFriendlyName('pressure', 'Pressure Sensor');

    mutableDevice.addDeviceTypes('temperature out', temperatureSensor);
    mutableDevice.addClusterServerIds('temperature out', TemperatureMeasurement.Cluster.id);
    mutableDevice.setFriendlyName('temperature out', 'Temperature Out Sensor');

    expect(mutableDevice.size()).toBe(5);
    const device = mutableDevice.create(true);
    expect(device).toBeDefined();
    expect(mutableDevice.size()).toBe(3);
    expect(mutableDevice.getEndpoints().size).toBe(3);
    expect(mutableDevice.getRemappedEndpoints().size).toBe(2);
    expect(Array.from(mutableDevice.getRemappedEndpoints())).toEqual(['humidity', 'pressure']);

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode', 'MA-powerSource', 'MA-humiditysensor', 'MA-pressuresensor']);
    expect(device.getAllClusterServerNames()).toEqual([
      'descriptor',
      'matterbridge',
      'powerSource',
      'bridgedDeviceBasicInformation',
      'identify',
      'relativeHumidityMeasurement',
      'pressureMeasurement',
    ]);
    expect(device.getChildEndpoints().length).toBe(2);

    // Verify temperature endpoint exists and retains its clusters
    const childEndpoint = mutableDevice.getEndpoint('temperature');
    expect(childEndpoint).toBeDefined();
    expect(Array.from(childEndpoint.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-tempsensor']);
    expect(childEndpoint.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'identify', 'temperatureMeasurement']);

    // Verify temperature endpoint exists and retains its clusters
    const childEndpoint2 = mutableDevice.getEndpoint('temperature out');
    expect(childEndpoint2).toBeDefined();
    expect(Array.from(childEndpoint2.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-tempsensor']);
    expect(childEndpoint2.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'identify', 'temperatureMeasurement']);

    // setDebug(false);
  });

  test('should NOT remap child endpoint when duplicate device types exist in main', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'No Remap Duplicate Device Types');

    mutableDevice.addDeviceTypes('', bridgedNode, onOffLight);

    mutableDevice.addDeviceTypes('child1', onOffLight);
    mutableDevice.addClusterServerObjs('child1', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: true }),
    });
    mutableDevice.setFriendlyName('child1', 'Child 1');

    expect(mutableDevice.size()).toBe(2); // main + child before remap
    const device = mutableDevice.create(true);
    expect(device).toBeDefined();
    expect(mutableDevice.size()).toBe(2); // child1 should remain because of duplicate device type
    expect(mutableDevice.getEndpoints().size).toBe(2);
    expect(mutableDevice.getRemappedEndpoints().size).toBe(0);
    expect(mutableDevice.has('child1')).toBeTruthy();

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode', 'MA-onofflight']);
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'bridgedDeviceBasicInformation', 'identify', 'groups', 'onOff']);

    // Verify child endpoint exists and retains its clusters
    const childEndpoint = mutableDevice.getEndpoint('child1');
    expect(childEndpoint).toBeDefined();
    expect(Array.from(childEndpoint.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-onofflight']);
    expect(childEndpoint.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'onOff', 'identify', 'groups']);
  });

  test('should NOT remap child endpoint when duplicate cluster server ids exist', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'No Remap Duplicate ClusterId');
    // Main endpoint: only bridgedNode + OnOff cluster id
    mutableDevice.addDeviceTypes('', bridgedNode);
    mutableDevice.addClusterServerIds('', OnOff.Cluster.id);
    // Child endpoint: unique device type (powerSource) but duplicate OnOff cluster id
    mutableDevice.setFriendlyName('child1', 'Child 1');
    mutableDevice.addDeviceTypes('child1', powerSource);
    mutableDevice.addClusterServerIds('child1', OnOff.Cluster.id);

    expect(mutableDevice.size()).toBe(2);
    const device = mutableDevice.create(true);
    expect(device).toBeDefined();
    expect(mutableDevice.size()).toBe(2); // Remap should be blocked by duplicate cluster server id
    expect(mutableDevice.getEndpoints().size).toBe(2);
    expect(mutableDevice.getRemappedEndpoints().size).toBe(0);
    expect(mutableDevice.has('child1')).toBeTruthy();

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode']);
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'bridgedDeviceBasicInformation', 'onOff']);

    // Verify child endpoint exists and retains its clusters
    const childEndpoint = mutableDevice.getEndpoint('child1');
    expect(childEndpoint).toBeDefined();
    expect(Array.from(childEndpoint.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-powerSource']);
    expect(childEndpoint.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'powerSource', 'onOff']);
  });

  test('should NOT remap child endpoint when duplicate cluster server objects exist', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Remap Duplicate ClusterObj');

    mutableDevice.addDeviceTypes('', bridgedNode);
    mutableDevice.addClusterServerObjs('', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: false }),
    });

    mutableDevice.setFriendlyName('child1', 'Child 1');
    mutableDevice.addDeviceTypes('child1', powerSource);
    mutableDevice.addClusterServerObjs('child1', {
      id: OnOff.Cluster.id,
      type: OnOffServer,
      options: optionsFor(OnOffServer, { onOff: true }),
    });

    expect(mutableDevice.size()).toBe(2);
    const device = mutableDevice.create(true);
    expect(device).toBeDefined();
    expect(mutableDevice.size()).toBe(2); // Remap should be blocked by duplicate cluster server object id
    expect(mutableDevice.getEndpoints().size).toBe(2);
    expect(mutableDevice.getRemappedEndpoints().size).toBe(0);
    expect(mutableDevice.has('child1')).toBeTruthy();

    // Verify main endpoint
    expect(Array.from(device.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-bridgedNode']);
    expect(device.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'onOff', 'bridgedDeviceBasicInformation']);

    // Verify child endpoint exists and retains its clusters
    const childEndpoint = mutableDevice.getEndpoint('child1');
    expect(childEndpoint).toBeDefined();
    expect(Array.from(childEndpoint.deviceTypes.values()).map((d) => d.name)).toEqual(['MA-powerSource']);
    expect(childEndpoint.getAllClusterServerNames()).toEqual(['descriptor', 'matterbridge', 'onOff', 'powerSource']);
  });

  test('close the server node', async () => {
    expect(server).toBeDefined();
    expect(server.lifecycle.isReady).toBeTruthy();
    expect(server.lifecycle.isOnline).toBeTruthy();
    await server.close();
    expect(server.lifecycle.isReady).toBeTruthy();
    expect(server.lifecycle.isOnline).toBeFalsy();
    await new Promise((resolve) => setTimeout(resolve, 250));
  });

  test('stop the mDNS service', async () => {
    expect(server).toBeDefined();
    await server.env.get(MdnsService)[Symbol.asyncDispose]();
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
});
