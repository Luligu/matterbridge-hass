/**
 * Regression tests for complete, cancellable Home Assistant snapshots.
 */
import { HomeAssistant, type HassConfig, type HassDevice, type HassEntity } from '../src/homeAssistant.js';

describe('Home Assistant initialization snapshots', () => {
  let ha: HomeAssistant;
  const config = { state: 'RUNNING' } as HassConfig;

  beforeEach(() => {
    ha = new HomeAssistant('ws://localhost:8123', 'test-token');
    vi.spyOn(ha.log, 'error').mockImplementation(() => {});
    vi.spyOn(ha, 'fetch').mockImplementation(async (type) => {
      if (type === 'get_config') return config;
      if (type === 'get_services') return {};
      return [];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject and preserve the last complete inventory when a late request fails', async () => {
    ha.hassDevices.set('old', { id: 'old' } as HassDevice);
    const published = vi.fn();
    ha.on('devices', published);
    vi.mocked(ha.fetch).mockImplementation(async (type) => {
      if (type === 'get_config') return config;
      if (type === 'get_services') return {};
      if (type === 'config/device_registry/list') return [{ id: 'new' }];
      if (type === 'config/label_registry/list') throw new Error('labels unavailable');
      return [];
    });
    await expect(ha.fetchData()).rejects.toThrow('labels unavailable');
    expect([...ha.hassDevices.keys()]).toEqual(['old']);
    expect(ha.hassServices).toBeNull();
    expect(published).not.toHaveBeenCalled();
  });

  it('should replace stale registry entries when the next complete fetch succeeds', async () => {
    ha.hassDevices.set('removed-device', { id: 'removed-device' } as HassDevice);
    ha.hassEntities.set('light.removed', { entity_id: 'light.removed' } as HassEntity);
    await ha.fetchData();
    expect(ha.hassDevices.size).toBe(0);
    expect(ha.hassEntities.size).toBe(0);
    expect(ha.hassServices).toEqual({});
    expect(ha.fetch).toHaveBeenCalledTimes(7);
  });

  it('should discard a response received after cancellation without issuing further requests', async () => {
    const controller = new AbortController();
    let finish!: (value: unknown) => void;
    vi.mocked(ha.fetch).mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const fetch = ha.fetchData(controller.signal);
    controller.abort();
    finish(config);
    await expect(fetch).rejects.toThrow();
    expect(ha.hassConfig).toBeNull();
    expect(ha.fetch).toHaveBeenCalledTimes(1);
  });

  it('should not start fetching when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(ha.fetchData(controller.signal)).rejects.toThrow();
    expect(ha.fetch).not.toHaveBeenCalled();
  });

  it('should cancel the wait for RUNNING promptly', async () => {
    const controller = new AbortController();
    vi.mocked(ha.fetch).mockResolvedValue({ state: 'STARTING' });
    const fetch = ha.fetchData(controller.signal);
    await vi.waitFor(() => expect(ha.hassConfig?.state).toBe('STARTING'));
    controller.abort();
    await expect(fetch).rejects.toThrow();
    expect(ha.fetch).toHaveBeenCalledTimes(1);
  });
});
