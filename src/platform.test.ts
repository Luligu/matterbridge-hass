/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Endpoint, Matterbridge, MatterbridgeDevice, PlatformConfig } from 'matterbridge';
import { wait } from 'matterbridge/utils';
import { AnsiLogger, BLUE, db, dn, hk, idn, LogLevel, nf, or, rs, YELLOW, CYAN } from 'matterbridge/logger';
import { HomeAssistantPlatform } from './platform';
import { jest } from '@jest/globals';
import { HomeAssistant } from './homeAssistant';

describe('HassPlatform', () => {
  let mockMatterbridge: Matterbridge;
  let mockLog: AnsiLogger;
  let mockConfig: PlatformConfig;
  let mockHomeAssistant: HomeAssistant;
  let haPlatform: HomeAssistantPlatform;
  let mockMatterbridgeDevice: MatterbridgeDevice;
  let mockEndpoint: Endpoint;

  let loggerLogSpy: jest.SpiedFunction<(level: LogLevel, message: string, ...parameters: any[]) => void>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  jest.spyOn(Matterbridge.prototype, 'addBridgedDevice').mockImplementation((pluginName: string, device: MatterbridgeDevice) => {
    console.log(`Mocked addBridgedDevice: ${pluginName} ${device.name}`);
    return Promise.resolve();
  });
  jest.spyOn(Matterbridge.prototype, 'removeBridgedDevice').mockImplementation((pluginName: string, device: MatterbridgeDevice) => {
    // console.log(`Mocked unregisterDevice: ${pluginName} ${device.name}`);
    return Promise.resolve();
  });
  jest.spyOn(Matterbridge.prototype, 'removeAllBridgedDevices').mockImplementation((pluginName: string) => {
    // console.log(`Mocked removeAllBridgedDevices: ${pluginName}`);
    return Promise.resolve();
  });

  jest.spyOn(HomeAssistant.prototype, 'fetchAsync').mockImplementation((type: string, timeout = 5000) => {
    console.log(`Mocked fetchAsync: ${type}`);
    if (type === 'config/device_registry/list') {
      return Promise.resolve([switchDevice]);
    } else if (type === 'config/entity_registry/list') {
      return Promise.resolve([switchDeviceEntity]);
    } else if (type === 'get_states') {
      return Promise.resolve([switchDeviceEntityState]);
    }
    return Promise.resolve([switchDeviceEntityState]);
  });

  jest.spyOn(HomeAssistant.prototype, 'callService').mockImplementation((domain: string, service: string, entityId: string, serviceData: Record<string, any> = {}) => {
    console.log(`Mocked callService: domain ${domain} service ${service} entityId ${entityId}`);
  });

  beforeAll(() => {
    // Creates the mocks for Matterbridge, AnsiLogger, and PlatformConfig
    mockMatterbridge = {
      matterbridgeDirectory: 'jest',
      matterbridgePluginDirectory: 'jest',
      systemInformation: { ipv4Address: undefined },
      addBridgedDevice: jest.fn(),
      removeAllBridgedDevices: jest.fn(),
    } as unknown as Matterbridge;
    mockLog = {
      fatal: jest.fn((message) => {
        console.log(`Fatal: ${message}`);
      }),
      error: jest.fn((message) => {
        console.log(`Error: ${message}`);
      }),
      warn: jest.fn((message) => {
        console.log(`Warn: ${message}`);
      }),
      notice: jest.fn((message) => {
        console.log(`Notice: ${message}`);
      }),
      info: jest.fn((message) => {
        console.log(`Info: ${message}`);
      }),
      debug: jest.fn((message) => {
        console.log(`Debug: ${message}`);
      }),
    } as unknown as AnsiLogger;
    mockConfig = {
      'name': 'matterbridge-hass',
      'type': 'DynamicPlatform',
      'blackList': [],
      'whiteList': [],
      'host': 'http://homeassistant.local:8123',
      'token': 'long-lived token',
      'debug': false,
      'unregisterOnShutdown': false,
    } as PlatformConfig;

    mockHomeAssistant = {
      connect: jest.fn(),
      close: jest.fn(),
      fetchAsync: jest.fn(),
      callService: jest.fn(),
    } as unknown as HomeAssistant;

    mockMatterbridgeDevice = {
      deviceName: 'Switch',
    } as unknown as MatterbridgeDevice;

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
    // Clears the call history of mockLog.* before each test
    (mockLog.fatal as jest.Mock).mockClear();
    (mockLog.error as jest.Mock).mockClear();
    (mockLog.warn as jest.Mock).mockClear();
    (mockLog.notice as jest.Mock).mockClear();
    (mockLog.info as jest.Mock).mockClear();
    (mockLog.debug as jest.Mock).mockClear();

    // Clears the call history before each test
    loggerLogSpy.mockClear();
    consoleLogSpy.mockClear();
  });

  afterAll(() => {
    //
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

  it('should initialize platform with config name', () => {
    mockConfig.host = 'http://homeassistant.local:8123';
    mockConfig.token = 'long-lived token';
    haPlatform = new HomeAssistantPlatform(mockMatterbridge, mockLog, mockConfig);
    expect(mockLog.debug).toHaveBeenCalledWith(`MatterbridgeDynamicPlatform loaded`);
  });

  it('should validate with white and black list', () => {
    (haPlatform as any).whiteList = ['whiteDevice'];
    (haPlatform as any).blackList = ['blackDevice'];
    expect((haPlatform as any).validateWhiteBlackList('whiteDevice')).toBe(true);
    expect((haPlatform as any).validateWhiteBlackList('blackDevice')).toBe(false);
    expect((haPlatform as any).validateWhiteBlackList('xDevice')).toBe(false);
    expect((haPlatform as any).validateWhiteBlackList('')).toBe(false);

    (haPlatform as any).whiteList = [];
    (haPlatform as any).blackList = ['blackDevice'];
    expect((haPlatform as any).validateWhiteBlackList('whiteDevice')).toBe(true);
    expect((haPlatform as any).validateWhiteBlackList('blackDevice')).toBe(false);
    expect((haPlatform as any).validateWhiteBlackList('xDevice')).toBe(true);
    expect((haPlatform as any).validateWhiteBlackList('')).toBe(true);

    (haPlatform as any).whiteList = [];
    (haPlatform as any).blackList = [];
  });

  it('should call onStart with reason', async () => {
    expect(haPlatform).toBeDefined();
    (haPlatform as any).ha.connected = true;
    (haPlatform as any).ha.devicesReceived = true;
    (haPlatform as any).ha.entitiesReceived = true;
    (haPlatform as any).ha.subscribed = true;
    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
  });

  it('should receive events from ha', () => {
    (haPlatform as any).ha.emit('connected', '2024.09.1');
    expect(mockLog.notice).toHaveBeenCalledWith(`Connected to Home Assistant 2024.09.1`);
    (haPlatform as any).ha.emit('disconnected');
    expect(mockLog.warn).toHaveBeenCalledWith(`Disconnected from Home Assistant`);
    (haPlatform as any).ha.emit('subscribed');
    expect(mockLog.info).toHaveBeenCalledWith(`Subscribed to Home Assistant events`);
    (haPlatform as any).ha.emit('config');
    expect(mockLog.info).toHaveBeenCalledWith(`Configuration received from Home Assistant`);
    (haPlatform as any).ha.emit('states');
    expect(mockLog.info).toHaveBeenCalledWith(`States received from Home Assistant`);
    (haPlatform as any).ha.emit('services');
    expect(mockLog.info).toHaveBeenCalledWith(`Services received from Home Assistant`);
    (haPlatform as any).ha.emit('devices');
    expect(mockLog.info).toHaveBeenCalledWith(`Devices received from Home Assistant`);
    (haPlatform as any).ha.emit('entities');
    expect(mockLog.info).toHaveBeenCalledWith(`Entities received from Home Assistant`);
  });

  it('should register a switch device from ha', async () => {
    // loggerLogSpy.mockRestore();
    // consoleLogSpy.mockRestore();

    expect(haPlatform).toBeDefined();
    (haPlatform as any).ha.connected = true;
    (haPlatform as any).ha.devicesReceived = true;
    (haPlatform as any).ha.entitiesReceived = true;
    (haPlatform as any).ha.subscribed = true;

    (haPlatform as any).hassDevices = [switchDevice];
    (haPlatform as any).hassEntities = [switchDeviceEntity];
    (haPlatform as any).hassStates = [switchDeviceEntityState];

    await haPlatform.onStart('Test reason');

    expect(mockLog.info).toHaveBeenCalledWith(`Starting platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockLog.info).toHaveBeenCalledWith(`Creating device ${idn}${switchDevice.name}${rs}${nf} id ${switchDevice.id}`);
    expect(mockLog.debug).toHaveBeenCalledWith(`Registering device ${dn}${switchDevice.name}${db}...`);
    expect(mockMatterbridge.addBridgedDevice).toHaveBeenCalledTimes(1);
  });

  it('should call onConfigure', async () => {
    await haPlatform.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith(`Configuring platform ${idn}${mockConfig.name}${rs}${nf}`);
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining(`${db}Received update event from Home Assistant device ${idn}${switchDevice.name}${rs}${db} entity ${CYAN}${switchDeviceEntity.entity_id}${db}`),
    );
  });

  it('should call callService', async () => {
    await (haPlatform as any).commandHandler(mockMatterbridgeDevice, mockEndpoint, 'on', switchDeviceEntity);
    expect(HomeAssistant.prototype.callService).toHaveBeenCalledWith('switch', 'turn_on', switchDeviceEntity.entity_id);
    await (haPlatform as any).commandHandler(mockMatterbridgeDevice, mockEndpoint, 'off', switchDeviceEntity);
    expect(HomeAssistant.prototype.callService).toHaveBeenCalledWith('switch', 'turn_off', switchDeviceEntity.entity_id);
    await (haPlatform as any).commandHandler(mockMatterbridgeDevice, mockEndpoint, 'toggle', switchDeviceEntity);
    expect(HomeAssistant.prototype.callService).toHaveBeenCalledWith('switch', 'toggle', switchDeviceEntity.entity_id);
  });

  it('should call onChangeLoggerLevel and log a partial message', async () => {
    await haPlatform.onChangeLoggerLevel(LogLevel.DEBUG);
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining(`Logger level changed to ${LogLevel.DEBUG}`));
  });

  it('should call onShutdown with reason', async () => {
    await haPlatform.onShutdown('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.removeAllBridgedDevices).not.toHaveBeenCalled();
    await wait(1000);
  }, 20000);

  it('should call onShutdown and unregister', async () => {
    mockConfig.unregisterOnShutdown = true;
    await haPlatform.onShutdown('Test reason');
    expect(mockLog.info).toHaveBeenCalledWith(`Shutting down platform ${idn}${mockConfig.name}${rs}${nf}: Test reason`);
    expect(mockMatterbridge.removeAllBridgedDevices).toHaveBeenCalled();
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
  name: 'Switch',
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
