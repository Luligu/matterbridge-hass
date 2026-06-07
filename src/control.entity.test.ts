import { jest } from '@jest/globals';
import {
  colorTemperatureLight,
  coverDevice,
  dimmableLight,
  doorLockDevice,
  extendedColorLight,
  fanDevice,
  onOffLight,
  onOffOutlet,
  roboticVacuumCleaner,
  thermostatDevice,
  waterValve,
} from 'matterbridge';
import { LevelControl } from 'matterbridge/matter/clusters';

import { addControlEntity } from './control.entity.js';
import { hassCommandConverter, hassDomainConverter, hassSubscribeConverter } from './converters.js';
import { generateEntity, generateState } from './helpers.js';
import { type HassConfig, type HassEntity, type HassState, HomeAssistant, MediaPlayerEntityFeature, MediaPlayerService, UnitOfTemperature } from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';

function createMockMutableDevice(): MutableDevice {
  const endpoints: Record<string, { deviceTypes: any[]; clusters: number[] }> = {};
  const ensure = (ep: string) => (endpoints[ep] ||= { deviceTypes: [], clusters: [] });
  return {
    endpoints,
    addDeviceTypes: jest.fn((ep: string, deviceType: any) => {
      ensure(ep);
      endpoints[ep].deviceTypes.push(deviceType);
      // @ts-expect-error chainable return
      return this;
    }),
    addClusterServerIds: jest.fn(function (ep: string, clusterId: number) {
      ensure(ep);
      endpoints[ep].clusters.push(clusterId);
      // @ts-expect-error chainable return
      return this;
    }),
    setFriendlyName: jest.fn(),
    get: jest.fn((ep: string) => ({ deviceTypes: ensure(ep).deviceTypes })),
    addClusterServerColorTemperatureColorControl: jest.fn(),
    addClusterServerColorControl: jest.fn(),
    addClusterServerAutoModeThermostat: jest.fn(),
    addClusterServerHeatingThermostat: jest.fn(),
    addClusterServerCoolingThermostat: jest.fn(),
    addClusterServerHeatingCoolingThermostat: jest.fn(),
    addClusterServerCompleteFanControl: jest.fn(),
    addVacuum: jest.fn(),
    addSelect: jest.fn(),
    addOnOff: jest.fn(),
    addBasicVideoPlayer: jest.fn(),
    addKeypadInput: jest.fn(),
    addCommandHandler: jest.fn(),
    addSubscribeHandler: jest.fn(),
  } as unknown as MutableDevice;
}

const mockLog = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
const mockPlatform = { config: { virtualControlLabel: '' }, log: mockLog } as any;
const commandHandler = jest.fn(async () => {}); // async signature required
const subscribeHandler = jest.fn();
type VirtualDeviceCallback = () => Promise<void>;

describe('addControlEntity', () => {
  beforeEach(() => jest.clearAllMocks());

  const make = (domain: string, name: string, attrs: Record<string, any>) => {
    const md = createMockMutableDevice();
    return [md, { entity_id: `${domain}.${name}` } as HassEntity, { attributes: attrs } as HassState] as const;
  };

  it('returns undefined for unsupported domain', () => {
    const [md, e, s] = make('scene', 'x', {});
    expect(addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any)).toBeUndefined();
  });

  it('returns undefined for sensor & binary_sensor with null deviceType', () => {
    const [md1, e1, s1] = make('sensor', 'x', {});
    const [md2, e2, s2] = make('binary_sensor', 'x', {});
    expect(addControlEntity(mockPlatform, md1, e1 as any, s1 as any, commandHandler, subscribeHandler as any)).toBeUndefined();
    expect(addControlEntity(mockPlatform, md2, e2 as any, s2 as any, commandHandler, subscribeHandler as any)).toBeUndefined();
  });

  it('switch domain adds onOffOutlet and friendly name', () => {
    const [md, e, s] = make('switch', 'plug', { friendly_name: 'Plug' });
    const ep = addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(ep).toBeDefined();
    expect(ep).toBe(e.entity_id);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, onOffOutlet);
    expect(md.setFriendlyName).toHaveBeenCalledWith(e.entity_id, 'Plug');
  });

  it('light color temperature path only color_temp mode', () => {
    const [md, e, s] = make('light', 'ct', {
      brightness: 120,
      supported_color_modes: ['color_temp'],
      color_temp_kelvin: 4000,
      min_color_temp_kelvin: 3000,
      max_color_temp_kelvin: 6500,
      friendly_name: 'CT Light',
    });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, onOffLight);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, dimmableLight);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, colorTemperatureLight);
    expect(md.addClusterServerColorTemperatureColorControl).toHaveBeenCalled();
    expect(md.addClusterServerColorControl).not.toHaveBeenCalled();
  });

  it('light extended color path when hs present', () => {
    const [md, e, s] = make('light', 'rgb', {
      brightness: 200,
      supported_color_modes: ['hs', 'color_temp'],
      hs_color: [10, 50],
      min_mireds: 150,
      max_mireds: 400,
    });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, extendedColorLight);
    expect(md.addClusterServerColorControl).toHaveBeenCalled();
    expect(md.addClusterServerColorTemperatureColorControl).not.toHaveBeenCalled();
  });

  it('light without friendly_name does not call setFriendlyName', () => {
    const [md, e, s] = make('light', 'plain', { brightness: 90, supported_color_modes: ['color_temp'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.setFriendlyName).not.toHaveBeenCalled();
  });

  it('should add level control for light when brightness mode is supported without brightness attribute', () => {
    const [md, e, s] = make('light', 'brightnessfallback', {
      supported_features: 44,
      supported_color_modes: ['brightness'],
    });

    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);

    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, onOffLight);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, dimmableLight);
    expect(md.addClusterServerIds).toHaveBeenCalledWith(e.entity_id, LevelControl.id);
  });

  it('uses cached state when an unavailable light is added', () => {
    const md = createMockMutableDevice();
    const ha = new HomeAssistant('ws://localhost:8123', 'token');
    const e = generateEntity(ha, 'Cached', 'light');
    const state = generateState(ha, e, 'unavailable', {});
    const cachedState = generateState(ha, e, 'on', {
      supported_features: 44,
      supported_color_modes: ['brightness'],
      friendly_name: 'Cached Light',
    });
    const platform = {
      ...mockPlatform,
      stateCache: {
        get: jest.fn().mockReturnValue(cachedState),
      },
    } as any;

    addControlEntity(platform, md, e as any, state, commandHandler, subscribeHandler as any);

    expect(platform.stateCache.get).toHaveBeenCalledWith(e.entity_id);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, onOffLight);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, dimmableLight);
    expect(md.addClusterServerIds).toHaveBeenCalledWith(e.entity_id, LevelControl.id);
    expect(md.setFriendlyName).toHaveBeenCalledWith(e.entity_id, 'Cached Light');
  });

  it('logs a warning when an unavailable light has no cached state', () => {
    const md = createMockMutableDevice();
    const ha = new HomeAssistant('ws://localhost:8123', 'token');
    const e = generateEntity(ha, 'No Cache', 'light');
    const state = generateState(ha, e, 'unavailable', {
      supported_features: 44,
      supported_color_modes: ['brightness'],
      friendly_name: 'No Cache Light',
    });
    const platform = {
      ...mockPlatform,
      stateCache: {
        get: jest.fn().mockReturnValue(undefined),
      },
    } as any;

    addControlEntity(platform, md, e as any, state, commandHandler, subscribeHandler as any);

    expect(platform.stateCache.get).toHaveBeenCalledWith(e.entity_id);
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('is unavailable and no cached state found'));
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, onOffLight);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, dimmableLight);
    expect(md.addClusterServerIds).toHaveBeenCalledWith(e.entity_id, LevelControl.id);
    expect(md.setFriendlyName).toHaveBeenCalledWith(e.entity_id, 'No Cache Light');
  });

  it('thermostat auto/heat/cool branches', () => {
    let [md, e, s] = make('climate', 'auto', { hvac_modes: ['heat_cool'], current_temperature: 22, target_temp_low: 20, target_temp_high: 25 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerAutoModeThermostat).toHaveBeenCalled();
    [md, e, s] = make('climate', 'heat', { hvac_modes: ['heat'], current_temperature: 21, temperature: 23 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerHeatingThermostat).toHaveBeenCalled();
    [md, e, s] = make('climate', 'cool', { hvac_modes: ['cool'], current_temperature: 24, temperature: 22 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerCoolingThermostat).toHaveBeenCalled();
  });

  it('fan extended features when direction/oscillating, basic otherwise', () => {
    let [md, e, s] = make('fan', 'dir', { direction: 'forward', preset_modes: ['low', 'high'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerCompleteFanControl).toHaveBeenCalledTimes(1);
    [md, e, s] = make('fan', 'osc', { oscillating: true, preset_modes: ['low'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerCompleteFanControl).toHaveBeenCalledTimes(1); // fresh mock count
    [md, e, s] = make('fan', 'simple', { preset_modes: ['low', 'high'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerCompleteFanControl).not.toHaveBeenCalled();
  });

  it('vacuum triple device type mapping and configuration', () => {
    const [md, e, s] = make('vacuum', 'robby', { activity: 'idle' });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addVacuum).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const vacuumCalls = md.addDeviceTypes.mock.calls.filter((c: any[]) => c[1] === roboticVacuumCleaner);
    expect(vacuumCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('valve mapping', () => {
    const [md, e, s] = make('valve', 'water', { current_position: 70 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, waterValve);
  });

  it('lock and cover mapping', () => {
    let [md, e, s] = make('lock', 'front', {});
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, doorLockDevice);
    [md, e, s] = make('cover', 'shade', { current_position: 55 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, coverDevice);
  });

  it('thermostat base & fan base device types', () => {
    const [md1, e1, s1] = make('climate', 'base', { hvac_modes: ['heat'] });
    addControlEntity(mockPlatform, md1, e1 as any, s1 as any, commandHandler, subscribeHandler as any);
    expect(md1.addDeviceTypes).toHaveBeenCalledWith(e1.entity_id, thermostatDevice);
    const [md2, e2, s2] = make('fan', 'base', { preset_modes: ['low'] });
    addControlEntity(mockPlatform, md2, e2 as any, s2 as any, commandHandler, subscribeHandler as any);
    expect(md2.addDeviceTypes).toHaveBeenCalledWith(e2.entity_id, fanDevice);
  });

  it.each([
    {
      entity: { entity_id: 'select.mode' },
      attributes: { options: ['Low', 'Medium', 'High', 'Auto'] },
    },
    {
      entity: { entity_id: 'input_select.mode' },
      attributes: { options: ['Eco', 'Comfort', 'Boost', 'Off'] },
    },
  ])('forwards every available option to addSelect for $entity.entity_id', ({ entity, attributes }) => {
    const md = createMockMutableDevice();
    const state = { attributes } as HassState;

    addControlEntity(mockPlatform, md, entity as HassEntity, state, commandHandler, subscribeHandler as any);

    expect(md.addSelect).toHaveBeenCalledTimes(1);
    // @ts-expect-error mock calls on the test double
    const args = md.addSelect.mock.calls[0];
    expect(args[0]).toBe(entity.entity_id);
    expect(args[1]).toEqual(expect.any(String));
    expect(args[2]).toEqual(attributes.options);
  });

  it('registers labeled input_select virtual controls for each option', async () => {
    const [md, e, s] = make('input_select', 'mode', {
      friendly_name: 'Heating Mode',
      options: ['Eco', 'Comfort'],
    });
    const callService = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const registerVirtualDevice = jest.fn<(name: string, deviceType: string, callback: VirtualDeviceCallback) => Promise<void>>().mockResolvedValue(undefined);
    const platform = {
      ...mockPlatform,
      config: { splitNameStrategy: 'Friendly name', virtualControlLabel: 'Virtual Controls' },
      ha: {
        callService,
        hassLabels: new Map([['virtual-controls', { label_id: 'virtual-controls', name: 'Virtual Controls' }]]),
        hassStates: new Map([[e.entity_id, s]]),
      },
      registerVirtualDevice,
    } as any;
    const entity = { ...e, labels: ['virtual-controls'] } as HassEntity;

    addControlEntity(platform, md, entity, s, commandHandler, subscribeHandler as any);

    expect(registerVirtualDevice).toHaveBeenCalledTimes(2);
    expect(registerVirtualDevice).toHaveBeenNthCalledWith(1, 'Heating Mode Eco', 'mounted_switch', expect.any(Function));
    expect(registerVirtualDevice).toHaveBeenNthCalledWith(2, 'Heating Mode Comfort', 'mounted_switch', expect.any(Function));

    const comfortCallback = registerVirtualDevice.mock.calls[1][2] as VirtualDeviceCallback;
    await comfortCallback();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith('input_select', 'select_option', e.entity_id, { option: 'Comfort' });
  });

  it('logs an error when a labeled input_select virtual control service call fails', async () => {
    const [md, e, s] = make('input_select', 'mode', {
      friendly_name: 'Heating Mode',
      options: ['Eco'],
    });
    const callService = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('boom'));
    const registerVirtualDevice = jest.fn<(name: string, deviceType: string, callback: VirtualDeviceCallback) => Promise<void>>().mockResolvedValue(undefined);
    const log = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const platform = {
      config: { splitNameStrategy: 'Friendly name', virtualControlLabel: 'Virtual Controls' },
      ha: {
        callService,
        hassLabels: new Map([['virtual-controls', { label_id: 'virtual-controls', name: 'Virtual Controls' }]]),
        hassStates: new Map([[e.entity_id, s]]),
      },
      log,
      registerVirtualDevice,
    } as any;
    const entity = { ...e, labels: ['virtual-controls'] } as HassEntity;

    addControlEntity(platform, md, entity, s, commandHandler, subscribeHandler as any);

    const ecoCallback = registerVirtualDevice.mock.calls[0][2] as VirtualDeviceCallback;
    await ecoCallback();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith('input_select', 'select_option', e.entity_id, { option: 'Eco' });
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to call select_option service for'));
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Error: boom'));
  });

  it('configures remote entities with on/off support', () => {
    const [md, e, s] = make('remote', 'tv', {});

    const ep = addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);

    expect(ep).toBe(e.entity_id);
    expect(md.addOnOff).toHaveBeenCalledWith(e.entity_id, true);
  });

  it('configures media players with playback and keypad support', () => {
    const [md, e, s] = make('media_player', 'tv', { supported_features: 0 });

    const ep = addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);

    expect(ep).toBe(e.entity_id);
    expect(md.addOnOff).toHaveBeenCalledWith(e.entity_id, true);
    expect(md.addBasicVideoPlayer).toHaveBeenCalledWith(e.entity_id);
    expect(md.addKeypadInput).toHaveBeenCalledWith(e.entity_id);
  });

  it('registers labeled media player virtual controls for supported features', async () => {
    const [md, e, s] = make('media_player', 'tv', {
      friendly_name: 'Living Room TV',
      supported_features: MediaPlayerEntityFeature.TURN_ON | MediaPlayerEntityFeature.VOLUME_STEP,
    });
    const callService = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const registerVirtualDevice = jest.fn<(name: string, deviceType: string, callback: VirtualDeviceCallback) => Promise<void>>().mockResolvedValue(undefined);
    const platform = {
      ...mockPlatform,
      config: { splitNameStrategy: 'Friendly name', virtualControlLabel: 'Virtual Controls' },
      ha: {
        callService,
        hassLabels: new Map([['virtual-controls', { label_id: 'virtual-controls', name: 'Virtual Controls' }]]),
        hassStates: new Map([[e.entity_id, s]]),
      },
      registerVirtualDevice,
    } as any;
    const entity = { ...e, labels: ['virtual-controls'] } as HassEntity;

    addControlEntity(platform, md, entity, s, commandHandler, subscribeHandler as any);

    expect(registerVirtualDevice).toHaveBeenCalledTimes(3);
    expect(registerVirtualDevice).toHaveBeenNthCalledWith(1, 'Turn ON Living Room TV', 'mounted_switch', expect.any(Function));
    expect(registerVirtualDevice).toHaveBeenNthCalledWith(2, 'Volume Down Living Room TV', 'mounted_switch', expect.any(Function));
    expect(registerVirtualDevice).toHaveBeenNthCalledWith(3, 'Volume Up Living Room TV', 'mounted_switch', expect.any(Function));

    const volumeUpCallback = registerVirtualDevice.mock.calls[2][2] as VirtualDeviceCallback;
    await volumeUpCallback();

    expect(callService).toHaveBeenCalledWith('media_player', MediaPlayerService.VOLUME_UP, e.entity_id);
  });

  it('logs an error when a labeled media player virtual control service call fails', async () => {
    const [md, e, s] = make('media_player', 'tv', {
      friendly_name: 'Living Room TV',
      supported_features: MediaPlayerEntityFeature.TURN_ON,
    });
    const callService = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('boom'));
    const registerVirtualDevice = jest.fn<(name: string, deviceType: string, callback: VirtualDeviceCallback) => Promise<void>>().mockResolvedValue(undefined);
    const log = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const platform = {
      config: { splitNameStrategy: 'Friendly name', virtualControlLabel: 'Virtual Controls' },
      ha: {
        callService,
        hassLabels: new Map([['virtual-controls', { label_id: 'virtual-controls', name: 'Virtual Controls' }]]),
        hassStates: new Map([[e.entity_id, s]]),
      },
      log,
      registerVirtualDevice,
    } as any;
    const entity = { ...e, labels: ['virtual-controls'] } as HassEntity;

    addControlEntity(platform, md, entity, s, commandHandler, subscribeHandler as any);

    const turnOnCallback = registerVirtualDevice.mock.calls[0][2] as VirtualDeviceCallback;
    await turnOnCallback();
    await Promise.resolve();

    expect(callService).toHaveBeenCalledWith('media_player', MediaPlayerService.TURN_ON, e.entity_id);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to call turn on service for'));
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Error: boom'));
  });

  it('registers all command handlers for light domain', () => {
    const [md, e, s] = make('light', 'cmds', {});
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    const expected = hassCommandConverter.filter((c) => c.domain === 'light').map((c) => c.command);
    // @ts-expect-error chainable return
    const registered = md.addCommandHandler.mock.calls.map((c: any[]) => c[1]);
    expected.forEach((cmd) => expect(registered).toContain(cmd));
  });

  it('registers all subscribe handlers for fan domain', () => {
    const [md, e, s] = make('fan', 'sub', {});
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    const expected = hassSubscribeConverter.filter((x) => x.domain === 'fan').length;
    // @ts-expect-error chainable return
    expect(md.addSubscribeHandler.mock.calls.length).toBe(expected);
  });

  it('executes registered command handler callbacks (light domain)', async () => {
    const [md, e, s] = make('light', 'cb', {});
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    // @ts-expect-error chainable return
    const calls = md.addCommandHandler.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Invoke every registered handler to cover callback body
    for (const call of calls) {
      const handler = call[2];
      await handler({ request: {}, cluster: 'x', attributes: {}, endpoint: {} }, e.entity_id, call[1]);
    }
    expect(commandHandler).toHaveBeenCalledTimes(calls.length);
  });

  it('executes registered subscribe handler callbacks (fan domain)', () => {
    const [md, e, s] = make('fan', 'cb', { preset_modes: ['low'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    // @ts-expect-error chainable return
    const calls = md.addSubscribeHandler.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const callback = call[3];
      callback('new', 'old', {} as any, e.entity_id, call[1], call[2]);
    }
    expect(subscribeHandler).toHaveBeenCalledTimes(calls.length);
  });

  it('climate domain with unsupported hvac modes adds no thermostat cluster servers', () => {
    const [md, e, s] = make('climate', 'none', { hvac_modes: ['dry'], current_temperature: 20 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerAutoModeThermostat).not.toHaveBeenCalled();
    expect(md.addClusterServerHeatingThermostat).not.toHaveBeenCalled();
    expect(md.addClusterServerCoolingThermostat).not.toHaveBeenCalled();
  });

  it('skips attribute mapping when deviceType or clusterId is null', () => {
    const [md, e, s] = make('light', 'nullattr', { dummy_null: true });
    // Inject a temporary null mapping into hassDomainConverter
    const originalLength = hassDomainConverter.length;
    (hassDomainConverter as any).push({ domain: 'light', withAttribute: 'dummy_null', deviceType: null, clusterId: null });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    // Only the base light device type should be added (no extra from dummy_null)
    // @ts-expect-error chainable return
    const deviceTypeCalls = md.addDeviceTypes.mock.calls.filter((c: any[]) => c[0] === e.entity_id);
    expect(deviceTypeCalls.length).toBe(1); // onOffLight only
    // Restore original converter array
    (hassDomainConverter as any).length = originalLength;
  });

  it('light color temperature fallback defaults', () => {
    const [md, e, s] = make('light', 'ctdefaults', { supported_color_modes: ['color_temp'], color_temp_kelvin: undefined });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerColorTemperatureColorControl).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerColorTemperatureColorControl.mock.calls[0];
    expect(args[1]).toBe(153); // default min_mireds
    expect(args[2]).toBe(500); // default max_mireds
  });

  it('light extended color fallback defaults', () => {
    const [md, e, s] = make('light', 'rgbdefaults', { supported_color_modes: ['hs'], hs_color: [0, 0] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerColorControl).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerColorControl.mock.calls[0];
    expect(args[1]).toBe(153); // default min_mireds
    expect(args[2]).toBe(500); // default max_mireds
  });

  it('thermostat auto mode fallback no hvac_modes', () => {
    const [md, e, s] = make('climate', 'autodefaults', { hvac_modes: [] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerHeatingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerHeatingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 23, 7, 35]);
  });

  it('thermostat auto mode fallback defaults heat_cool', () => {
    const [md, e, s] = make('climate', 'autodefaults', { hvac_modes: ['heat_cool'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerAutoModeThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerAutoModeThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 20, 26, 7, 35]);
  });

  it('thermostat auto mode fallback defaults heat and cool', () => {
    const [md, e, s] = make('climate', 'autodefaults', { hvac_modes: ['heat', 'cool'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerHeatingCoolingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerHeatingCoolingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 23, 23, 7, 35]);
  });

  it('thermostat auto mode fallback defaults heat_cool with local', () => {
    const [md, e, s] = make('climate', 'autodefaults', { hvac_modes: ['heat_cool'], current_temperature: 22.2, target_temp_low: 22, target_temp_high: 24 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerAutoModeThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerAutoModeThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([22.2, 22, 24, 7, 35]);
  });

  it('thermostat cool mode fallback defaults heat', () => {
    const [md, e, s] = make('climate', 'heatdefaults', { hvac_modes: ['heat'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerHeatingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerHeatingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 23, 7, 35]);
  });

  it('thermostat cool mode fallback defaults heat config °C', () => {
    HomeAssistant.hassConfig = { unit_system: { temperature: UnitOfTemperature.CELSIUS } } as HassConfig;
    const [md, e, s] = make('climate', 'heatdefaults', { hvac_modes: ['heat'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerHeatingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerHeatingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 23, 7, 35]);
    HomeAssistant.hassConfig = {} as HassConfig;
  });

  it('thermostat cool mode fallback defaults heat config °F', () => {
    HomeAssistant.hassConfig = { unit_system: { temperature: UnitOfTemperature.FAHRENHEIT } } as HassConfig;
    const [md, e, s] = make('climate', 'heatdefaults', { hvac_modes: ['heat'] });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerHeatingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerHeatingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 23, 7, 35]);
    HomeAssistant.hassConfig = {} as HassConfig;
  });

  it('thermostat cool mode fallback defaults cool', () => {
    const [md, e, s] = make('climate', 'cooldefaults', { hvac_modes: ['cool'], current_temperature: 23.1, temperature: 22, min_temp: 0, max_temp: 50 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerCoolingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerCoolingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([23.1, 22, 0, 50]);
  });

  it('thermostat cool mode fallback defaults cool config °C', () => {
    HomeAssistant.hassConfig = { unit_system: { temperature: UnitOfTemperature.CELSIUS } } as HassConfig;
    const [md, e, s] = make('climate', 'cooldefaults', { hvac_modes: ['cool'], current_temperature: 23.7, temperature: 22, min_temp: 0, max_temp: 50 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerCoolingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerCoolingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([23.7, 22, 0, 50]);
    HomeAssistant.hassConfig = {} as HassConfig;
  });

  it('thermostat cool mode fallback defaults cool config °F', () => {
    HomeAssistant.hassConfig = { unit_system: { temperature: UnitOfTemperature.FAHRENHEIT } } as HassConfig;
    const [md, e, s] = make('climate', 'cooldefaults', { hvac_modes: ['cool'], current_temperature: 74.3, temperature: 71.8, min_temp: 32, max_temp: 122 }); // 23.5°C and 22.1111111°C and 0-50°C
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerCoolingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerCoolingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([23.5, expect.closeTo(22.1, 0.1), 0, 50]);
    HomeAssistant.hassConfig = {} as HassConfig;
  });

  it('thermostat auto mode fallback defaults heat_cool °C', () => {
    const [md, e, s] = make('climate', 'autodefaults', { hvac_modes: ['heat_cool'], temperature_unit: '°C', target_temp_low: 18, target_temp_high: 28 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerAutoModeThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerAutoModeThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 18, 28, 7, 35]);
  });

  it('thermostat auto mode fallback defaults heat_cool °F', () => {
    const [md, e, s] = make('climate', 'autodefaults', { hvac_modes: ['heat_cool'], temperature_unit: '°F', target_temp_low: 64, target_temp_high: 78 });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerAutoModeThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerAutoModeThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, expect.closeTo(17.7, 0.1), expect.closeTo(25.5, 0.1), 7, 35]);
  });

  it('thermostat cool mode fallback defaults heat °F', () => {
    const [md, e, s] = make('climate', 'cooldefaults', { hvac_modes: ['heat'], temperature_unit: '°F' });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerHeatingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerHeatingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 23, 7, 35]);
  });

  it('thermostat cool mode fallback defaults cool °F', () => {
    const [md, e, s] = make('climate', 'cooldefaults', { hvac_modes: ['cool'], temperature_unit: '°F' });
    addControlEntity(mockPlatform, md, e as any, s as any, commandHandler, subscribeHandler as any);
    expect(md.addClusterServerCoolingThermostat).toHaveBeenCalled();
    // @ts-expect-error chainable return
    const args = md.addClusterServerCoolingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([null, 23, 7, 35]);
  });
});
