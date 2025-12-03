/**
 * @description This file contains the addEventEntity function.
 * @file src/event.entity.ts
 * @author Luca Liguori
 * @created 2025-12-03
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

import { genericSwitch } from 'matterbridge';
import { isValidString } from 'matterbridge/utils';
import { AnsiLogger, CYAN, db, debugStringify } from 'matterbridge/logger';
import { Switch } from 'matterbridge/matter/clusters';

import { HassEntity, HassState } from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';
import { hassDomainEventConverter } from './converters.js';

/**
 * Look for supported events of the current entity
 *
 * @param {MutableDevice} mutableDevice - The mutable device to which the events will be added
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity to check
 * @param {AnsiLogger} log - The logger instance to log messages
 *
 * @returns {string | undefined} - The endpoint name for the event, if found; otherwise, undefined
 */
export function addEventEntity(mutableDevice: MutableDevice, entity: HassEntity, state: HassState, log: AnsiLogger): string | undefined {
  const endpointName = entity.entity_id;
  const [domain, _name] = entity.entity_id.split('.');
  const supportedEventTypes: string[] = [];
  if (domain !== 'event') return undefined;

  log.debug(`- domain ${domain} deviceClass ${state.attributes.device_class} endpoint '${CYAN}${endpointName}${db}' for entity ${CYAN}${entity.entity_id}${db}`);
  for (const eventType of state.attributes.event_types) {
    if (hassDomainEventConverter.find((e) => e.hassEventType === eventType)) {
      log.debug(`+ event ${CYAN}${eventType}${db}`);
      supportedEventTypes.push(eventType);
    }
  }
  if (supportedEventTypes.length === 0) return undefined;

  log.debug(`+ domain event supported [${supportedEventTypes.join(', ')}] device ${CYAN}${genericSwitch.name}${db} cluster ${CYAN}${Switch.Cluster.name}${db}`);
  mutableDevice.addDeviceTypes(endpointName, genericSwitch);
  mutableDevice.addClusterServerIds(endpointName, Switch.Cluster.id);
  if (isValidString(state.attributes['friendly_name'])) mutableDevice.setFriendlyName(endpointName, state.attributes['friendly_name']);
  log.debug(`- state ${debugStringify(state)}`);
  return endpointName;
}
