/**
 * @file src/setup.ts
 * @description This file contains the REST API used by the plugin frontend (setup wizard and device picker).
 * @author Luca Liguori
 * @created 2026-10-10
 * @version 1.0.0
 * @license Apache-2.0
 *
 * Copyright 2026, 2027, 2028 Luca Liguori.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { lookup } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { BroadcastChannel } from 'node:worker_threads';

import { getErrorMessage, isValidArray, isValidObject, isValidString } from 'matterbridge/utils';
import { type ClientOptions, type RawData, WebSocket } from 'ws';

import { hassDomainBinarySensorsConverter, hassDomainConverter, hassDomainSensorsConverter } from './converters.js';
import { getDomain, isDisabled, isHidden } from './helpers.js';
import { type HassEntity, type HassState, HomeAssistant } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';

/** A function of a device (one Home Assistant entity) as shown in the device picker. */
export interface SetupCapability {
  entityId: string;
  name: string;
  /** What the entity becomes in Matter, or null when it is not supported. */
  matter: string | null;
  selected: boolean;
  /** True for the main function of the device (e.g. the switch of a plug): a device that is not synced yet starts with only these ticked. */
  main: boolean;
}

/** A row of the device picker: a Home Assistant device or an individual entity. */
export interface SetupItem {
  id: string;
  name: string;
  kind: 'device' | 'entity';
  area: string;
  labels: string[];
  integration: string;
  selected: boolean;
  capabilities: SetupCapability[];
  /** Why the device is not useful in Matter (e.g. only maintenance buttons), or undefined when it is. */
  notUseful?: string;
}

/** A Home Assistant instance found by the discovery. */
export interface DiscoveredServer {
  /** The url with the IP address (names like homeassistant.local don't resolve on every computer). */
  url: string;
  label: string;
  /** True when Home Assistant runs on the Matterbridge computer: the browser reaches it at the Matterbridge address. */
  local: boolean;
  /** The name it was found with, when not an IP address (e.g. homeassistant.local). */
  name?: string;
  /** True when this is the address saved in the plugin config. */
  saved?: boolean;
}

/** Result of a token check. */
export interface TokenCheckResult {
  ok: boolean;
  error?: 'rejected' | 'unreachable' | 'invalid';
  message?: string;
  version?: string;
  locationName?: string;
}

/** Friendly names for the Matter device types that don't read well when split. */
const FRIENDLY_DEVICE_TYPES: Readonly<Record<string, string>> = {
  OnOffPlugInUnit: 'Outlet',
  OnOffLight: 'On/off light',
  PowerSource: 'Battery',
  ElectricalSensor: 'Energy meter',
  SmokeCOAlarm: 'Smoke / CO alarm',
  RoboticVacuumCleaner: 'Robot vacuum',
  BasicVideoPlayer: 'Media player',
};

/** Matter names for the helper and other domains that don't use the domain converters. */
const DOMAIN_MATTER_TYPES: Readonly<Record<string, string>> = {
  automation: 'Switch',
  scene: 'Switch',
  script: 'Switch',
  input_boolean: 'Switch',
  input_button: 'Button',
  button: 'Button',
  event: 'Button events',
};

/**
 * Return the value as a plain record when it is an object.
 *
 * @param {unknown} value - The value received from the network or the frontend.
 * @returns {Record<string, unknown> | undefined} The record, or undefined if the value is not an object.
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return isValidObject(value) ? (value as Record<string, unknown>) : undefined;
}

/** Data loaded with a temporary connection while the plugin is not connected (setup mode). */
const setupData = new WeakMap<HomeAssistantPlatform, HomeAssistant>();

/**
 * Convert a Home Assistant url to the WebSocket form used in the config (ws:// or wss://).
 *
 * @param {string} url - The url typed or discovered (http, https, ws or wss).
 * @returns {string} The ws:// or wss:// url without trailing slash.
 */
export function toWebSocketUrl(url: string): string {
  // Plain string checks instead of a /\/+$/ regex: the url comes from the page and the regex is slow on many slashes.
  let trimmed = url.trim();
  if (trimmed.endsWith('/api/websocket')) trimmed = trimmed.slice(0, -'/api/websocket'.length);
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  if (trimmed.startsWith('https://')) return 'wss://' + trimmed.slice(8);
  if (trimmed.startsWith('http://')) return 'ws://' + trimmed.slice(7);
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
  return 'ws://' + trimmed;
}

/**
 * Convert a Home Assistant url to the http form used in the browser.
 *
 * @param {string} url - The url (http, https, ws or wss).
 * @returns {string} The http:// or https:// url without trailing slash.
 */
export function toHttpUrl(url: string): string {
  const ws = toWebSocketUrl(url);
  return ws.startsWith('wss://') ? 'https://' + ws.slice(6) : 'http://' + ws.slice(5);
}

/**
 * Get what an entity becomes in Matter, using the same converters the plugin uses.
 *
 * @param {string} entityId - The entity id.
 * @param {HassState | undefined} state - The entity state (needed for lights and sensors).
 * @param {readonly string[]} supportedDomains - The domains supported by the plugin.
 * @returns {string | null} A friendly Matter device type name, or null if not supported.
 */
export function getMatterType(entityId: string, state: HassState | undefined, supportedDomains: readonly string[]): string | null {
  const domain = getDomain(entityId);
  if (!supportedDomains.includes(domain)) return null;
  if (domain in DOMAIN_MATTER_TYPES) return DOMAIN_MATTER_TYPES[domain];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const attributes = (state?.attributes ?? {}) as Record<string, unknown>;
  let deviceTypeName: string | undefined;
  if (domain === 'sensor') {
    deviceTypeName = hassDomainSensorsConverter.find((c) => c.withStateClass === attributes['state_class'] && c.withDeviceClass === attributes['device_class'])?.deviceType.name;
  } else if (domain === 'binary_sensor') {
    deviceTypeName = hassDomainBinarySensorsConverter.find((c) => c.withDeviceClass === attributes['device_class'])?.deviceType.name;
  } else {
    // The last match wins: the converters list the richer device types (dimmable, color...) after the basic one.
    const matches = hassDomainConverter.filter((c) => c.domain === domain && (c.withAttribute === undefined || attributes[c.withAttribute] !== undefined));
    deviceTypeName = matches.at(-1)?.deviceType?.name;
  }
  if (deviceTypeName === undefined) return null;
  // Voltage maps to the battery voltage only on battery devices: show what it measures.
  if (domain === 'sensor' && attributes['device_class'] === 'voltage') return 'Voltage';
  return FRIENDLY_DEVICE_TYPES[deviceTypeName] ?? deviceTypeName.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ ([A-Z])/g, (m) => m.toLowerCase());
}

/**
 * List the IPv4 addresses of this computer (without loopback).
 *
 * @returns {string[]} The addresses.
 */
export function getOwnAddresses(): string[] {
  const own: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    /* v8 ignore next cause networkInterfaces() never lists an interface without addresses */
    for (const address of addresses ?? []) if (address.family === 'IPv4' && !address.internal) own.push(address.address);
  }
  return own;
}

/**
 * List the addresses of the local IPv4 networks (the /24 of each network interface), without our own addresses.
 *
 * @param {string[]} [own] - The addresses of this computer.
 * @returns {string[]} The IPv4 addresses to scan.
 */
export function getLocalSubnetHosts(own: string[] = getOwnAddresses()): string[] {
  const prefixes = new Set(own.map((address) => address.split('.').slice(0, 3).join('.')));
  const hosts: string[] = [];
  for (const prefix of prefixes) {
    for (let i = 1; i < 255; i++) if (!own.includes(`${prefix}.${i}`)) hosts.push(`${prefix}.${i}`);
  }
  return hosts;
}

/**
 * Build the http url for a host and port (no port for 80).
 *
 * @param {string} host - The host name or address.
 * @param {number} port - The port.
 * @returns {string} The url.
 */
const httpUrl = (host: string, port: number): string => (port === 80 ? `http://${host}` : `http://${host}:${port}`);

/**
 * Look for Home Assistant: first on the Matterbridge computer (preferred), then the saved address and every address of the local networks.
 * Ports 8123 and 80 are checked. Results use IP addresses and an instance found more than once is listed once.
 *
 * @param {string} configuredHost - The host saved in the config, marked as saved in the results.
 * @param {number} [timeout] - Timeout for each probe in ms.
 * @param {string[]} [own] - The addresses of the Matterbridge computer.
 * @param {string[]} [subnetHosts] - The network addresses to scan (default: the local /24 networks).
 * @param {number[]} [ports] - The ports to check.
 * @returns {Promise<DiscoveredServer[]>} The instances found: the Matterbridge computer first, then the saved one, then the network.
 */
export async function discoverHomeAssistant(
  configuredHost: string,
  timeout = 2500,
  own: string[] = getOwnAddresses(),
  subnetHosts: string[] = getLocalSubnetHosts(own),
  ports: number[] = [8123, 80],
): Promise<DiscoveredServer[]> {
  const candidates: DiscoveredServer[] = [];
  for (const port of ports) {
    for (const host of ['localhost', ...own]) candidates.push({ url: httpUrl(host, port), label: 'On the Matterbridge computer', local: true });
  }
  candidates.push({ url: 'http://homeassistant:8123', label: 'On the Matterbridge computer (add-on)', local: true });
  if (isValidString(configuredHost, 1)) candidates.push({ url: toHttpUrl(configuredHost), label: 'In your settings', local: false });
  candidates.push({ url: 'http://homeassistant.local:8123', label: 'Found on your network', local: false });
  for (const port of ports) {
    for (const host of subnetHosts) candidates.push({ url: httpUrl(host, port), label: 'Found on your network', local: false });
  }
  const unique = candidates.filter((c, i) => candidates.findIndex((o) => o.url === c.url) === i);
  // Network addresses get a short timeout (a LAN answers fast) and are probed in batches to keep the open sockets low on small devices.
  const scanTimeout = Math.min(timeout, 1000);
  const found: DiscoveredServer[] = [];
  for (let i = 0; i < unique.length; i += 128) {
    const batch = unique.slice(i, i + 128);
    const results = await Promise.all(batch.map(async (c) => ((await probeHomeAssistant(c.url, c.local ? timeout : scanTimeout)) ? c : null)));
    found.push(...results.filter((r): r is DiscoveredServer => r !== null));
  }
  // Show IP addresses and list each instance once: the candidates order keeps the Matterbridge computer first.
  const saved = isValidString(configuredHost, 1) ? (await resolveServer({ url: toHttpUrl(configuredHost), label: '', local: false }, own)).url : '';
  const servers: DiscoveredServer[] = [];
  for (const server of found) {
    const resolved = await resolveServer(server, own);
    if (servers.some((s) => s.url === resolved.url)) continue;
    servers.push(resolved.url === saved ? { ...resolved, saved: true } : resolved);
  }
  return servers;
}

/**
 * Replace the host name of a found server with its IPv4 address. A loopback address becomes the address of this computer.
 *
 * @param {DiscoveredServer} server - The found server.
 * @param {string[]} own - The addresses of this computer.
 * @returns {Promise<DiscoveredServer>} The server with the IP url and the name it was found with.
 */
async function resolveServer(server: DiscoveredServer, own: string[]): Promise<DiscoveredServer> {
  const url = new URL(server.url);
  const name = isIP(url.hostname) ? undefined : url.hostname;
  let address = url.hostname;
  if (name !== undefined) {
    try {
      address = (await lookup(name, { family: 4 })).address;
    } catch {
      return server;
    }
  }
  const local = server.local || address.startsWith('127.') || own.includes(address);
  if (address.startsWith('127.') && own.length > 0) address = own[0];
  url.hostname = address;
  const result: DiscoveredServer = { ...server, url: url.toString().replace(/\/$/, ''), local };
  if (name !== undefined && name !== 'localhost') result.name = name;
  return result;
}

/**
 * Ask Matterbridge to restart, like its own Restart button does.
 * It uses the Matterbridge internal message channel: if a future Matterbridge doesn't answer, the page asks the user to restart from Matterbridge.
 *
 * @param {number} [timeout] - Time to wait for Matterbridge to accept the request in ms.
 * @returns {Promise<boolean>} True if Matterbridge accepted the restart.
 */
export async function requestMatterbridgeRestart(timeout = 3000): Promise<boolean> {
  const channel = new BroadcastChannel('broadcast-channel');
  const id = Math.floor(Math.random() * 900000000) + 100000000;
  try {
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeout);
      channel.onmessage = (event: unknown): void => {
        const message = asRecord(asRecord(event)?.['data']);
        if (message?.['id'] === id && message['type'] === 'matterbridge_restart' && message['dst'] === 'platform') {
          clearTimeout(timer);
          resolve(asRecord(message['result'])?.['success'] === true);
        }
      };
      channel.postMessage({ type: 'matterbridge_restart', src: 'platform', dst: 'matterbridge', id, timestamp: Date.now(), params: undefined });
    });
  } finally {
    channel.onmessage = null;
    channel.close();
  }
}

/**
 * Check if a url answers like Home Assistant (its web manifest names Home Assistant).
 *
 * @param {string} url - The http url to probe.
 * @param {number} timeout - Timeout in ms.
 * @returns {Promise<boolean>} True if Home Assistant answered.
 */
async function probeHomeAssistant(url: string, timeout: number): Promise<boolean> {
  try {
    const response = await fetch(`${url}/manifest.json`, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) return false;
    const manifest: unknown = await response.json();
    const name = asRecord(manifest)?.['name'];
    return typeof name === 'string' && name.includes('Home Assistant');
  } catch {
    return false;
  }
}

/**
 * Check a long-lived access token by authenticating on the Home Assistant WebSocket API.
 *
 * @param {string} url - The Home Assistant url (any form).
 * @param {string} token - The long-lived access token.
 * @param {string} [certificatePath] - Optional CA certificate for wss://.
 * @param {boolean} [rejectUnauthorized] - Reject self-signed certificates for wss://.
 * @param {number} [timeout] - Timeout in ms.
 * @returns {Promise<TokenCheckResult>} The result of the check.
 */
export async function checkToken(url: string, token: string, certificatePath?: string, rejectUnauthorized = true, timeout = 10000): Promise<TokenCheckResult> {
  if (!isValidString(url, 1) || !isValidString(token, 1)) return { ok: false, error: 'invalid', message: 'Address and token are required' };
  let ws: WebSocket;
  try {
    const ca = isValidString(certificatePath, 1) ? readFileSync(certificatePath) : undefined;
    // Same TLS options as HomeAssistant.connect(): top level for Node, nested under tls for Bun.
    ws = new WebSocket(toWebSocketUrl(url) + '/api/websocket', { ca, rejectUnauthorized, tls: { ca, rejectUnauthorized } } as ClientOptions);
  } catch (error) {
    return { ok: false, error: 'unreachable', message: getErrorMessage(error) };
  }
  return new Promise((resolve) => {
    let version = '';
    let timer: NodeJS.Timeout | undefined;
    const finish = (result: TokenCheckResult): void => {
      clearTimeout(timer);
      ws.removeAllListeners();
      /* v8 ignore next cause it only swallows a late socket error after the check is finished */
      ws.on('error', () => null);
      ws.close();
      resolve(result);
    };
    timer = setTimeout(() => finish({ ok: false, error: 'unreachable', message: 'Home Assistant did not answer in time' }), timeout);
    ws.on('error', (error) => finish({ ok: false, error: 'unreachable', message: getErrorMessage(error) }));
    ws.on('close', () => finish({ ok: false, error: 'unreachable', message: 'Connection closed by Home Assistant' }));
    ws.on('message', (data: RawData) => {
      let message: Record<string, unknown> | undefined;
      try {
        // oxlint-disable-next-line typescript/no-base-to-string
        message = asRecord(JSON.parse(data.toString()));
      } catch {
        return;
      }
      if (message?.['type'] === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      } else if (message?.['type'] === 'auth_invalid') {
        finish({ ok: false, error: 'rejected', message: 'Home Assistant rejected the token' });
      } else if (message?.['type'] === 'auth_ok') {
        version = typeof message['ha_version'] === 'string' ? message['ha_version'] : '';
        ws.send(JSON.stringify({ id: 1, type: 'get_config' }));
      } else if (message?.['type'] === 'result' && message['id'] === 1) {
        const locationName = asRecord(message['result'])?.['location_name'];
        finish({ ok: true, version, locationName: typeof locationName === 'string' ? locationName : undefined });
      }
    });
  });
}

/**
 * Get the Home Assistant data for the device picker.
 * Uses the plugin connection when it is connected, otherwise a temporary connection with the saved host and token.
 *
 * @param {HomeAssistantPlatform} platform - The platform.
 * @param {boolean} refresh - Reload the data of the temporary connection.
 * @returns {Promise<HomeAssistant>} A HomeAssistant instance with devices, entities, states, areas and labels.
 */
export async function loadHomeAssistantData(platform: HomeAssistantPlatform, refresh: boolean): Promise<HomeAssistant> {
  if (platform.ha.connected && platform.ha.hassConfig !== null) return platform.ha;
  const cached = setupData.get(platform);
  if (cached && !refresh) return cached;
  const ha = new HomeAssistant(toWebSocketUrl(platform.config.host), platform.config.token, 60, 0, platform.config.certificatePath, platform.config.rejectUnauthorized);
  ha.log.logLevel = platform.log.logLevel;
  ha.on('error', () => null);
  try {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      /* v8 ignore next cause is too long to test the 15 seconds timeout */
      timer = setTimeout(() => reject(new Error('Home Assistant did not answer in time')), 15000);
    });
    try {
      await Promise.race([ha.connect(), timeout]);
      await Promise.race([ha.fetchData(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    /* v8 ignore next cause close() doesn't reject on a closed connection */
    await ha.close().catch(() => null);
    ha.removeAllListeners();
  }
  setupData.set(platform, ha);
  return ha;
}

/**
 * Build the rows of the device picker from the Home Assistant data and the current config.
 *
 * @param {HomeAssistantPlatform} platform - The platform (config, supported domains and validation).
 * @param {HomeAssistant} ha - The Home Assistant data.
 * @returns {SetupItem[]} The devices and individual entities.
 */
export function buildSetupItems(platform: HomeAssistantPlatform, ha: HomeAssistant): SetupItem[] {
  const config = platform.config;
  const areaName = (areaId: string | null): string => (areaId === null ? 'No area' : (ha.hassAreas.get(areaId)?.name ?? 'No area'));
  const labelNames = (labels: string[] | undefined): string[] => (labels ?? []).map((l) => ha.hassLabels.get(l)?.name ?? l);
  const usable = (entity: HassEntity): boolean => !isDisabled(entity) && (!isHidden(entity) || !config.discardHiddenEntities) && ha.hassStates.has(entity.entity_id);
  const capability = (entity: HassEntity, name: string, selected: boolean): SetupCapability => ({
    entityId: entity.entity_id,
    name,
    matter: getMatterType(entity.entity_id, ha.hassStates.get(entity.entity_id), platform.supportedDomains),
    selected,
    main: true,
  });
  // Name shown for a function: names can be null or empty in the registry, so fall back to the friendly name and the entity id.
  const entityLabel = (e: HassEntity): string =>
    [e.name, e.original_name, ha.hassStates.get(e.entity_id)?.attributes?.friendly_name].find((n): n is string => isValidString(n, 1)) ?? e.entity_id;
  const entities = Array.from(ha.hassEntities.values()).filter(usable);
  const items: SetupItem[] = [];

  for (const entity of entities.filter((e) => e.device_id === null)) {
    // Same name the plugin uses for individual entities (see getEntityName in helpers.ts).
    const friendlyName = ha.hassStates.get(entity.entity_id)?.attributes?.friendly_name;
    const name =
      (config.splitNameStrategy === 'Friendly name' ? (friendlyName ?? entity.name ?? entity.original_name) : (entity.name ?? entity.original_name ?? friendlyName)) ??
      entity.entity_id;
    const entityCapability = capability(entity, name, true);
    items.push({
      id: entity.entity_id,
      name,
      kind: 'entity',
      area: areaName(entity.area_id),
      labels: labelNames(entity.labels),
      integration: entity.platform,
      // A row with nothing Matter can show is never selected, even when the config would allow it.
      selected: entityCapability.matter !== null && platform.validateDevice([name, entity.entity_id, entity.id], false),
      capabilities: [entityCapability],
    });
  }

  for (const device of Array.from(ha.hassDevices.values()).filter((d) => !isDisabled(d) && d.entry_type !== 'service')) {
    const deviceName = device.name_by_user ?? device.name;
    const deviceEntities = entities.filter((e) => e.device_id === device.id);
    if (!isValidString(deviceName, 1) || deviceEntities.length === 0) continue;
    const blackList = config.deviceEntityBlackList[deviceName];
    const analysis = analyzeDevice(
      deviceEntities.map((e) => capability(e, entityLabel(e), blackList === undefined || !blackList.includes(e.entity_id))),
      deviceEntities,
      (entityId) => {
        const deviceClass = ha.hassStates.get(entityId)?.attributes?.['device_class'];
        return typeof deviceClass === 'string' ? deviceClass : undefined;
      },
    );
    const capabilities = analysis.capabilities;
    const selected = capabilities.some((c) => c.matter !== null) && platform.validateDevice([deviceName, device.id], false);
    // A device not synced yet, without own choices in the config, starts with only its main functions ticked.
    if (!selected && blackList === undefined) for (const c of capabilities) c.selected = c.main;
    items.push({
      id: device.id,
      name: deviceName,
      kind: 'device',
      area: areaName(device.area_id),
      labels: labelNames(device.labels),
      integration: analysis.integration,
      selected,
      capabilities,
      notUseful: analysis.notUseful,
    });
  }
  return items.toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Controls in order of importance: a light or a cover is the main function before a switch, a switch before a select. */
const CONTROL_TIERS: readonly (readonly string[])[] = [['light', 'cover', 'lock', 'climate', 'fan', 'valve', 'vacuum', 'media_player'], ['switch'], ['remote', 'select']];

/** Integrations that add helper entities to the devices of other integrations: their entities are never main. */
const HELPER_INTEGRATIONS: ReadonlySet<string> = new Set(['battery_notes', 'powercalc', 'utility_meter', 'template', 'group', 'derivative', 'integration', 'statistics']);

/** Names of maintenance and settings functions, also when the integration doesn't mark them as config or diagnostic. */
const MAINTENANCE =
  /restart|reboot|identify|self[- ]?test|mute|permit join|power[- ]?on|outage|indicator|\bled\b|child lock|effect|preset|auto[- ]?update|firmware|update|calibrat|reset|turbo|\blog\b|buzzer|backlight|sensitivity|replaced/i;

/** The result of the device analysis. */
export interface DeviceAnalysis {
  /** The functions with main set, main ones first. */
  capabilities: SetupCapability[];
  /** The integration of the device (not a helper integration like battery_notes). */
  integration: string;
  /** Why the device is not useful in Matter, or undefined when it is. */
  notUseful?: string;
}

/**
 * Analyze a device against what Matter can show: find its main functions and tell if it is useful in Matter at all.
 *
 * Rules (only functions Matter supports count):
 *  - Extras are never main: entities marked config or diagnostic, maintenance and settings (restart, identify, LED, child lock, effect...),
 *    entities added by helper integrations (battery_notes "Battery replaced"...), voltage and energy readings.
 *  - Controls first: lights, covers, locks, climate, fans, valves, vacuums, media players; else switches; else remotes and selects.
 *  - Without controls: detectors (motion, door, leak...), else events (button presses), else measurements (temperature, humidity...).
 *  - A remote with only buttons: the power button.
 *  - The battery of the device is added to the main functions (one, the numeric level when there is one).
 *  - A device whose only main function would be the battery, or nothing, is not useful in Matter.
 *
 * @param {SetupCapability[]} capabilities - The functions of the device.
 * @param {HassEntity[]} entities - The registry entries of the functions (same order).
 * @param {(entityId: string) => string | undefined} deviceClassOf - The device class of an entity from its state.
 * @returns {DeviceAnalysis} The analysis.
 */
export function analyzeDevice(capabilities: SetupCapability[], entities: HassEntity[], deviceClassOf: (entityId: string) => string | undefined): DeviceAnalysis {
  const entityOf = new Map(entities.map((e) => [e.entity_id, e]));
  // The integration of the device: the most used one that is not a helper integration.
  const counts = new Map<string, number>();
  for (const e of entities) if (!HELPER_INTEGRATIONS.has(e.platform)) counts.set(e.platform, (counts.get(e.platform) ?? 0) + 1);
  const integration = [...counts.entries()].toSorted((a, b) => b[1] - a[1]).at(0)?.[0] ?? entities.at(0)?.platform ?? '';
  const own = (c: SetupCapability): boolean => entityOf.get(c.entityId)?.platform === integration;
  const domain = (c: SetupCapability): string => getDomain(c.entityId);
  const isBattery = (c: SetupCapability): boolean => deviceClassOf(c.entityId) === 'battery';

  const usable = capabilities.filter((c) => c.matter !== null && own(c));
  const isExtra = (c: SetupCapability): boolean =>
    Boolean(entityOf.get(c.entityId)?.entity_category) || MAINTENANCE.test(c.name) || ['voltage', 'energy', 'power', 'current'].includes(deviceClassOf(c.entityId) ?? '');
  const candidates = usable.filter((c) => !isBattery(c) && !isExtra(c));

  let main: SetupCapability[] = [];
  for (const tier of CONTROL_TIERS) {
    main = candidates.filter((c) => tier.includes(domain(c)));
    if (main.length > 0) break;
  }
  if (main.length === 0) main = [['binary_sensor'], ['event'], ['sensor']].map((d) => candidates.filter((c) => d.includes(domain(c)))).find((g) => g.length > 0) ?? [];
  if (main.length === 0) {
    const power = candidates.find((c) => domain(c) === 'button' && /power/i.test(c.name));
    if (power) main = [power];
  }
  const batteries = usable.filter(isBattery);
  const battery = batteries.find((c) => domain(c) === 'sensor') ?? batteries.at(0);

  let notUseful: string | undefined;
  if (main.length === 0) {
    const names = capabilities.filter((c) => c.matter !== null).map((c) => c.name);
    if (names.length === 0) notUseful = 'Nothing here works in Matter';
    else if (battery) notUseful = 'Only battery information reaches Matter';
    else notUseful = `Only maintenance or settings functions reach Matter (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''})`;
  }
  const mainSet = new Set(battery && main.length > 0 ? [...main, battery] : main);
  for (const c of capabilities) c.main = mainSet.has(c);
  return { capabilities: capabilities.toSorted((a, b) => Number(b.main) - Number(a.main)), integration, notUseful };
}

/** The selection sent by the device picker on save. */
export interface SetupSelection {
  /** Ids of the selected devices (device.id) and individual entities (entity_id). */
  selected: string[];
  /** For each device id, the entity ids the user unticked. */
  unchecked: Record<string, string[]>;
  onlyDomains: string[];
  neverDomains: string[];
  /** Start fresh: also remove the expert entries (other list entries, area and label filters, split entities). The connection settings stay. */
  reset: boolean;
}

/**
 * Validate the body sent by the device picker.
 *
 * @param {unknown} body - The request body.
 * @returns {SetupSelection | undefined} The selection, or undefined if invalid.
 */
export function parseSelection(body: unknown): SetupSelection | undefined {
  const record = asRecord(body);
  if (!record) return undefined;
  const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  const { selected, onlyDomains, neverDomains } = record;
  const uncheckedRecord = asRecord(record['unchecked']);
  if (!isStrings(selected) || !isStrings(onlyDomains) || !isStrings(neverDomains) || !uncheckedRecord) return undefined;
  const unchecked: Record<string, string[]> = {};
  for (const [deviceId, list] of Object.entries(uncheckedRecord)) {
    if (!isStrings(list)) return undefined;
    unchecked[deviceId] = list;
  }
  return { selected, unchecked, onlyDomains, neverDomains, reset: record['reset'] === true };
}

/**
 * Write the device picker selection to the plugin config.
 * It only touches whiteList, blackList, deviceEntityBlackList, entityWhiteList and entityBlackList,
 * and keeps the entries that don't belong to the listed devices and entities (for example split entities).
 * With reset (Start fresh) it also clears those expert entries, the area and label filters and the split entities.
 *
 * @param {HomeAssistantPlatform} platform - The platform.
 * @param {SetupItem[]} items - The rows currently shown in the picker.
 * @param {SetupSelection} selection - The selection to save.
 */
export function applySelection(platform: HomeAssistantPlatform, items: SetupItem[], selection: SetupSelection): void {
  const config = platform.config;
  if (selection.reset) {
    config.whiteList = [];
    config.blackList = [];
    config.deviceEntityBlackList = {};
    config.filterByArea = '';
    config.filterByLabel = '';
    config.splitEntities = [];
    config.splitByLabel = '';
  }
  const known = new Set(items.flatMap((i) => [i.id, i.name]));
  const selectedItems = items.filter((i) => selection.selected.includes(i.id));
  const selectedKeys = new Set(selectedItems.flatMap((i) => [i.id, i.name]));

  // An empty whiteList exposes everything: the page asks the user to confirm before saving an empty selection.
  config.whiteList = [...(config.whiteList ?? []).filter((w) => !known.has(w)), ...selectedItems.map((i) => i.id)];
  config.blackList = (config.blackList ?? []).filter((b) => !selectedKeys.has(b));

  const deviceEntityBlackList: Record<string, string[]> = {};
  const deviceNames = new Set(items.filter((i) => i.kind === 'device').map((i) => i.name));
  for (const [name, list] of Object.entries(config.deviceEntityBlackList ?? {})) {
    if (!deviceNames.has(name)) deviceEntityBlackList[name] = list;
  }
  for (const item of items.filter((i) => i.kind === 'device' && selection.selected.includes(i.id))) {
    const unchecked = (selection.unchecked[item.id] ?? []).filter((e) => item.capabilities.some((c) => c.entityId === e));
    if (unchecked.length > 0) deviceEntityBlackList[item.name] = unchecked;
  }
  config.deviceEntityBlackList = deviceEntityBlackList;

  config.entityWhiteList = selection.onlyDomains.filter((d) => platform.supportedDomains.includes(d));
  config.entityBlackList = selection.neverDomains.filter((d) => platform.supportedDomains.includes(d));
}

/**
 * Handle the REST API of the plugin frontend: GET|POST /plugins/matterbridge-hass/api/:path.
 *
 * Paths:
 *  - GET status: setup state and connection.
 *  - GET discover: Home Assistant instances found.
 *  - POST token: check { url, token } and save them when valid.
 *  - GET items: devices, entities and domain rules.
 *  - POST save: save the selection.
 *  - POST restart: restart Matterbridge.
 *
 * @param {HomeAssistantPlatform} platform - The platform.
 * @param {string} method - The HTTP method.
 * @param {string | undefined} path - The api path.
 * @param {Record<string, unknown> | undefined} query - The query parameters.
 * @param {unknown} body - The request body.
 * @returns {Promise<unknown>} The JSON response, or undefined for 404.
 */
export async function handleSetupFetch(
  platform: HomeAssistantPlatform,
  method: string,
  path: string | undefined,
  query: Record<string, unknown> | undefined,
  body: unknown,
): Promise<unknown> {
  const config = platform.config;
  const route = `${method.toUpperCase()} ${path ?? ''}`;

  if (route === 'GET status') {
    return {
      configured: isValidString(config.host, 1) && isValidString(config.token, 1),
      connected: platform.ha.connected,
      host: isValidString(config.host, 1) ? toHttpUrl(config.host) : '',
      version: platform.version,
    };
  }

  if (route === 'GET discover') {
    return { servers: await discoverHomeAssistant(config.host) };
  }

  if (route === 'POST restart') {
    platform.log.notice('Restart of Matterbridge requested from the plugin page');
    return { ok: await requestMatterbridgeRestart() };
  }

  if (route === 'POST token') {
    const { url, token } = asRecord(body) ?? {};
    if (!isValidString(url, 1) || !isValidString(token, 1)) return { ok: false, error: 'invalid', message: 'Address and token are required' };
    const result = await checkToken(url, token.trim(), config.certificatePath, config.rejectUnauthorized);
    if (result.ok) {
      config.host = toWebSocketUrl(url);
      config.token = token.trim();
      setupData.delete(platform);
      platform.saveConfig(config);
      platform.wssSendRestartRequired();
      platform.log.notice(`Home Assistant token saved from the plugin page for ${config.host}`);
    }
    return result;
  }

  if (route === 'GET items' || route === 'POST save') {
    if (!isValidString(config.host, 1) || !isValidString(config.token, 1)) return { ok: false, error: 'not-configured' };
    const refresh = route === 'GET items' && query?.['refresh'] !== undefined;
    // Check the saved host and token first: a wrong token is reported at once instead of waiting for the connection timeout.
    if (!platform.ha.connected) {
      const check = await checkToken(config.host, config.token, config.certificatePath, config.rejectUnauthorized);
      if (!check.ok) return { ok: false, error: check.error, message: check.message };
    }
    let items: SetupItem[];
    try {
      items = buildSetupItems(platform, await loadHomeAssistantData(platform, refresh));
    } catch (error) {
      return { ok: false, error: 'unreachable', message: getErrorMessage(error) };
    }
    if (route === 'GET items') {
      return {
        ok: true,
        items,
        onlyDomains: isValidArray(config.entityWhiteList) ? config.entityWhiteList : [],
        neverDomains: isValidArray(config.entityBlackList) ? config.entityBlackList : [],
        domains: platform.supportedDomains,
        filterByArea: config.filterByArea,
        filterByLabel: config.filterByLabel,
      };
    }
    const selection = parseSelection(body);
    if (!selection) return { ok: false, error: 'invalid' };
    applySelection(platform, items, selection);
    platform.saveConfig(config);
    platform.wssSendRestartRequired();
    platform.log.notice(`Device selection saved from the plugin page: ${selection.selected.length} devices and entities`);
    return { ok: true };
  }

  return undefined;
}
