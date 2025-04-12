/* eslint-disable jest/no-commented-out-tests */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bridgedNode, colorTemperatureLight, dimmableOutlet, Matterbridge, MatterbridgeEndpoint, PlatformConfig } from 'matterbridge';
import { EndpointNumber } from 'matterbridge/matter/types';
import { wait } from 'matterbridge/utils';
import { AnsiLogger, BLUE, db, dn, hk, idn, LogLevel, nf, or, rs, YELLOW, CYAN, ign, wr } from 'matterbridge/logger';
import { Endpoint } from 'matterbridge/matter';
import { HomeAssistantPlatform } from './platform';
import { jest } from '@jest/globals';
import { HassConfig, HassDevice, HassEntity, HassState, HomeAssistant } from './homeAssistant';
import * as fs from 'node:fs';
import * as path from 'node:path';

const readMockHomeAssistantFile = () => {
  const filePath = path.join('mock', 'homeassistant.json');
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading or parsing moassistan.json:', error);
    return null;
  }
};

describe('HassPlatform', () => {
  const mockLog = {
    fatal: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.fatal', message, parameters);
    }),
    error: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.error', message, parameters);
    }),
    warn: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.warn', message, parameters);
    }),
    notice: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.notice', message, parameters);
    }),
    info: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.info', message, parameters);
    }),
    debug: jest.fn((message: string, ...parameters: any[]) => {
      // console.log('mockLog.debug', message, parameters);
    }),
  } as unknown as AnsiLogger;

  const mockMatterbridge = {
    matterbridgeDirectory: './jest/matterbridge',
    matterbridgePluginDirectory: './jest/plugins',
    systemInformation: { ipv4Address: undefined, ipv6Address: undefined, osRelease: 'xx.xx.xx.xx.xx.xx', nodeVersion: '22.1.10' },
    matterbridgeVersion: '2.2.6',
    edge: true,
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
      // console.log('addBridgedEndpoint called');
    }),
    removeBridgedEndpoint: jest.fn(async (pluginName: string, device: MatterbridgeEndpoint) => {
      // console.log('removeBridgedEndpoint called');
    }),
    removeAllBridgedEndpoints: jest.fn(async (pluginName: string) => {
      // console.log('removeAllBridgedEndpoints called');
    }),
  } as unknown as Matterbridge;

  const mockConfig = {
    'name': 'matterbridge-hass',
    'type': 'DynamicPlatform',
    'blackList': [],
    'whiteList': [],
    'host': 'http://homeassistant.local:8123',
    'token': 'long-lived token',
    'debug': false,
    'unregisterOnShutdown': false,
  } as PlatformConfig;

  // let mockHomeAssistant: HomeAssistant;
  let haPlatform: HomeAssistantPlatform;
  let mockMatterbridgeDevice: MatterbridgeEndpoint;
  let mockEndpoint: Endpoint;

  const mockData = readMockHomeAssistantFile();

  let loggerLogSpy: jest.SpiedFunction<(level: LogLevel, message: string, ...parameters: any[]) => void>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  jest.spyOn(Matterbridge.prototype, 'addBridgedEndpoint').mockImplementation((pluginName: string, device: MatterbridgeEndpoint) => {
    console.log(`Mocked addBridgedDevice: ${pluginName} ${device.name}`);
    return Promise.resolve();
  });
  jest.spyOn(Matterbridge.prototype, 'removeBridgedEndpoint').mockImplementation((pluginName: string, device: MatterbridgeEndpoint) => {
    // console.log(`Mocked unregisterDevice: ${pluginName} ${device.name}`);
    return Promise.resolve();
  });
  jest.spyOn(Matterbridge.prototype, 'removeAllBridgedEndpoints').mockImplementation((pluginName: string) => {
    // console.log(`Mocked removeAllBridgedDevices: ${pluginName}`);
    return Promise.resolve();
  });

  jest.spyOn(HomeAssistant.prototype, 'fetch').mockImplementation((type: string, id?: number) => {
    console.log(`Mocked fetch: ${type}`);
  });

  jest.spyOn(HomeAssistant.prototype, 'fetchAsync').mockImplementation((type: string, timeout = 5000) => {
    console.log(`Mocked fetchAsync: ${type}`);
    if (type === 'config/device_registry/list') {
      return Promise.resolve(mockData.devices);
    } else if (type === 'config/entity_registry/list') {
      return Promise.resolve(mockData.entities);
    } else if (type === 'get_states') {
      return Promise.resolve(mockData.states);
    }
    return Promise.resolve(mockData.config);
  });

  jest.spyOn(HomeAssistant.prototype, 'callService').mockImplementation((domain: string, service: string, entityId: string, serviceData: Record<string, any> = {}) => {
    console.log(`Mocked callService: domain ${domain} service ${service} entityId ${entityId}`);
  });

  const mockCallServiceAsync = jest
    .spyOn(HomeAssistant.prototype, 'callServiceAsync')
    .mockImplementation((domain: string, service: string, entityId: string, serviceData: Record<string, any> = {}, id?: number) => {
      console.log(`Mocked callServiceAsync: domain ${domain} service ${service} entityId ${entityId}`);
      return Promise.resolve({});
    });

  beforeAll(() => {
    /*
    mockHomeAssistant = {
      connect: jest.fn(),
      close: jest.fn(),
      fetchAsync: jest.fn(),
      callService: jest.fn(),
    } as unknown as HomeAssistant;
    */

    mockMatterbridgeDevice = {
      deviceName: 'Switch',
    } as unknown as MatterbridgeEndpoint;

    mockEndpoint = {
      name: 'MA-onoffswitch',
      number: undefined,
    } as unknown as Endpoint;

    // Spy on and mock the AnsiLogger.log method
    loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((level: string, message: string, ...parameters: any[]) => {
      // console.log(`Mocked log: ${level} - ${message}`, ...parameters);
    });

    // Spy on and mock console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      // console.error(`Mocked console.log: ${args}`);
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    if (haPlatform) {
      haPlatform.ha.connected = true;
      haPlatform.ha.devicesReceived = true;
      haPlatform.ha.entitiesReceived = true;
      haPlatform.ha.statesReceived = true;
      haPlatform.ha.subscribed = true;
      haPlatform.ha.hassDevices.clear();
      haPlatform.ha.hassEntities.clear();
      haPlatform.ha.hassStates.clear();
    }
  });

  afterAll(() => {
    loggerLogSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('should not initialize platform with config name', () => {
    mockConfig.host = '';
    mockConfig.token = '';
    expect(() => new HomeAssistantPlatform(mockMatterbridge, mockLog, mockConfig)).toThrow('Host and token must be defined in the configuration');
    mockConfig.host = 'http://homeassistant.local:8123';
    mockConfig.token = '';
    expect(() => new HomeAssistantPlatform(mockMatterbridge, mockLog, mockConfig)).toThrow('Host and token must be defined in the configuration');
    mockConfig.host = '';
    mockConfig.token = 'long-lived token';
    expect(() => new HomeAssistantPlatform(mockMatterbridge, mockLog, mockConfig)).toThrow('Host and token must be defined in the configuration');
  });

  it('should initialize platform with with config name', () => {
    mockConfig.host = 'http://homeassistant.local:8123';
    mockConfig.token = 'long-lived token';
    haPlatform = new HomeAssistantPlatform(mockMatterbridge, mockLog, mockConfig);
    expect(mockLog.debug).toHaveBeenCalledWith(`MatterbridgeDynamicPlatform loaded`);
  });

  it('should not initialize platform with wrong version', () => {
    mockMatterbridge.matterbridgeVersion = '1.5.5';
    expect(() => new HomeAssistantPlatform(mockMatterbridge, mockLog, mockConfig)).toThrow();
    mockMatterbridge.matterbridgeVersion = '2.2.6';
  });

  it('should validate with white and black list', () => {
    haPlatform.config.whiteList = ['white1', 'white2', 'white3'];
    haPlatform.config.blackList = ['black1', 'black2', 'black3'];
    expect(haPlatform.validateDeviceWhiteBlackList('white1')).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList('black2')).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList(['white1', 'black2'])).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList('xDevice')).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList('')).toBe(false);
  });

  it('should validate with white list', () => {
    haPlatform.config.whiteList = ['white1', 'white2', 'white3'];
    haPlatform.config.blackList = [];
    expect(haPlatform.validateDeviceWhiteBlackList('white1')).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList('black2')).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList(['white1', 'black2'])).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList('xDevice')).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList('')).toBe(false);
  });

  it('should validate with black list', () => {
    haPlatform.config.whiteList = [];
    haPlatform.config.blackList = ['black1', 'black2', 'black3'];
    expect(haPlatform.validateDeviceWhiteBlackList('whiteDevice')).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList('black1')).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList('black2')).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList('black3')).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList(['x', 'y', 'z'])).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList(['x', 'y', 'z', 'black3'])).toBe(false);
    expect(haPlatform.validateDeviceWhiteBlackList('xDevice')).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList('')).toBe(true);
  });

  it('should validate with no white and black list', () => {
    haPlatform.config.whiteList = [];
    haPlatform.config.blackList = [];
    expect(haPlatform.validateDeviceWhiteBlackList('whiteDevice')).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList(['whiteDevice', '123456'])).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList('blackDevice')).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList(['blackDevice', '123456'])).toBe(true);
    expect(haPlatform.validateDeviceWhiteBlackList('')).toBe(true);
  });

  it('should validate with entity black list', () => {
    haPlatform.config.entityBlackList = ['blackEntity'];
    haPlatform.config.deviceEntityBlackList = {};
    expect(haPlatform.validateEntityBlackList('any', 'whiteEntity')).toBe(true);
    expect(haPlatform.validateEntityBlackList('any', 'blackEntity')).toBe(false);
    expect(haPlatform.validateEntityBlackList('any', '')).toBe(true);

    haPlatform.config.entityBlackList = [];
    haPlatform.config.deviceEntityBlackList = {};
  });

  it('should validate with device entity black list and entity black list', () => {
    haPlatform.config.entityBlackList = ['blackEntity'];
    haPlatform.config.deviceEntityBlackList = { device1: ['blackEntityDevice1'] };
    expect(haPlatform.validateEntityBlackList('any', 'whiteEntity')).toBe(true);
    expect(haPlatform.validateEntityBlackList('any', 'blackEntity')).toBe(false);
    expect(haPlatform.validateEntityBlackList('any', 'blackEntityDevice1')).toBe(true);
    expect(haPlatform.validateEntityBlackList('any', '')).toBe(true);

    expect(haPlatform.validateEntityBlackList('device1', 'whiteEntity')).toBe(true);
    expect(haPlatform.validateEntityBlackList('device1', 'blackEntity')).toBe(false);
    expect(haPlatform.validateEntityBlackList('device1', 'blackEntityDevice1')).toBe(false);
    expect(haPlatform.validateEntityBlackList('device1', '')).toBe(true);

    haPlatform.config.entityBlackList = [];
    haPlatform.config.deviceEntityBlackList = {};
  });

  it('should call commandHandler', async () => {
    expect(haPlatform).toBeDefined();
    const device = new MatterbridgeEndpoint(bridgedNode, { uniqueStorageKey: 'dimmableDoubleOutlet' }, true);
    expect(device).toBeDefined();
    if (!device) return;

    const child1 = device.addChildDeviceTypeWithClusterServer('switch.switch_switch_1', [dimmableOutlet], [], { endpointId: EndpointNumber(1) });
    expect(child1).toBeDefined();
    child1.number = EndpointNumber(1);

    const child2 = device.addChildDeviceTypeWithClusterServer('switch.switch_switch_2', [dimmableOutlet], [], { endpointId: EndpointNumber(2) });
    expect(child2).toBeDefined();
    child2.number = EndpointNumber(2);

    const child3 = device.addChildDeviceTypeWithClusterServer('light.light_light_3', [colorTemperatureLight], [], { endpointId: EndpointNumber(3) });
    expect(child3).toBeDefined();
    child3.number = EndpointNumber(3);

    await haPlatform.commandHandler(device, child1, undefined, undefined, 'on');
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Received matter command ${ign}on${rs}${db} from device ${idn}${device.deviceName}${rs}${db}`),
    );
    expect(mockCallServiceAsync).toHaveBeenCalledWith('switch', 'turn_on', 'switch.switch_switch_1', undefined);

    await haPlatform.commandHandler(device, child2, undefined, undefined, 'off');
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Received matter command ${ign}off${rs}${db} from device ${idn}${device.deviceName}${rs}${db}`),
    );
    expect(mockCallServiceAsync).toHaveBeenCalledWith('switch', 'turn_off', 'switch.switch_switch_2', undefined);

    await haPlatform.commandHandler(device, child3, { level: 100 }, undefined, 'moveToLevel');
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Received matter command ${ign}moveToLevel${rs}${db} from device ${idn}${device.deviceName}${rs}${db}`),
    );
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.WARN, expect.stringContaining(`Command ${ign}moveToLevel${rs}${wr} not supported`));
    expect(mockCallServiceAsync).toHaveBeenCalledWith('light', 'turn_on', 'light.light_light_3', expect.objectContaining({ brightness: 100 }));

    await haPlatform.commandHandler(device, child3, { level: 100 }, undefined, 'moveToLevelWithOnOff');
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Received matter command ${ign}moveToLevelWithOnOff${rs}${db} from device ${idn}${device.deviceName}${rs}${db}`),
    );
    expect(loggerLogSpy).not.toHaveBeenCalledWith(LogLevel.WARN, expect.stringContaining(`Command ${ign}moveToLevelWithOnOff${rs}${wr} not supported`));
    expect(mockCallServiceAsync).toHaveBeenCalledWith('light', 'turn_on', 'light.light_light_3', expect.objectContaining({ brightness: 100 }));

    await haPlatform.commandHandler(device, child3, { colorTemperatureMireds: 300 }, undefined, 'moveToColorTemperature');
    expect(mockCallServiceAsync).toHaveBeenCalledWith('light', 'turn_on', 'light.light_light_3', expect.objectContaining({ color_temp: 300 }));

    await haPlatform.commandHandler(device, child3, { colorX: 0.5, colorY: 0.5 }, undefined, 'moveToColor');
    expect(mockCallServiceAsync).toHaveBeenCalledWith('light', 'turn_on', 'light.light_light_3', expect.objectContaining({ xy_color: [0.5, 0.5] }));

    await haPlatform.commandHandler(device, child3, { hue: 50 }, { currentSaturation: { value: 50 } }, 'moveToHue');
    expect(mockCallServiceAsync).toHaveBeenCalledWith('light', 'turn_on', 'light.light_light_3', expect.objectContaining({ hs_color: [71, 20] }));

    await haPlatform.commandHandler(device, child3, { saturation: 50 }, { currentHue: { value: 50 } }, 'moveToSaturation');
    expect(mockCallServiceAsync).toHaveBeenCalledWith('light', 'turn_on', 'light.light_light_3', expect.objectContaining({ hs_color: [71, 20] }));

    await haPlatform.commandHandler(device, child3, { hue: 50, saturation: 50 }, undefined, 'moveToHueAndSaturation');
    expect(mockCallServiceAsync).toHaveBeenCalledWith('light', 'turn_on', 'light.light_light_3', expect.objectContaining({ hs_color: [71, 20] }));

    mockCallServiceAsync.mockClear();
    await haPlatform.commandHandler(device, child2, undefined, undefined, 'unknown');
    expect(loggerLogSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      expect.stringContaining(`${db}Received matter command ${ign}unknown${rs}${db} from device ${idn}${device.deviceName}${rs}${db}`),
    );
    expect(mockCallServiceAsync).not.toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalledWith(LogLevel.WARN, expect.stringContaining(`Command ${ign}unknown${rs}${wr} not supported`));
  });

  it('should call onStart with reason', async () => {
    expect(haPlatform).toBeDefined();
    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    await wait(1000);
    expect(mockLog.debug).toHaveBeenCalledWith(`Payload successfully written to homeassistant.json`);

    /*
    mockMatterbridge.matterbridgePluginDirectory = 'none';
    await haPlatform.onStart('Test reason');
    await wait(1000);
    expect(mockLog.error).toHaveBeenCalled();
    mockMatterbridge.matterbridgePluginDirectory = 'temp';
    */
  });

  it('should receive events from ha', () => {
    haPlatform.ha.emit('connected', '2024.09.1');
    expect(mockLog.notice).toHaveBeenCalledWith(`Connected to Home Assistant 2024.09.1`);
    haPlatform.ha.emit('disconnected');
    expect(mockLog.warn).toHaveBeenCalledWith(`Disconnected from Home Assistant`);
    haPlatform.ha.emit('subscribed');
    expect(mockLog.info).toHaveBeenCalledWith(`Subscribed to Home Assistant events`);
    haPlatform.ha.emit('config', {} as unknown as HassConfig);
    expect(mockLog.info).toHaveBeenCalledWith(`Configuration received from Home Assistant`);
    haPlatform.ha.emit('states', []);
    expect(mockLog.info).toHaveBeenCalledWith(`States received from Home Assistant`);
    haPlatform.ha.emit('services', {});
    expect(mockLog.info).toHaveBeenCalledWith(`Services received from Home Assistant`);
    haPlatform.ha.emit('devices', []);
    expect(mockLog.info).toHaveBeenCalledWith(`Devices received from Home Assistant`);
    haPlatform.ha.emit('entities', []);
    expect(mockLog.info).toHaveBeenCalledWith(`Entities received from Home Assistant`);
  });

  it('should register a Scene entity', async () => {
    expect(haPlatform).toBeDefined();

    let entity: HassEntity | undefined;
    (mockData.entities as HassEntity[]).forEach((e) => {
      if (e.original_name === 'Turn off all lights') entity = e;
    });
    expect(entity).toBeDefined();
    if (!entity) return;
    haPlatform.ha.hassEntities.set(entity.id, entity);
    haPlatform.ha.hassDevices.clear();
    haPlatform.ha.hassStates.clear();

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(
      `Creating device for individual entity ${idn}${entity.original_name}${rs}${nf} domain ${CYAN}scene${nf} name ${CYAN}turn_off_all_lights${nf}`,
    );
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${entity.original_name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();
  });

  it('should register a Script entity', async () => {
    expect(haPlatform).toBeDefined();

    let entity: HassEntity | undefined;
    (mockData.entities as HassEntity[]).forEach((e) => {
      if (e.original_name === 'Increase brightness') entity = e;
    });
    expect(entity).toBeDefined();
    if (!entity) return;
    haPlatform.ha.hassEntities.set(entity.id, entity);
    haPlatform.ha.hassDevices.clear();
    haPlatform.ha.hassStates.clear();

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(
      `Creating device for individual entity ${idn}${entity.original_name}${rs}${nf} domain ${CYAN}script${nf} name ${CYAN}increase_brightness${nf}`,
    );
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${entity.original_name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();
  });

  it('should register an Automation entity', async () => {
    expect(haPlatform).toBeDefined();

    let entity: HassEntity | undefined;
    (mockData.entities as HassEntity[]).forEach((e) => {
      if (e.original_name === 'Turn off all switches') entity = e;
    });
    expect(entity).toBeDefined();
    if (!entity) return;
    haPlatform.ha.hassEntities.set(entity.id, entity);
    haPlatform.ha.hassDevices.clear();
    haPlatform.ha.hassStates.clear();

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(
      `Creating device for individual entity ${idn}${entity.original_name}${rs}${nf} domain ${CYAN}automation${nf} name ${CYAN}turn_off_all_switches${nf}`,
    );
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${entity.original_name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();
  });

  it('should register a Switch device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Switch') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Light (on/off) device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Light (on/off)') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Dimmer device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Dimmer') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Light (HS) device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Light (HS)') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Light (XY) device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Light (XY)') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Light (CT) device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Light (CT)') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Light (XY, HS and CT) device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Light (XY, HS and CT)') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Outlet device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Outlet') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Lock device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Lock') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Fan device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Fan') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`- subscribe: ${CYAN}FanControl${db}:${CYAN}fanMode${db} check ${CYAN}true${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Thermostat heat_cool device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Thermostat') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`- subscribe: ${CYAN}Thermostat${db}:${CYAN}systemMode${db} check ${CYAN}true${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Thermostat heat device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Thermostat (Heat)') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    // expect(mockLog.debug).toHaveBeenCalledWith(`- subscribe: ${CYAN}Thermostat (Heat)${db}:${CYAN}systemMode${db} check ${CYAN}true${db}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a Cover device from ha', async () => {
    expect(haPlatform).toBeDefined();

    let device: HassDevice | undefined;
    (mockData.devices as HassDevice[]).forEach((d) => {
      if (d.name === 'Cover') device = d;
    });
    expect(device).toBeDefined();
    if (!device) return;
    haPlatform.ha.hassDevices.set(device.id, device);
    for (const entity of mockData.entities) if (entity.device_id === device.id) haPlatform.ha.hassEntities.set(entity.entity_id, entity);
    for (const state of mockData.states) if (haPlatform.ha.hassEntities.has(state.entity_id)) haPlatform.ha.hassStates.set(state.entity_id, state);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${device.name}${rs}${nf} id ${CYAN}${device.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${device.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();

    await haPlatform.onConfigure();
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`Configuring state`));
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining(`for device ${CYAN}${device.id}${db}`));

    for (const state of mockData.states) {
      if (haPlatform.ha.hassEntities.has(state.entity_id)) {
        haPlatform.updateHandler(device.id, state.entity_id, state, state);
      }
    }
  });

  it('should register a switch device from ha', async () => {
    expect(haPlatform).toBeDefined();

    haPlatform.ha.hassDevices.set(switchDevice.id, switchDevice as unknown as HassDevice);
    haPlatform.ha.hassEntities.set(switchDeviceEntity.entity_id, switchDeviceEntity as unknown as HassEntity);
    haPlatform.ha.hassStates.set(switchDeviceEntityState.entity_id, switchDeviceEntityState as unknown as HassState);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${switchDevice.name}${rs}${nf} id ${CYAN}${switchDevice.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${switchDevice.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled(); // Duplicated device name
  });

  it('should not register a switch device from ha without states', async () => {
    expect(haPlatform).toBeDefined();

    haPlatform.ha.hassDevices.set(switchDevice.id, switchDevice as unknown as HassDevice);
    haPlatform.ha.hassEntities.set(switchDeviceEntity.entity_id, switchDeviceEntity as unknown as HassEntity);
    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    // expect(mockLog.debug).toHaveBeenCalledWith(`Lookup device ${CYAN}${switchDevice.name}${db} entity ${CYAN}${switchDeviceEntity.entity_id}${db}: state not found`);
    expect(mockLog.debug).not.toHaveBeenCalledWith(`Registering device ${dn}${switchDevice.name}${db}...`);
  });

  it('should register a thermo auto device from ha', async () => {
    expect(haPlatform).toBeDefined();

    haPlatform.ha.hassDevices.set(autoDevice.id, autoDevice as unknown as HassDevice);
    haPlatform.ha.hassEntities.set(autoDeviceEntity.entity_id, autoDeviceEntity as unknown as HassEntity);
    haPlatform.ha.hassStates.set(autoDeviceEntityState.entity_id, autoDeviceEntityState as unknown as HassState);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${autoDevice.name}${rs}${nf} id ${CYAN}${autoDevice.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${autoDevice.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();
  });

  it('should register a thermo heat device from ha', async () => {
    expect(haPlatform).toBeDefined();

    haPlatform.ha.hassDevices.set(heatDevice.id, heatDevice as unknown as HassDevice);
    haPlatform.ha.hassEntities.set(heatDeviceEntity.entity_id, heatDeviceEntity as unknown as HassEntity);
    haPlatform.ha.hassStates.set(heatDeviceEntityState.entity_id, heatDeviceEntityState as unknown as HassState);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${heatDevice.name}${rs}${nf} id ${CYAN}${heatDevice.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${heatDevice.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled();
  });

  it('should register a thermo cool device from ha', async () => {
    expect(haPlatform).toBeDefined();

    haPlatform.ha.hassDevices.set(coolDevice.id, coolDevice as unknown as HassDevice);
    haPlatform.ha.hassEntities.set(coolDeviceEntity.entity_id, coolDeviceEntity as unknown as HassEntity);
    haPlatform.ha.hassStates.set(coolDeviceEntityState.entity_id, coolDeviceEntityState as unknown as HassState);

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${coolDevice.name}${rs}${nf} id ${CYAN}${coolDevice.id}${nf}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${coolDevice.name}${db}...`);
    expect(mockMatterbridge.addBridgedEndpoint).toHaveBeenCalled(); // Duplicated device name
  });

  it('should call onConfigure', async () => {
    await haPlatform.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith(`Configuring platform ${idn}${mockConfig.name}${rs}${nf}`);
  });

  /*
  it('should call callService', async () => {
    await haPlatform.commandHandler(mockMatterbridgeDevice, mockEndpoint, undefined, undefined, 'on');
    // expect(HomeAssistant.prototype.callService).toHaveBeenCalledWith('switch', 'turn_on', switchDeviceEntity.entity_id, undefined);
    await haPlatform.commandHandler(mockMatterbridgeDevice, mockEndpoint, undefined, undefined, 'off');
    // expect(HomeAssistant.prototype.callService).toHaveBeenCalledWith('switch', 'turn_off', switchDeviceEntity.entity_id, undefined);
    await haPlatform.commandHandler(mockMatterbridgeDevice, mockEndpoint, undefined, undefined, 'toggle');
    // expect(HomeAssistant.prototype.callService).toHaveBeenCalledWith('switch', 'toggle', switchDeviceEntity.entity_id, undefined);
  });
  */

  it('should call onChangeLoggerLevel and log a partial message', async () => {
    await haPlatform.onChangeLoggerLevel(LogLevel.DEBUG);
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining(`Logger level changed to ${LogLevel.DEBUG}`));
  });

  it('should call onShutdown with reason', async () => {
    await haPlatform.onShutdown('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.removeAllBridgedEndpoints).not.toHaveBeenCalled();
    await wait(1000);
  }, 20000);

  it('should call onShutdown and unregister', async () => {
    mockConfig.unregisterOnShutdown = true;
    await haPlatform.onShutdown('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.removeAllBridgedEndpoints).toHaveBeenCalled();
    await wait(1000);
  }, 20000);
});

const switchDevice = {
  area_id: null,
  configuration_url: null,
  config_entries: ['01J6J7D7EADB8KNX8XBDYDNB1B'],
  connections: [],
  created_at: 1725044472.632472,
  disabled_by: null,
  entry_type: null,
  hw_version: '1.0.0',
  id: 'd80898f83188759ed7329e97df00ee6a',
  identifiers: [
    ['matter', 'deviceid_CAD2FA0F285B2850-000000000000001C-230'],
    ['matter', 'deviceid_CAD2FA0F285B2850-000000000000001F-2'],
    ['matter', 'serial_0x23452164'],
  ],
  labels: [],
  manufacturer: 'Luligu',
  model: 'Matterbridge Switch',
  model_id: null,
  modified_at: 1726500210.074452,
  name_by_user: null,
  name: 'Switch mock',
  primary_config_entry: '01J6J7D7EADB8KNX8XBDYDNB1B',
  serial_number: '0x23452164',
  sw_version: '1.0.0',
  via_device_id: '09f9d3f59a339f12b621d15dce10bf4f',
};

const switchDeviceEntity = {
  area_id: null,
  categories: {},
  config_entry_id: '01J6J7D7EADB8KNX8XBDYDNB1B',
  created_at: 1726500210.089665,
  device_id: 'd80898f83188759ed7329e97df00ee6a',
  disabled_by: null,
  entity_category: null,
  entity_id: 'switch.switch_switch_2',
  has_entity_name: true,
  hidden_by: null,
  icon: null,
  id: '0b25a337cb83edefb1d310450ad2b0aa',
  labels: [],
  modified_at: 1726500210.093338,
  name: null,
  options: { conversation: { should_expose: true } },
  original_name: 'Switch',
  platform: 'matter',
  translation_key: 'switch',
  unique_id: 'CAD2FA0F285B2850-000000000000001F-2-2-MatterSwitch-6-0',
};

const switchDeviceEntityState = {
  entity_id: 'switch.switch_switch_2',
  state: 'on',
  attributes: { device_class: 'outlet', friendly_name: 'Switch Switch' },
  last_changed: '2024-09-18T18:09:20.344470+00:00',
  last_reported: '2024-09-18T18:09:20.344470+00:00',
  last_updated: '2024-09-18T18:09:20.344470+00:00',
  context: { id: '01J83564ER52RJF78N4S96YHG8', parent_id: null, user_id: null },
};

const autoDevice = {
  area_id: null,
  id: 'd80898f83188759ed7329e97df00ee6f',
  labels: [],
  manufacturer: 'Luligu',
  model: 'Matterbridge Switch',
  model_id: null,
  name_by_user: null,
  name: 'Thermo auto',
  serial_number: '0x23452164',
};

const autoDeviceEntity = {
  area_id: null,
  device_id: 'd80898f83188759ed7329e97df00ee6f',
  entity_id: 'climate.thermo-auto',
  id: '0b25a337cb83edefb1d310450ad2b0aa',
  name: null,
};

const autoDeviceEntityState = {
  entity_id: 'climate.thermo-auto',
  state: 'heat',
  attributes: {
    hvac_modes: ['off', 'heat', 'cool', 'auto'],
    min_temp: 7,
    max_temp: 50,
    current_temperature: 19,
    temperature: 20,
    target_temp_high: null,
    target_temp_low: null,
    friendly_name: 'Thermostat',
  },
};

const heatDevice = {
  area_id: null,
  id: 'd80898f83188759ed7329e97df00ee6a',
  labels: [],
  manufacturer: 'Luligu',
  model: 'Matterbridge Switch',
  model_id: null,
  name_by_user: null,
  name: 'Thermo heat',
  serial_number: '0x23452164',
};

const heatDeviceEntity = {
  area_id: null,
  device_id: 'd80898f83188759ed7329e97df00ee6a',
  entity_id: 'climate.thermo',
  id: '0b25a337cb83edefb1d310450ad2b0aa',
  name: null,
};

const heatDeviceEntityState = {
  entity_id: 'climate.thermo',
  state: 'heat',
  attributes: {
    hvac_modes: ['off', 'heat'],
    min_temp: 7,
    max_temp: 50,
    current_temperature: 19,
    temperature: 20,
    target_temp_high: null,
    target_temp_low: null,
    friendly_name: 'Thermostat',
  },
};

const coolDevice = {
  area_id: null,
  id: 'd80898f83188759ed7329e97df00ee6a',
  labels: [],
  manufacturer: 'Luligu',
  model: 'Matterbridge Switch',
  model_id: null,
  name_by_user: null,
  name: 'Thermo cool',
  serial_number: '0x23452164',
};

const coolDeviceEntity = {
  area_id: null,
  device_id: 'd80898f83188759ed7329e97df00ee6a',
  entity_id: 'climate.thermo',
  id: '0b25a337cb83edefb1d310450ad2b0aa',
  name: null,
};

const coolDeviceEntityState = {
  entity_id: 'climate.thermo',
  state: 'cool',
  attributes: {
    hvac_modes: ['off', 'cool'],
    min_temp: 7,
    max_temp: 50,
    current_temperature: 19,
    temperature: 20,
    target_temp_high: null,
    target_temp_low: null,
    friendly_name: 'Thermostat',
  },
};
