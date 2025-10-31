import { jest } from '@jest/globals';
import {
  onOffOutlet,
  onOffLight,
  dimmableLight,
  colorTemperatureLight,
  extendedColorLight,
  doorLockDevice,
  fanDevice,
  coverDevice,
  thermostatDevice,
  waterValve,
  roboticVacuumCleaner,
} from 'matterbridge';

import { addControlEntity } from './control.entity.js';
import { hassCommandConverter, hassSubscribeConverter, hassDomainConverter } from './converters.js';

type HassEntity = { entity_id: string };
type HassState = { attributes: Record<string, any> };

function createMockMutableDevice() {
  const endpoints: Record<string, { deviceTypes: any[]; clusters: number[] }> = {};
  const ensure = (ep: string) => (endpoints[ep] ||= { deviceTypes: [], clusters: [] });
  return {
    endpoints,
    addDeviceTypes: jest.fn(function (ep: string, deviceType: any) {
      ensure(ep);
      endpoints[ep].deviceTypes.push(deviceType);
      return this;
    }),
    addClusterServerIds: jest.fn(function (ep: string, clusterId: number) {
      ensure(ep);
      endpoints[ep].clusters.push(clusterId);
      return this;
    }),
    setFriendlyName: jest.fn(),
    get: jest.fn((ep: string) => ({ deviceTypes: ensure(ep).deviceTypes })),
    addClusterServerColorTemperatureColorControl: jest.fn(),
    addClusterServerColorControl: jest.fn(),
    addClusterServerAutoModeThermostat: jest.fn(),
    addClusterServerHeatingThermostat: jest.fn(),
    addClusterServerCoolingThermostat: jest.fn(),
    addClusterServerCompleteFanControl: jest.fn(),
    addVacuum: jest.fn(),
    addCommandHandler: jest.fn(),
    addSubscribeHandler: jest.fn(),
  } as any;
}

const mockLog = { debug: jest.fn() } as any;
const commandHandler = jest.fn(async () => {}); // async signature required
const subscribeHandler = jest.fn();

describe('addControlEntity', () => {
  beforeEach(() => jest.clearAllMocks());

  const make = (domain: string, name: string, attrs: Record<string, any>) => {
    const md = createMockMutableDevice();
    return [md, { entity_id: `${domain}.${name}` } as HassEntity, { attributes: attrs } as HassState] as const;
  };

  it('returns undefined for unsupported domain', () => {
    const [md, e, s] = make('media_player', 'x', {});
    expect(addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog)).toBeUndefined();
  });

  it('returns undefined for sensor & binary_sensor with null deviceType', () => {
    const [md1, e1, s1] = make('sensor', 'x', {});
    const [md2, e2, s2] = make('binary_sensor', 'x', {});
    expect(addControlEntity(md1, e1 as any, s1 as any, commandHandler, subscribeHandler, mockLog)).toBeUndefined();
    expect(addControlEntity(md2, e2 as any, s2 as any, commandHandler, subscribeHandler, mockLog)).toBeUndefined();
  });

  it('switch domain adds onOffOutlet and friendly name', () => {
    const [md, e, s] = make('switch', 'plug', { friendly_name: 'Plug' });
    const ep = addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
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
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
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
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, extendedColorLight);
    expect(md.addClusterServerColorControl).toHaveBeenCalled();
    expect(md.addClusterServerColorTemperatureColorControl).not.toHaveBeenCalled();
  });

  it('light without friendly_name does not call setFriendlyName', () => {
    const [md, e, s] = make('light', 'plain', { brightness: 90, supported_color_modes: ['color_temp'] });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.setFriendlyName).not.toHaveBeenCalled();
  });

  it('thermostat auto/heat/cool branches', () => {
    let [md, e, s] = make('climate', 'auto', { hvac_modes: ['heat_cool'], current_temperature: 22, target_temp_low: 20, target_temp_high: 25 });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerAutoModeThermostat).toHaveBeenCalled();
    [md, e, s] = make('climate', 'heat', { hvac_modes: ['heat'], current_temperature: 21, temperature: 23 });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerHeatingThermostat).toHaveBeenCalled();
    [md, e, s] = make('climate', 'cool', { hvac_modes: ['cool'], current_temperature: 24, temperature: 22 });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerCoolingThermostat).toHaveBeenCalled();
  });

  it('fan extended features when direction/oscillating, basic otherwise', () => {
    let [md, e, s] = make('fan', 'dir', { direction: 'forward', preset_modes: ['low', 'high'] });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerCompleteFanControl).toHaveBeenCalledTimes(1);
    [md, e, s] = make('fan', 'osc', { oscillating: true, preset_modes: ['low'] });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerCompleteFanControl).toHaveBeenCalledTimes(1); // fresh mock count
    [md, e, s] = make('fan', 'simple', { preset_modes: ['low', 'high'] });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerCompleteFanControl).not.toHaveBeenCalled();
  });

  it('vacuum triple device type mapping and configuration', () => {
    const [md, e, s] = make('vacuum', 'robby', { activity: 'idle' });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addVacuum).toHaveBeenCalled();
    const vacuumCalls = md.addDeviceTypes.mock.calls.filter((c: any[]) => c[1] === roboticVacuumCleaner);
    expect(vacuumCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('valve mapping', () => {
    const [md, e, s] = make('valve', 'water', { current_position: 70 });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, waterValve);
  });

  it('lock and cover mapping', () => {
    let [md, e, s] = make('lock', 'front', {});
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, doorLockDevice);
    [md, e, s] = make('cover', 'shade', { current_position: 55 });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addDeviceTypes).toHaveBeenCalledWith(e.entity_id, coverDevice);
  });

  it('thermostat base & fan base device types', () => {
    const [md1, e1, s1] = make('climate', 'base', { hvac_modes: ['heat'] });
    addControlEntity(md1, e1 as any, s1 as any, commandHandler, subscribeHandler, mockLog);
    expect(md1.addDeviceTypes).toHaveBeenCalledWith(e1.entity_id, thermostatDevice);
    const [md2, e2, s2] = make('fan', 'base', { preset_modes: ['low'] });
    addControlEntity(md2, e2 as any, s2 as any, commandHandler, subscribeHandler, mockLog);
    expect(md2.addDeviceTypes).toHaveBeenCalledWith(e2.entity_id, fanDevice);
  });

  it('registers all command handlers for light domain', () => {
    const [md, e, s] = make('light', 'cmds', {});
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    const expected = hassCommandConverter.filter((c) => c.domain === 'light').map((c) => c.command);
    const registered = md.addCommandHandler.mock.calls.map((c: any[]) => c[1]);
    expected.forEach((cmd) => expect(registered).toContain(cmd));
  });

  it('registers all subscribe handlers for fan domain', () => {
    const [md, e, s] = make('fan', 'sub', {});
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    const expected = hassSubscribeConverter.filter((x) => x.domain === 'fan').length;
    expect(md.addSubscribeHandler.mock.calls.length).toBe(expected);
  });

  it('executes registered command handler callbacks (light domain)', async () => {
    const [md, e, s] = make('light', 'cb', {});
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
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
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
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
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerAutoModeThermostat).not.toHaveBeenCalled();
    expect(md.addClusterServerHeatingThermostat).not.toHaveBeenCalled();
    expect(md.addClusterServerCoolingThermostat).not.toHaveBeenCalled();
  });

  it('skips attribute mapping when deviceType or clusterId is null', () => {
    const [md, e, s] = make('light', 'nullattr', { dummy_null: true });
    // Inject a temporary null mapping into hassDomainConverter
    const originalLength = hassDomainConverter.length;
    (hassDomainConverter as any).push({ domain: 'light', withAttribute: 'dummy_null', deviceType: null, clusterId: null });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    // Only the base light device type should be added (no extra from dummy_null)
    const deviceTypeCalls = md.addDeviceTypes.mock.calls.filter((c: any[]) => c[0] === e.entity_id);
    expect(deviceTypeCalls.length).toBe(1); // onOffLight only
    // Restore original converter array
    (hassDomainConverter as any).length = originalLength;
  });

  it('light color temperature fallback defaults', () => {
    const [md, e, s] = make('light', 'ctdefaults', { supported_color_modes: ['color_temp'], color_temp_kelvin: undefined });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerColorTemperatureColorControl).toHaveBeenCalled();
    const args = md.addClusterServerColorTemperatureColorControl.mock.calls[0];
    expect(args[1]).toBe(147); // default min_mireds
    expect(args[2]).toBe(500); // default max_mireds
  });

  it('light extended color fallback defaults', () => {
    const [md, e, s] = make('light', 'rgbdefaults', { supported_color_modes: ['hs'], hs_color: [0, 0] });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerColorControl).toHaveBeenCalled();
    const args = md.addClusterServerColorControl.mock.calls[0];
    expect(args[1]).toBe(147); // default min_mireds
    expect(args[2]).toBe(500); // default max_mireds
  });

  it('thermostat auto mode fallback defaults (cover ?? branches)', () => {
    const [md, e, s] = make('climate', 'autodefaults', { hvac_modes: ['heat_cool'] });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerAutoModeThermostat).toHaveBeenCalled();
    const args = md.addClusterServerAutoModeThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([23, 21, 25, 0, 50]);
  });

  it('thermostat cool mode fallback defaults (cover ?? branches)', () => {
    const [md, e, s] = make('climate', 'cooldefaults', { hvac_modes: ['cool'] });
    addControlEntity(md, e as any, s as any, commandHandler, subscribeHandler, mockLog);
    expect(md.addClusterServerCoolingThermostat).toHaveBeenCalled();
    const args = md.addClusterServerCoolingThermostat.mock.calls[0];
    expect(args.slice(1)).toEqual([23, 21, 0, 50]);
  });
});
