/**
 * @description This file contains the HomeAssistantPlatform converters.
 * @file src\converters.ts
 * @author Luca Liguori
 * @created 2024-09-13
 * @version 1.0.0
 * @license Apache-2.0
 * @copyright 2024, 2025, 2026 Luca Liguori.
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
 * limitations under the License. *
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  colorTemperatureLight,
  contactSensor,
  coverDevice,
  DeviceTypeDefinition,
  dimmableLight,
  doorLockDevice,
  extendedColorLight,
  fanDevice,
  humiditySensor,
  lightSensor,
  MatterbridgeEndpointCommands,
  occupancySensor,
  onOffLight,
  onOffOutlet,
  powerSource,
  pressureSensor,
  smokeCoAlarm,
  temperatureSensor,
  thermostatDevice,
  waterFreezeDetector,
  waterLeakDetector,
} from 'matterbridge';
import { isValidArray, isValidNumber, isValidString } from 'matterbridge/utils';
import { ClusterId } from 'matterbridge/matter/types';
import {
  WindowCovering,
  Thermostat,
  PressureMeasurement,
  RelativeHumidityMeasurement,
  TemperatureMeasurement,
  OnOff,
  FanControl,
  IlluminanceMeasurement,
  LevelControl,
  DoorLock,
  ColorControl,
  BooleanState,
  OccupancySensing,
  SmokeCoAlarm,
  PowerSource,
} from 'matterbridge/matter/clusters';

import { HassState } from './homeAssistant.js';

/** Update Home Assistant state to Matterbridge device states */
// prettier-ignore
export const hassUpdateStateConverter: { domain: string; state: string; clusterId: ClusterId; attribute: string; value: any }[] = [
    { domain: 'switch', state: 'on', clusterId: OnOff.Cluster.id, attribute: 'onOff', value: true },
    { domain: 'switch', state: 'off', clusterId: OnOff.Cluster.id, attribute: 'onOff', value: false },
    
    { domain: 'light', state: 'on', clusterId: OnOff.Cluster.id, attribute: 'onOff', value: true },
    { domain: 'light', state: 'off', clusterId: OnOff.Cluster.id, attribute: 'onOff', value: false },
    
    { domain: 'lock', state: 'locked', clusterId: DoorLock.Cluster.id, attribute: 'lockState', value: DoorLock.LockState.Locked },
    { domain: 'lock', state: 'locking', clusterId: DoorLock.Cluster.id, attribute: 'lockState', value: DoorLock.LockState.NotFullyLocked },
    { domain: 'lock', state: 'unlocking', clusterId: DoorLock.Cluster.id, attribute: 'lockState', value: DoorLock.LockState.NotFullyLocked },
    { domain: 'lock', state: 'unlocked', clusterId: DoorLock.Cluster.id, attribute: 'lockState', value: DoorLock.LockState.Unlocked },
    
    { domain: 'fan', state: 'on', clusterId: FanControl.Cluster.id, attribute: 'fanMode', value: FanControl.FanMode.Auto },
    { domain: 'fan', state: 'off', clusterId: FanControl.Cluster.id, attribute: 'fanMode', value: FanControl.FanMode.Off },
  
    { domain: 'cover', state: 'opening', clusterId: WindowCovering.Cluster.id, attribute: 'operationalStatus', value: { global: WindowCovering.MovementStatus.Opening, lift: WindowCovering.MovementStatus.Opening, tilt: 0 } },
    { domain: 'cover', state: 'open', clusterId: WindowCovering.Cluster.id, attribute: 'operationalStatus', value: { global: WindowCovering.MovementStatus.Stopped, lift: WindowCovering.MovementStatus.Stopped, tilt: 0 } },
    { domain: 'cover', state: 'closed', clusterId: WindowCovering.Cluster.id, attribute: 'operationalStatus', value: { global: WindowCovering.MovementStatus.Stopped, lift: WindowCovering.MovementStatus.Stopped, tilt: 0 } },
    { domain: 'cover', state: 'closing', clusterId: WindowCovering.Cluster.id, attribute: 'operationalStatus', value: { global: WindowCovering.MovementStatus.Closing, lift: WindowCovering.MovementStatus.Closing, tilt: 0 } },
  
    { domain: 'climate', state: 'off', clusterId: Thermostat.Cluster.id, attribute: 'systemMode', value: Thermostat.SystemMode.Off },
    { domain: 'climate', state: 'heat', clusterId: Thermostat.Cluster.id, attribute: 'systemMode', value: Thermostat.SystemMode.Heat },
    { domain: 'climate', state: 'cool', clusterId: Thermostat.Cluster.id, attribute: 'systemMode', value: Thermostat.SystemMode.Cool },
    { domain: 'climate', state: 'heat_cool', clusterId: Thermostat.Cluster.id, attribute: 'systemMode', value: Thermostat.SystemMode.Auto },

    { domain: 'input_boolean', state: 'on', clusterId: OnOff.Cluster.id, attribute: 'onOff', value: true },
    { domain: 'input_boolean', state: 'off', clusterId: OnOff.Cluster.id, attribute: 'onOff', value: false },

    { domain: 'binary_sensor', state: 'on', clusterId: BooleanState.Cluster.id, attribute: 'stateValue', value: true },
    { domain: 'binary_sensor', state: 'off', clusterId: BooleanState.Cluster.id, attribute: 'stateValue', value: false },
  ];

/** Update Home Assistant attributes to Matterbridge device attributes */
// prettier-ignore
export const hassUpdateAttributeConverter: { domain: string; with: string; clusterId: ClusterId; attribute: string; converter: (value: any, state: HassState) => any }[] = [
    { domain: 'light', with: 'brightness', clusterId: LevelControl.Cluster.id, attribute: 'currentLevel', converter: (value: number) => (isValidNumber(value, 1, 255) ? Math.round(value / 255 * 254) : null) },
    { domain: 'light', with: 'color_mode', clusterId: ColorControl.Cluster.id, attribute: 'colorMode', converter: (value: string) => {
        if( isValidString(value, 2, 10) ) {
          if (value === 'hs' || value === 'rgb') return ColorControl.ColorMode.CurrentHueAndCurrentSaturation;
          else if (value === 'xy') return ColorControl.ColorMode.CurrentXAndCurrentY;
          else if (value === 'color_temp') return ColorControl.ColorMode.ColorTemperatureMireds;
          else return null;
        } else {
          return null;
        }
      } 
    },
    { domain: 'light', with: 'color_temp', clusterId: ColorControl.Cluster.id, attribute: 'colorTemperatureMireds', converter: (value: number, state: HassState) => ( isValidNumber(value, 0, 65279) && state.attributes['color_mode'] === 'color_temp' ? value : null ) },
    { domain: 'light', with: 'hs_color', clusterId: ColorControl.Cluster.id, attribute: 'currentHue', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[0], 0, 360) && (state.attributes['color_mode'] === 'hs' || state.attributes['color_mode'] === 'rgb') ? Math.round(value[0] / 360 * 254) : null ) },
    { domain: 'light', with: 'hs_color', clusterId: ColorControl.Cluster.id, attribute: 'currentSaturation', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[1], 0, 100) && (state.attributes['color_mode'] === 'hs' || state.attributes['color_mode'] === 'rgb') ? Math.round(value[1] / 100 * 254) : null ) },
    { domain: 'light', with: 'xy_color', clusterId: ColorControl.Cluster.id, attribute: 'currentX', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[0], 0, 1) && state.attributes['color_mode'] === 'xy' ? value[0] : null ) },
    { domain: 'light', with: 'xy_color', clusterId: ColorControl.Cluster.id, attribute: 'currentY', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[1], 0, 1) && state.attributes['color_mode'] === 'xy' ? value[1] : null ) },
  
    { domain: 'fan', with: 'percentage', clusterId: FanControl.Cluster.id, attribute: 'percentCurrent', converter: (value: number) => (isValidNumber(value, 1, 100) ? Math.round(value) : null) },
    { domain: 'fan', with: 'preset_mode', clusterId: FanControl.Cluster.id, attribute: 'fanMode', converter: (value: string) => {
      if( isValidString(value, 3, 6) ) {
        if (value === 'low') return FanControl.FanMode.Low;
        else if (value === 'medium') return FanControl.FanMode.Medium;
        else if (value === 'high') return FanControl.FanMode.High;
        else if (value === 'auto') return FanControl.FanMode.Auto;
        else return null;
      } else {
        return null;
      }
    } },
    // Matter WindowCovering: 0 = open 10000 = closed
    { domain: 'cover', with: 'current_position', clusterId: WindowCovering.Cluster.id, attribute: 'currentPositionLiftPercent100ths', converter: (value: number) => (isValidNumber(value, 0, 100) ? Math.round(10000 - value * 100) : null) },
    { domain: 'cover', with: 'current_position', clusterId: WindowCovering.Cluster.id, attribute: 'targetPositionLiftPercent100ths', converter: (value: number) => (isValidNumber(value, 0, 100) ? Math.round(10000 - value * 100) : null) },
  
    { domain: 'climate', with: 'temperature',         clusterId: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'heat' ? value * 100 : null) },
    { domain: 'climate', with: 'temperature',         clusterId: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'cool' ? value * 100 : null) },
    { domain: 'climate', with: 'target_temp_high',    clusterId: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'heat_cool' ? value * 100 : null) },
    { domain: 'climate', with: 'target_temp_low',     clusterId: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'heat_cool' ? value * 100 : null) },
    { domain: 'climate', with: 'current_temperature', clusterId: Thermostat.Cluster.id, attribute: 'localTemperature', converter: (value: number) => (isValidNumber(value) ? value * 100 : null) },
  ];

/**
 * Convert Home Assistant domains to Matterbridge device types and clusterIds.
 * If the device type is null, no device type will be added. It will use hassDomainSensorsConverter to determine the device type and clusterId.
 */
// prettier-ignore
export const hassDomainConverter: { domain: string; deviceType: DeviceTypeDefinition | null; clusterId: ClusterId | null }[] = [
    { domain: 'switch',         deviceType: onOffOutlet,      clusterId: OnOff.Cluster.id },
    { domain: 'light',          deviceType: onOffLight,       clusterId: OnOff.Cluster.id },
    { domain: 'lock',           deviceType: doorLockDevice,   clusterId: DoorLock.Cluster.id },
    { domain: 'fan',            deviceType: fanDevice,        clusterId: FanControl.Cluster.id },
    { domain: 'cover',          deviceType: coverDevice,      clusterId: WindowCovering.Cluster.id },
    { domain: 'climate',        deviceType: thermostatDevice, clusterId: Thermostat.Cluster.id },
    { domain: 'sensor',         deviceType: null,             clusterId: null },
    { domain: 'binary_sensor',  deviceType: null,             clusterId: null },
  ];

/** Convert Home Assistant domains attributes to Matterbridge device types and clusterIds */
// prettier-ignore
export const hassDomainAttributeConverter: { domain: string; withAttribute: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId }[] = [
    { domain: 'light',    withAttribute: 'brightness',  deviceType: dimmableLight,          clusterId: LevelControl.Cluster.id },
    { domain: 'light',    withAttribute: 'color_temp',  deviceType: colorTemperatureLight,  clusterId: ColorControl.Cluster.id },
    { domain: 'light',    withAttribute: 'hs_color',    deviceType: extendedColorLight,     clusterId: ColorControl.Cluster.id },
    { domain: 'light',    withAttribute: 'xy_color',    deviceType: extendedColorLight,     clusterId: ColorControl.Cluster.id },
  ];

/** Convert Home Assistant sensor domains attributes to Matterbridge device types and clusterIds */
// prettier-ignore
export const hassDomainSensorsConverter: { domain: string; withStateClass: string; withDeviceClass: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId; attribute: string; converter: (value: number) => any }[] = [
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'battery',               deviceType: powerSource,        clusterId: PowerSource.Cluster.id,                  attribute: 'batPercentRemaining', converter: (value) => (isValidNumber(value, 0, 100) ? Math.round(value * 2) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'temperature',           deviceType: temperatureSensor,  clusterId: TemperatureMeasurement.Cluster.id,       attribute: 'measuredValue',   converter: (value) => (isValidNumber(value, -100, 100) ? Math.round(value * 100) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'humidity',              deviceType: humiditySensor,     clusterId: RelativeHumidityMeasurement.Cluster.id,  attribute: 'measuredValue',   converter: (value) => (isValidNumber(value, 0, 100) ? Math.round(value * 100) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'pressure',              deviceType: pressureSensor,     clusterId: PressureMeasurement.Cluster.id,          attribute: 'measuredValue',   converter: (value) => (isValidNumber(value) ? Math.round(value) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'atmospheric_pressure',  deviceType: pressureSensor,     clusterId: PressureMeasurement.Cluster.id,          attribute: 'measuredValue',   converter: (value) => (isValidNumber(value) ? Math.round(value) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'illuminance',           deviceType: lightSensor,        clusterId: IlluminanceMeasurement.Cluster.id,       attribute: 'measuredValue',   converter: (value) => (isValidNumber(value) ? Math.round(Math.max(Math.min(10000 * Math.log10(value), 0xfffe), 0)) : null) },
  ];

/** Convert Home Assistant binary_sensor domains attributes to Matterbridge device types and clusterIds */
// prettier-ignore
export const hassDomainBinarySensorsConverter: { domain: string; withDeviceClass: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId; attribute: string; converter: (value: string) => any }[] = [
    { domain: 'binary_sensor',    withDeviceClass: 'battery',         deviceType: powerSource,          clusterId: PowerSource.Cluster.id,        attribute: 'batChargeLevel',  converter: (value: string) => (value === 'off' ? 0 : 2) },
    { domain: 'binary_sensor',    withDeviceClass: 'window',          deviceType: contactSensor,        clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? false : true) },
    { domain: 'binary_sensor',    withDeviceClass: 'door',            deviceType: contactSensor,        clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? false : true) },
    { domain: 'binary_sensor',    withDeviceClass: 'garage_door',     deviceType: contactSensor,        clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? false : true) },
    { domain: 'binary_sensor',    withDeviceClass: 'vibration',       deviceType: contactSensor,        clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? false : true) },
    { domain: 'binary_sensor',    withDeviceClass: 'cold',            deviceType: waterFreezeDetector,  clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? true : false) },
    { domain: 'binary_sensor',    withDeviceClass: 'moisture',        deviceType: waterLeakDetector,    clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? true : false) },
    { domain: 'binary_sensor',    withDeviceClass: 'occupancy',       deviceType: occupancySensor,      clusterId: OccupancySensing.Cluster.id,   attribute: 'occupancy',       converter: (value) => ({occupied: value === 'on' ? true : false}) },
    { domain: 'binary_sensor',    withDeviceClass: 'motion',          deviceType: occupancySensor,      clusterId: OccupancySensing.Cluster.id,   attribute: 'occupancy',       converter: (value) => ({occupied: value === 'on' ? true : false}) },
    { domain: 'binary_sensor',    withDeviceClass: 'presence',        deviceType: occupancySensor,      clusterId: OccupancySensing.Cluster.id,   attribute: 'occupancy',       converter: (value) => ({occupied: value === 'on' ? true : false}) },
    { domain: 'binary_sensor',    withDeviceClass: 'smoke',           deviceType: smokeCoAlarm,         clusterId: SmokeCoAlarm.Cluster.id,       attribute: 'smokeState',      converter: (value) => (value === 'on' ?  SmokeCoAlarm.AlarmState.Critical :  SmokeCoAlarm.AlarmState.Normal) },
    { domain: 'binary_sensor',    withDeviceClass: 'carbon_monoxide', deviceType: smokeCoAlarm,         clusterId: SmokeCoAlarm.Cluster.id,       attribute: 'coState',         converter: (value) => (value === 'on' ?  SmokeCoAlarm.AlarmState.Critical :  SmokeCoAlarm.AlarmState.Normal) },
  ];

/** Convert Home Assistant domains services to Matterbridge commands for device types */
// prettier-ignore
export const hassCommandConverter: { command: keyof MatterbridgeEndpointCommands; domain: string; service: string; converter?: (request: Record<string, any>, attributes: Record<string, any>) => any }[] = [
    { command: 'on',                      domain: 'switch', service: 'turn_on' },
    { command: 'off',                     domain: 'switch', service: 'turn_off' },
    { command: 'toggle',                  domain: 'switch', service: 'toggle' },
  
    { command: 'on',                      domain: 'light', service: 'turn_on' },
    { command: 'off',                     domain: 'light', service: 'turn_off' },
    { command: 'toggle',                  domain: 'light', service: 'toggle' },
    { command: 'moveToLevel',             domain: 'light', service: 'turn_on', converter: (request) => { return { brightness: Math.round(request.level / 254 * 255) } } },
    { command: 'moveToLevelWithOnOff',    domain: 'light', service: 'turn_on', converter: (request) => { return { brightness: Math.round(request.level / 254 * 255) } } },
    { command: 'moveToColorTemperature',  domain: 'light', service: 'turn_on', converter: (request) => { return { color_temp: request.colorTemperatureMireds } } },
    { command: 'moveToColor',             domain: 'light', service: 'turn_on', converter: (request) => { return { xy_color: [request.colorX, request.colorY] } } },
    { command: 'moveToHue',               domain: 'light', service: 'turn_on', converter: (request, attributes) => { return { hs_color: [Math.round(request.hue / 254 * 360), Math.round(attributes.currentSaturation.value / 254 * 100)] } } },
    { command: 'moveToSaturation',        domain: 'light', service: 'turn_on', converter: (request, attributes) => { return { hs_color: [Math.round(attributes.currentHue.value / 254 * 360), Math.round(request.saturation / 254 * 100)] } } },
    { command: 'moveToHueAndSaturation',  domain: 'light', service: 'turn_on', converter: (request) => { return { hs_color: [Math.round(request.hue / 254 * 360), Math.round(request.saturation / 254 * 100)] } } },
    
    { command: 'lockDoor',                domain: 'lock', service: 'lock' },
    { command: 'unlockDoor',              domain: 'lock', service: 'unlock' },
  
    { command: 'upOrOpen',                domain: 'cover', service: 'open_cover' },
    { command: 'downOrClose',             domain: 'cover', service: 'close_cover' },
    { command: 'stopMotion',              domain: 'cover', service: 'stop_cover' },
    { command: 'goToLiftPercentage',      domain: 'cover', service: 'set_cover_position', converter: (request) => { return { position: Math.round(100 - request.liftPercent100thsValue / 100) } } },
  ];

/**
 * Convert Home Assistant domains services and attributes to Matterbridge subscribed cluster / attributes.
 * Returning null will send turn_off service to Home Assistant instead of turn_on with attributes.
 */
// prettier-ignore
export const hassSubscribeConverter: { domain: string; service: string; with: string; clusterId: ClusterId; attribute: string; converter?: (value: number) => any }[] = [
    { domain: 'fan',      service: 'turn_on',         with: 'preset_mode',  clusterId: FanControl.Cluster.id,  attribute: 'fanMode', converter: (value: FanControl.FanMode) => {
      if( isValidNumber(value, FanControl.FanMode.Off, FanControl.FanMode.Smart) ) {
        if (value === FanControl.FanMode.Low) return 'low';
        else if (value === FanControl.FanMode.Medium) return 'medium';
        else if (value === FanControl.FanMode.High) return 'high';
        else if (value === FanControl.FanMode.Auto || value === FanControl.FanMode.Smart || value === FanControl.FanMode.On) return 'auto';
      } else {
        return null;
      }
    }},
    { domain: 'fan',      service: 'turn_on',         with: 'percentage',   clusterId: FanControl.Cluster.id,  attribute: 'percentSetting' },
    // { domain: 'fan',      service: 'turn_on',         with: 'percentage',   clusterId: FanControl.Cluster.id,  attribute: 'speedSetting' },
  
    { domain: 'climate',  service: 'set_hvac_mode',   with: 'hvac_mode',    clusterId: Thermostat.Cluster.id,  attribute: 'systemMode', converter: (value) => {
      if( isValidNumber(value, Thermostat.SystemMode.Off, Thermostat.SystemMode.Heat) ) {
        if (value === Thermostat.SystemMode.Auto) return 'auto';
        else if (value === Thermostat.SystemMode.Cool) return 'cool';
        else if (value === Thermostat.SystemMode.Heat) return 'heat';
        else return null;
      } else {
        return null;
      }
    }},
    { domain: 'climate',  service: 'set_temperature', with: 'temperature',  clusterId: Thermostat.Cluster.id,  attribute: 'occupiedHeatingSetpoint', converter: (value) => { return value / 100 } },
    { domain: 'climate',  service: 'set_temperature', with: 'temperature',  clusterId: Thermostat.Cluster.id,  attribute: 'occupiedCoolingSetpoint', converter: (value) => { return value / 100 } },
  ]
