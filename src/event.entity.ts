/**
 * @description This file contains the addEventEntity function.
 * @file src/event.entity.ts
 * @author Luca Liguori
 * @created 2025-12-03
 * @version 1.1.0
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

import { genericSwitch } from 'matterbridge';
import { CYAN, db, debugStringify } from 'matterbridge/logger';
import { Switch } from 'matterbridge/matter/clusters';
import { isValidString } from 'matterbridge/utils';

import { hassDomainEventConverter } from './converters.js';
import { getDomain } from './helpers.js';
import type { HassEntity, HassState } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';
import type { MutableDevice } from './mutableDevice.js';

/**
 * Look for supported events of the current entity
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance
 * @param {MutableDevice} mutableDevice - The mutable device to which the events will be added
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity to check
 *
 * @returns {string | undefined} - The endpoint name for the event, if found; otherwise, undefined
 */
export function addEventEntity(platform: HomeAssistantPlatform, mutableDevice: MutableDevice, entity: HassEntity, state: HassState): string | undefined {
  const endpointName = entity.entity_id;
  const domain = getDomain(entity.entity_id);
  const supportedEventTypes: string[] = [];
  if (domain !== 'event') return undefined;

  platform.log.debug(`- domain ${domain} deviceClass ${state.attributes.device_class} endpoint '${CYAN}${endpointName}${db}' for entity ${CYAN}${entity.entity_id}${db}`);
  for (const eventType of state.attributes.event_types || []) {
    if (hassDomainEventConverter.find((e) => e.hassEventType === eventType)) {
      platform.log.debug(`+ event ${CYAN}${eventType}${db}`);
      supportedEventTypes.push(eventType);
    }
  }
  if (supportedEventTypes.length === 0) return undefined;

  platform.log.debug(`+ domain event supported [${supportedEventTypes.join(', ')}] device ${CYAN}${genericSwitch.name}${db} cluster ${CYAN}${Switch.name}${db}`);
  mutableDevice.addDeviceTypes(endpointName, genericSwitch);
  mutableDevice.addClusterServerIds(endpointName, Switch.id);
  if (isValidString(state.attributes['friendly_name'])) mutableDevice.setFriendlyName(endpointName, state.attributes['friendly_name']);
  platform.log.debug(`- state ${debugStringify(state)}`);
  return endpointName;
}
