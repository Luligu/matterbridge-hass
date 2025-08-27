/**
 * @description This file contains the addControlEntity function.
 * @file src\control.entity.ts
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { colorTemperatureLight, extendedColorLight, MatterbridgeEndpoint, PrimitiveTypes } from 'matterbridge';
import { isValidArray, isValidString } from 'matterbridge/utils';
import { AnsiLogger, CYAN, db, debugStringify } from 'matterbridge/logger';
import { ActionContext } from 'matterbridge/matter';
import { ClusterId, ClusterRegistry } from 'matterbridge/matter/types';

import { HassEntity, HassState } from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';
import { hassDomainConverter, hassCommandConverter, hassSubscribeConverter } from './converters.js';

/**
 * Look for supported binary_sensors of the current entity
 *
 * @param {MutableDevice} mutableDevice - The mutable device to which the binary sensor will be added
 * @param {HassEntity} entity - The Home Assistant entity to check
 * @param {HassState} state - The state of the Home Assistant entity
 * @param {Function} commandHandler - The command handler function
 * @param {Function} subscribeHandler - The subscribe handler function
 * @param {AnsiLogger} log - The logger instance to log messages
 *
 * @returns {string | undefined} - The endpoint name for the binary sensor, if found; otherwise, undefined
 */
export function addControlEntity(
  mutableDevice: MutableDevice,
  entity: HassEntity,
  state: HassState,
  commandHandler: (
    data: { request: Record<string, any>; cluster: string; attributes: Record<string, PrimitiveTypes>; endpoint: MatterbridgeEndpoint },
    endpointName: string,
    command: string,
  ) => Promise<void>,
  subscribeHandler: (
    entity: HassEntity,
    hassSubscribe: {
      domain: string;
      service: string;
      with: string;
      clusterId: ClusterId;
      attribute: string;
      converter?: any;
    },
    newValue: any,
    oldValue: any,
    context: ActionContext,
  ) => void,
  log: AnsiLogger,
): string | undefined {
  let endpointName: string | undefined = undefined;
  const [domain, _name] = entity.entity_id.split('.');

  // Add device type and clusterIds for supported domain of the current entity.
  hassDomainConverter
    .filter((d) => d.domain === domain && d.withAttribute === undefined)
    .forEach((hassDomain) => {
      if (!hassDomain.deviceType || !hassDomain.clusterId) return;
      endpointName = entity.entity_id;
      log.debug(`+ ${domain} device ${CYAN}${hassDomain.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomain.clusterId)?.name}${db}`);
      mutableDevice.addDeviceTypes(endpointName, hassDomain.deviceType);
      mutableDevice.addClusterServerIds(endpointName, hassDomain.clusterId);
      if (state.attributes && isValidString(state.attributes['friendly_name'])) mutableDevice.setFriendlyName(endpointName, state.attributes['friendly_name']);
    });

  // Skip the entity if no supported domains are found.
  if (endpointName === undefined) return;

  // Add device type and clusterIds for supported attributes of the current entity domain.
  log.debug(`- state ${debugStringify(state)}`);
  for (const [key, _value] of Object.entries(state.attributes)) {
    hassDomainConverter
      .filter((d) => d.domain === domain && d.withAttribute === key)
      .forEach((hassDomain) => {
        if (!hassDomain.deviceType || !hassDomain.clusterId) return;
        endpointName = entity.entity_id;
        log.debug(`+ attribute device ${CYAN}${hassDomain.deviceType.name}${db} cluster ${CYAN}${ClusterRegistry.get(hassDomain.clusterId)?.name}${db}`);
        mutableDevice.addDeviceTypes(endpointName, hassDomain.deviceType);
        mutableDevice.addClusterServerIds(endpointName, hassDomain.clusterId);
      });
  }

  // Skip the entity if no supported domains are found.
  if (endpointName === undefined) return;

  // Real values will be updated by the configure with the Home Assistant states. Here we need the features and fixed attributes to be set.

  // Configure the ColorControl cluster default values and features.
  // prettier-ignore
  if (domain === 'light' && (mutableDevice.get(endpointName).deviceTypes.includes(colorTemperatureLight) || mutableDevice.get(endpointName).deviceTypes.includes(extendedColorLight))) {
    log.debug(`= colorControl device ${CYAN}${entity.entity_id}${db} supported_color_modes: ${CYAN}${state.attributes['supported_color_modes']}${db} min_mireds: ${CYAN}${state.attributes['min_mireds']}${db} max_mireds: ${CYAN}${state.attributes['max_mireds']}${db}`);
    if (isValidArray(state.attributes['supported_color_modes']) && !state.attributes['supported_color_modes'].includes('xy') && !state.attributes['supported_color_modes'].includes('hs') && !state.attributes['supported_color_modes'].includes('rgb') &&
      !state.attributes['supported_color_modes'].includes('rgbw') && !state.attributes['supported_color_modes'].includes('rgbww') && state.attributes['supported_color_modes'].includes('color_temp')
    ) {
      mutableDevice.addClusterServerColorTemperatureColorControl(endpointName, state.attributes['color_temp'] ?? 250, state.attributes['min_mireds'] ?? 147, state.attributes['max_mireds'] ?? 500);
    } else {
      mutableDevice.addClusterServerColorControl(endpointName, state.attributes['color_temp'] ?? 250, state.attributes['min_mireds'] ?? 147, state.attributes['max_mireds'] ?? 500);
    }
  }

  // Configure the Thermostat cluster default values and features.
  // prettier-ignore
  if (domain === 'climate') {
    if (isValidArray(state?.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes('heat_cool')) {
      log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db}`);
      mutableDevice.addClusterServerAutoModeThermostat(endpointName, state.attributes['current_temperature'] ?? 23, state.attributes['target_temp_low'] ?? 21, state.attributes['target_temp_high'] ?? 25, state.attributes['min_temp'] ?? 0, state.attributes['max_temp'] ?? 50);
    } else if (isValidArray(state?.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes('heat') && !state.attributes['hvac_modes'].includes('cool')) {
      log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db}`);
      mutableDevice.addClusterServerHeatingThermostat(endpointName, state.attributes['current_temperature'] ?? 23, state.attributes['temperature'] ?? 21, state.attributes['min_temp'] ?? 0, state.attributes['max_temp'] ?? 50);
    } else if (isValidArray(state?.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes('cool') && !state.attributes['hvac_modes'].includes('heat')) {
      log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db}`);
      mutableDevice.addClusterServerCoolingThermostat(endpointName, state.attributes['current_temperature'] ?? 23, state.attributes['temperature'] ?? 21, state.attributes['min_temp'] ?? 0, state.attributes['max_temp'] ?? 50);
    }
  }

  // Configure the FanControl cluster default values and features.
  // prettier-ignore
  if (domain === 'fan') {
    log.debug(`= fanControl device ${CYAN}${entity.entity_id}${db} preset_modes: ${CYAN}${state.attributes['preset_modes']}${db} direction: ${CYAN}${state.attributes['direction']}${db} oscillating: ${CYAN}${state.attributes['oscillating']}${db}`);
    if (state.attributes['direction'] || state.attributes['oscillating']) {
      mutableDevice.addClusterServerCompleteFanControl(endpointName);
    }
  }

  // Add command handlers
  for (const hassCommand of hassCommandConverter.filter((c) => c.domain === domain)) {
    log.debug(`- command: ${CYAN}${hassCommand.command}${db}`);
    mutableDevice.addCommandHandler(entity.entity_id, hassCommand.command, async (data, endpointName, command) => {
      commandHandler(data, endpointName, command);
    });
  }

  // Add subscribe handlers
  for (const hassSubscribe of hassSubscribeConverter.filter((s) => s.domain === domain)) {
    log.debug(`- subscribe: ${CYAN}${ClusterRegistry.get(hassSubscribe.clusterId)?.name}${db}:${CYAN}${hassSubscribe.attribute}${db}`);
    mutableDevice.addSubscribeHandler(
      entity.entity_id,
      hassSubscribe.clusterId,
      hassSubscribe.attribute,
      (newValue: any, oldValue: any, context: ActionContext, _endpointName: string, _clusterId: ClusterId, _attribute: string) => {
        subscribeHandler(entity, hassSubscribe, newValue, oldValue, context);
      },
    );
  }

  return endpointName;
}
