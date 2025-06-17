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
} from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
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
  const mockLog = {
    fatal: jest.fn((message: string, ...parameters: any[]) => {}),
    error: jest.fn((message: string, ...parameters: any[]) => {}),
    warn: jest.fn((message: string, ...parameters: any[]) => {}),
    notice: jest.fn((message: string, ...parameters: any[]) => {}),
    info: jest.fn((message: string, ...parameters: any[]) => {}),
    debug: jest.fn((message: string, ...parameters: any[]) => {}),
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
    matterbridgeVersion: '2.1.0',
    log: mockLog,
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

  it('should initialize with an empty mutableDevice', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    expect(mutableDevice).toBeInstanceOf(MutableDevice);
    expect((mutableDevice as any).matterbridge).toBe(mockMatterbridge);
    expect(mutableDevice.deviceName).toBe('Test Device');
    expect(mutableDevice.composedType).toBeUndefined();
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
  });

  it('should add a device type', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().tagList).toHaveLength(0);
    expect(mutableDevice.get().deviceTypes).toContain(bridgedNode);
    expect(mutableDevice.get().deviceTypes).not.toContain(powerSource);
  });

  it('should add a device types', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().tagList).toHaveLength(0);
    expect(mutableDevice.get().deviceTypes).toContain(bridgedNode);
    expect(mutableDevice.get().deviceTypes).toContain(powerSource);
    expect(mutableDevice.get().deviceTypes).not.toContain(electricalSensor);
  });

  it('should add a cluster ids', () => {
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);
    mutableDevice.addClusterServerIds('', PowerSource.Cluster.id);

    expect(mutableDevice.get()).toBeDefined();
    expect(mutableDevice.get().clusterServersIds).toContain(PowerSource.Cluster.id);
    expect(mutableDevice.get().clusterServersIds).not.toContain(BridgedDeviceBasicInformation.Cluster.id);
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
    const mutableDevice = new MutableDevice(mockMatterbridge, 'Test Device');

    mutableDevice.composedType = 'Switch';
    mutableDevice.addDeviceTypes('', bridgedNode, powerSource);

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
    expect(mutableDevice.get('child1').deviceTypes).toHaveLength(3);
    expect(mutableDevice.get('child1').clusterServersIds).toHaveLength(1);
    expect(mutableDevice.get('child1').clusterServersObjs).toHaveLength(2);

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
    expect(mutableDevice.get('child2').deviceTypes).toHaveLength(1);
    expect(mutableDevice.get('child2').clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get('child2').clusterServersObjs).toHaveLength(1);

    const device = await mutableDevice.create();
    expect(device).toBeDefined();

    expect(mutableDevice.get().deviceTypes).toHaveLength(2);
    expect(mutableDevice.get().clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get().clusterServersObjs).toHaveLength(1); // BridgedDeviceBasicInformation
    expect(Object.keys(device.behaviors.supported)).toHaveLength(5); // ["descriptor", "matterbridge", "bridgedDeviceBasicInformation", "powerSource", "fixedLabel"]
    expect(device.hasClusterServer(Descriptor.Cluster.id)).toBeTruthy();
    expect(device.hasClusterServer(BridgedDeviceBasicInformation.Cluster.id)).toBeTruthy();
    expect(device.hasClusterServer(PowerSource.Cluster.id)).toBeTruthy();
    expect(device.hasClusterServer(FixedLabel.Cluster.id)).toBeTruthy();
    expect(device.getChildEndpoints()).toHaveLength(2);

    expect(mutableDevice.get('child1').deviceTypes).toHaveLength(1);
    expect(mutableDevice.get('child1').clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get('child1').clusterServersObjs).toHaveLength(2);
    expect(Object.keys(mutableDevice.getEndpoint('child1').behaviors.supported)).toHaveLength(7); // ["descriptor", "matterbridge", "onOff", "levelControl", "identify", "groups", "colorControl"]

    expect(mutableDevice.get('child2').deviceTypes).toHaveLength(1);
    expect(mutableDevice.get('child2').clusterServersIds).toHaveLength(0);
    expect(mutableDevice.get('child2').clusterServersObjs).toHaveLength(1);
    expect(Object.keys(mutableDevice.getEndpoint('child2').behaviors.supported)).toHaveLength(5); // ["descriptor", "matterbridge", "onOff", "identify", "groups"]

    expect(mutableDevice.getEndpoint()).toBeDefined();
    expect(mutableDevice.getEndpoint('child1')).toBeDefined();
    expect(mutableDevice.getEndpoint('child2')).toBeDefined();
    mutableDevice.logMutableDevice();
  });
});
