import { jest } from '@jest/globals';
import { onOffMountedSwitch, onOffOutlet } from 'matterbridge';
import { OnOff } from 'matterbridge/matter/clusters';

import { addHelperEntity } from './helper.entity.js';

type CommandHandler = (data: { endpoint: { setAttribute: (...args: unknown[]) => unknown; log: unknown } }) => void | Promise<void>;

type MutableDeviceLike = {
  setComposedType: (type: string) => unknown;
  setConfigUrl: (url: string) => unknown;
  addDeviceTypes: (endpoint: string, ...types: unknown[]) => unknown;
  addCommandHandler: (endpoint: string, command: string, handler: CommandHandler) => unknown;
};

function createMockMutableDevice(): MutableDeviceLike & {
  lastComposedType?: string;
  lastConfigUrl?: string;
  deviceTypes: Record<string, number[]>;
  commandHandlers: Record<string, Record<string, CommandHandler>>;
} {
  const deviceTypes: Record<string, number[]> = {};
  const commandHandlers: Record<string, Record<string, CommandHandler>> = {};

  return {
    deviceTypes,
    commandHandlers,
    setComposedType(type: string) {
      (this as any).lastComposedType = type;
      return this as any;
    },
    setConfigUrl(url: string) {
      (this as any).lastConfigUrl = url;
      return this as any;
    },
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
  } as unknown as MutableDeviceLike & {
    lastComposedType?: string;
    lastConfigUrl?: string;
    deviceTypes: Record<string, number[]>;
    commandHandlers: Record<string, Record<string, CommandHandler>>;
  };
}

function createPlatform(host: string) {
  return {
    config: { host },
    log: {
      debug: jest.fn(),
    },
    ha: {
      callService: jest.fn(async () => undefined),
    },
  } as any;
}

describe('addHelperEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined for unsupported domain', () => {
    const md = createMockMutableDevice();
    const platform = createPlatform('ws://ha:8123');

    const ep = addHelperEntity(md as any, undefined, { entity_id: 'light.kitchen' } as any, {} as any, platform);

    expect(ep).toBeUndefined();
    expect(Object.keys(md.deviceTypes).length).toBe(0);
    expect(Object.keys(md.commandHandlers).length).toBe(0);
    expect(platform.ha.callService).not.toHaveBeenCalled();
  });

  it('sets composed type + configUrl and adds device types for automation', () => {
    const md = createMockMutableDevice();
    const platform = createPlatform('ws://homeassistant.local:8123');
    const entity = { entity_id: 'automation.test_auto' } as any;

    const ep = addHelperEntity(md as any, undefined, entity, {} as any, platform);

    expect(ep).toBe(entity.entity_id);
    expect(md.lastComposedType).toBe('Hass Automation');
    expect(md.lastConfigUrl).toBe('http://homeassistant.local:8123/config/automation/dashboard');
    expect(md.deviceTypes['']).toEqual([onOffMountedSwitch.code, onOffOutlet.code]);
    expect(md.commandHandlers['']).toHaveProperty('on');
    expect(md.commandHandlers['']).toHaveProperty('off');
  });

  it('converts wss host to https for scene configUrl', () => {
    const md = createMockMutableDevice();
    const platform = createPlatform('wss://ha.example:8123');
    const entity = { entity_id: 'scene.movie_time' } as any;

    addHelperEntity(md as any, undefined, entity, {} as any, platform);

    expect(md.lastComposedType).toBe('Hass Scene');
    expect(md.lastConfigUrl).toBe('https://ha.example:8123/config/scene/dashboard');
  });

  it('sets composed type + configUrl for script', () => {
    const md = createMockMutableDevice();
    const platform = createPlatform('ws://ha:8123');
    const entity = { entity_id: 'script.good_morning' } as any;

    const ep = addHelperEntity(md as any, undefined, entity, {} as any, platform);

    expect(ep).toBe(entity.entity_id);
    expect(md.lastComposedType).toBe('Hass Script');
    expect(md.lastConfigUrl).toBe('http://ha:8123/config/script/dashboard');
  });

  it.each(['automation.test_auto', 'scene.movie_time', 'script.good_morning', 'input_boolean.night_mode', 'input_button.doorbell'])(
    'uses the provided endpoint name without changing composed type or configUrl for %s',
    (entityId) => {
      const md = createMockMutableDevice();
      const platform = createPlatform('ws://ha:8123');
      const endpointName = 'custom-endpoint';
      const entity = { entity_id: entityId } as any;

      const ep = addHelperEntity(md as any, endpointName, entity, {} as any, platform);

      expect(ep).toBe(endpointName);
      expect(md.lastComposedType).toBeUndefined();
      expect(md.lastConfigUrl).toBeUndefined();
      expect(md.deviceTypes[endpointName]).toEqual([onOffMountedSwitch.code, onOffOutlet.code]);
      expect(md.commandHandlers[endpointName]).toHaveProperty('on');
      expect(md.commandHandlers[endpointName]).toHaveProperty('off');
    },
  );

  it('calls correct HA services for on/off and auto-reverts for automation', async () => {
    const md = createMockMutableDevice();
    const platform = createPlatform('ws://ha:8123');
    const entity = { entity_id: 'automation.test_auto' } as any;

    addHelperEntity(md as any, undefined, entity, {} as any, platform);

    const handler = md.commandHandlers[''].on;
    const offHandler = md.commandHandlers[''].off;

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
      await handler({ endpoint });
      await offHandler({ endpoint }); // covers off-handler false path for non-input_boolean domains
      await Promise.all(timeoutPromises);

      expect(platform.ha.callService).toHaveBeenCalledWith('automation', 'trigger', entity.entity_id);
      expect(setTimeoutSpy).toHaveBeenCalled();
      expect(endpoint.setAttribute).toHaveBeenCalledWith(OnOff.Cluster, 'onOff', false, endpoint.log);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('input_button uses press service and auto-reverts', async () => {
    const md = createMockMutableDevice();
    const platform = createPlatform('ws://ha:8123');
    const entity = { entity_id: 'input_button.doorbell' } as any;

    addHelperEntity(md as any, undefined, entity, {} as any, platform);

    const handler = md.commandHandlers[''].on;

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
      await handler({ endpoint });
      await Promise.all(timeoutPromises);

      expect(platform.ha.callService).toHaveBeenCalledWith('input_button', 'press', entity.entity_id);
      expect(setTimeoutSpy).toHaveBeenCalled();
      expect(endpoint.setAttribute).toHaveBeenCalledWith(OnOff.Cluster, 'onOff', false, endpoint.log);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('input_boolean maintains state (no auto-revert) and supports off => turn_off', async () => {
    const md = createMockMutableDevice();
    const platform = createPlatform('ws://ha:8123');
    const entity = { entity_id: 'input_boolean.night_mode' } as any;

    addHelperEntity(md as any, undefined, entity, {} as any, platform);

    const onHandler = md.commandHandlers[''].on;
    const offHandler = md.commandHandlers[''].off;

    const endpoint = {
      setAttribute: jest.fn(async () => undefined),
      log: { debug: jest.fn() },
    };

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    try {
      await onHandler({ endpoint });
      await offHandler({ endpoint });

      expect(platform.ha.callService).toHaveBeenCalledWith('input_boolean', 'turn_on', entity.entity_id);
      expect(platform.ha.callService).toHaveBeenCalledWith('input_boolean', 'turn_off', entity.entity_id);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(endpoint.setAttribute).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
