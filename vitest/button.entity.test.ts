/**
 * @file vitest/button.entity.test.ts
 * @description This file contains the tests for the addButtonEntity function.
 * @author Luca Liguori
 */

import { mountedOnOffControl, onOffPlugInUnit } from 'matterbridge';
import { OnOff } from 'matterbridge/matter/clusters';

import { addButtonEntity } from '../src/button.entity.js';

type CommandHandler = (data: { endpoint: { setAttribute: (...args: unknown[]) => unknown; log: unknown } }) => void | Promise<void>;

type MutableDeviceLike = {
  addDeviceTypes: (endpoint: string, ...types: unknown[]) => unknown;
  addCommandHandler: (endpoint: string, command: string, handler: CommandHandler) => unknown;
};

function createMockMutableDevice(): MutableDeviceLike & {
  deviceTypes: Record<string, number[]>;
  commandHandlers: Record<string, Record<string, CommandHandler>>;
} {
  const deviceTypes: Record<string, number[]> = {};
  const commandHandlers: Record<string, Record<string, CommandHandler>> = {};

  return {
    deviceTypes,
    commandHandlers,
    addDeviceTypes(endpoint: string, ...types: any[]) {
      const ep = endpoint ?? '';
      if (!deviceTypes[ep]) deviceTypes[ep] = [];
      for (const deviceType of types) deviceTypes[ep].push(deviceType.code);
      return this;
    },
    addCommandHandler(endpoint: string, command: string, handler: CommandHandler) {
      const ep = endpoint ?? '';
      commandHandlers[ep] ||= {};
      commandHandlers[ep][command] = handler;
      return this;
    },
  };
}

function createPlatform(): any {
  return {
    log: {
      debug: vi.fn(),
    },
    ha: {
      callService: vi.fn(async () => {}),
    },
  } as any;
}

describe('addButtonEntity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined for unsupported domain', () => {
    const md = createMockMutableDevice();
    const platform = createPlatform();

    const ep = addButtonEntity(platform, md as any, { entity_id: 'switch.kitchen' } as any, {} as any);

    expect(ep).toBeUndefined();
    expect(Object.keys(md.deviceTypes)).toHaveLength(0);
    expect(Object.keys(md.commandHandlers)).toHaveLength(0);
    expect(platform.ha.callService).not.toHaveBeenCalled();
  });

  it('adds button device types and registers an on handler using the entity id by default', async () => {
    const md = createMockMutableDevice();
    const platform = createPlatform();
    const entity = { entity_id: 'button.doorbell', platform: 'demo' } as any;

    const ep = addButtonEntity(platform, md as any, entity, {} as any);

    expect(ep).toBe(entity.entity_id);
    expect(md.deviceTypes[entity.entity_id]).toEqual([mountedOnOffControl.code, onOffPlugInUnit.code]);
    expect(md.commandHandlers[entity.entity_id]).toHaveProperty('on');

    const endpoint = {
      setAttribute: vi.fn(async () => {}),
      log: { debug: vi.fn() },
    };

    const timeoutPromises: Promise<unknown>[] = [];
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => unknown, _ms?: number) => {
      const result = cb();
      timeoutPromises.push(Promise.resolve(result));
      return { unref: vi.fn() } as any;
    }) as any);

    try {
      await md.commandHandlers[entity.entity_id].on({ endpoint });
      await Promise.all(timeoutPromises);

      expect(platform.ha.callService).toHaveBeenCalledWith('button', 'press', entity.entity_id);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
      expect(endpoint.setAttribute).toHaveBeenCalledWith(OnOff, 'onOff', false, endpoint.log);
      expect(platform.log.debug).toHaveBeenCalledTimes(2);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('uses entity id as endpoint name', () => {
    const md = createMockMutableDevice();
    const platform = createPlatform();
    const entity = { entity_id: 'button.scene_trigger', platform: 'demo' } as any;

    const ep = addButtonEntity(platform, md as any, entity, {} as any);

    expect(ep).toBe(entity.entity_id);
    expect(md.deviceTypes[entity.entity_id]).toEqual([mountedOnOffControl.code, onOffPlugInUnit.code]);
    expect(md.commandHandlers[entity.entity_id]).toHaveProperty('on');
  });
});
