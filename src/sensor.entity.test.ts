import { jest } from '@jest/globals';
import { airQualitySensor, electricalSensor, humiditySensor, lightSensor, powerSource, pressureSensor, temperatureSensor } from 'matterbridge';
import {
  AirQuality,
  ElectricalEnergyMeasurement,
  ElectricalPowerMeasurement,
  IlluminanceMeasurement,
  PowerSource as PowerSourceCluster,
  PressureMeasurement,
  RelativeHumidityMeasurement,
  TemperatureMeasurement,
} from 'matterbridge/matter/clusters';

import { hassDomainSensorsConverter } from './converters.js';
import { MutableDevice } from './mutableDevice.js';
import { addSensorEntity } from './sensor.entity.js';

// Lightweight mock factory replicating just the methods used by addSensorEntity
function createMockMutableDevice(): MutableDevice & {
  deviceTypes: Record<string, number[]>;
  clusters: Record<string, number[]>;
  friendlyNames: Record<string, string>;
} {
  const deviceTypes: Record<string, number[]> = {};
  const clusters: Record<string, number[]> = {};
  const friendlyNames: Record<string, string> = {};
  return {
    deviceTypes,
    clusters,
    friendlyNames,
    name() {
      return 'Test Device';
    },
    addDeviceTypes(endpoint: string, deviceType: any) {
      if (!deviceTypes[endpoint]) deviceTypes[endpoint] = [];
      deviceTypes[endpoint].push(deviceType.code);
      return this as any;
    },
    addClusterServerIds(endpoint: string, clusterId: any) {
      if (!clusters[endpoint]) clusters[endpoint] = [];
      clusters[endpoint].push(clusterId);
      return this as any;
    },
    setFriendlyName(endpoint: string, name: string) {
      friendlyNames[endpoint] = name;
      return this as any;
    },
  } as any;
}

const mockLog = { debug: jest.fn() } as any;

describe('addSensorEntity', () => {
  beforeEach(() => jest.clearAllMocks());

  const baseEntity = (suffix: string) => ({ entity_id: `sensor.test_${suffix}` }) as any;
  const buildState = (device_class: string, state_class: string, friendly?: string) =>
    ({
      attributes: { device_class, state_class, friendly_name: friendly },
    }) as any;

  it('handles air quality regex match with friendly name', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('aqi_regex');
    const state = buildState('aqi', 'measurement', 'AQI Friendly');
    const ep = addSensorEntity(md as any, entity, state, /test_aqi_regex$/, false, mockLog);
    expect(ep).toBe('AirQuality');
    expect(md.deviceTypes['AirQuality'][0]).toBe(airQualitySensor.code);
    expect(md.clusters['AirQuality']).toContain(AirQuality.Cluster.id);
    expect(md.friendlyNames['AirQuality']).toBe('AQI Friendly');
  });

  it('air quality regex path without friendly name (no setFriendlyName)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('aqi_regex2');
    const state = buildState('aqi', 'measurement'); // no friendly_name
    const ep = addSensorEntity(md as any, entity, state, /test_aqi_regex2$/, false, mockLog);
    expect(ep).toBe('AirQuality');
    expect(md.friendlyNames['AirQuality']).toBeUndefined();
  });

  it('adds temperature measurement sensor (no endpoint) with friendly name', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('temp');
    const state = buildState('temperature', 'measurement', 'Temp Friendly');
    const ep = addSensorEntity(md as any, entity, state, undefined, false, mockLog) as string;
    expect(ep).toBe(entity.entity_id);
    expect(md.deviceTypes[ep][0]).toBe(temperatureSensor.code);
    expect(md.clusters[ep]).toContain(TemperatureMeasurement.Cluster.id);
    expect(md.friendlyNames[ep]).toBe('Temp Friendly');
  });

  it('adds only electrical voltage sensor when not battery powered (skips powerSource voltage)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('voltage_ps');
    const state = buildState('voltage', 'measurement', 'Voltage PS');
    const ep = addSensorEntity(md as any, entity, state, undefined, false, mockLog) as string;
    expect(ep).toBe('PowerEnergy'); // electricalSensor mapping
    expect(md.deviceTypes['PowerEnergy']).toContain(electricalSensor.code);
    // Ensure powerSource device type not added
    expect(Object.values(md.deviceTypes).flat()).not.toContain(powerSource.code);
  });

  it('adds powerSource voltage sensor when battery powered', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('voltage_ps_batt');
    const state = buildState('voltage', 'measurement', 'Voltage Batt');
    const ep = addSensorEntity(md as any, entity, state, undefined, true, mockLog);
    expect(ep).toBe(''); // endpoint remapped to ''
    expect(md.deviceTypes[''][0]).toBe(powerSource.code);
    expect(md.clusters['']).toContain(PowerSourceCluster.Cluster.id);
  });

  it('adds battery percentage sensor (powerSource) with empty endpoint', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('battery_ps');
    const state = buildState('battery', 'measurement', 'Battery Percent');
    const ep = addSensorEntity(md as any, entity, state, undefined, true, mockLog);
    expect(ep).toBe('');
    expect(md.deviceTypes['']).toContain(powerSource.code);
    expect(md.clusters['']).toContain(PowerSourceCluster.Cluster.id);
  });

  it('adds only powerSource voltage sensor when battery powered (skips electrical voltage)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('voltage_el_batt');
    const state = buildState('voltage', 'measurement', 'Voltage El Batt');
    const ep = addSensorEntity(md as any, entity, state, undefined, true, mockLog) as string;
    expect(ep).toBe(''); // powerSource converter endpoint
    expect(md.deviceTypes['']).toContain(powerSource.code);
    expect(Object.values(md.deviceTypes).flat()).not.toContain(electricalSensor.code);
  });

  it('adds electrical voltage sensor when not battery powered', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('voltage_el');
    const state = buildState('voltage', 'measurement', 'Voltage El');
    const ep = addSensorEntity(md as any, entity, state, undefined, false, mockLog);
    // Two potential converters (powerSource & electrical). Non-battery skip removes powerSource voltage, leaving electrical with endpoint PowerEnergy
    expect(ep).toBe('PowerEnergy');
    expect(md.deviceTypes['PowerEnergy']).toContain(electricalSensor.code);
    expect(md.clusters['PowerEnergy']).toContain(ElectricalPowerMeasurement.Cluster.id);
  });

  it('adds humidity measurement sensor (friendly name missing)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('humidity');
    const state = buildState('humidity', 'measurement');
    const ep = addSensorEntity(md as any, entity, state, undefined, false, mockLog) as string;
    expect(md.friendlyNames[ep]).toBeUndefined();
    expect(md.deviceTypes[ep][0]).toBe(humiditySensor.code);
    expect(md.clusters[ep]).toContain(RelativeHumidityMeasurement.Cluster.id);
  });

  it('adds pressure measurement sensor', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('pressure');
    const state = buildState('pressure', 'measurement', 'Press');
    const ep = addSensorEntity(md as any, entity, state, undefined, false, mockLog) as string;
    expect(md.deviceTypes[ep][0]).toBe(pressureSensor.code);
    expect(md.clusters[ep]).toContain(PressureMeasurement.Cluster.id);
  });

  it('adds illuminance measurement sensor with endpoint remap unaffected (no endpoint defined)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('lux');
    const state = buildState('illuminance', 'measurement', 'Lux');
    const ep = addSensorEntity(md as any, entity, state, undefined, false, mockLog) as string;
    expect(md.deviceTypes[ep][0]).toBe(lightSensor.code);
    expect(md.clusters[ep]).toContain(IlluminanceMeasurement.Cluster.id);
  });

  it('adds electrical energy & power sensors with endpoint PowerEnergy', () => {
    const md = createMockMutableDevice();
    const entityEnergy = baseEntity('energy');
    const stateEnergy = buildState('energy', 'total_increasing', 'Energy');
    const epEnergy = addSensorEntity(md as any, entityEnergy, stateEnergy, undefined, false, mockLog) as string;
    expect(epEnergy).toBe('PowerEnergy');
    expect(md.deviceTypes['PowerEnergy']).toContain(electricalSensor.code);
    expect(md.clusters['PowerEnergy']).toContain(ElectricalEnergyMeasurement.Cluster.id);

    const entityPower = baseEntity('power');
    const statePower = buildState('power', 'measurement', 'Power');
    const epPower = addSensorEntity(md as any, entityPower, statePower, undefined, false, mockLog) as string;
    expect(epPower).toBe('PowerEnergy');
    expect(md.clusters['PowerEnergy']).toContain(ElectricalPowerMeasurement.Cluster.id);
  });

  it('adds air quality converter (aqi) without regex (endpoint AirQuality)', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('aqi_conv');
    const state = buildState('aqi', 'measurement', 'AQI Converter');
    const ep = addSensorEntity(md as any, entity, state, undefined, false, mockLog) as string;
    expect(ep).toBe('AirQuality');
    expect(md.deviceTypes['AirQuality']).toContain(airQualitySensor.code);
    expect(md.clusters['AirQuality']).toContain(AirQuality.Cluster.id);
  });

  it('returns undefined when no converter matches', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity('unknown');
    const state = buildState('not_supported', 'measurement', 'Unknown');
    const ep = addSensorEntity(md as any, entity, state, undefined, false, mockLog);
    expect(ep).toBeUndefined();
  });

  it('iterates through all sensor converters (smoke test)', () => {
    const md = createMockMutableDevice();
    for (const conv of hassDomainSensorsConverter) {
      const entity = { entity_id: `sensor.coverage_${conv.withDeviceClass}` } as any;
      const state = { attributes: { device_class: conv.withDeviceClass, state_class: conv.withStateClass, friendly_name: conv.withDeviceClass } } as any;
      addSensorEntity(md as any, entity, state, undefined, conv.deviceType === powerSource, mockLog);
    }
    expect(Object.keys(md.deviceTypes).length).toBeGreaterThan(0);
  });
});
