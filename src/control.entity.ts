/**
 * @description This file contains the addControlEntity function.
 * @file src\control.entity.ts
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

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable jsdoc/reject-function-type */

import { colorTemperatureLight, extendedColorLight, MatterbridgeEndpoint, PrimitiveTypes } from 'matterbridge';
import { isValidArray, isValidBoolean, isValidNumber, isValidString } from 'matterbridge/utils';
import { AnsiLogger, CYAN, db, debugStringify } from 'matterbridge/logger';
import { ActionContext } from 'matterbridge/matter';
import { ClusterId, ClusterRegistry } from 'matterbridge/matter/types';

import {
  ClimateEntityFeature,
  ColorMode,
  DEFAULT_MAX_KELVIN,
  DEFAULT_MAX_TEMP,
  DEFAULT_MIN_KELVIN,
  DEFAULT_MIN_TEMP,
  FanEntityFeature,
  HassEntity,
  HassState,
  HomeAssistant,
  HVACMode,
  LightEntityFeature,
  UnitOfTemperature,
  VacuumEntityFeature,
} from './homeAssistant.js';
import { MutableDevice } from './mutableDevice.js';
import { hassDomainConverter, hassCommandConverter, hassSubscribeConverter, kelvinToMireds, temp, roundTo, getFeatureNames } from './converters.js';

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

  // Real values will be updated by the configure with the Home Assistant states. Here we need the features and fixed attributes to be set.

  // Configure the ColorControl cluster default values and features.
  // prettier-ignore
  if (domain === 'light' && (mutableDevice.get(endpointName).deviceTypes.includes(colorTemperatureLight) || mutableDevice.get(endpointName).deviceTypes.includes(extendedColorLight))) {
    log.debug(`= colorControl device ${CYAN}${entity.entity_id}${db} supported_color_modes: ${CYAN}${state.attributes['supported_color_modes']}${db} min_color_temp_kelvin: ${CYAN}${state.attributes['min_color_temp_kelvin']}${db} max_color_temp_kelvin: ${CYAN}${state.attributes['max_color_temp_kelvin']}${db}`);
    log.debug(`# colorControl device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(LightEntityFeature, state.attributes.supported_features)}${db}`);
    const minMireds = kelvinToMireds(state.attributes['max_color_temp_kelvin'] ?? DEFAULT_MAX_KELVIN, 'floor');
    const maxMireds = kelvinToMireds(state.attributes['min_color_temp_kelvin'] ?? DEFAULT_MIN_KELVIN, 'floor');
    log.debug(`= colorControl device ${CYAN}${entity.entity_id}${db} supported_color_modes: ${CYAN}${state.attributes['supported_color_modes']}${db} min_mireds: ${CYAN}${minMireds}${db} max_mireds: ${CYAN}${maxMireds}${db}`);
    if (isValidArray(state.attributes['supported_color_modes']) && !state.attributes['supported_color_modes'].includes(ColorMode.XY) && !state.attributes['supported_color_modes'].includes(ColorMode.HS) && !state.attributes['supported_color_modes'].includes(ColorMode.RGB) &&
      !state.attributes['supported_color_modes'].includes(ColorMode.RGBW) && !state.attributes['supported_color_modes'].includes(ColorMode.RGBWW) && state.attributes['supported_color_modes'].includes(ColorMode.COLOR_TEMP)
    ) {
      mutableDevice.addClusterServerColorTemperatureColorControl(endpointName, minMireds, maxMireds);
    } else {
      mutableDevice.addClusterServerColorControl(endpointName, minMireds, maxMireds);
    }
  }

  // Configure the Thermostat cluster default values and features.
  // prettier-ignore
  if (domain === 'climate') {
    // Determine temperature unit and convert temperatures: 
    // - temperature_unit is required as implementation but not on WS REST Api (never present actually)
    // - if not present, assume Home Assistant unit_system.temperature
    // - fallback to Home Assistant unit_system.temperature
    const temperature_unit = state.attributes['temperature_unit'] || HomeAssistant.hassConfig?.unit_system?.temperature || UnitOfTemperature.CELSIUS;
    const current_temperature = isValidNumber(state.attributes['current_temperature']) ? roundTo(temp(state.attributes['current_temperature'], temperature_unit), 2) : null;
    const min_temp = isValidNumber(state.attributes['min_temp']) ? roundTo(temp(state.attributes['min_temp'], temperature_unit), 2) : DEFAULT_MIN_TEMP;
    const max_temp = isValidNumber(state.attributes['max_temp']) ? roundTo(temp(state.attributes['max_temp'], temperature_unit), 2) : DEFAULT_MAX_TEMP;
    const temperature = isValidNumber(state.attributes['temperature']) ? roundTo(temp(state.attributes['temperature'], temperature_unit), 2) : 23;
    const target_temp_low = isValidNumber(state.attributes['target_temp_low']) ? roundTo(temp(state.attributes['target_temp_low'], temperature_unit), 2) : 20;
    const target_temp_high = isValidNumber(state.attributes['target_temp_high']) ? roundTo(temp(state.attributes['target_temp_high'], temperature_unit), 2) : 26;
    log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} hvac_modes: ${CYAN}${state.attributes['hvac_modes']}${db} temperature_unit: ${CYAN}${temperature_unit}${db} current_temperature: ${CYAN}${current_temperature}${db} min_temp: ${CYAN}${min_temp}${db} max_temp: ${CYAN}${max_temp}${db}`);
    log.debug(`# thermostat device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(ClimateEntityFeature, state.attributes.supported_features)}${db}`);
    if(!isValidArray(state.attributes['hvac_modes'], 1)) {
      state.attributes['hvac_modes'] = [HVACMode.HEAT];
      log.debug(`Thermostat device ${CYAN}${entity.entity_id}${db} has no hvac_modes attribute, assuming ${CYAN}${HVACMode.HEAT}${db}.`);
    } 
    if (isValidArray(state.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes(HVACMode.HEAT_COOL)) {
      log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} auto target_temp_low: ${CYAN}${target_temp_low}${db} target_temp_high: ${CYAN}${target_temp_high}${db}`);
      mutableDevice.addClusterServerAutoModeThermostat(endpointName, current_temperature, target_temp_low, target_temp_high, min_temp, max_temp);
    } else if (isValidArray(state.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes(HVACMode.HEAT) && !state.attributes['hvac_modes'].includes(HVACMode.COOL)) {
      log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} heat temperature: ${CYAN}${temperature}${db}`);
      mutableDevice.addClusterServerHeatingThermostat(endpointName, current_temperature, temperature, min_temp, max_temp);
    } else if (isValidArray(state.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes(HVACMode.COOL) && !state.attributes['hvac_modes'].includes(HVACMode.HEAT)) {
      log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} cool temperature: ${CYAN}${temperature}${db}`);
      mutableDevice.addClusterServerCoolingThermostat(endpointName, current_temperature, temperature, min_temp, max_temp);
    } else if (isValidArray(state.attributes['hvac_modes']) && state.attributes['hvac_modes'].includes(HVACMode.COOL) && state.attributes['hvac_modes'].includes(HVACMode.HEAT)) {
      log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} heat cool temperature: ${CYAN}${temperature}${db}`);
      mutableDevice.addClusterServerHeatingCoolingThermostat(endpointName, current_temperature, temperature, temperature, min_temp, max_temp);
    } else {
      log.debug(`= thermostat device ${CYAN}${entity.entity_id}${db} state ${CYAN}${state.attributes['hvac_modes']}${db} default temperature: ${CYAN}${temperature}${db}`);
    }
  }

  // Configure the FanControl cluster default values and features.
  // prettier-ignore
  if (domain === 'fan') {
    log.debug(`= fan device ${CYAN}${entity.entity_id}${db} preset_modes: ${CYAN}${state.attributes['preset_modes']}${db} direction: ${CYAN}${state.attributes['direction']}${db} oscillating: ${CYAN}${state.attributes['oscillating']}${db}`);
    log.debug(`# fan device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(FanEntityFeature, state.attributes.supported_features)}${db}`);
    if (isValidString(state.attributes['direction']) || isValidBoolean(state.attributes['oscillating'])) {
      mutableDevice.addClusterServerCompleteFanControl(endpointName);
    }
  }

  // Configure the vacuum.
  if (domain === 'vacuum') {
    log.debug(`= vacuum device ${CYAN}${entity.entity_id}${db} activity: ${CYAN}${state.attributes['activity']}${db}`);
    log.debug(`# vacuum device ${CYAN}${entity.entity_id}${db} supported_features: ${CYAN}${getFeatureNames(VacuumEntityFeature, state.attributes.supported_features)}${db}`);
    mutableDevice.addVacuum(endpointName);
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
