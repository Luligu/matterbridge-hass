/**
 * @description This file contains the addBinarySensorEntity function.
 * @file src\binary_sensor.entity.ts
 * @author Luca Liguori
 * @created 2025-08-25
 * @version 1.0.1
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

import { contactSensor, smokeCoAlarm, waterFreezeDetector, waterLeakDetector } from 'matterbridge';
import { CYAN, db, debugStringify } from 'matterbridge/logger';
import { SmokeCoAlarm } from 'matterbridge/matter/clusters';
import { ClusterRegistry } from 'matterbridge/matter/types';
import { isValidString } from 'matterbridge/utils';

import { hassDomainBinarySensorsConverter } from './converters.js';
import { getDomain } from './helpers.js';
import type { HassEntity, HassState } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';
import type { MutableDevice } from './mutableDevice.js';

/**
 * Look for supported binary_sensors of the current entity
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance
 * @param {MutableDevice} mutableDevice - The mutable device to which the binary sensor will be added
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity
 *
 * @returns {string | undefined} - The endpoint name for the binary sensor, if found; otherwise, undefined
 */
export function addBinarySensorEntity(platform: HomeAssistantPlatform, mutableDevice: MutableDevice, entity: HassEntity, state: HassState): string | undefined {
  let endpointName: string | undefined = undefined;
  const domain = getDomain(entity.entity_id);
  if (domain !== 'binary_sensor') return undefined;

  hassDomainBinarySensorsConverter
    .filter((d) => d.domain === domain && d.withDeviceClass === state.attributes['device_class'])
    .forEach((hassDomainBinarySensor) => {
      if (hassDomainBinarySensor.endpoint !== undefined) {
        endpointName = hassDomainBinarySensor.endpoint; // Remap the endpoint name for the entity
        platform.log.debug(
          `- binary_sensor domain ${hassDomainBinarySensor.domain} deviceClass ${hassDomainBinarySensor.withDeviceClass} endpoint '${CYAN}${endpointName}${db}' for entity ${CYAN}${entity.entity_id}${db}`,
        );
      } else {
        endpointName = entity.entity_id; // Use the entity ID as the endpoint name
      }
      platform.log.debug(
        `+ binary_sensor device ${CYAN}${hassDomainBinarySensor.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomainBinarySensor.clusterId)?.name}${db}`,
      );
      mutableDevice.addDeviceTypes(endpointName, hassDomainBinarySensor.deviceType);
      mutableDevice.addClusterServerIds(endpointName, hassDomainBinarySensor.clusterId);
      if (isValidString(state.attributes['friendly_name'])) mutableDevice.setFriendlyName(endpointName, state.attributes['friendly_name']);
      platform.log.debug(`- state ${debugStringify(state)}`);

      // Configure the BooleanState cluster default value for contactSensor.
      if (hassDomainBinarySensor.deviceType.code === contactSensor.code) {
        platform.log.debug(`= contactSensor device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.state}${db}`);
        mutableDevice.addClusterServerBooleanState(endpointName, state.state === 'on' ? false : true);
      }

      // Configure the BooleanState cluster default value for waterLeakDetector/waterFreezeDetector.
      if (hassDomainBinarySensor.deviceType.code === waterLeakDetector.code || hassDomainBinarySensor.deviceType.code === waterFreezeDetector.code) {
        platform.log.debug(`= waterLeakDetector/waterFreezeDetector device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.state}${db}`);
        mutableDevice.addClusterServerBooleanState(endpointName, state.state === 'on' ? true : false);
      }

      // Configure the SmokeCoAlarm cluster default value with feature SmokeAlarm for device_class smoke.
      if (state.attributes.device_class === 'smoke' && hassDomainBinarySensor.deviceType.code === smokeCoAlarm.code) {
        platform.log.debug(`= smokeCoAlarm SmokeAlarm device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.state}${db}`);
        mutableDevice.addClusterServerSmokeAlarmSmokeCoAlarm(endpointName, state.state === 'on' ? SmokeCoAlarm.AlarmState.Critical : SmokeCoAlarm.AlarmState.Normal);
      }

      // Configure the SmokeCoAlarm cluster default value with feature CoAlarm for device_class carbon_monoxide.
      if (state.attributes.device_class === 'carbon_monoxide' && hassDomainBinarySensor.deviceType.code === smokeCoAlarm.code) {
        platform.log.debug(`= smokeCoAlarm CoAlarm device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.state}${db}`);
        mutableDevice.addClusterServerCoAlarmSmokeCoAlarm(endpointName, state.state === 'on' ? SmokeCoAlarm.AlarmState.Critical : SmokeCoAlarm.AlarmState.Normal);
      }
    });
  return endpointName;
}
