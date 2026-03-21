/**
 * @description This file contains the addButtonEntity function.
 * @file src\button.entity.ts
 * @author Luca Liguori
 * @created 2026-03-19
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

import { onOffMountedSwitch, onOffOutlet } from 'matterbridge';
import { OnOff } from 'matterbridge/matter/clusters';
import { CYAN, db } from 'node-ansi-logger';

import { HassEntity, HassState } from './homeAssistant.js';
import { HomeAssistantPlatform } from './module.js';
import { MutableDevice } from './mutableDevice.js';

/**
 * Add a button entity to the mutable device based on the Home Assistant entity and its state.
 *
 * @param {MutableDevice} mutableDevice - The mutable device to which the button will be added
 * @param {string | undefined} endpointName - The endpoint name for the button entity, if already determined; otherwise, undefined
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance
 *
 * @returns {string | undefined} - The endpoint name for the button, if created; otherwise, undefined
 */
export function addButtonEntity(
  mutableDevice: MutableDevice,
  endpointName: string | undefined,
  entity: HassEntity,
  state: HassState,
  platform: HomeAssistantPlatform,
): string | undefined {
  const [domain, _name] = entity.entity_id.split('.');
  if (domain !== 'button') return;

  platform.log.debug(`- button domain platform "${entity.platform}" endpoint "${endpointName}" for entity ${CYAN}${entity.entity_id}${db}`);

  // Add to the mutable endpoint the superset onOffMountedSwitch and subset onOffOutlet device type for global compatibility with all the controllers
  mutableDevice.addDeviceTypes(endpointName || '', onOffMountedSwitch, onOffOutlet);
  mutableDevice.addCommandHandler(endpointName || '', 'on', async (data) => {
    await platform.ha.callService(domain, 'press', entity.entity_id);
    // We revert the state after 500ms except for input_boolean that mantain the state
    setTimeout(async () => {
      // istanbul ignore next cause is too long
      await data.endpoint.setAttribute(OnOff.Cluster, 'onOff', false, data.endpoint.log);
    }, 500).unref();
  });

  platform.log.debug(`+ button domain platform "${entity.platform}" endpoint "${endpointName}" for entity ${CYAN}${entity.entity_id}${db}`);

  return endpointName || entity.entity_id;
}
