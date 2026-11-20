/**
 * @file src/helpers.ts
 * @description This file contains helper functions for the Home Assistant platform.
 * @author Luca Liguori
 * @created 2024-09-13
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

import { randomBytes } from 'node:crypto';

import { isValidArray, isValidObject, isValidString } from 'matterbridge/utils';

import type { HassArea, HassDevice, HassEntity, HassLabel, HassState, HomeAssistant } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';

const generatedEntityIds = new Set<string>();
const generatedAreaIds = new Set<string>();
const generatedLabelIds = new Set<string>();

/**
 * Creates a unique generated identifier, appending an index when needed to avoid duplicates.
 *
 * @param {string} baseId - The base identifier.
 * @param {Set<string>} generatedIds - The set of already generated identifiers.
 * @returns {string} - A unique identifier.
 */
function createGeneratedId(baseId: string, generatedIds: Set<string>): string {
  let generatedId = baseId;
  let duplicateIndex = 1;
  while (generatedIds.has(generatedId)) {
    duplicateIndex += 1;
    generatedId = `${baseId}_${duplicateIndex}`;
  }

  generatedIds.add(generatedId);
  return generatedId;
}

/**
 * Creates a unique entity ID based on the provided name and domain, ensuring that it does not conflict with previously generated entity IDs.
 *
 * @param {string} name - The entity name to be normalized and used in the entity ID.
 * @param {string} domain - The entity domain to be prefixed in the entity ID.
 * @returns {string} - A unique entity ID in the format of "domain.normalized_name" with an optional suffix if duplicates are found.
 */
function createEntityId(name: string, domain: string): string {
  const normalizedName = isValidString(name) ? name.toLowerCase().replace(/ /g, '_') : 'unnamed_entity';
  const baseEntityId = `${domain}.${normalizedName}`;
  return createGeneratedId(baseEntityId, generatedEntityIds);
}

/**
 * Creates a unique area ID based on the provided area name.
 *
 * @param {string} name - The area name.
 * @returns {string} - A unique area ID.
 */
function createAreaId(name: string): string {
  const normalizedName = isValidString(name) ? name.toLowerCase().replace(/ /g, '_') : 'unnamed_area';
  return createGeneratedId(normalizedName, generatedAreaIds);
}

/**
 * Creates a unique label ID based on the provided label name.
 *
 * @param {string} name - The label name.
 * @returns {string} - A unique label ID.
 */
function createLabelId(name: string): string {
  const normalizedName = isValidString(name) ? name.toLowerCase().replace(/ /g, '_') : 'unnamed_label';
  return createGeneratedId(normalizedName, generatedLabelIds);
}

/**
 * Checks if a given entity has a specific label.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance.
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @param {string} label - The label name to check for.
 * @returns {boolean} - Returns true if the entity has the specified label, false otherwise.
 */
export function entityHasLabel(platform: HomeAssistantPlatform, entity: HassEntity, label: string): boolean {
  if (
    !isValidObject(platform) ||
    !isValidObject(platform.ha) ||
    !isValidObject(platform.ha.hassLabels) ||
    !isValidObject(entity) ||
    !isValidArray(entity.labels) ||
    !label ||
    !isValidString(label)
  ) {
    return false;
  }

  const labels = Array.from(platform.ha.hassLabels.values());
  const entry = labels.find((entry) => entry.name === label);
  if (!entry) {
    return false;
  }
  return entity.labels.includes(entry.label_id);
}

/**
 * Checks if a given entity is a split entity, i.e. it has the label set in the platform splitByLabel config.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance.
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @returns {boolean} - Returns true if the entity is a split entity, false otherwise.
 */
export function isSplitEntity(platform: HomeAssistantPlatform, entity: HassEntity): boolean {
  if (
    !isValidObject(platform) ||
    !isValidObject(platform.config) ||
    !isValidObject(platform.ha) ||
    !isValidObject(platform.ha.hassLabels) ||
    !isValidObject(entity) ||
    !isValidString(platform.config.splitByLabel)
  ) {
    return false;
  }
  return entityHasLabel(platform, entity, platform.config.splitByLabel);
}

/**
 * Checks if a given entity belongs to a device.
 *
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @returns {boolean} - Returns true if the entity has a device_id, false otherwise.
 */
export function isDeviceEntity(entity: HassEntity): entity is HassEntity & { device_id: string } {
  if (!isValidObject(entity)) {
    return false;
  }
  // oxlint-disable-next-line no-eq-null
  return entity.device_id != null;
}

/**
 * Checks if a given entity is an individual entity.
 *
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @returns {boolean} - Returns true if the entity does not belong to a device, false otherwise.
 */
export function isIndividualEntity(entity: HassEntity): entity is HassEntity & { device_id: null } {
  if (!isValidObject(entity)) {
    return false;
  }
  return entity.device_id === null;
}

/**
 * Checks if a given entity or device is disabled.
 *
 * @param {HassEntity | HassDevice} entityOrDevice - The Home Assistant entity or device to check.
 * @returns {boolean} - Returns true if the entity or device is disabled, false otherwise.
 */
export function isDisabled(entityOrDevice: HassEntity | HassDevice): boolean {
  if (!isValidObject(entityOrDevice) || (typeof entityOrDevice.disabled_by !== 'string' && entityOrDevice.disabled_by !== null)) {
    return false;
  }
  return entityOrDevice.disabled_by !== null;
}

/**
 * Checks if a given entity is hidden.
 *
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @returns {boolean} - Returns true if the entity is hidden, false otherwise.
 */
export function isHidden(entity: HassEntity): boolean {
  if (!isValidObject(entity) || (typeof entity.hidden_by !== 'string' && entity.hidden_by !== null)) {
    return false;
  }
  return entity.hidden_by !== null;
}

/**
 * Checks if a given entity or device satisfies the configured area filter.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance.
 * @param {HassEntity | HassDevice} deviceOrEntity - The Home Assistant entity or device to check.
 * @returns {boolean} - Returns true if no area filter is configured or the entity/device belongs to the configured area.
 */
export function satisfiesAreaFilter(platform: HomeAssistantPlatform, deviceOrEntity: HassEntity | HassDevice): boolean {
  if (!isValidObject(platform) || !isValidObject(platform.config) || !isValidObject(platform.ha) || !isValidObject(deviceOrEntity)) {
    // Invalid inputs cannot satisfy the configured filter.
    return false;
  }

  if (!isValidString(platform.config.filterByArea, 1)) {
    // No area filter configured means every device or entity passes.
    return true;
  }

  if (!isValidObject(platform.ha.hassAreas) || typeof deviceOrEntity.area_id !== 'string') {
    // A configured area filter requires a valid area registry and area_id.
    return false;
  }

  const area = platform.ha.hassAreas.get(deviceOrEntity.area_id);
  // The device or entity passes only when its resolved area name matches the configured filter.
  return area?.name === platform.config.filterByArea;
}

/**
 * Returns the Home Assistant areas sorted by area_id for a deterministic Matter SupportedAreas ordering.
 *
 * @param {HomeAssistant} ha - The Home Assistant instance.
 * @returns {HassArea[]} - The Home Assistant areas sorted by area_id.
 */
export function getSortedHassAreas(ha: HomeAssistant): HassArea[] {
  // Compare code points directly instead of localeCompare(), whose result depends on the runtime's default locale/ICU settings and would undermine the deterministic ordering across hosts.
  // The area_id values are unique keys of the area registry, so two areas never compare equal.
  return Array.from(ha.hassAreas.values()).toSorted((a, b) => (a.area_id < b.area_id ? -1 : 1));
}

/**
 * Returns the Home Assistant areas that a vacuum entity has mapped to its own cleaning segments, sorted by area_id.
 *
 * The Home Assistant vacuum.clean_area service only accepts the areas present in the per-entity area_mapping stored in the entity registry options (options.vacuum.area_mapping: area_id => segment ids).
 * Any other area makes the service fail with areas_not_mapped, and an entity without an area_mapping fails with area_mapping_not_configured, so only the mapped areas can be offered to a Matter controller.
 *
 * @param {HomeAssistant} ha - The Home Assistant instance.
 * @param {HassEntity} entity - The Home Assistant vacuum entity registry entry.
 * @returns {HassArea[]} - The mapped Home Assistant areas sorted by area_id, or an empty array if the vacuum has no area mapping.
 */
export function getVacuumMappedHassAreas(ha: HomeAssistant, entity: HassEntity): HassArea[] {
  const vacuumOptions = entity.options?.['vacuum'];
  if (!isValidObject(vacuumOptions) || !('area_mapping' in vacuumOptions)) return [];
  if (!isValidObject(vacuumOptions.area_mapping)) return [];
  const areaMapping = new Map<string, unknown>(Object.entries(vacuumOptions.area_mapping));
  return getSortedHassAreas(ha).filter((area) => isValidArray(areaMapping.get(area.area_id), 1));
}

/**
 * Truncates a string to at most the given number of UTF-8 bytes without splitting a character.
 *
 * Matter string constraints are expressed in UTF-8 bytes, while String.prototype.slice() counts UTF-16 code units and can split a surrogate pair.
 *
 * @param {string} text - The string to truncate.
 * @param {number} maxBytes - The maximum length in UTF-8 bytes.
 * @returns {string} - The string itself if it fits, otherwise its longest prefix of whole characters that fits.
 */
export function truncateUtf8(text: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (bytes + charBytes > maxBytes) break;
    result += char;
    bytes += charBytes;
  }
  return result;
}

/**
 * Derives a stable Matter ServiceArea AreaId from a Home Assistant area_id using the FNV-1a 32-bit hash.
 *
 * The AreaId must stay stable across restarts regardless of how the Home Assistant area registry grows, shrinks, or is reordered, so it cannot be a positional index into the current area list.
 *
 * @param {string} areaId - The Home Assistant area_id.
 * @returns {number} - An unsigned 32-bit integer derived from the area_id, stable for as long as the area_id itself does not change.
 */
export function hassAreaIdToMatterAreaId(areaId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < areaId.length; i++) {
    // oxlint-disable-next-line no-bitwise
    hash ^= areaId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // oxlint-disable-next-line no-bitwise
  return hash >>> 0;
}

/**
 * Checks if a given entity or device satisfies the configured label filter.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance.
 * @param {HassEntity | HassDevice} deviceOrEntity - The Home Assistant entity or device to check.
 * @returns {boolean} - Returns true if no label filter is configured or the entity/device has the configured label.
 */
export function satisfiesLabelFilter(platform: HomeAssistantPlatform, deviceOrEntity: HassEntity | HassDevice): boolean {
  if (!isValidObject(platform) || !isValidObject(platform.config) || !isValidObject(platform.ha) || !isValidObject(deviceOrEntity)) {
    // Invalid inputs cannot satisfy the configured filter.
    return false;
  }

  if (!isValidString(platform.config.filterByLabel, 1)) {
    // No label filter configured means every device or entity passes.
    return true;
  }

  if (!isValidObject(platform.ha.hassLabels) || !isValidArray(deviceOrEntity.labels, 1)) {
    // A configured label filter requires a valid label registry and label ids on the device or entity.
    return false;
  }

  const label = Array.from(platform.ha.hassLabels.values()).find((entry) => entry.name === platform.config.filterByLabel);
  // The device or entity passes only when it contains the configured label id.
  return label !== undefined && deviceOrEntity.labels.includes(label.label_id);
}

/**
 * Returns the domain of a Home Assistant entity.
 *
 * @param {HassEntity | string} entity - The Home Assistant entity or entity_id.
 * @returns {string} - The entity domain.
 * @throws {Error} - Throws when the entity_id does not contain a domain.
 */
export function getDomain(entity: HassEntity | string): string {
  const entityId = typeof entity === 'string' ? entity : entity?.entity_id;

  if (!isValidString(entityId)) {
    throw new Error('The entity_id does not contain a domain');
  }

  const separatorIndex = entityId.indexOf('.');

  if (separatorIndex <= 0) {
    throw new Error(`The entity_id "${entityId}" does not contain a domain`);
  }

  return entityId.slice(0, separatorIndex);
}

/**
 * Returns the name segment of a Home Assistant entity.
 *
 * @param {HassEntity | string} entity - The Home Assistant entity or entity_id.
 * @returns {string} - The entity name after the dot.
 * @throws {Error} - Throws when the entity_id does not contain a name.
 */
export function getName(entity: HassEntity | string): string {
  const entityId = typeof entity === 'string' ? entity : entity?.entity_id;

  if (!isValidString(entityId)) {
    throw new Error('The entity_id does not contain a name');
  }

  const separatorIndex = entityId.indexOf('.');

  if (separatorIndex === -1 || separatorIndex === entityId.length - 1) {
    throw new Error(`The entity_id "${entityId}" does not contain a name`);
  }

  return entityId.slice(separatorIndex + 1);
}

/**
 * Returns the name of a given entity based on the specified strategy.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance.
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @returns {string | null} - Returns the entity's name if valid, null otherwise.
 */
export function getEntityName(platform: HomeAssistantPlatform, entity: HassEntity): string | null {
  if (
    !isValidObject(platform) ||
    !isValidObject(platform.config) ||
    !isValidObject(platform.ha) ||
    !isValidObject(platform.ha.hassStates) ||
    !isValidObject(entity) ||
    (platform.config.splitNameStrategy !== 'Entity name' && platform.config.splitNameStrategy !== 'Friendly name')
  ) {
    return null;
  }

  const state = platform.ha.hassStates.get(entity.entity_id);
  if (!isValidObject(state)) {
    return null;
  }

  return platform.config.splitNameStrategy === 'Friendly name'
    ? (state.attributes?.friendly_name ?? entity.name ?? entity.original_name ?? null)
    : (entity.name ?? entity.original_name ?? state.attributes?.friendly_name ?? null);
}

/**
 * Returns the device name with the configured namePostfix, as it is registered in Matterbridge.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance.
 * @param {string} name - The device or entity name.
 * @returns {string} - The name with ' <namePostfix>' appended when the namePostfix is nonempty.
 */
export function getPostfixedName(platform: HomeAssistantPlatform, name: string): string {
  return name + (platform.config.namePostfix ? ' ' + platform.config.namePostfix : '');
}

/**
 * Returns the serial number with the configured postfix, limited to 32 characters.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance.
 * @param {string} serial - The device or entity serial number.
 * @returns {string} - The truncated serial with the postfix appended.
 */
export function getPostfixedSerial(platform: HomeAssistantPlatform, serial: string): string {
  return serial.slice(0, 32 - platform.config.postfix.length) + platform.config.postfix;
}

/**
 * Creates a unique identifier.
 *
 * @returns {string} - A 32-character hexadecimal string.
 */
export function createUniqueId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Creates a Home Assistant device with default properties.
 *
 * @param {HomeAssistant} ha - The Home Assistant instance.
 * @param {string} name - The device name.
 * @param {string | null} area_id - The related area ID.
 * @param {string[]} labels - The related labels.
 * @returns {HassDevice} - A Home Assistant device.
 */
export function generateDevice(ha: HomeAssistant, name: string, area_id: string | null = null, labels: string[] = []): HassDevice {
  const timestamp = Date.now() / 1000;
  const serialNumber = '0x' + randomBytes(8).toString('hex');

  const device: HassDevice = {
    id: createUniqueId(),
    area_id,
    configuration_url: null,
    config_entries: [],
    config_entries_subentries: {},
    connections: [],
    created_at: timestamp,
    disabled_by: null,
    entry_type: null,
    hw_version: null,
    identifiers: [],
    labels: [...labels],
    manufacturer: null,
    model: null,
    model_id: null,
    modified_at: timestamp,
    name: isValidString(name) ? name : null,
    name_by_user: null,
    primary_config_entry: '',
    serial_number: serialNumber,
    sw_version: null,
    via_device_id: null,
  };

  ha.hassDevices.set(device.id, device);
  return device;
}

/**
 * Creates a Home Assistant entity with default properties.
 *
 * @param {HomeAssistant} ha - The Home Assistant instance.
 * @param {string} name - The entity name.
 * @param {string} domain - The entity domain.
 * @param {HassDevice | null} device - The related device.
 * @param {string | null} area_id - The related area ID.
 * @param {string[]} labels - The related labels.
 * @param {string} state - The initial state value.
 * @param {Record<string, string | number | boolean | null>} attributes - The initial state attributes.
 * @returns {HassEntity} - A Home Assistant entity.
 */
export function generateEntity(
  ha: HomeAssistant,
  name: string,
  domain: string,
  device: HassDevice | null = null,
  area_id: string | null = null,
  labels: string[] = [],
  state: string = 'unknown',
  attributes: Record<string, string | number | boolean | null> = {},
): HassEntity {
  const timestamp = Date.now() / 1000;
  const entity_id = createEntityId(name, domain);

  const entity: HassEntity = {
    id: createUniqueId(),
    entity_id,
    area_id: device === null ? area_id : null,
    categories: {},
    config_entry_id: null,
    config_subentry_id: null,
    created_at: timestamp,
    device_id: device?.id ?? null,
    disabled_by: null,
    entity_category: null,
    has_entity_name: true,
    hidden_by: null,
    icon: null,
    labels: [...labels],
    modified_at: timestamp,
    name: null,
    options: null,
    original_name: isValidString(name) ? name : null,
    platform: 'jest',
    translation_key: null,
    unique_id: createUniqueId(),
  };

  ha.hassEntities.set(entity.entity_id, entity);
  generateState(ha, entity, state, attributes);
  return entity;
}

/**
 * Creates a Home Assistant state with default properties.
 *
 * @param {HomeAssistant} ha - The Home Assistant instance.
 * @param {HassEntity} entity - The related entity.
 * @param {string} state - The state value.
 * @param {Record<string, string | number | boolean | null>} attributes - The related state attributes.
 * @returns {HassState} - A Home Assistant state.
 */
export function generateState(
  ha: HomeAssistant,
  entity: HassEntity,
  state: string = 'unknown',
  attributes: Record<string, string | number | boolean | null | object> = {},
): HassState {
  const timestamp = new Date().toISOString();
  const entityFriendlyName = entity.original_name ?? entity.name ?? undefined;
  const deviceName = entity.device_id ? (ha.hassDevices.get(entity.device_id)?.name_by_user ?? ha.hassDevices.get(entity.device_id)?.name ?? undefined) : undefined;
  const friendlyName = isValidString(deviceName) && isValidString(entityFriendlyName) ? `${deviceName} ${entityFriendlyName}` : entityFriendlyName;

  const hassState: HassState = {
    entity_id: entity.entity_id,
    state,
    last_changed: timestamp,
    last_reported: timestamp,
    last_updated: timestamp,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    attributes: {
      friendly_name: friendlyName,
      ...attributes,
    } as HassState['attributes'],
    context: {
      id: createUniqueId(),
      parent_id: null,
      user_id: null,
    },
  };

  ha.hassStates.set(hassState.entity_id, hassState);
  return hassState;
}

/**
 * Creates a Home Assistant area with default properties.
 *
 * @param {HomeAssistant} ha - The Home Assistant instance.
 * @param {string} name - The area name.
 * @param {string[]} labels - The related labels.
 * @returns {HassArea} - A Home Assistant area.
 */
export function generateArea(ha: HomeAssistant, name: string, labels: string[] = []): HassArea {
  const timestamp = Date.now() / 1000;

  const area: HassArea = {
    aliases: [],
    area_id: createAreaId(name),
    created_at: timestamp,
    floor_id: null,
    humidity_entity_id: null,
    icon: null,
    labels: [...labels],
    modified_at: timestamp,
    name: isValidString(name) ? name : 'Unnamed Area',
    picture: null,
    temperature_entity_id: null,
  };

  ha.hassAreas.set(area.area_id, area);
  return area;
}

/**
 * Creates a Home Assistant label with default properties.
 *
 * @param {HomeAssistant} ha - The Home Assistant instance.
 * @param {string} name - The label name.
 * @returns {HassLabel} - A Home Assistant label.
 */
export function generateLabel(ha: HomeAssistant, name: string): HassLabel {
  const timestamp = Date.now() / 1000;

  const label: HassLabel = {
    label_id: createLabelId(name),
    color: null,
    created_at: timestamp,
    description: null,
    icon: null,
    modified_at: timestamp,
    name: isValidString(name) ? name : 'Unnamed Label',
  };

  ha.hassLabels.set(label.label_id, label);
  return label;
}
