// src\stateCache.test.ts

const NAME = 'StateCache';

import { jest } from '@jest/globals';
import { setupTest } from 'matterbridge/jestutils';
import type { NodeStorage } from 'matterbridge/storage';

import { type HassState, UnitOfTemperature, VacuumActivity } from './homeAssistant.js';
import { StateCache } from './stateCache.js';

// Setup the test environment
await setupTest(NAME, false);

function createState(entityId: string, state = 'on'): HassState {
  const attributes = {
    options: [],
    effect_list: null,
    effect: null,
    supported_color_modes: null,
    color_mode: null,
    brightness: null,
    color_temp_kelvin: null,
    min_color_temp_kelvin: null,
    max_color_temp_kelvin: null,
    xy_color: null,
    hs_color: null,
    rgb_color: null,
    rgbw_color: null,
    rgbww_color: null,
    hvac_modes: [],
    hvac_mode: null,
    current_humidity: null,
    current_temperature: null,
    min_temp: 7,
    max_temp: 35,
    min_humidity: 30,
    max_humidity: 99,
    temperature_unit: UnitOfTemperature.CELSIUS,
    preset_modes: undefined,
    preset_mode: undefined,
    percentage: null,
    direction: null,
    oscillating: null,
    speed_count: 100,
    activity: VacuumActivity.IDLE,
    event_types: [],
    event_type: null,
  } as unknown as HassState['attributes'];

  return {
    entity_id: entityId,
    state,
    last_changed: '2026-04-28T00:00:00.000Z',
    last_reported: '2026-04-28T00:00:00.000Z',
    last_updated: '2026-04-28T00:00:00.000Z',
    attributes,
    context: {
      id: 'context-id',
      parent_id: null,
      user_id: null,
    },
  };
}

describe('StateCache', () => {
  let storedCache: HassState[];
  let context: Pick<NodeStorage, 'get' | 'set'>;

  beforeEach(() => {
    jest.clearAllMocks();
    storedCache = [createState('light.kitchen', 'off')];

    const getMock: NodeStorage['get'] = jest.fn(async <T = any>(_key: string, defaultValue?: T): Promise<T> => {
      return ((storedCache as unknown as T) ?? defaultValue) as T;
    });

    const setMock: NodeStorage['set'] = jest.fn(async <T = any>(_key: string, value: T) => {
      storedCache = value as HassState[];
      return {} as Awaited<ReturnType<NodeStorage['set']>>;
    });

    context = {
      get: getMock,
      set: setMock,
    };
  });

  it('should load, add, get, remove, clear cache, and save cached states', async () => {
    const stateCache = new StateCache();
    const livingRoomState = createState('light.living_room', 'on');

    await stateCache.load(context as NodeStorage);

    expect(context.get).toHaveBeenCalledWith('stateCache', []);
    expect(stateCache.size()).toBe(1);
    expect(stateCache.get('light.kitchen')).toEqual(storedCache[0]);

    stateCache.add(livingRoomState);

    expect(stateCache.size()).toBe(2);
    expect(stateCache.get('light.living_room')).toEqual(livingRoomState);

    stateCache.remove('light.kitchen');

    expect(stateCache.size()).toBe(1);
    expect(stateCache.get('light.kitchen')).toBeUndefined();

    stateCache.clear();

    expect(stateCache.size()).toBe(0);
    expect(stateCache.get('light.living_room')).toBeUndefined();

    await stateCache.save(context as NodeStorage);

    expect(context.set).toHaveBeenCalledWith('stateCache', []);
  });
});
