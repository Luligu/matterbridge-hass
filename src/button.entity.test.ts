import { jest } from '@jest/globals';
import { onOffMountedSwitch, onOffOutlet } from 'matterbridge';
import { OnOff } from 'matterbridge/matter/clusters';

import { addButtonEntity } from './button.entity.js';

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
      return this as any;
    },
    addCommandHandler(endpoint: string, command: string, handler: CommandHandler) {
      const ep = endpoint ?? '';
      commandHandlers[ep] ||= {};
      commandHandlers[ep][command] = handler;
      return this as any;
    },
  } as MutableDeviceLike & {
    deviceTypes: Record<string, number[]>;
    commandHandlers: Record<string, Record<string, CommandHandler>>;
  };
}

function createPlatform() {
  return {
    log: {
      debug: jest.fn(),
    },
    ha: {
      callService: jest.fn(async () => undefined),
    },
  } as any;
}

describe('addButtonEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined for unsupported domain', () => {
    const md = createMockMutableDevice();
    const platform = createPlatform();

    const ep = addButtonEntity(md as any, undefined, { entity_id: 'switch.kitchen' } as any, {} as any, platform);

    expect(ep).toBeUndefined();
    expect(Object.keys(md.deviceTypes)).toHaveLength(0);
    expect(Object.keys(md.commandHandlers)).toHaveLength(0);
    expect(platform.ha.callService).not.toHaveBeenCalled();
  });

  it('adds button device types and registers an on handler using the entity id by default', async () => {
    const md = createMockMutableDevice();
    const platform = createPlatform();
    const entity = { entity_id: 'button.doorbell', platform: 'demo' } as any;

    const ep = addButtonEntity(md as any, undefined, entity, {} as any, platform);

    expect(ep).toBe(entity.entity_id);
    expect(md.deviceTypes['']).toEqual([onOffMountedSwitch.code, onOffOutlet.code]);
    expect(md.commandHandlers['']).toHaveProperty('on');

    const endpoint = {
      setAttribute: jest.fn(async () => undefined),
      log: { debug: jest.fn() },
    };

    const timeoutPromises: Promise<unknown>[] = [];
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((cb: (...args: unknown[]) => unknown, _ms?: number) => {
      const result = cb();
      timeoutPromises.push(Promise.resolve(result));
      return { unref: jest.fn() } as any;
    }) as any);

    try {
      await md.commandHandlers[''].on({ endpoint });
      await Promise.all(timeoutPromises);

      expect(platform.ha.callService).toHaveBeenCalledWith('button', 'press', entity.entity_id);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
      expect(endpoint.setAttribute).toHaveBeenCalledWith(OnOff.Cluster, 'onOff', false, endpoint.log);
      expect(platform.log.debug).toHaveBeenCalledTimes(2);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('uses the provided endpoint name', () => {
    const md = createMockMutableDevice();
    const platform = createPlatform();
    const endpointName = 'custom-button-endpoint';
    const entity = { entity_id: 'button.scene_trigger', platform: 'demo' } as any;

    const ep = addButtonEntity(md as any, endpointName, entity, {} as any, platform);

    expect(ep).toBe(endpointName);
    expect(md.deviceTypes[endpointName]).toEqual([onOffMountedSwitch.code, onOffOutlet.code]);
    expect(md.commandHandlers[endpointName]).toHaveProperty('on');
  });
});
