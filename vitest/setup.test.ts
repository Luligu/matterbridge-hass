/**
 * @file vitest/setup.test.ts
 * @description This file contains the tests for the plugin page REST API (setup wizard and device picker).
 * @author Luca Liguori
 */

const NAME = 'Setup';

import { lookup } from 'node:dns/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { BroadcastChannel } from 'node:worker_threads';

import { setupTest } from 'matterbridge/vitest-utils';
import { WebSocketServer } from 'ws';

import type { HassArea, HassDevice, HassEntity, HassLabel, HassState, HomeAssistant } from '../src/homeAssistant.js';
import type { HomeAssistantPlatform, HomeAssistantPlatformConfig } from '../src/module.js';
import {
  applySelection,
  buildSetupItems,
  checkToken,
  discoverHomeAssistant,
  getLocalSubnetHosts,
  getOwnAddresses,
  analyzeDevice,
  getMatterType,
  handleSetupFetch,
  loadHomeAssistantData,
  parseSelection,
  requestMatterbridgeRestart,
  type SetupCapability,
  type SetupItem,
  toHttpUrl,
  toWebSocketUrl,
} from '../src/setup.js';

// Keep the real DNS lookup and answer a host name only where a test asks for it.
vi.mock('node:dns/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:dns/promises')>();
  return { ...original, lookup: vi.fn(original.lookup) };
});

// Setup the test environment
await setupTest(NAME, false);

const SUPPORTED_DOMAINS = [
  'automation',
  'scene',
  'script',
  'input_boolean',
  'input_button',
  'switch',
  'light',
  'lock',
  'fan',
  'cover',
  'climate',
  'valve',
  'vacuum',
  'remote',
  'input_select',
  'select',
  'media_player',
  'sensor',
  'binary_sensor',
  'event',
  'button',
];

const areas: HassArea[] = [{ area_id: 'living', name: 'Living room' } as HassArea];
const labels: HassLabel[] = [{ label_id: 'lights', name: 'Lights' } as HassLabel];
const devices: HassDevice[] = [
  { id: 'dev1', name: 'Ceiling', name_by_user: null, area_id: 'living', labels: ['lights'], disabled_by: null, entry_type: null } as unknown as HassDevice,
  { id: 'dev2', name: 'Plug', name_by_user: 'TV plug', area_id: null, labels: [], disabled_by: null, entry_type: null } as unknown as HassDevice,
  { id: 'dev3', name: 'Backup', name_by_user: null, area_id: null, labels: [], disabled_by: null, entry_type: 'service' } as unknown as HassDevice,
  { id: 'dev4', name: 'Empty', name_by_user: null, area_id: null, labels: [], disabled_by: null, entry_type: null } as unknown as HassDevice,
];
const entity = (entity_id: string, device_id: string | null, name: string | null, extra: Partial<HassEntity> = {}): HassEntity =>
  ({
    id: 'id_' + entity_id,
    entity_id,
    device_id,
    name,
    original_name: null,
    area_id: null,
    labels: [],
    platform: 'demo',
    disabled_by: null,
    hidden_by: null,
    ...extra,
  }) as unknown as HassEntity;
const entities: HassEntity[] = [
  entity('light.ceiling', 'dev1', 'Light'),
  entity('switch.tv_plug', 'dev2', 'Power'),
  entity('sensor.tv_plug_power', 'dev2', null, { original_name: 'Power usage' }),
  entity('sensor.tv_plug_rssi', 'dev2', null),
  entity('switch.tv_plug_led', 'dev2', 'LED', { hidden_by: 'user' }),
  entity('scene.movie', null, 'Movie night', { area_id: 'living', labels: ['lights'] }),
  entity('input_text.note', null, null),
  entity('switch.no_state', null, 'No state'),
];
const state = (entity_id: string, attributes: Record<string, unknown> = {}): HassState => ({ entity_id, state: 'on', attributes }) as unknown as HassState;
const states: HassState[] = [
  state('light.ceiling', { brightness: 100 }),
  state('switch.tv_plug'),
  state('sensor.tv_plug_power', { state_class: 'measurement', device_class: 'power' }),
  state('sensor.tv_plug_rssi', { state_class: 'measurement', device_class: 'signal_strength' }),
  state('switch.tv_plug_led'),
  state('scene.movie'),
  state('input_text.note', { friendly_name: 'Note' }),
];

function createHomeAssistant(connected = false): HomeAssistant {
  return {
    connected,
    hassConfig: connected ? {} : null,
    hassDevices: new Map(devices.map((d) => [d.id, d])),
    hassEntities: new Map(entities.map((e) => [e.entity_id, e])),
    hassStates: new Map(states.map((s) => [s.entity_id, s])),
    hassAreas: new Map(areas.map((a) => [a.area_id, a])),
    hassLabels: new Map(labels.map((l) => [l.label_id, l])),
  } as unknown as HomeAssistant;
}

function createConfig(overrides: Partial<HomeAssistantPlatformConfig> = {}): HomeAssistantPlatformConfig {
  return {
    name: 'matterbridge-hass',
    type: 'DynamicPlatform',
    host: 'ws://homeassistant.local:8123',
    token: 'good',
    certificatePath: '',
    rejectUnauthorized: true,
    whiteList: [],
    blackList: [],
    entityWhiteList: [],
    entityBlackList: [],
    deviceEntityBlackList: {},
    splitNameStrategy: 'Entity name',
    discardHiddenEntities: true,
    filterByArea: '',
    filterByLabel: '',
    ...overrides,
  } as HomeAssistantPlatformConfig;
}

function createPlatform(config = createConfig(), ha = createHomeAssistant(true)): HomeAssistantPlatform {
  const platform = {
    config,
    ha,
    version: '1.5.0',
    supportedDomains: SUPPORTED_DOMAINS,
    log: { logLevel: 'info', notice: vi.fn(), debug: vi.fn() },
    saveConfig: vi.fn(),
    wssSendRestartRequired: vi.fn(),
    // Same rules as MatterbridgePlatform.validateDevice
    validateDevice: (names: string[]): boolean => {
      if (platform.config.whiteList.length > 0 && !names.some((n) => platform.config.whiteList.includes(n))) return false;
      return !names.some((n) => platform.config.blackList.includes(n));
    },
  };
  return platform as unknown as HomeAssistantPlatform;
}

/**
 * Start a fake Home Assistant WebSocket API.
 *
 * @param {'normal' | 'silent' | 'bare' | 'close'} mode - silent: no auth_required (to test the timeout), bare: noise and answers without version and location,
 *  close: close the connection after the auth.
 * @returns {Promise<{ url: string; close: () => Promise<void> }>} The ws url and a close function.
 */
async function startFakeHomeAssistant(mode: 'normal' | 'silent' | 'bare' | 'close' = 'normal'): Promise<{ url: string; close: () => Promise<void> }> {
  const results: Record<string, unknown> = {
    'get_config': { state: 'RUNNING', location_name: 'Home', unit_system: { temperature: '°C', pressure: 'hPa' } },
    'get_services': {},
    'config/device_registry/list': devices,
    'config/entity_registry/list': entities,
    'get_states': states,
    'config/area_registry/list': areas,
    'config/label_registry/list': labels,
  };
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
  wss.on('connection', (ws) => {
    if (mode === 'bare') {
      ws.send('not json');
      ws.send(JSON.stringify({ type: 'event' }));
    }
    if (mode !== 'silent') ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (data) => {
      // oxlint-disable-next-line typescript/no-base-to-string
      const message = JSON.parse(data.toString()) as { type: string; id?: number; access_token?: string };
      if (message.type === 'auth' && mode === 'close') ws.close();
      else if (message.type === 'auth' && mode === 'bare') ws.send(JSON.stringify({ type: 'auth_ok' }));
      else if (mode === 'bare') ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result: {} }));
      else if (message.type === 'auth') ws.send(JSON.stringify(message.access_token === 'good' ? { type: 'auth_ok', ha_version: '2026.10.0' } : { type: 'auth_invalid' }));
      else ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result: results[message.type] ?? null }));
    });
  });
  return {
    url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`,
    close: async () => {
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

describe('Setup page API', () => {
  test('should convert urls when the user types any form', () => {
    expect(toWebSocketUrl('http://ha.local:8123/')).toBe('ws://ha.local:8123');
    expect(toWebSocketUrl('https://ha.local:8123')).toBe('wss://ha.local:8123');
    expect(toWebSocketUrl('ws://ha.local:8123/api/websocket')).toBe('ws://ha.local:8123');
    expect(toWebSocketUrl('wss://ha.local:8123')).toBe('wss://ha.local:8123');
    expect(toWebSocketUrl(' 192.168.1.10:8123 ')).toBe('ws://192.168.1.10:8123');
    expect(toWebSocketUrl('http://ha.local:8123///')).toBe('ws://ha.local:8123');
    expect(toWebSocketUrl('http://ha.local:8123' + '/'.repeat(100000))).toBe('ws://ha.local:8123');
    expect(toHttpUrl('ws://ha.local:8123')).toBe('http://ha.local:8123');
    expect(toHttpUrl('wss://ha.local:8123')).toBe('https://ha.local:8123');
  });

  test('should name the Matter device type when the entity is supported', () => {
    expect(getMatterType('light.a', state('light.a', { brightness: 1 }), SUPPORTED_DOMAINS)).toBe('Dimmable light');
    expect(getMatterType('light.a', state('light.a'), SUPPORTED_DOMAINS)).toBe('On/off light');
    expect(getMatterType('switch.a', undefined, SUPPORTED_DOMAINS)).toBe('Outlet');
    expect(getMatterType('cover.a', undefined, SUPPORTED_DOMAINS)).toBe('Window covering');
    expect(getMatterType('scene.a', undefined, SUPPORTED_DOMAINS)).toBe('Switch');
    expect(getMatterType('sensor.a', state('sensor.a', { state_class: 'measurement', device_class: 'temperature' }), SUPPORTED_DOMAINS)).toBe('Temperature sensor');
    expect(getMatterType('sensor.a', state('sensor.a', { state_class: 'measurement', device_class: 'battery' }), SUPPORTED_DOMAINS)).toBe('Battery');
    expect(getMatterType('sensor.a', state('sensor.a', { state_class: 'measurement', device_class: 'voltage' }), SUPPORTED_DOMAINS)).toBe('Voltage');
    expect(getMatterType('binary_sensor.a', state('binary_sensor.a', { device_class: 'door' }), SUPPORTED_DOMAINS)).toBe('Contact sensor');
    expect(getMatterType('sensor.a', state('sensor.a', { device_class: 'signal_strength' }), SUPPORTED_DOMAINS)).toBeNull();
    expect(getMatterType('input_text.a', undefined, SUPPORTED_DOMAINS)).toBeNull();
  });

  test('should list devices and individual entities when Home Assistant has data', () => {
    const platform = createPlatform(createConfig({ whiteList: ['TV plug', 'scene.movie'], deviceEntityBlackList: { 'TV plug': ['sensor.tv_plug_power'] } }));
    const items = buildSetupItems(platform, platform.ha);
    expect(items.map((i) => i.id)).toEqual(['dev1', 'scene.movie', 'input_text.note', 'dev2']);
    expect(items.find((i) => i.id === 'dev1')).toMatchObject({ name: 'Ceiling', kind: 'device', area: 'Living room', labels: ['Lights'], integration: 'demo', selected: false });
    const plug = items.find((i) => i.id === 'dev2');
    expect(plug?.selected).toBe(true);
    expect(plug?.area).toBe('No area');
    expect(plug?.capabilities).toEqual([
      { entityId: 'switch.tv_plug', name: 'Power', matter: 'Outlet', selected: true, main: true },
      { entityId: 'sensor.tv_plug_power', name: 'Power usage', matter: 'Energy meter', selected: false, main: false },
      { entityId: 'sensor.tv_plug_rssi', name: 'sensor.tv_plug_rssi', matter: null, selected: true, main: false },
    ]);
    expect(items.find((i) => i.id === 'scene.movie')).toMatchObject({ kind: 'entity', name: 'Movie night', area: 'Living room', selected: true });
    expect(items.find((i) => i.id === 'input_text.note')).toMatchObject({ name: 'Note', selected: false, capabilities: [{ matter: null }] });
  });

  test('should use the friendly name and keep hidden entities when configured', () => {
    const platform = createPlatform(createConfig({ splitNameStrategy: 'Friendly name', discardHiddenEntities: false }));
    const items = buildSetupItems(platform, platform.ha);
    expect(items.find((i) => i.id === 'scene.movie')?.name).toBe('Movie night');
    expect(items.find((i) => i.id === 'dev2')?.capabilities.map((c) => c.entityId)).toContain('switch.tv_plug_led');
    // Empty whiteList: every supported row is selected, a Not supported row never is.
    expect(items.filter((i) => i.id !== 'input_text.note').every((i) => i.selected)).toBe(true);
    expect(items.find((i) => i.id === 'input_text.note')?.selected).toBe(false);
  });

  test('should find the main functions and the devices not useful in Matter when analyzing a device', () => {
    type Def = [entityId: string, matter: string | null, deviceClass?: string, category?: string | null, platform?: string, name?: string];
    const analyze = (defs: Def[]): { main: string[]; integration: string; notUseful?: string } => {
      const caps: SetupCapability[] = defs.map(([entityId, matter, , , , name]) => ({ entityId, name: name ?? entityId.split('.')[1], matter, selected: true, main: false }));
      const ents = defs.map(([entityId, , , category, platform]) => entity(entityId, 'dev', null, { entity_category: category ?? null, platform: platform ?? 'mqtt' }));
      const classes = new Map(defs.map(([entityId, , deviceClass]) => [entityId, deviceClass]));
      const result = analyzeDevice(caps, ents, (id) => classes.get(id));
      return { main: result.capabilities.filter((c) => c.main).map((c) => c.entityId), integration: result.integration, notUseful: result.notUseful };
    };
    // Zigbee plug: the switch only, not voltage, power, energy, current, child lock or power outage memory.
    expect(
      analyze([
        ['sensor.voltage', 'Voltage', 'voltage'],
        ['switch.cooler', 'Outlet'],
        ['select.power_outage_memory', 'Mode select', undefined, 'config'],
        ['sensor.power', 'Energy meter', 'power'],
        ['sensor.energy', 'Energy meter', 'energy'],
        ['switch.child_lock', 'Outlet', undefined, null, 'mqtt', 'Child lock'],
      ]),
    ).toEqual({ main: ['switch.cooler'], integration: 'mqtt', notUseful: undefined });
    // Motion sensor with Battery Notes: motion and its own battery; the light level and the Battery Notes entities are extras.
    expect(
      analyze([
        ['binary_sensor.battery_low', 'Battery', 'battery', null, 'battery_notes'],
        ['button.battery_replaced', 'Button', undefined, null, 'battery_notes'],
        ['sensor.lux', 'Light sensor', 'illuminance'],
        ['binary_sensor.motion', 'Occupancy sensor', 'motion'],
        ['sensor.battery', 'Battery', 'battery', 'diagnostic'],
      ]),
    ).toEqual({ main: ['binary_sensor.motion', 'sensor.battery'], integration: 'mqtt', notUseful: undefined });
    // Light: the light, not the effect or power-on behavior selects.
    expect(
      analyze([
        ['light.berandah', 'Color light'],
        ['select.effect', 'Mode select', undefined, null, 'mqtt', 'Effect'],
        ['select.power_on', 'Mode select', undefined, 'config'],
      ]).main,
    ).toEqual(['light.berandah']);
    // Temperature sensor: the measurements and the battery.
    expect(
      analyze([
        ['sensor.t', 'Temperature sensor', 'temperature'],
        ['sensor.h', 'Humidity sensor', 'humidity'],
        ['sensor.battery', 'Battery', 'battery'],
      ]).main,
    ).toEqual(['sensor.t', 'sensor.h', 'sensor.battery']);
    // IR remote: the power button.
    expect(
      analyze([
        ['button.source', 'Button'],
        ['button.power', 'Button', undefined, null, 'mqtt', 'Power'],
      ]).main,
    ).toEqual(['button.power']);
    // Not useful: a bridge with only settings, a gas sensor with only maintenance buttons, a cube with only battery information.
    expect(
      analyze([
        ['switch.turbo', 'Outlet', undefined, null, 'mqtt', 'Turbo'],
        ['switch.permit_join', 'Outlet', undefined, null, 'mqtt', 'Permit Join'],
        ['button.restart', 'Button', undefined, 'config'],
      ]),
    ).toMatchObject({ main: [], notUseful: 'Only maintenance or settings functions reach Matter (Turbo, Permit Join, restart)' });
    expect(
      analyze([
        ['button.restart', 'Button'],
        ['button.self_test', 'Button'],
        ['button.mute', 'Button'],
        ['button.reset', 'Button'],
      ]).notUseful,
    ).toBe('Only maintenance or settings functions reach Matter (restart, self_test, mute…)');
    expect(
      analyze([
        ['button.battery_replaced', 'Button', undefined, null, 'battery_notes'],
        ['sensor.battery', 'Battery', 'battery', null, 'zha'],
      ]),
    ).toEqual({
      main: [],
      integration: 'zha',
      notUseful: 'Only battery information reaches Matter',
    });
    expect(analyze([['sensor.uptime', null]]).notUseful).toBe('Nothing here works in Matter');
    expect(analyzeDevice([], [], (id) => new Map<string, string>().get(id))).toEqual({ capabilities: [], integration: '', notUseful: 'Nothing here works in Matter' });
  });

  test('should start a not synced device with its main functions and keep the saved choices of the others', () => {
    const platform = createPlatform(createConfig({ whiteList: ['dev1'] }));
    const plug = buildSetupItems(platform, platform.ha).find((i) => i.id === 'dev2');
    expect(plug?.selected).toBe(false);
    expect(plug?.capabilities.filter((c) => c.selected).map((c) => c.entityId)).toEqual(['switch.tv_plug']);
    // Saving writes the device entity blacklist only for the synced devices.
    applySelection(platform, buildSetupItems(platform, platform.ha), {
      selected: ['dev1'],
      unchecked: { dev1: [], dev2: ['sensor.tv_plug_power'] },
      onlyDomains: [],
      neverDomains: [],
      reset: false,
    });
    expect(platform.config.deviceEntityBlackList).toEqual({});
  });

  test('should validate the selection when the body is sent by the page', () => {
    expect(parseSelection(null)).toBeUndefined();
    expect(parseSelection({ selected: 'x', unchecked: {}, onlyDomains: [], neverDomains: [] })).toBeUndefined();
    expect(parseSelection({ selected: [], unchecked: null, onlyDomains: [], neverDomains: [] })).toBeUndefined();
    expect(parseSelection({ selected: [], unchecked: { dev1: [1] }, onlyDomains: [], neverDomains: [] })).toBeUndefined();
    expect(parseSelection({ selected: ['dev1'], unchecked: { dev1: ['light.ceiling'] }, onlyDomains: ['light'], neverDomains: [] })).toEqual({
      selected: ['dev1'],
      unchecked: { dev1: ['light.ceiling'] },
      onlyDomains: ['light'],
      neverDomains: [],
      reset: false,
    });
  });

  test('should write the selection to the config and keep the expert entries when saving', () => {
    const config = createConfig({
      whiteList: ['Ceiling', 'switch.split_entity'],
      blackList: ['TV plug', 'Other device'],
      deviceEntityBlackList: { 'Ceiling': ['light.ceiling'], 'Unknown device': ['sensor.x'] },
    });
    const platform = createPlatform(config);
    const items = buildSetupItems(platform, platform.ha);
    applySelection(platform, items, {
      selected: ['dev2', 'scene.movie'],
      unchecked: { dev2: ['sensor.tv_plug_power', 'sensor.not_mine'] },
      onlyDomains: ['light', 'bogus'],
      neverDomains: ['scene'],
      reset: false,
    });
    expect(config.whiteList).toEqual(['switch.split_entity', 'scene.movie', 'dev2']);
    expect(config.blackList).toEqual(['Other device']);
    expect(config.deviceEntityBlackList).toEqual({ 'Unknown device': ['sensor.x'], 'TV plug': ['sensor.tv_plug_power'] });
    expect(config.entityWhiteList).toEqual(['light']);
    expect(config.entityBlackList).toEqual(['scene']);
  });

  test('should save an empty whitelist when nothing is selected', () => {
    const config = createConfig({ whiteList: ['dev1'] });
    const platform = createPlatform(config);
    applySelection(platform, buildSetupItems(platform, platform.ha), { selected: [], unchecked: {}, onlyDomains: [], neverDomains: [], reset: false });
    expect(config.whiteList).toEqual([]);
  });

  test('should clear the expert entries and keep the connection when starting fresh', () => {
    const config = createConfig({
      whiteList: ['Ceiling', 'switch.split_entity'],
      blackList: ['Other device'],
      deviceEntityBlackList: { 'Unknown device': ['sensor.x'] },
      filterByArea: 'Kitchen',
      filterByLabel: 'Matter',
      splitEntities: ['switch.split_entity'],
      splitByLabel: 'Split',
    });
    const platform = createPlatform(config);
    const items = buildSetupItems(platform, platform.ha);
    applySelection(platform, items, { selected: ['dev1'], unchecked: {}, onlyDomains: [], neverDomains: [], reset: true });
    expect(config).toMatchObject({
      host: 'ws://homeassistant.local:8123',
      token: 'good',
      whiteList: ['dev1'],
      blackList: [],
      deviceEntityBlackList: {},
      filterByArea: '',
      filterByLabel: '',
      splitEntities: [],
      splitByLabel: '',
    });
  });

  test('should check the token when Home Assistant answers', async () => {
    const server = await startFakeHomeAssistant();
    expect(await checkToken(server.url.replace('ws://', 'http://'), 'good')).toEqual({ ok: true, version: '2026.10.0', locationName: 'Home' });
    expect(await checkToken(server.url, 'wrong')).toMatchObject({ ok: false, error: 'rejected' });
    expect(await checkToken(server.url, '')).toMatchObject({ ok: false, error: 'invalid' });
    expect(await checkToken(server.url, 'good', '/not/existing/ca.pem')).toMatchObject({ ok: false, error: 'unreachable' });
    await server.close();
    expect(await checkToken(server.url, 'good')).toMatchObject({ ok: false, error: 'unreachable' });
  });

  test('should check the token when Home Assistant sends noise, no version or closes', async () => {
    const bare = await startFakeHomeAssistant('bare');
    expect(await checkToken(bare.url, 'good')).toEqual({ ok: true, version: '', locationName: undefined });
    await bare.close();
    const closing = await startFakeHomeAssistant('close');
    expect(await checkToken(closing.url, 'good')).toEqual({ ok: false, error: 'unreachable', message: 'Connection closed by Home Assistant' });
    await closing.close();
  });

  test('should time out the token check when Home Assistant stays silent', async () => {
    const server = await startFakeHomeAssistant('silent');
    expect(await checkToken(server.url, 'good', undefined, true, 200)).toMatchObject({ ok: false, error: 'unreachable', message: 'Home Assistant did not answer in time' });
    await server.close();
  });

  test('should discover Home Assistant when the configured host answers', async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/manifest.json') res.end(JSON.stringify({ name: 'Home Assistant' }));
      else res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as AddressInfo).port;
    // The Matterbridge computer is checked first and the saved address is tagged, not listed twice.
    const local = await discoverHomeAssistant(`ws://127.0.0.1:${port}`, 500, [], ['127.0.0.1'], [port]);
    expect(local).toEqual([{ url: `http://127.0.0.1:${port}`, label: 'On the Matterbridge computer', local: true, saved: true }]);
    // A loopback answer is shown with the address of the Matterbridge computer, and names are resolved.
    const own = await discoverHomeAssistant(`ws://localhost:${port}`, 500, ['192.0.2.10'], [], [port]);
    expect(own[0]).toEqual({ url: `http://192.0.2.10:${port}`, label: 'On the Matterbridge computer', local: true, saved: true });
    const unresolved = await discoverHomeAssistant('ws://not-existing-host.invalid:1', 300, [], [], []);
    expect(unresolved).toEqual([]);
    const notFound = await discoverHomeAssistant(`ws://127.0.0.1:${port}/nothing-here`, 500, [], [], []);
    expect(notFound.some((s) => s.url.includes(`${port}`))).toBe(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('should name the servers found and keep the order when nothing is saved', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : '';
      if (url === 'http://homeassistant.local:8123/manifest.json' || url === 'http://192.0.2.20:8123/manifest.json')
        return new Response(JSON.stringify({ name: 'Home Assistant' }));
      throw new Error('offline');
    });
    vi.mocked(lookup).mockResolvedValueOnce({ address: '192.0.2.10', family: 4 });
    // homeassistant.local resolves to the Matterbridge computer: it is shown as local with its name.
    expect(await discoverHomeAssistant('', 100, ['192.0.2.10'], ['192.0.2.20'], [8123])).toEqual([
      { url: 'http://192.0.2.10:8123', label: 'Found on your network', local: true, name: 'homeassistant.local' },
      { url: 'http://192.0.2.20:8123', label: 'Found on your network', local: false },
    ]);
    fetchSpy.mockRestore();
  });

  test('should list the local network addresses without our own when scanning', () => {
    const hosts = getLocalSubnetHosts(['192.168.1.5']);
    expect(hosts.length).toBe(253);
    expect(hosts).not.toContain('192.168.1.5');
    expect(hosts[0]).toBe('192.168.1.1');
    expect(getOwnAddresses().every((a) => !a.startsWith('127.'))).toBe(true);
    expect(getLocalSubnetHosts().every((h) => /^\d+\.\d+\.\d+\.\d+$/.test(h))).toBe(true);
  });

  test('should restart Matterbridge when Matterbridge answers on its channel', async () => {
    const matterbridge = new BroadcastChannel('broadcast-channel');
    matterbridge.onmessage = (event: unknown): void => {
      const message = (event as { data: { type: string; dst: string; id: number } }).data;
      if (message.type === 'matterbridge_restart' && message.dst === 'matterbridge') {
        // Other messages on the channel are ignored.
        matterbridge.postMessage({ type: 'matterbridge_restart', src: 'matterbridge', dst: 'platform', id: 0, result: { success: false } });
        matterbridge.postMessage({ ...message, src: 'matterbridge', dst: 'platform', result: { success: true } });
      }
    };
    const platform = createPlatform();
    expect(await handleSetupFetch(platform, 'POST', 'restart', {}, null)).toEqual({ ok: true });
    matterbridge.close();
    expect(await requestMatterbridgeRestart(100)).toBe(false);
  });

  test('should load the data with a temporary connection when the plugin is not connected', async () => {
    const server = await startFakeHomeAssistant();
    const platform = createPlatform(createConfig({ host: server.url }), createHomeAssistant(false));
    const ha = await loadHomeAssistantData(platform, false);
    expect(ha.hassDevices.size).toBe(devices.length);
    expect(await loadHomeAssistantData(platform, false)).toBe(ha);
    expect(await loadHomeAssistantData(platform, true)).not.toBe(ha);
    await server.close();
  });

  test('should answer the page routes when called through onFetch', async () => {
    const server = await startFakeHomeAssistant();
    const config = createConfig({ host: '', token: '' });
    const platform = createPlatform(config, createHomeAssistant(false));

    expect(await handleSetupFetch(platform, 'GET', 'status', {}, null)).toEqual({ configured: false, connected: false, host: '', version: '1.5.0' });
    expect(await handleSetupFetch(platform, 'GET', 'items', {}, null)).toEqual({ ok: false, error: 'not-configured' });
    expect(await handleSetupFetch(platform, 'POST', 'token', {}, { url: server.url })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await handleSetupFetch(platform, 'POST', 'token', {}, { url: server.url, token: 'wrong' })).toMatchObject({ ok: false, error: 'rejected' });
    expect(platform.saveConfig).not.toHaveBeenCalled();

    expect(await handleSetupFetch(platform, 'POST', 'token', {}, { url: server.url.replace('ws://', 'http://'), token: ' good ' })).toMatchObject({ ok: true });
    expect(config.host).toBe(server.url);
    expect(config.token).toBe('good');
    expect(platform.saveConfig).toHaveBeenCalledWith(config);
    expect(platform.wssSendRestartRequired).toHaveBeenCalled();

    const items = (await handleSetupFetch(platform, 'GET', 'items', { refresh: '1' }, null)) as { ok: boolean; items: SetupItem[]; domains: string[] };
    expect(items.ok).toBe(true);
    expect(items.items.length).toBe(4);
    expect(items.domains).toBe(SUPPORTED_DOMAINS);

    expect(await handleSetupFetch(platform, 'POST', 'save', {}, { selected: 'bad' })).toEqual({ ok: false, error: 'invalid' });
    expect(await handleSetupFetch(platform, 'POST', 'save', {}, { selected: ['dev1'], unchecked: {}, onlyDomains: [], neverDomains: [] })).toEqual({ ok: true });
    expect(config.whiteList).toEqual(['dev1']);
    expect(platform.saveConfig).toHaveBeenCalledTimes(2);

    expect(await handleSetupFetch(platform, 'GET', 'unknown', {}, null)).toBeUndefined();
    expect(await handleSetupFetch(platform, 'GET', undefined, {}, null)).toBeUndefined();
    expect(await handleSetupFetch(platform, 'POST', 'token', {}, null)).toMatchObject({ ok: false, error: 'invalid' });
    await server.close();

    config.host = 'ws://127.0.0.1:1';
    expect(await handleSetupFetch(platform, 'GET', 'items', { refresh: '1' }, null)).toMatchObject({ ok: false, error: 'unreachable' });
  });

  test('should report a rejected token at once when the saved token is wrong', async () => {
    const server = await startFakeHomeAssistant();
    const platform = createPlatform(createConfig({ host: server.url, token: 'wrong' }), createHomeAssistant(false));
    expect(await handleSetupFetch(platform, 'GET', 'items', {}, null)).toMatchObject({ ok: false, error: 'rejected' });
    await server.close();
  });

  test('should use the plugin connection and discover when the plugin is connected', async () => {
    const platform = createPlatform(createConfig({ entityWhiteList: undefined, entityBlackList: undefined }));
    const items = (await handleSetupFetch(platform, 'get', 'items', undefined, null)) as { ok: boolean; items: SetupItem[]; onlyDomains: string[]; neverDomains: string[] };
    expect(items).toMatchObject({ ok: true, onlyDomains: [], neverDomains: [] });
    expect(items.items.length).toBe(4);
    expect(await handleSetupFetch(platform, 'GET', 'status', undefined, null)).toMatchObject({ configured: true, connected: true, host: 'http://homeassistant.local:8123' });
    // No network scan in the test: every probe fails at once and the saved address is an IP (no name lookup).
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    platform.config.host = 'ws://127.0.0.1:1';
    expect(await handleSetupFetch(platform, 'GET', 'discover', undefined, null)).toEqual({ servers: [] });
    fetchSpy.mockRestore();
  });

  test('should report Home Assistant unreachable when the plugin is connected but has no data', async () => {
    const ha = createHomeAssistant(true);
    (ha as unknown as { hassConfig: null }).hassConfig = null;
    const platform = createPlatform(createConfig({ host: 'ws://127.0.0.1:1' }), ha);
    expect(await handleSetupFetch(platform, 'GET', 'items', {}, null)).toMatchObject({ ok: false, error: 'unreachable' });
  });

  test('should name the rows with fallbacks when the registry has missing data', () => {
    const ha = createHomeAssistant(true);
    ha.hassEntities.set('scene.bare', entity('scene.bare', null, null, { area_id: 'gone', labels: undefined }));
    ha.hassEntities.set('scene.label', entity('scene.label', null, null, { labels: ['gone'] }));
    ha.hassStates.set('scene.bare', state('scene.bare'));
    ha.hassStates.set('scene.label', state('scene.label', { friendly_name: 'Label scene' }));
    const platform = createPlatform(createConfig({ splitNameStrategy: 'Friendly name' }), ha);
    const items = buildSetupItems(platform, ha);
    expect(items.find((i) => i.id === 'scene.bare')).toMatchObject({ name: 'scene.bare', area: 'No area', labels: [] });
    expect(items.find((i) => i.id === 'scene.label')).toMatchObject({ name: 'Label scene', labels: ['gone'] });
    // Without the lists in the config the selection is written from scratch.
    const config = platform.config as unknown as Record<string, unknown>;
    delete config['whiteList'];
    delete config['blackList'];
    delete config['deviceEntityBlackList'];
    applySelection(platform, items, { selected: ['scene.bare'], unchecked: {}, onlyDomains: [], neverDomains: [], reset: false });
    expect(platform.config).toMatchObject({ whiteList: ['scene.bare'], blackList: [], deviceEntityBlackList: {} });
  });
});
