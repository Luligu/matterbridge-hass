/**
 * @description This file contains the addHelperEntity function.
 * @file src\helper.entity.ts
 * @author Luca Liguori
 * @created 2026-03-19
 * @version 1.1.0
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

// TODO: Remove when require Matterbridge 3.8.1 or later
/* eslint-disable @typescript-eslint/no-deprecated */

import { onOffMountedSwitch, onOffOutlet } from 'matterbridge';
import { OnOff } from 'matterbridge/matter/clusters';
import { CYAN, db } from 'node-ansi-logger';

import { getDomain } from './helpers.js';
import type { HassEntity, HassState } from './homeAssistant.js';
import type { HomeAssistantPlatform } from './module.js';
import type { MutableDevice } from './mutableDevice.js';

/**
 * Add a helper entity to the mutable device based on the Home Assistant entity and its state.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform instance
 * @param {MutableDevice} mutableDevice - The mutable device to which the helper will be added
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity
 * @param {boolean} individualOrSplitEntity - Whether this is an individual or split entity (not part of a device)
 *
 * @returns {string | undefined} - The endpoint name for the helper, if created; otherwise, undefined
 */
export function addHelperEntity(
  platform: HomeAssistantPlatform,
  mutableDevice: MutableDevice,
  entity: HassEntity,
  state: HassState,
  individualOrSplitEntity: boolean,
): string | undefined {
  const endpointName: string | undefined = entity.entity_id;
  const domain = getDomain(entity.entity_id);

  platform.log.debug(`- helper domain "${domain}" platform "${entity.platform}" endpoint "${endpointName}" for entity ${CYAN}${entity.entity_id}${db}`);

  // Set the composed type and configUrl based on the domain
  if (domain === 'automation') {
    if (individualOrSplitEntity) {
      mutableDevice.setComposedType(`Hass Automation`);
      mutableDevice.setConfigUrl(`${platform.config.host.replace('ws://', 'http://').replace('wss://', 'https://')}/config/automation/dashboard`);
    }
  } else if (domain === 'scene') {
    if (individualOrSplitEntity) {
      mutableDevice.setComposedType(`Hass Scene`);
      mutableDevice.setConfigUrl(`${platform.config.host.replace('ws://', 'http://').replace('wss://', 'https://')}/config/scene/dashboard`);
    }
  } else if (domain === 'script') {
    if (individualOrSplitEntity) {
      mutableDevice.setComposedType(`Hass Script`);
      mutableDevice.setConfigUrl(`${platform.config.host.replace('ws://', 'http://').replace('wss://', 'https://')}/config/script/dashboard`);
    }
  } else if (domain === 'input_boolean') {
    if (individualOrSplitEntity) {
      mutableDevice.setComposedType(`Hass Boolean`);
      mutableDevice.setConfigUrl(`${platform.config.host.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`);
    }
  } else if (domain === 'input_button') {
    if (individualOrSplitEntity) {
      mutableDevice.setComposedType(`Hass Button`);
      mutableDevice.setConfigUrl(`${platform.config.host.replace('ws://', 'http://').replace('wss://', 'https://')}/config/helpers`);
    }
  } else {
    return undefined; // Unsupported helper domain
  }

  // Add to the mutable endpoint the superset onOffMountedSwitch and subset onOffOutlet device type for global compatibility with all controllers
  mutableDevice.addDeviceTypes(endpointName, onOffMountedSwitch, onOffOutlet);
  mutableDevice.addCommandHandler(endpointName, 'on', async (data) => {
    if (domain === 'automation') {
      await platform.ha.callService(domain, 'trigger', entity.entity_id);
    } else if (domain === 'input_button') {
      await platform.ha.callService(domain, 'press', entity.entity_id);
    } else {
      await platform.ha.callService(domain, 'turn_on', entity.entity_id);
    }
    // We revert the state after 500ms except for input_boolean that mantain the state
    if (domain !== 'input_boolean') {
      setTimeout(() => {
        // istanbul ignore next cause is too long
        void data.endpoint.setAttribute(OnOff, 'onOff', false, data.endpoint.log).catch(/* istanbul ignore next */ () => {});
      }, 500).unref();
    }
  });
  mutableDevice.addCommandHandler(endpointName, 'off', async () => {
    // We don't revert only for input_boolean
    // istanbul ignore else
    if (domain === 'input_boolean') await platform.ha.callService(domain, 'turn_off', entity.entity_id);
  });

  platform.log.debug(`+ helper domain "${domain}" platform "${entity.platform}" endpoint "${endpointName}" for entity ${CYAN}${entity.entity_id}${db}`);

  return endpointName;
}
