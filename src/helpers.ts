/**
 * @description This file contains helper functions for the Home Assistant platform.
 * @file src\helpers.ts
 * @author Luca Liguori
 * @created 2024-09-13
 * @version 1.0.0
 * @license Apache-2.0
 * @copyright 2026, 2027, 2028 Luca Liguori.
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

import { HassArea, HassDevice, HassEntity, HassLabel, HassState } from './homeAssistant.js';

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
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @param {HassLabel[]} labels - The Home Assistant labels registry.
 * @param {string} label - The label name to check for.
 * @returns {boolean} - Returns true if the entity has the specified label, false otherwise.
 */
export function entityHasLabel(entity: HassEntity, labels: HassLabel[], label: string): boolean {
  if (!isValidObject(entity) || !isValidArray(entity.labels) || !isValidArray(labels) || !label || !isValidString(label)) {
    return false;
  }
  const entry = labels.find((entry) => entry.name === label);
  if (!entry) {
    return false;
  }
  return entity.labels.includes(entry.label_id);
}

/**
 * Checks if a given entity is a split entity based on the provided split entities list and label.
 *
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @param {string[]} splitEntities - The list of split entities.
 * @param {HassLabel[]} labels - The Home Assistant labels registry.
 * @param {string} label - The label name to check for.
 * @returns {boolean} - Returns true if the entity is a split entity, false otherwise.
 */
export function isSplitEntity(entity: HassEntity, splitEntities: string[], labels: HassLabel[], label: string): boolean {
  if (!isValidObject(entity) || !isValidArray(splitEntities) || !isValidArray(labels) || !isValidString(label)) {
    return false;
  }
  return splitEntities.includes(entity.entity_id) || entityHasLabel(entity, labels, label);
}

/**
 * Checks if a given entity is disabled.
 *
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @returns {boolean} - Returns true if the entity is disabled, false otherwise.
 */
export function entityDisabled(entity: HassEntity): boolean {
  if (!isValidObject(entity) || (typeof entity.disabled_by !== 'string' && entity.disabled_by !== null)) {
    return false;
  }
  return entity.disabled_by !== null;
}

/**
 * Returns the name of a given entity based on the specified strategy.
 *
 * @param {HassEntity} entity - The Home Assistant entity to check.
 * @param {HassState} state - The current state of the entity.
 * @param {"Entity name" | "Friendly name"} splitNameStrategy - The strategy to determine the entity's name.
 * @returns {string | null} - Returns the entity's name if valid, null otherwise.
 */
export function getEntityName(entity: HassEntity, state: HassState, splitNameStrategy: 'Entity name' | 'Friendly name'): string | null {
  if (!isValidObject(entity) || !isValidObject(state) || (splitNameStrategy !== 'Entity name' && splitNameStrategy !== 'Friendly name')) {
    return null;
  }
  return splitNameStrategy === 'Friendly name'
    ? (state.attributes?.friendly_name ?? entity.name ?? entity.original_name ?? null)
    : (entity.name ?? entity.original_name ?? state.attributes?.friendly_name ?? null);
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
 * @param {string} name - The device name.
 * @param {string | null} area_id - The related area ID.
 * @param {string[]} labels - The related labels.
 * @returns {HassDevice} - A Home Assistant device.
 */
export function generateDevice(name: string, area_id: string | null = null, labels: string[] = []): HassDevice {
  const timestamp = Date.now() / 1000;
  const serialNumber = '0x' + randomBytes(8).toString('hex');

  return {
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
}

/**
 * Creates a Home Assistant entity with default properties.
 *
 * @param {string} name - The entity name.
 * @param {string} domain - The entity domain.
 * @param {HassDevice | null} device - The related device.
 * @param {string | null} area_id - The related area ID.
 * @param {string[]} labels - The related labels.
 * @returns {HassEntity} - A Home Assistant entity.
 */
export function generateEntity(name: string, domain: string, device: HassDevice | null = null, area_id: string | null = null, labels: string[] = []): HassEntity {
  const timestamp = Date.now() / 1000;
  const entityId = createEntityId(name, domain);

  return {
    id: createUniqueId(),
    entity_id: entityId,
    area_id: device !== null ? null : area_id,
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
}

/**
 * Creates a Home Assistant state with default properties.
 *
 * @param {HassEntity} entity - The related entity.
 * @param {string} state - The state value.
 * @param {Record<string, string | number | boolean | null>} attributes - The related state attributes.
 * @returns {HassState} - A Home Assistant state.
 */
export function generateState(entity: HassEntity, state: string = 'unknown', attributes: Record<string, string | number | boolean | null> = {}): HassState {
  const timestamp = new Date().toISOString();

  return {
    entity_id: entity.entity_id,
    state,
    last_changed: timestamp,
    last_reported: timestamp,
    last_updated: timestamp,
    attributes: {
      friendly_name: entity.original_name ?? entity.name ?? undefined,
      ...attributes,
    } as HassState['attributes'],
    context: {
      id: createUniqueId(),
      parent_id: null,
      user_id: null,
    },
  };
}

/**
 * Creates a Home Assistant area with default properties.
 *
 * @param {string} name - The area name.
 * @param {string[]} labels - The related labels.
 * @returns {HassArea} - A Home Assistant area.
 */
export function generateArea(name: string, labels: string[] = []): HassArea {
  const timestamp = Date.now() / 1000;

  return {
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
}

/**
 * Creates a Home Assistant label with default properties.
 *
 * @param {string} name - The label name.
 * @returns {HassLabel} - A Home Assistant label.
 */
export function generateLabel(name: string): HassLabel {
  const timestamp = Date.now() / 1000;

  return {
    label_id: createLabelId(name),
    color: null,
    created_at: timestamp,
    description: null,
    icon: null,
    modified_at: timestamp,
    name: isValidString(name) ? name : 'Unnamed Label',
  };
}
