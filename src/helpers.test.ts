// src\helpers.test.ts

import {
  createUniqueId,
  entityHasLabel,
  generateArea,
  generateDevice,
  generateEntity,
  generateLabel,
  generateState,
  getDomain,
  getEntityName,
  getName,
  isDeviceEntity,
  isDisabled,
  isHidden,
  isIndividualEntity,
  isSplitEntity,
  satisfiesAreaFilter,
  satisfiesLabelFilter,
} from './helpers.js';
import { HassArea, HassDevice, HassEntity, HassLabel, HassState, type HomeAssistant } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';

function createHomeAssistant(): HomeAssistant {
  return {
    hassDevices: new Map<string, HassDevice>(),
    hassEntities: new Map<string, HassEntity>(),
    hassStates: new Map<string, HassState>(),
    hassAreas: new Map<string, HassArea>(),
    hassLabels: new Map<string, HassLabel>(),
  } as HomeAssistant;
}

describe('HassPlatform helpers', () => {
  it('should create a unique id as a 32-character hexadecimal string', () => {
    const uniqueId1 = createUniqueId();
    const uniqueId2 = createUniqueId();

    expect(uniqueId1).toMatch(/^[0-9a-f]{32}$/);
    expect(uniqueId2).toMatch(/^[0-9a-f]{32}$/);
    expect(uniqueId1).not.toBe(uniqueId2);
  });

  it('should generate a Home Assistant device with default properties', () => {
    const homeAssistant = createHomeAssistant();
    const device: HassDevice = generateDevice(homeAssistant, 'Test Device');

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
    expect(homeAssistant.hassDevices.get(device.id)).toBe(device);
  });

  it('should generate a Home Assistant device with null name for invalid input', () => {
    const homeAssistant = createHomeAssistant();
    // @ts-expect-error Testing edge case where name is undefined
    const device: HassDevice = generateDevice(homeAssistant, undefined);

    expect(device.name).toBeNull();
    expect(device.area_id).toBeNull();
    expect(device.serial_number).toMatch(/^0x[0-9a-f]{16}$/);
  });

  it('should generate a Home Assistant device with the provided area id', () => {
    const homeAssistant = createHomeAssistant();
    const device: HassDevice = generateDevice(homeAssistant, 'Test Device', 'living_room');

    expect(device.name).toBe('Test Device');
    expect(device.area_id).toBe('living_room');
  });

  it('should generate a Home Assistant device with the provided labels', () => {
    const homeAssistant = createHomeAssistant();
    const device: HassDevice = generateDevice(homeAssistant, 'Test Device', null, ['matterbridge', 'split']);

    expect(device.labels).toEqual(['matterbridge', 'split']);
  });

  it('should generate a Home Assistant area with default properties', () => {
    const homeAssistant = createHomeAssistant();
    const area: HassArea = generateArea(homeAssistant, 'Living Room Default');

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
    expect(homeAssistant.hassAreas.get(area.area_id)).toBe(area);
  });

  it('should generate a Home Assistant area with the provided labels', () => {
    const homeAssistant = createHomeAssistant();
    const area: HassArea = generateArea(homeAssistant, 'Living Room Labels', ['matterbridge', 'split']);

    expect(area.area_id).toBe('living_room_labels');
    expect(area.labels).toEqual(['matterbridge', 'split']);
  });

  it('should generate a unique area id when the same name is reused', () => {
    const homeAssistant = createHomeAssistant();
    const area1: HassArea = generateArea(homeAssistant, 'Repeated Area');
    const area2: HassArea = generateArea(homeAssistant, 'Repeated Area');

    expect(area1.area_id).toBe('repeated_area');
    expect(area2.area_id).toBe('repeated_area_2');
  });

  it('should generate a fallback area id and name for invalid input', () => {
    const homeAssistant = createHomeAssistant();
    // @ts-expect-error Testing edge case where name is undefined
    const area: HassArea = generateArea(homeAssistant, undefined);

    expect(area.area_id).toBe('unnamed_area');
    expect(area.name).toBe('Unnamed Area');
  });

  it('should generate a Home Assistant label with default properties', () => {
    const homeAssistant = createHomeAssistant();
    const label: HassLabel = generateLabel(homeAssistant, 'Matterbridge Label');

    expect(label.label_id).toBe('matterbridge_label');
    expect(label.color).toBeNull();
    expect(label.created_at).toBeGreaterThan(0);
    expect(label.description).toBeNull();
    expect(label.icon).toBeNull();
    expect(label.modified_at).toBe(label.created_at);
    expect(label.name).toBe('Matterbridge Label');
    expect(homeAssistant.hassLabels.get(label.label_id)).toBe(label);
  });

  it('should generate a unique label id when the same name is reused', () => {
    const homeAssistant = createHomeAssistant();
    const label1: HassLabel = generateLabel(homeAssistant, 'Repeated Label');
    const label2: HassLabel = generateLabel(homeAssistant, 'Repeated Label');

    expect(label1.label_id).toBe('repeated_label');
    expect(label2.label_id).toBe('repeated_label_2');
  });

  it('should generate a fallback label id and name for invalid input', () => {
    const homeAssistant = createHomeAssistant();
    // @ts-expect-error Testing edge case where name is undefined
    const label: HassLabel = generateLabel(homeAssistant, undefined);

    expect(label.label_id).toBe('unnamed_label');
    expect(label.name).toBe('Unnamed Label');
  });

  it('should generate a Home Assistant entity with default properties', () => {
    const homeAssistant = createHomeAssistant();
    const device: HassDevice = generateDevice(homeAssistant, 'Test Device');
    const entity: HassEntity = generateEntity(homeAssistant, 'Test Entity Default', 'light', device);
    const state = homeAssistant.hassStates.get(entity.entity_id);

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
    expect(homeAssistant.hassEntities.get(entity.entity_id)).toBe(entity);
    expect(state?.state).toBe('unknown');
    expect(state?.attributes.friendly_name).toBe('Test Device Test Entity Default');
  });

  it('should generate a Home Assistant entity with the provided labels', () => {
    const homeAssistant = createHomeAssistant();
    const entity: HassEntity = generateEntity(homeAssistant, 'Test Entity Labels', 'light', null, null, ['matterbridge', 'split']);

    expect(entity.entity_id).toBe('light.test_entity_labels');
    expect(entity.labels).toEqual(['matterbridge', 'split']);
  });

  it('should generate a Home Assistant entity with the provided area id when there is no device', () => {
    const homeAssistant = createHomeAssistant();
    const entity: HassEntity = generateEntity(homeAssistant, 'Test Entity Area', 'light', null, 'living_room');

    expect(entity.device_id).toBeNull();
    expect(entity.entity_id).toBe('light.test_entity_area');
    expect(entity.area_id).toBe('living_room');
  });

  it('should generate a Home Assistant entity with null area id when a device is provided', () => {
    const homeAssistant = createHomeAssistant();
    const device: HassDevice = generateDevice(homeAssistant, 'Test Device', 'kitchen');
    const entity: HassEntity = generateEntity(homeAssistant, 'Test Entity Device', 'light', device, 'living_room');

    expect(entity.device_id).toBe(device.id);
    expect(entity.entity_id).toBe('light.test_entity_device');
    expect(entity.area_id).toBeNull();
  });

  it('should generate a Home Assistant entity with null name for invalid input', () => {
    const homeAssistant = createHomeAssistant();
    // @ts-expect-error Testing edge case where name is undefined
    const entity: HassEntity = generateEntity(homeAssistant, undefined, 'switch');

    expect(entity.device_id).toBeNull();
    expect(entity.entity_id).toBe('switch.unnamed_entity');
    expect(entity.has_entity_name).toBe(true);
    expect(entity.name).toBeNull();
    expect(entity.original_name).toBeNull();
    expect(entity.platform).toBe('jest');
  });

  it('should generate a Home Assistant entity with fixed platform for any domain', () => {
    const homeAssistant = createHomeAssistant();
    const entity: HassEntity = generateEntity(homeAssistant, 'Test Entity Domain', 'invalid_domain');

    expect(entity.entity_id).toBe('invalid_domain.test_entity_domain');
    expect(entity.platform).toBe('jest');
  });

  it('should generate a Home Assistant entity with the provided initial state and attributes', () => {
    const homeAssistant = createHomeAssistant();
    const entity: HassEntity = generateEntity(homeAssistant, 'Test Entity Custom State', 'sensor', null, null, [], '12', {
      unit_of_measurement: '%',
      restored: true,
    });
    const state = homeAssistant.hassStates.get(entity.entity_id);

    expect(state).toBeDefined();
    expect(state?.state).toBe('12');
    expect(state?.attributes.friendly_name).toBe('Test Entity Custom State');
    expect(state?.attributes.unit_of_measurement).toBe('%');
    expect(state?.attributes.restored).toBe(true);
  });

  it('should generate a unique entity id when the same name is reused', () => {
    const homeAssistant = createHomeAssistant();
    const entity1: HassEntity = generateEntity(homeAssistant, 'Repeated Name', 'light');
    const entity2: HassEntity = generateEntity(homeAssistant, 'Repeated Name', 'light');

    expect(entity1.entity_id).toBe('light.repeated_name');
    expect(entity2.entity_id).toBe('light.repeated_name_2');
  });

  it('should generate a Home Assistant state with default properties', () => {
    const homeAssistant = createHomeAssistant();
    const entity: HassEntity = generateEntity(homeAssistant, 'Test Entity State', 'light');
    const state: HassState = generateState(homeAssistant, entity, 'unknown', { unit_of_measurement: '%', restored: true });

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
    expect(homeAssistant.hassStates.get(state.entity_id)).toBe(state);
  });

  it('should prefix the friendly name with the parent device name', () => {
    const homeAssistant = createHomeAssistant();
    const device: HassDevice = generateDevice(homeAssistant, 'Kitchen Sensor');
    const entity: HassEntity = generateEntity(homeAssistant, 'Temperature', 'sensor', device);
    const state: HassState = generateState(homeAssistant, entity, '21');

    expect(state.state).toBe('21');
    expect(state.attributes.friendly_name).toBe('Kitchen Sensor Temperature');
  });

  it('should prefer the user-defined device name when prefixing the friendly name', () => {
    const homeAssistant = createHomeAssistant();
    const device: HassDevice = generateDevice(homeAssistant, 'Kitchen Sensor');
    device.name_by_user = 'Kitchen Climate';
    const entity: HassEntity = generateEntity(homeAssistant, 'Temperature', 'sensor', device);
    const state: HassState = generateState(homeAssistant, entity, '21');

    expect(state.state).toBe('21');
    expect(state.attributes.friendly_name).toBe('Kitchen Climate Temperature');
  });

  it('should fall back to the entity name when the parent device has no usable name', () => {
    const homeAssistant = createHomeAssistant();
    // @ts-expect-error Testing edge case where device name is undefined
    const device: HassDevice = generateDevice(homeAssistant, undefined);
    const entity: HassEntity = generateEntity(homeAssistant, 'Temperature', 'sensor', device);
    const state: HassState = generateState(homeAssistant, entity, '21');

    expect(state.state).toBe('21');
    expect(state.attributes.friendly_name).toBe('Temperature');
  });

  it('should generate a Home Assistant state with an overridden friendly name', () => {
    const homeAssistant = createHomeAssistant();
    const entity: HassEntity = generateEntity(homeAssistant, 'Test Entity Override', 'light');
    const state: HassState = generateState(homeAssistant, entity, 'on', { friendly_name: 'Friendly Test Entity' });

    expect(state.state).toBe('on');
    expect(state.attributes.friendly_name).toBe('Friendly Test Entity');
  });

  it('should generate a Home Assistant state without friendly name when the entity has no name', () => {
    const homeAssistant = createHomeAssistant();
    // @ts-expect-error Testing edge case where name is undefined
    const entity: HassEntity = generateEntity(homeAssistant, undefined, 'switch');
    const state: HassState = generateState(homeAssistant, entity);

    expect(state.state).toBe('unknown');
    expect(state.attributes.friendly_name).toBeUndefined();
  });

  it('should check if an entity has a label', () => {
    const labels: HassLabel[] = [
      { label_id: 'select', name: 'Select', color: null, created_at: 0, description: null, icon: null, modified_at: 0 },
      { label_id: 'split', name: 'Split', color: null, created_at: 0, description: null, icon: null, modified_at: 0 },
    ];
    const createPlatform = (platformLabels: HassLabel[] | undefined): HomeAssistantPlatform =>
      ({
        ha: {
          hassLabels: new Map((platformLabels ?? []).map((platformLabel) => [platformLabel.label_id, platformLabel])),
        },
      }) as unknown as HomeAssistantPlatform;
    const entity: HassEntity = {
      entity_id: 'light.living_room',
      labels: ['select', 'split'],
    } as unknown as HassEntity;

    expect(entityHasLabel(createPlatform(labels), entity, 'Select')).toBe(true);
    expect(entityHasLabel(createPlatform(labels), entity, 'select')).toBe(false);

    // @ts-expect-error Testing edge case where platform is null
    expect(entityHasLabel(null, entity, 'select')).toBe(false);

    // @ts-expect-error Testing edge case where platform is undefined
    expect(entityHasLabel(undefined, entity, 'select')).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(entityHasLabel(createPlatform(labels), null, 'select')).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(entityHasLabel(createPlatform(labels), undefined, 'select')).toBe(false);

    expect(entityHasLabel(createPlatform(labels), entity, 'unknown')).toBe(false);

    expect(entityHasLabel(createPlatform(undefined), entity, 'Select')).toBe(false);

    // @ts-expect-error Testing edge case where label is undefined
    expect(entityHasLabel(createPlatform(labels), entity, undefined)).toBe(false);

    // @ts-expect-error Testing edge case where label is number
    expect(entityHasLabel(createPlatform(labels), entity, 1)).toBe(false);

    delete (entity as Partial<HassEntity>).labels;
    expect(entityHasLabel(createPlatform(labels), entity, 'Select')).toBe(false);
  });

  it('should check if an entity is disabled', () => {
    const entity: HassEntity = {
      entity_id: 'light.kitchen',
      disabled_by: null,
    } as unknown as HassEntity;

    expect(isDisabled(entity)).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(isDisabled(null)).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(isDisabled(undefined)).toBe(false);

    entity.disabled_by = 'user';
    expect(isDisabled(entity)).toBe(true);

    // @ts-expect-error Testing edge case where disabled_by is a number
    entity.disabled_by = 1;
    expect(isDisabled(entity)).toBe(false);

    // @ts-expect-error Testing edge case where disabled_by is undefined
    entity.disabled_by = undefined;
    expect(isDisabled(entity)).toBe(false);
  });

  it('should check if an entity is hidden', () => {
    const entity: HassEntity = {
      entity_id: 'light.kitchen',
      hidden_by: null,
    } as unknown as HassEntity;

    expect(isHidden(entity)).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(isHidden(null)).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(isHidden(undefined)).toBe(false);

    entity.hidden_by = 'user';
    expect(isHidden(entity)).toBe(true);

    // @ts-expect-error Testing edge case where hidden_by is a number
    entity.hidden_by = 1;
    expect(isHidden(entity)).toBe(false);

    // @ts-expect-error Testing edge case where hidden_by is undefined
    entity.hidden_by = undefined;
    expect(isHidden(entity)).toBe(false);
  });

  it('should check if a device or entity satisfies the configured area filter', () => {
    const createPlatform = (filterByArea: string, areas: HassArea[] = []): HomeAssistantPlatform =>
      ({
        config: { filterByArea },
        ha: {
          hassAreas: new Map(areas.map((area) => [area.area_id, area])),
        },
      }) as unknown as HomeAssistantPlatform;

    const area: HassArea = {
      aliases: [],
      area_id: 'living_room',
      created_at: 0,
      floor_id: null,
      humidity_entity_id: null,
      icon: null,
      labels: [],
      modified_at: 0,
      name: 'Living Room',
      picture: null,
      temperature_entity_id: null,
    };
    const device: HassDevice = {
      id: 'device-1',
      area_id: 'living_room',
    } as unknown as HassDevice;
    const entity: HassEntity = {
      entity_id: 'light.living_room',
      area_id: 'living_room',
    } as unknown as HassEntity;

    expect(satisfiesAreaFilter(createPlatform('', [area]), device)).toBe(true);
    expect(satisfiesAreaFilter(createPlatform('Living Room', [area]), device)).toBe(true);
    expect(satisfiesAreaFilter(createPlatform('Living Room', [area]), entity)).toBe(true);

    device.area_id = null;
    expect(satisfiesAreaFilter(createPlatform('Living Room', [area]), device)).toBe(false);

    entity.area_id = 'kitchen';
    expect(satisfiesAreaFilter(createPlatform('Living Room', [area]), entity)).toBe(false);

    expect(satisfiesAreaFilter(createPlatform('Living Room'), device)).toBe(false);

    expect(satisfiesAreaFilter({ config: { filterByArea: 'Living Room' } } as unknown as HomeAssistantPlatform, device)).toBe(false);
    expect(satisfiesAreaFilter({ ha: { hassAreas: new Map([['living_room', area]]) } } as unknown as HomeAssistantPlatform, device)).toBe(false);
    expect(satisfiesAreaFilter({ config: { filterByArea: 'Living Room' }, ha: {} } as unknown as HomeAssistantPlatform, device)).toBe(false);

    device.area_id = 'living_room';
    expect(satisfiesAreaFilter(createPlatform('Kitchen', [area]), device)).toBe(false);

    expect(satisfiesAreaFilter({ config: { filterByArea: 'Living Room' }, ha: { hassAreas: undefined } } as unknown as HomeAssistantPlatform, device)).toBe(false);

    // @ts-expect-error Testing edge case where area_id is undefined
    device.area_id = undefined;
    expect(satisfiesAreaFilter(createPlatform('Living Room', [area]), device)).toBe(false);

    // @ts-expect-error Testing edge case where area_id is a number
    entity.area_id = 1;
    expect(satisfiesAreaFilter(createPlatform('Living Room', [area]), entity)).toBe(false);

    // @ts-expect-error Testing edge case where platform is null
    expect(satisfiesAreaFilter(null, device)).toBe(false);

    // @ts-expect-error Testing edge case where platform is undefined
    expect(satisfiesAreaFilter(undefined, device)).toBe(false);

    // @ts-expect-error Testing edge case where deviceOrEntity is undefined
    expect(satisfiesAreaFilter(createPlatform('Living Room', [area]), undefined)).toBe(false);

    // @ts-expect-error Testing edge case where deviceOrEntity is null
    expect(satisfiesAreaFilter(createPlatform('Living Room', [area]), null)).toBe(false);
  });

  it('should check if a device or entity satisfies the configured label filter', () => {
    const createPlatform = (filterByLabel: string, labels: HassLabel[] = []): HomeAssistantPlatform =>
      ({
        config: { filterByLabel },
        ha: {
          hassLabels: new Map(labels.map((label) => [label.label_id, label])),
        },
      }) as unknown as HomeAssistantPlatform;

    const label: HassLabel = {
      label_id: 'important',
      color: null,
      created_at: 0,
      description: null,
      icon: null,
      modified_at: 0,
      name: 'Important',
    };
    const device: HassDevice = {
      id: 'device-1',
      labels: ['important'],
    } as unknown as HassDevice;
    const entity: HassEntity = {
      entity_id: 'light.living_room',
      labels: ['important'],
    } as unknown as HassEntity;

    expect(satisfiesLabelFilter(createPlatform('', [label]), device)).toBe(true);
    expect(satisfiesLabelFilter(createPlatform('Important', [label]), device)).toBe(true);
    expect(satisfiesLabelFilter(createPlatform('Important', [label]), entity)).toBe(true);

    device.labels = [];
    expect(satisfiesLabelFilter(createPlatform('Important', [label]), device)).toBe(false);

    entity.labels = ['other'];
    expect(satisfiesLabelFilter(createPlatform('Important', [label]), entity)).toBe(false);

    expect(satisfiesLabelFilter(createPlatform('Important'), device)).toBe(false);

    expect(satisfiesLabelFilter({ config: { filterByLabel: 'Important' } } as unknown as HomeAssistantPlatform, device)).toBe(false);
    expect(satisfiesLabelFilter({ ha: { hassLabels: new Map([['important', label]]) } } as unknown as HomeAssistantPlatform, device)).toBe(false);
    expect(satisfiesLabelFilter({ config: { filterByLabel: 'Important' }, ha: {} } as unknown as HomeAssistantPlatform, device)).toBe(false);

    device.labels = ['important'];
    expect(satisfiesLabelFilter(createPlatform('Other', [label]), device)).toBe(false);

    expect(satisfiesLabelFilter({ config: { filterByLabel: 'Important' }, ha: { hassLabels: undefined } } as unknown as HomeAssistantPlatform, device)).toBe(false);

    // @ts-expect-error Testing edge case where labels is undefined
    device.labels = undefined;
    expect(satisfiesLabelFilter(createPlatform('Important', [label]), device)).toBe(false);

    // @ts-expect-error Testing edge case where labels is a string
    entity.labels = 'important';
    expect(satisfiesLabelFilter(createPlatform('Important', [label]), entity)).toBe(false);

    // @ts-expect-error Testing edge case where platform is null
    expect(satisfiesLabelFilter(null, device)).toBe(false);

    // @ts-expect-error Testing edge case where platform is undefined
    expect(satisfiesLabelFilter(undefined, device)).toBe(false);

    // @ts-expect-error Testing edge case where deviceOrEntity is undefined
    expect(satisfiesLabelFilter(createPlatform('Important', [label]), undefined)).toBe(false);

    // @ts-expect-error Testing edge case where deviceOrEntity is null
    expect(satisfiesLabelFilter(createPlatform('Important', [label]), null)).toBe(false);
  });

  it('should check if an entity belongs to a device', () => {
    const deviceEntity: HassEntity = {
      entity_id: 'light.kitchen',
      device_id: 'device-1',
    } as unknown as HassEntity;
    const individualEntity: HassEntity = {
      entity_id: 'light.living_room',
      device_id: null,
    } as unknown as HassEntity;

    expect(isDeviceEntity(deviceEntity)).toBe(true);
    expect(isDeviceEntity(individualEntity)).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(isDeviceEntity(null)).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(isDeviceEntity(undefined)).toBe(false);

    // @ts-expect-error Testing edge case where device_id is undefined
    deviceEntity.device_id = undefined;
    expect(isDeviceEntity(deviceEntity)).toBe(false);
  });

  it('should check if an entity is individual', () => {
    const deviceEntity: HassEntity = {
      entity_id: 'light.kitchen',
      device_id: 'device-1',
    } as unknown as HassEntity;
    const individualEntity: HassEntity = {
      entity_id: 'light.living_room',
      device_id: null,
    } as unknown as HassEntity;

    expect(isIndividualEntity(individualEntity)).toBe(true);
    expect(isIndividualEntity(deviceEntity)).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(isIndividualEntity(null)).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(isIndividualEntity(undefined)).toBe(false);

    // @ts-expect-error Testing edge case where device_id is undefined
    individualEntity.device_id = undefined;
    expect(isIndividualEntity(individualEntity)).toBe(false);
  });

  it('should return the entity domain and throw when it is missing', () => {
    const entity: HassEntity = {
      entity_id: 'light.kitchen',
    } as unknown as HassEntity;

    expect(getDomain(entity)).toBe('light');
    expect(getDomain('sensor.outdoor_temperature')).toBe('sensor');

    entity.entity_id = 'switch.';
    expect(getDomain(entity)).toBe('switch');

    entity.entity_id = '.kitchen';
    expect(() => getDomain(entity)).toThrow('The entity_id ".kitchen" does not contain a domain');
    expect(() => getDomain('.garage')).toThrow('The entity_id ".garage" does not contain a domain');

    entity.entity_id = 'kitchen';
    expect(() => getDomain(entity)).toThrow('The entity_id "kitchen" does not contain a domain');
    expect(() => getDomain('garage')).toThrow('The entity_id "garage" does not contain a domain');

    // @ts-expect-error Testing edge case where entity is null
    expect(() => getDomain(null)).toThrow('The entity_id does not contain a domain');

    // @ts-expect-error Testing edge case where entity is undefined
    expect(() => getDomain(undefined)).toThrow('The entity_id does not contain a domain');

    // @ts-expect-error Testing edge case where entity_id is undefined
    entity.entity_id = undefined;
    expect(() => getDomain(entity)).toThrow('The entity_id does not contain a domain');
  });

  it('should return the entity name and throw when it is missing', () => {
    const entity: HassEntity = {
      entity_id: 'light.kitchen',
    } as unknown as HassEntity;

    expect(getName(entity)).toBe('kitchen');
    expect(getName('sensor.outdoor_temperature')).toBe('outdoor_temperature');

    entity.entity_id = '.kitchen';
    expect(getName(entity)).toBe('kitchen');

    entity.entity_id = 'switch.';
    expect(() => getName(entity)).toThrow('The entity_id "switch." does not contain a name');
    expect(() => getName('sensor.')).toThrow('The entity_id "sensor." does not contain a name');

    entity.entity_id = 'kitchen';
    expect(() => getName(entity)).toThrow('The entity_id "kitchen" does not contain a name');
    expect(() => getName('garage')).toThrow('The entity_id "garage" does not contain a name');

    // @ts-expect-error Testing edge case where entity is null
    expect(() => getName(null)).toThrow('The entity_id does not contain a name');

    // @ts-expect-error Testing edge case where entity is undefined
    expect(() => getName(undefined)).toThrow('The entity_id does not contain a name');

    // @ts-expect-error Testing edge case where entity_id is undefined
    entity.entity_id = undefined;
    expect(() => getName(entity)).toThrow('The entity_id does not contain a name');
  });

  it('should check if an entity is a split entity and handle edge cases', () => {
    const labels: HassLabel[] = [
      { label_id: 'split', name: 'Split', color: null, created_at: 0, description: null, icon: null, modified_at: 0 },
      { label_id: 'desk', name: 'Desk', color: null, created_at: 0, description: null, icon: null, modified_at: 0 },
    ];
    const createPlatform = (splitEntities: unknown, platformLabels: HassLabel[] | undefined, splitByLabel: unknown): HomeAssistantPlatform =>
      ({
        config: {
          splitEntities,
          splitByLabel,
        },
        ha: {
          hassLabels: new Map((platformLabels ?? []).map((platformLabel) => [platformLabel.label_id, platformLabel])),
        },
      }) as unknown as HomeAssistantPlatform;
    const entity: HassEntity = {
      entity_id: 'light.office',
      labels: ['split', 'desk'],
    } as unknown as HassEntity;

    expect(isSplitEntity(createPlatform(['light.office'], labels, 'separate'), entity)).toBe(true);
    expect(isSplitEntity(createPlatform(['light.kitchen'], labels, 'split'), entity)).toBe(false);
    expect(isSplitEntity(createPlatform(['light.kitchen'], labels, 'Split'), entity)).toBe(true);
    expect(isSplitEntity(createPlatform(['light.kitchen'], labels, 'separate'), entity)).toBe(false);

    // @ts-expect-error Testing edge case where platform is null
    expect(isSplitEntity(null, entity)).toBe(false);

    // @ts-expect-error Testing edge case where platform is undefined
    expect(isSplitEntity(undefined, entity)).toBe(false);

    // @ts-expect-error Testing edge case where entity is null
    expect(isSplitEntity(createPlatform(['light.office'], labels, 'Split'), null)).toBe(false);

    // @ts-expect-error Testing edge case where entity is undefined
    expect(isSplitEntity(createPlatform(['light.office'], labels, 'Split'), undefined)).toBe(false);

    expect(isSplitEntity(createPlatform('light.office', labels, 'Split'), entity)).toBe(false);

    expect(isSplitEntity(createPlatform(['light.kitchen'], undefined, 'Split'), entity)).toBe(false);

    expect(isSplitEntity(createPlatform(['light.office'], labels, undefined), entity)).toBe(false);

    expect(isSplitEntity(createPlatform(['light.office'], labels, 1), entity)).toBe(false);

    delete (entity as Partial<HassEntity>).labels;
    expect(isSplitEntity(createPlatform(['light.kitchen'], labels, 'Split'), entity)).toBe(false);
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

    const createPlatform = (splitNameStrategy: unknown, entityState: HassState | undefined): HomeAssistantPlatform =>
      ({
        config: {
          splitNameStrategy,
        },
        ha: {
          hassStates: new Map(entityState ? [[entity.entity_id, entityState]] : []),
        },
      }) as unknown as HomeAssistantPlatform;

    expect(getEntityName(createPlatform('Friendly name', state), entity)).toBe('Bedroom Ceiling Light');
    expect(getEntityName(createPlatform('Entity name', state), entity)).toBe('Bedroom Light');

    state.attributes.friendly_name = undefined;
    expect(getEntityName(createPlatform('Friendly name', state), entity)).toBe('Bedroom Light');

    entity.name = null;
    expect(getEntityName(createPlatform('Friendly name', state), entity)).toBe('Original Bedroom Light');
    expect(getEntityName(createPlatform('Entity name', state), entity)).toBe('Original Bedroom Light');

    entity.original_name = null;
    state.attributes.friendly_name = 'Bedroom Ceiling Light';
    expect(getEntityName(createPlatform('Friendly name', state), entity)).toBe('Bedroom Ceiling Light');
    expect(getEntityName(createPlatform('Entity name', state), entity)).toBe('Bedroom Ceiling Light');

    entity.name = '';
    entity.original_name = 'Original Bedroom Light';
    state.attributes.friendly_name = '';
    expect(getEntityName(createPlatform('Friendly name', state), entity)).toBe('');
    expect(getEntityName(createPlatform('Entity name', state), entity)).toBe('');

    entity.name = null;
    entity.original_name = null;
    state.attributes.friendly_name = undefined;
    expect(getEntityName(createPlatform('Friendly name', state), entity)).toBeNull();
    expect(getEntityName(createPlatform('Entity name', state), entity)).toBeNull();

    entity.name = 'Bedroom Light';
    entity.original_name = 'Original Bedroom Light';
    // @ts-expect-error Testing edge case where attributes is undefined
    state.attributes = undefined;
    expect(getEntityName(createPlatform('Friendly name', state), entity)).toBe('Bedroom Light');
    expect(getEntityName(createPlatform('Entity name', state), entity)).toBe('Bedroom Light');

    const platform = createPlatform('Entity name', state);

    // @ts-expect-error Testing edge case where platform is null
    expect(getEntityName(null, entity)).toBeNull();

    // @ts-expect-error Testing edge case where platform is undefined
    expect(getEntityName(undefined, entity)).toBeNull();

    // @ts-expect-error Testing edge case where entity is null
    expect(getEntityName(platform, null)).toBeNull();

    // @ts-expect-error Testing edge case where entity is undefined
    expect(getEntityName(platform, undefined)).toBeNull();

    expect(getEntityName(createPlatform('Entity name', undefined), entity)).toBeNull();

    expect(getEntityName(createPlatform(undefined, state), entity)).toBeNull();

    expect(getEntityName(createPlatform('Unknown', state), entity)).toBeNull();

    expect(getEntityName(createPlatform(1, state), entity)).toBeNull();

    expect(getEntityName({ config: { splitNameStrategy: 'Entity name' }, ha: {} } as unknown as HomeAssistantPlatform, entity)).toBeNull();
  });
});
