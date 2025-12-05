import { jest } from '@jest/globals';
import { genericSwitch } from 'matterbridge';
import { CYAN, db } from 'matterbridge/logger';
import { Switch } from 'matterbridge/matter/clusters';

import { addEventEntity } from './event.entity.js';
import { MutableDevice } from './mutableDevice.js';
import { HomeAssistantEventDeviceClass } from './homeAssistant.js';

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
  return {
    // Cast to any to satisfy expected type usages
    deviceTypes,
    clusters,
    friendlyNames,
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
  } as any;
}

const mockLog = { debug: jest.fn() } as any;

describe('addEventEntity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseEntity = (idSuffix: string) =>
    ({
      entity_id: `event.entity_${idSuffix}`,
    }) as any;

  const baseState = (event_types: string[], device_class: string, state: string, friendly?: string) =>
    ({
      state,
      attributes: { event_types, device_class, friendly_name: friendly },
    }) as any;

  it("doesn't add not an event domain", () => {
    const md = createMockMutableDevice();
    const entity = { entity_id: `notanevent.entity_unsupported` } as any;
    const state = baseState(['unsupported'], HomeAssistantEventDeviceClass.MOTION, 'unknown');
    const ep = addEventEntity(md as any, entity, state, mockLog);
    expect(ep).toBeUndefined();
  });

  it('adds button and friendly name', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity(HomeAssistantEventDeviceClass.BUTTON);
    const state = baseState(['single', 'double', 'long'], HomeAssistantEventDeviceClass.BUTTON, 'unknown', 'Button Friendly');
    const ep = addEventEntity(md as any, entity, state, mockLog);
    expect(ep).toBe(entity.entity_id);
    const endpoint = ep as string;
    expect(md.deviceTypes[endpoint]).toEqual([genericSwitch.code]);
    expect(md.friendlyNames[endpoint]).toBe('Button Friendly');
    expect(mockLog.debug).toHaveBeenCalledWith(
      `- domain event deviceClass ${HomeAssistantEventDeviceClass.BUTTON} endpoint '${CYAN}${entity.entity_id}${db}' for entity ${CYAN}${entity.entity_id}${db}`,
    );
    expect(mockLog.debug).toHaveBeenCalledWith(
      `+ domain event supported [single, double, long] device ${CYAN}${genericSwitch.name}${db} cluster ${CYAN}${Switch.Cluster.name}${db}`,
    );
  });

  it('adds doorbell without friendly name', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity(HomeAssistantEventDeviceClass.DOORBELL);
    const state = baseState(['single'], HomeAssistantEventDeviceClass.DOORBELL, 'unknown');
    const ep = addEventEntity(md as any, entity, state, mockLog);
    expect(ep).toBe(entity.entity_id);
    const endpoint = ep as string;
    expect(md.deviceTypes[endpoint]).toEqual([genericSwitch.code]);
    expect(md.friendlyNames[endpoint]).toBeUndefined();
    expect(mockLog.debug).toHaveBeenCalledWith(
      `- domain event deviceClass ${HomeAssistantEventDeviceClass.DOORBELL} endpoint '${CYAN}${entity.entity_id}${db}' for entity ${CYAN}${entity.entity_id}${db}`,
    );
    expect(mockLog.debug).toHaveBeenCalledWith(`+ domain event supported [single] device ${CYAN}${genericSwitch.name}${db} cluster ${CYAN}${Switch.Cluster.name}${db}`);
  });

  it('adds motion without friendly name', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity(HomeAssistantEventDeviceClass.MOTION);
    const state = baseState(['single'], HomeAssistantEventDeviceClass.MOTION, 'unknown');
    const ep = addEventEntity(md as any, entity, state, mockLog);
    expect(ep).toBe(entity.entity_id);
    const endpoint = ep as string;
    expect(md.deviceTypes[endpoint]).toEqual([genericSwitch.code]);
    expect(md.friendlyNames[endpoint]).toBeUndefined();
    expect(mockLog.debug).toHaveBeenCalledWith(
      `- domain event deviceClass ${HomeAssistantEventDeviceClass.MOTION} endpoint '${CYAN}${entity.entity_id}${db}' for entity ${CYAN}${entity.entity_id}${db}`,
    );
    expect(mockLog.debug).toHaveBeenCalledWith(`+ domain event supported [single] device ${CYAN}${genericSwitch.name}${db} cluster ${CYAN}${Switch.Cluster.name}${db}`);
  });

  it('adds unsupported', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity(HomeAssistantEventDeviceClass.MOTION);
    const state = baseState(['unsupported'], HomeAssistantEventDeviceClass.MOTION, 'unknown');
    const ep = addEventEntity(md as any, entity, state, mockLog);
    expect(ep).toBeUndefined();
  });

  it('adds supported and unsupported', () => {
    const md = createMockMutableDevice();
    const entity = baseEntity(HomeAssistantEventDeviceClass.MOTION);
    const state = baseState(['single', 'unsupported'], HomeAssistantEventDeviceClass.MOTION, 'unknown');
    const ep = addEventEntity(md as any, entity, state, mockLog);
    expect(ep).toBe(entity.entity_id);
    const endpoint = ep as string;
    expect(md.deviceTypes[endpoint]).toEqual([genericSwitch.code]);
    expect(md.friendlyNames[endpoint]).toBeUndefined();
    expect(mockLog.debug).toHaveBeenCalledWith(
      `- domain event deviceClass ${HomeAssistantEventDeviceClass.MOTION} endpoint '${CYAN}${entity.entity_id}${db}' for entity ${CYAN}${entity.entity_id}${db}`,
    );
    expect(mockLog.debug).toHaveBeenCalledWith(`+ domain event supported [single] device ${CYAN}${genericSwitch.name}${db} cluster ${CYAN}${Switch.Cluster.name}${db}`);
  });
});
