import { jest } from '@jest/globals';
import { contactSensor, smokeCoAlarm, waterFreezeDetector, waterLeakDetector, powerSource, occupancySensor } from 'matterbridge';
import { BooleanState, OccupancySensing, PowerSource, SmokeCoAlarm } from 'matterbridge/matter/clusters';

import { hassDomainBinarySensorsConverter } from './converters.js';
import { addBinarySensorEntity } from './binary_sensor.entity.js';
import { MutableDevice } from './mutableDevice.js';

function createMockMutableDevice(): MutableDevice & {
  deviceTypes: Record<string, number[]>;
  clusters: Record<string, number[]>;
  friendlyNames: Record<string, string>;
  booleanDefaults: Record<string, boolean>;
  smokeAlarmDefaults: Record<string, number>;
  coAlarmDefaults: Record<string, number>;
} {
  const deviceTypes: Record<string, number[]> = {};
  const clusters: Record<string, number[]> = {};
  const friendlyNames: Record<string, string> = {};
  const booleanDefaults: Record<string, boolean> = {};
  const smokeAlarmDefaults: Record<string, number> = {};
  const coAlarmDefaults: Record<string, number> = {};
  return {
    // Cast to any to satisfy expected type usages
    deviceTypes,
    clusters,
    friendlyNames,
    booleanDefaults,
    smokeAlarmDefaults,
    coAlarmDefaults,
    addDeviceTypes(endpoint: string, deviceType: any) {
      const ep = endpoint ?? '';
      if (!deviceTypes[ep]) deviceTypes[ep] = [];
      deviceTypes[ep].push(deviceType.code);
      return this as any;
    },
    addClusterServerIds(endpoint: string, clusterId: any) {
      const ep = endpoint ?? '';
      if (!clusters[ep]) clusters[ep] = [];
      clusters[ep].push(clusterId);
      return this as any;
    },
    setFriendlyName(endpoint: string, name: string) {
      friendlyNames[endpoint ?? ''] = name;
      return this as any;
    },
    addClusterServerBooleanState(endpoint: string, value: boolean) {
      booleanDefaults[endpoint ?? ''] = value;
      return this as any;
    },
    addClusterServerSmokeAlarmSmokeCoAlarm(endpoint: string, value: number) {
      smokeAlarmDefaults[endpoint ?? ''] = value;
      return this as any;
    },
    addClusterServerCoAlarmSmokeCoAlarm(endpoint: string, value: number) {
      coAlarmDefaults[endpoint ?? ''] = value;
      return this as any;
    },
  } as any;
}

const mockLog = { debug: jest.fn() } as any;

describe('addBinarySensorEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseEntity = (device_class: string, idSuffix: string) =>
    ({
      entity_id: `binary_sensor.entity_${idSuffix}`,
    }) as any;

  const baseState = (device_class: string, state: string, friendly = 'Friendly') =>
    ({
      state,
      attributes: { device_class, friendly_name: friendly },
    }) as any;

  it('adds contactSensor (door) with inverse boolean logic and friendly name', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('door', 'door');
    const state = baseState('door', 'on', 'Door Friendly');
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog);
    expect(ep).toBe(entity.entity_id);
    const endpoint = ep as string;
    expect(md.booleanDefaults[endpoint]).toBe(false);
    expect(md.deviceTypes[endpoint][0]).toBe(contactSensor.code);
    expect(md.clusters[endpoint]).toContain(BooleanState.Cluster.id);
    expect(md.friendlyNames[endpoint]).toBe('Door Friendly');
  });

  it('branch where friendly_name missing (no setFriendlyName call)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('door', 'door_no_friendly');
    const state = { state: 'off', attributes: { device_class: 'door' } } as any;
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog) as string;
    expect(md.friendlyNames[ep]).toBeUndefined();
    expect(md.booleanDefaults[ep]).toBe(true);
  });

  it('adds window contactSensor with state off => true', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('window', 'window');
    const state = baseState('window', 'off');
    addBinarySensorEntity(md as any, entity, state, mockLog);
    expect(Object.values(md.booleanDefaults)[0]).toBe(true);
  });

  it('adds waterLeakDetector (moisture) mapping on => true', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('moisture', 'moisture');
    const state = baseState('moisture', 'on');
    addBinarySensorEntity(md as any, entity, state, mockLog);
    expect(Object.values(md.booleanDefaults)[0]).toBe(true);
    expect(Object.values(md.deviceTypes)[0][0]).toBe(waterLeakDetector.code);
  });

  it('adds waterLeakDetector (moisture) mapping off => false', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('moisture', 'moisture_off');
    const state = baseState('moisture', 'off');
    addBinarySensorEntity(md as any, entity, state, mockLog);
    expect(md.booleanDefaults[entity.entity_id]).toBe(false);
  });

  it('adds waterFreezeDetector (cold) mapping on => true', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('cold', 'cold');
    const state = baseState('cold', 'on');
    addBinarySensorEntity(md as any, entity, state, mockLog);
    expect(Object.values(md.booleanDefaults)[0]).toBe(true);
    expect(Object.values(md.deviceTypes)[0][0]).toBe(waterFreezeDetector.code);
  });

  it('adds waterFreezeDetector (cold) mapping off => false', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('cold', 'cold_off');
    const state = baseState('cold', 'off');
    addBinarySensorEntity(md as any, entity, state, mockLog);
    expect(md.booleanDefaults[entity.entity_id]).toBe(false);
  });

  it('adds occupancySensor (motion)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('motion', 'motion');
    const state = baseState('motion', 'on');
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog) as string;
    expect(md.deviceTypes[ep][0]).toBe(occupancySensor.code);
    expect(md.clusters[ep]).toContain(OccupancySensing.Cluster.id);
  });

  it('adds smokeCoAlarm with smoke feature (smoke)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('smoke', 'smoke');
    const state = baseState('smoke', 'on');
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog) as string;
    expect(md.deviceTypes[ep][0]).toBe(smokeCoAlarm.code);
    expect(md.smokeAlarmDefaults[ep]).toBe(SmokeCoAlarm.AlarmState.Critical);
  });

  it('adds smokeCoAlarm with smoke feature (smoke) off => Normal', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('smoke', 'smoke_off');
    const state = baseState('smoke', 'off');
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog) as string;
    expect(md.smokeAlarmDefaults[ep]).toBe(SmokeCoAlarm.AlarmState.Normal);
  });

  it('adds smokeCoAlarm with CO feature (carbon_monoxide)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('carbon_monoxide', 'co');
    const state = baseState('carbon_monoxide', 'off');
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog) as string;
    expect(md.deviceTypes[ep][0]).toBe(smokeCoAlarm.code);
    expect(md.coAlarmDefaults[ep]).toBe(SmokeCoAlarm.AlarmState.Normal);
  });

  it('adds smokeCoAlarm with CO feature (carbon_monoxide) on => Critical', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('carbon_monoxide', 'co_on');
    const state = baseState('carbon_monoxide', 'on');
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog) as string;
    expect(md.coAlarmDefaults[ep]).toBe(SmokeCoAlarm.AlarmState.Critical);
  });

  it('remaps endpoint when converter provides endpoint value (battery)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('battery', 'battery');
    const state = baseState('battery', 'off');
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog);
    expect(ep).toBe('');
    expect(md.deviceTypes[''][0]).toBe(powerSource.code);
    expect(md.clusters['']).toContain(PowerSource.Cluster.id);
  });

  it('returns undefined when no matching converter', () => {
    const md = createMockMutableDevice();
    const entity = { entity_id: 'binary_sensor.unknown_type' } as any;
    const state = { state: 'on', attributes: { device_class: 'not_supported' } } as any;
    const ep = addBinarySensorEntity(md as any, entity, state, mockLog);
    expect(ep).toBeUndefined();
    expect(Object.keys(md.deviceTypes).length).toBe(0);
  });

  it('covers multiple converters by iterating through all supported device classes', () => {
    const md = createMockMutableDevice();
    const classes = hassDomainBinarySensorsConverter.map((c) => c.withDeviceClass);
    for (const dc of classes) {
      const entity = { entity_id: `binary_sensor.test_${dc}` } as any;
      const state = { state: 'on', attributes: { device_class: dc, friendly_name: dc } } as any;
      addBinarySensorEntity(md as any, entity, state, mockLog);
    }
    expect(Object.values(md.deviceTypes).flat().length).toBeGreaterThanOrEqual(classes.length);
  });
});
