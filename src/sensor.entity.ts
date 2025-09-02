/**
 * @description This file contains the addSensorEntity function.
 * @file src\sensor.entity.ts
 * @author Luca Liguori
 * @created 2025-08-25
 * @version 1.0.0
 * @license Apache-2.0
 * @copyright 2025, 2026, 2027 Luca Liguori.
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

import { airQualitySensor, electricalSensor, powerSource } from 'matterbridge';
import { isValidString } from 'matterbridge/utils';
import { AnsiLogger, CYAN, db, debugStringify } from 'matterbridge/logger';
import { ClusterRegistry } from 'matterbridge/matter/types';
import { AirQuality } from 'matterbridge/matter/clusters';

import { HassEntity, HassState } from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';
import { hassDomainSensorsConverter } from './converters.js';

/**
 * Look for supported sensors of the current entity
 *
 * @param {MutableDevice} mutableDevice - The mutable device to which the sensor will be added
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity
 * @param {RegExp | undefined} airQualityRegex - The regex to match air quality sensor entities
 * @param {boolean} battery - If the entity belongs to a battery powered device
 * @param {AnsiLogger} log - The logger instance to log messages
 *
 * @returns {string | undefined} - The endpoint name for the sensor, if found; otherwise, undefined
 */
export function addSensorEntity(
  mutableDevice: MutableDevice,
  entity: HassEntity,
  state: HassState,
  airQualityRegex: RegExp | undefined,
  battery: boolean,
  log: AnsiLogger,
): string | undefined {
  let endpointName: string | undefined = undefined;
  const [domain, _name] = entity.entity_id.split('.');

  // Look for air_quality sensor entity using airqualityRegex
  if (airQualityRegex && airQualityRegex.test(entity.entity_id)) {
    log.debug(`+ air_quality entity ${CYAN}${entity.entity_id}${db} found for device ${CYAN}${mutableDevice.name()}${db}`);
    endpointName = 'AirQuality'; // Remap the endpoint name for the entity
    mutableDevice.addDeviceTypes('AirQuality', airQualitySensor); // Add the air quality sensor device type
    mutableDevice.addClusterServerIds('AirQuality', AirQuality.Cluster.id); // Add the AirQuality cluster
    if (isValidString(state.attributes['friendly_name'])) mutableDevice.setFriendlyName('AirQuality', state.attributes['friendly_name']); // Set the friendly name for the air quality sensor
    return endpointName;
  }

  // Look for supported sensors of the current entity
  hassDomainSensorsConverter
    .filter((d) => d.domain === domain && d.withStateClass === state.attributes['state_class'] && d.withDeviceClass === state.attributes['device_class'])
    .forEach((hassDomainSensor) => {
      // prettier-ignore
      if (hassDomainSensor.deviceType === powerSource && state.attributes['state_class'] === 'measurement' && state.attributes['device_class'] === 'voltage' && !battery) return; // Skip powerSource voltage sensor if the device is not battery powered
      // prettier-ignore
      if (hassDomainSensor.deviceType === electricalSensor && state.attributes['state_class'] === 'measurement' && state.attributes['device_class'] === 'voltage' && battery) return; // Skip electricalSensor voltage sensor if the device is battery powered
      if (hassDomainSensor.endpoint !== undefined) {
        endpointName = hassDomainSensor.endpoint; // Remap the endpoint name for the entity
        log.debug(
          `- sensor domain ${hassDomainSensor.domain} stateClass ${hassDomainSensor.withStateClass} deviceClass ${hassDomainSensor.withDeviceClass} endpoint '${CYAN}${endpointName}${db}' for entity ${CYAN}${entity.entity_id}${db}`,
        );
      } else {
        endpointName = entity.entity_id; // Use the entity ID as the endpoint name
      }
      log.debug(`+ sensor device ${CYAN}${hassDomainSensor.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomainSensor.clusterId)?.name}${db}`);
      mutableDevice.addDeviceTypes(endpointName, hassDomainSensor.deviceType);
      mutableDevice.addClusterServerIds(endpointName, hassDomainSensor.clusterId);
      if (isValidString(state.attributes['friendly_name'])) mutableDevice.setFriendlyName(endpointName, state.attributes['friendly_name']);
      log.debug(`- state ${debugStringify(state)}`);
    });
  return endpointName;
}
