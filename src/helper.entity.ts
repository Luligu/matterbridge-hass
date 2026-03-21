/**
 * @description This file contains the addHelperEntity function.
 * @file src\helper.entity.ts
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
 * Add a helper entity to the mutable device based on the Home Assistant entity and its state.
 *
 * @param {MutableDevice} mutableDevice - The mutable device to which the helper will be added
 * @param {string | undefined} endpointName - The endpoint name for the helper entity, if already determined; otherwise, undefined
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance
 *
 * @returns {string | undefined} - The endpoint name for the helper, if created; otherwise, undefined
 */
export function addHelperEntity(
  mutableDevice: MutableDevice,
  endpointName: string | undefined,
  entity: HassEntity,
  state: HassState,
  platform: HomeAssistantPlatform,
): string | undefined {
  const [domain, _name] = entity.entity_id.split('.');

  platform.log.debug(`- helper domain "${domain}" platform "${entity.platform}" endpoint "${endpointName}" for entity ${CYAN}${entity.entity_id}${db}`);

  // Set the composed type and configUrl based on the domain
  if (domain === 'automation') {
    if (!endpointName) mutableDevice.setComposedType(`Hass Automation`);
    if (!endpointName)
      mutableDevice.setConfigUrl(`${(platform.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/automation/dashboard`);
  } else if (domain === 'scene') {
    if (!endpointName) mutableDevice.setComposedType(`Hass Scene`);
    if (!endpointName)
      mutableDevice.setConfigUrl(`${(platform.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/scene/dashboard`);
  } else if (domain === 'script') {
    if (!endpointName) mutableDevice.setComposedType(`Hass Script`);
    if (!endpointName)
      mutableDevice.setConfigUrl(`${(platform.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/script/dashboard`);
  } else if (domain === 'input_boolean') {
    if (!endpointName) mutableDevice.setComposedType(`Hass Boolean`);
    if (!endpointName) mutableDevice.setConfigUrl(`${(platform.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`);
  } else if (domain === 'input_button') {
    if (!endpointName) mutableDevice.setComposedType(`Hass Button`);
    if (!endpointName) mutableDevice.setConfigUrl(`${(platform.config.host as string | undefined)?.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`);
  } else {
    return;
  }

  // Add to the mutable endpoint the superset onOffMountedSwitch and subset onOffOutlet device type for global compatibility with all the controllers
  mutableDevice.addDeviceTypes(endpointName || '', onOffMountedSwitch, onOffOutlet);
  mutableDevice.addCommandHandler(endpointName || '', 'on', async (data) => {
    if (domain === 'automation') {
      await platform.ha.callService(domain, 'trigger', entity.entity_id);
    } else if (domain === 'input_button') {
      await platform.ha.callService(domain, 'press', entity.entity_id);
    } else {
      await platform.ha.callService(domain, 'turn_on', entity.entity_id);
    }
    // We revert the state after 500ms except for input_boolean that mantain the state
    if (domain !== 'input_boolean') {
      setTimeout(async () => {
        // istanbul ignore next cause is too long
        await data.endpoint.setAttribute(OnOff.Cluster, 'onOff', false, data.endpoint.log);
      }, 500).unref();
    }
  });
  mutableDevice.addCommandHandler(endpointName || '', 'off', async () => {
    // We don't revert only for input_boolean
    // istanbul ignore else
    if (domain === 'input_boolean') await platform.ha.callService(domain, 'turn_off', entity.entity_id);
  });

  platform.log.debug(`+ helper domain "${domain}" platform "${entity.platform}" endpoint "${endpointName}" for entity ${CYAN}${entity.entity_id}${db}`);

  return endpointName || entity.entity_id;
}
