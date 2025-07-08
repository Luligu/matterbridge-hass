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

describe('MutableDevice', () => {
  const environment = Environment.default;
  let server: ServerNode<ServerNode.RootEndpoint>;
  let aggregator: Endpoint<AggregatorEndpoint>;
  let device: MatterbridgeEndpoint;

  // Cleanup the matter environment
  rmSync(HOMEDIR, { recursive: true, force: true });

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
    expect(mutableDevice.deviceName).toBe('Test Device');
    expect(mutableDevice.composedType).toBeUndefined();
    expect(mutableDevice.configUrl).toBeUndefined();

    mutableDevice.setComposedType('Hass Device');
    expect(mutableDevice.composedType).toBe('Hass Device');

    mutableDevice.setConfigUrl('http://example.com/config');
    expect(mutableDevice.configUrl).toBe('http://example.com/config');
  });

  it('should throw error', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice).toBeInstanceOf(MutableDevice);
    expect(() => mutableDevice.get('none')).toThrow();
    expect(() => mutableDevice.getEndpoint()).toThrow();
    await expect(mutableDevice.createChildEndpoint('none')).rejects.toThrow();
    mutableDevice.addDeviceTypes('', bridgedNode);
    expect(mutableDevice.has('')).toBeTruthy();
    mutableDevice.addDeviceTypes('child1', onOffSwitch, dimmableSwitch, colorTemperatureSwitch);
    expect(mutableDevice.has('child1')).toBeTruthy();
    expect(mutableDevice.setFriendlyName('child1', 'Child')).toBe(mutableDevice);
    await expect(mutableDevice.createChildEndpoints()).rejects.toThrow();
    await expect(mutableDevice.createClusters('')).rejects.toThrow();
    await mutableDevice.createMainEndpoint();
    await expect(mutableDevice.createChildEndpoint('none')).rejects.toThrow();
    expect(mutableDevice.getEndpoint()).toBeDefined();
    // await expect(mutableDevice.createClusters('')).rejects.toThrow();
    mutableDevice.addDeviceTypes('one', temperatureSensor);
    expect(await mutableDevice.createChildEndpoint('one')).toBeDefined();
    mutableDevice.addDeviceTypes('two', temperatureSensor);
    mutableDevice.addTagLists('two', {
      mfgCode: null,
      namespaceId: 1,
      tag: 1,
      label: 'Test',
    });
    await expect(mutableDevice.createClusters('two')).rejects.toThrow();
    expect(await mutableDevice.createChildEndpoint('two')).toBeDefined();
  });

  it('should create a mutableDevice', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice).toBeInstanceOf(MutableDevice);
    expect((mutableDevice as any).matterbridge).toBe(mockMatterbridge);
    expect(mutableDevice.deviceName).toBe('Test Device');
    expect(mutableDevice.composedType).toBeUndefined();

    mutableDevice.addDeviceTypes('', bridgedNode);
    const device = await mutableDevice.create();
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    mutableDevice.logMutableDevice();
  });

  it('should add a BridgedDeviceBasicInformationCluster', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode);
    await mutableDevice.createMainEndpoint();
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
    mutableDevice.addClusterServerPowerSource('', PowerSource.BatChargeLevel.Critical, 200);
    mutableDevice.addClusterServerPowerSource('test', PowerSource.BatChargeLevel.Ok, null);

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

  it('should create a MatterbridgeDevice', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice.composedType).toBeUndefined();

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

    const device = await mutableDevice.create();
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

  it('should create a MatterbridgeDevice without superset device types', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice.composedType).toBeUndefined();

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

    const device = await mutableDevice.create();
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

  it('should create a MatterbridgeDevice without superset device types II', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice.composedType).toBeUndefined();

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

    const device = await mutableDevice.create();
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

  it('should create a MatterbridgeDevice without superset device types III', async () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice.composedType).toBeUndefined();

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

    const device = await mutableDevice.create();
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

    const device = await mutableDevice.create();
    expect(device).toBeDefined();
    expect(device).toBeInstanceOf(MatterbridgeEndpoint);
    expect(device.configUrl).toBe('http://example.com/config');
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
