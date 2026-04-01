// src\helpers.test.ts

import {
  createUniqueId,
  entityDisabled,
  entityHasLabel,
  generateArea,
  generateDevice,
  generateEntity,
  generateLabel,
  generateState,
  getEntityName,
  isSplitEntity,
} from './helpers.js';
import { HassArea, HassDevice, HassEntity, HassLabel, HassState } from './homeAssistant.js';

describe('HassPlatform helpers', () => {
  it('should create a unique id as a 32-character hexadecimal string', () => {
    const uniqueId1 = createUniqueId();
    const uniqueId2 = createUniqueId();

    expect(uniqueId1).toMatch(/^[0-9a-f]{32}$/);
    expect(uniqueId2).toMatch(/^[0-9a-f]{32}$/);
    expect(uniqueId1).not.toBe(uniqueId2);
  });

  it('should generate a Home Assistant device with default properties', () => {
    const device: HassDevice = generateDevice('Test Device');

    expect(device.id).toMatch(/^[0-9a-f]{32}$/);
    expect(device.area_id).toBeNull();
    expect(device.configuration_url).toBeNull();
    expect(device.config_entries).toEqual([]);
    expect(device.config_entries_subentries).toEqual({});
    expect(device.connections).toEqual([]);
    expect(device.created_at).toBeGreaterThan(0);
    expect(device.disabled_by).toBeNull();
    expect(device.entry_type).toBeNull();
    expect(device.hw_version).toBeNull();
    expect(device.identifiers).toEqual([]);
    expect(device.labels).toEqual([]);
    expect(device.manufacturer).toBeNull();
    expect(device.model).toBeNull();
    expect(device.model_id).toBeNull();
    expect(device.modified_at).toBe(device.created_at);
    expect(device.name).toBe('Test Device');
    expect(device.name_by_user).toBeNull();
    expect(device.primary_config_entry).toBe('');
    expect(device.serial_number).toMatch(/^0x[0-9a-f]{16}$/);
    expect(device.sw_version).toBeNull();
    expect(device.via_device_id).toBeNull();
  });

  it('should generate a Home Assistant device with null name for invalid input', () => {
    // @ts-expect-error Testing edge case where name is undefined
    const device: HassDevice = generateDevice(undefined);

    expect(device.name).toBeNull();
    expect(device.area_id).toBeNull();
    expect(device.serial_number).toMatch(/^0x[0-9a-f]{16}$/);
  });

  it('should generate a Home Assistant device with the provided area id', () => {
    const device: HassDevice = generateDevice('Test Device', 'living_room');

    expect(device.name).toBe('Test Device');
    expect(device.area_id).toBe('living_room');
  });

  it('should generate a Home Assistant device with the provided labels', () => {
    const device: HassDevice = generateDevice('Test Device', null, ['matterbridge', 'split']);

    expect(device.labels).toEqual(['matterbridge', 'split']);
  });

  it('should generate a Home Assistant area with default properties', () => {
    const area: HassArea = generateArea('Living Room Default');

    expect(area.area_id).toBe('living_room_default');
    expect(area.aliases).toEqual([]);
    expect(area.created_at).toBeGreaterThan(0);
    expect(area.floor_id).toBeNull();
    expect(area.humidity_entity_id).toBeNull();
    expect(area.icon).toBeNull();
    expect(area.labels).toEqual([]);
    expect(area.modified_at).toBe(area.created_at);
    expect(area.name).toBe('Living Room Default');
    expect(area.picture).toBeNull();
    expect(area.temperature_entity_id).toBeNull();
  });

  it('should generate a Home Assistant area with the provided labels', () => {
    const area: HassArea = generateArea('Living Room Labels', ['matterbridge', 'split']);

    expect(area.area_id).toBe('living_room_labels');
    expect(area.labels).toEqual(['matterbridge', 'split']);
  });

  it('should generate a unique area id when the same name is reused', () => {
    const area1: HassArea = generateArea('Repeated Area');
    const area2: HassArea = generateArea('Repeated Area');

    expect(area1.area_id).toBe('repeated_area');
    expect(area2.area_id).toBe('repeated_area_2');
  });

  it('should generate a fallback area id and name for invalid input', () => {
    // @ts-expect-error Testing edge case where name is undefined
    const area: HassArea = generateArea(undefined);

    expect(area.area_id).toBe('unnamed_area');
    expect(area.name).toBe('Unnamed Area');
  });

  it('should generate a Home Assistant label with default properties', () => {
    const label: HassLabel = generateLabel('Matterbridge Label');

    expect(label.label_id).toBe('matterbridge_label');
    expect(label.color).toBeNull();
    expect(label.created_at).toBeGreaterThan(0);
    expect(label.description).toBeNull();
    expect(label.icon).toBeNull();
    expect(label.modified_at).toBe(label.created_at);
    expect(label.name).toBe('Matterbridge Label');
  });

  it('should generate a unique label id when the same name is reused', () => {
    const label1: HassLabel = generateLabel('Repeated Label');
    const label2: HassLabel = generateLabel('Repeated Label');

    expect(label1.label_id).toBe('repeated_label');
    expect(label2.label_id).toBe('repeated_label_2');
  });

  it('should generate a fallback label id and name for invalid input', () => {
    // @ts-expect-error Testing edge case where name is undefined
    const label: HassLabel = generateLabel(undefined);

    expect(label.label_id).toBe('unnamed_label');
    expect(label.name).toBe('Unnamed Label');
  });

  it('should generate a Home Assistant entity with default properties', () => {
    const device: HassDevice = generateDevice('Test Device');
    const entity: HassEntity = generateEntity('Test Entity Default', 'light', device);

    expect(entity.id).toMatch(/^[0-9a-f]{32}$/);
    expect(entity.entity_id).toBe('light.test_entity_default');
    expect(entity.area_id).toBeNull();
    expect(entity.categories).toEqual({});
    expect(entity.config_entry_id).toBeNull();
    expect(entity.config_subentry_id).toBeNull();
    expect(entity.created_at).toBeGreaterThan(0);
    expect(entity.device_id).toBe(device.id);
    expect(entity.disabled_by).toBeNull();
    expect(entity.entity_category).toBeNull();
    expect(entity.has_entity_name).toBe(true);
    expect(entity.hidden_by).toBeNull();
    expect(entity.icon).toBeNull();
    expect(entity.labels).toEqual([]);
    expect(entity.modified_at).toBe(entity.created_at);
    expect(entity.name).toBeNull();
    expect(entity.options).toBeNull();
    expect(entity.original_name).toBe('Test Entity Default');
    expect(entity.platform).toBe('jest');
    expect(entity.translation_key).toBeNull();
    expect(entity.unique_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('should generate a Home Assistant entity with the provided labels', () => {
    const entity: HassEntity = generateEntity('Test Entity Labels', 'light', null, null, ['matterbridge', 'split']);

    expect(entity.entity_id).toBe('light.test_entity_labels');
    expect(entity.labels).toEqual(['matterbridge', 'split']);
  });

  it('should generate a Home Assistant entity with the provided area id when there is no device', () => {
    const entity: HassEntity = generateEntity('Test Entity Area', 'light', null, 'living_room');

    expect(entity.device_id).toBeNull();
    expect(entity.entity_id).toBe('light.test_entity_area');
    expect(entity.area_id).toBe('living_room');
  });

  it('should generate a Home Assistant entity with null area id when a device is provided', () => {
    const device: HassDevice = generateDevice('Test Device', 'kitchen');
    const entity: HassEntity = generateEntity('Test Entity Device', 'light', device, 'living_room');

    expect(entity.device_id).toBe(device.id);
    expect(entity.entity_id).toBe('light.test_entity_device');
    expect(entity.area_id).toBeNull();
  });

  it('should generate a Home Assistant entity with null name for invalid input', () => {
    // @ts-expect-error Testing edge case where name is undefined
    const entity: HassEntity = generateEntity(undefined, 'switch');

    expect(entity.device_id).toBeNull();
    expect(entity.entity_id).toBe('switch.unnamed_entity');
    expect(entity.has_entity_name).toBe(true);
    expect(entity.name).toBeNull();
    expect(entity.original_name).toBeNull();
    expect(entity.platform).toBe('jest');
  });

  it('should generate a Home Assistant entity with fixed platform for any domain', () => {
    const entity: HassEntity = generateEntity('Test Entity Domain', 'invalid_domain');

    expect(entity.entity_id).toBe('invalid_domain.test_entity_domain');
    expect(entity.platform).toBe('jest');
  });

  it('should generate a unique entity id when the same name is reused', () => {
    const entity1: HassEntity = generateEntity('Repeated Name', 'light');
    const entity2: HassEntity = generateEntity('Repeated Name', 'light');

    expect(entity1.entity_id).toBe('light.repeated_name');
    expect(entity2.entity_id).toBe('light.repeated_name_2');
  });

  it('should generate a Home Assistant state with default properties', () => {
    const entity: HassEntity = generateEntity('Test Entity State', 'light');
    const state: HassState = generateState(entity, 'unknown', { unit_of_measurement: '%', restored: true });

    expect(state.entity_id).toBe(entity.entity_id);
    expect(state.state).toBe('unknown');
    expect(state.last_changed).toBe(state.last_reported);
    expect(state.last_reported).toBe(state.last_updated);
    expect(state.attributes.friendly_name).toBe('Test Entity State');
    expect(state.attributes.unit_of_measurement).toBe('%');
    expect(state.attributes.restored).toBe(true);
    expect(state.context.id).toMatch(/^[0-9a-f]{32}$/);
    expect(state.context.parent_id).toBeNull();
    expect(state.context.user_id).toBeNull();
  });

  it('should generate a Home Assistant state with an overridden friendly name', () => {
    const entity: HassEntity = generateEntity('Test Entity Override', 'light');
    const state: HassState = generateState(entity, 'on', { friendly_name: 'Friendly Test Entity' });

    expect(state.state).toBe('on');
    expect(state.attributes.friendly_name).toBe('Friendly Test Entity');
  });

  it('should generate a Home Assistant state without friendly name when the entity has no name', () => {
    // @ts-expect-error Testing edge case where name is undefined
    const entity: HassEntity = generateEntity(undefined, 'switch');
    const state: HassState = generateState(entity);

    expect(state.state).toBe('unknown');
    expect(state.attributes.friendly_name).toBeUndefined();
  });

  it('should check if an entity has a label', () => {
    const labels: HassLabel[] = [
      { label_id: 'select', name: 'Select', color: null, created_at: 0, description: null, icon: null, modified_at: 0 },
      { label_id: 'split', name: 'Split', color: null, created_at: 0, description: null, icon: null, modified_at: 0 },
    ];
    const entity: HassEntity = {
      entity_id: 'light.living_room',
      labels: ['select', 'split'],
    } as unknown as HassEntity;

    expect(entityHasLabel(entity, labels, 'Select')).toBe(true);
    expect(entityHasLabel(entity, labels, 'select')).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(entityHasLabel(null, labels, 'select')).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(entityHasLabel(undefined, labels, 'select')).toBe(false);

    expect(entityHasLabel(entity, labels, 'unknown')).toBe(false);

    // @ts-expect-error Testing edge case where labels is undefined
    expect(entityHasLabel(entity, undefined, 'Select')).toBe(false);

    // @ts-expect-error Testing edge case where label is undefined
    expect(entityHasLabel(entity, labels, undefined)).toBe(false);

    // @ts-expect-error Testing edge case where label is number
    expect(entityHasLabel(entity, labels, 1)).toBe(false);

    // @ts-expect-error Testing edge case where labels is undefined
    entity.labels = undefined;
    expect(entityHasLabel(entity, labels, 'Select')).toBe(false);
  });

  it('should check if an entity is disabled', () => {
    const entity: HassEntity = {
      entity_id: 'light.kitchen',
      disabled_by: null,
    } as unknown as HassEntity;

    expect(entityDisabled(entity)).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(entityDisabled(null)).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(entityDisabled(undefined)).toBe(false);

    entity.disabled_by = 'user';
    expect(entityDisabled(entity)).toBe(true);

    // @ts-expect-error Testing edge case where disabled_by is a number
    entity.disabled_by = 1;
    expect(entityDisabled(entity)).toBe(false);

    // @ts-expect-error Testing edge case where disabled_by is undefined
    entity.disabled_by = undefined;
    expect(entityDisabled(entity)).toBe(false);
  });

  it('should check if an entity is a split entity and handle edge cases', () => {
    const labels: HassLabel[] = [
      { label_id: 'split', name: 'Split', color: null, created_at: 0, description: null, icon: null, modified_at: 0 },
      { label_id: 'desk', name: 'Desk', color: null, created_at: 0, description: null, icon: null, modified_at: 0 },
    ];
    const entity: HassEntity = {
      entity_id: 'light.office',
      labels: ['split', 'desk'],
    } as unknown as HassEntity;

    expect(isSplitEntity(entity, ['light.office'], labels, 'separate')).toBe(true);
    expect(isSplitEntity(entity, ['light.kitchen'], labels, 'Split')).toBe(true);
    expect(isSplitEntity(entity, ['light.kitchen'], labels, 'separate')).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(isSplitEntity(null, ['light.office'], labels, 'Split')).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(isSplitEntity(undefined, ['light.office'], labels, 'Split')).toBe(false);

    // @ts-expect-error Testing edge case where splitEntities is null
    expect(isSplitEntity(entity, null, labels, 'Split')).toBe(false);

    // @ts-expect-error Testing edge case where splitEntities is undefined
    expect(isSplitEntity(entity, undefined, labels, 'Split')).toBe(false);

    // @ts-expect-error Testing edge case where splitEntities is not an array
    expect(isSplitEntity(entity, 'light.office', labels, 'Split')).toBe(false);

    // @ts-expect-error Testing edge case where labels is undefined
    expect(isSplitEntity(entity, ['light.office'], undefined, 'Split')).toBe(false);

    // @ts-expect-error Testing edge case where label is undefined
    expect(isSplitEntity(entity, ['light.office'], labels, undefined)).toBe(false);

    // @ts-expect-error Testing edge case where label is a number
    expect(isSplitEntity(entity, ['light.office'], labels, 1)).toBe(false);

    // @ts-expect-error Testing edge case where labels is undefined
    entity.labels = undefined;
    expect(isSplitEntity(entity, ['light.kitchen'], labels, 'Split')).toBe(false);
  });

  it('should return the entity name using the selected strategy and handle edge cases', () => {
    const entity: HassEntity = {
      entity_id: 'light.bedroom',
      name: 'Bedroom Light',
      original_name: 'Original Bedroom Light',
    } as unknown as HassEntity;

    const state: HassState = {
      entity_id: entity.entity_id,
      state: 'on',
      attributes: { friendly_name: 'Bedroom Ceiling Light' },
    } as unknown as HassState;

    expect(getEntityName(entity, state, 'Friendly name')).toBe('Bedroom Ceiling Light');
    expect(getEntityName(entity, state, 'Entity name')).toBe('Bedroom Light');

    state.attributes.friendly_name = undefined;
    expect(getEntityName(entity, state, 'Friendly name')).toBe('Bedroom Light');

    entity.name = null;
    expect(getEntityName(entity, state, 'Friendly name')).toBe('Original Bedroom Light');
    expect(getEntityName(entity, state, 'Entity name')).toBe('Original Bedroom Light');

    entity.original_name = null;
    state.attributes.friendly_name = 'Bedroom Ceiling Light';
    expect(getEntityName(entity, state, 'Friendly name')).toBe('Bedroom Ceiling Light');
    expect(getEntityName(entity, state, 'Entity name')).toBe('Bedroom Ceiling Light');

    entity.name = '';
    entity.original_name = 'Original Bedroom Light';
    state.attributes.friendly_name = '';
    expect(getEntityName(entity, state, 'Friendly name')).toBe('');
    expect(getEntityName(entity, state, 'Entity name')).toBe('');

    entity.name = null;
    entity.original_name = null;
    state.attributes.friendly_name = undefined;
    expect(getEntityName(entity, state, 'Friendly name')).toBeNull();
    expect(getEntityName(entity, state, 'Entity name')).toBeNull();

    entity.name = 'Bedroom Light';
    entity.original_name = 'Original Bedroom Light';
    // @ts-expect-error Testing edge case where attributes is undefined
    state.attributes = undefined;
    expect(getEntityName(entity, state, 'Friendly name')).toBe('Bedroom Light');
    expect(getEntityName(entity, state, 'Entity name')).toBe('Bedroom Light');

    // @ts-expect-error Testing edge case where entity is null
    expect(getEntityName(null, state, 'Entity name')).toBeNull();

    // @ts-expect-error Testing edge case where entity is undefined
    expect(getEntityName(undefined, state, 'Entity name')).toBeNull();

    // @ts-expect-error Testing edge case where state is null
    expect(getEntityName(entity, null, 'Entity name')).toBeNull();

    // @ts-expect-error Testing edge case where state is undefined
    expect(getEntityName(entity, undefined, 'Entity name')).toBeNull();

    // @ts-expect-error Testing edge case where splitNameStrategy is undefined
    expect(getEntityName(entity, state, undefined)).toBeNull();

    // @ts-expect-error Testing edge case where splitNameStrategy is invalid
    expect(getEntityName(entity, state, 'Unknown')).toBeNull();

    // @ts-expect-error Testing edge case where splitNameStrategy is a number
    expect(getEntityName(entity, state, 1)).toBeNull();
  });
});
