/**
 * @description This file contains the HomeAssistantPlatform converters.
 * @file src\converters.ts
 * @author Luca Liguori
 * @created 2024-09-13
 * @version 1.1.0
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
 * limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  airQualitySensor,
  colorTemperatureLight,
  contactSensor,
  coverDevice,
  DeviceTypeDefinition,
  dimmableLight,
  doorLockDevice,
  electricalSensor,
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
  ElectricalPowerMeasurement,
  ElectricalEnergyMeasurement,
  AirQuality,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
  Pm1ConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  CarbonDioxideConcentrationMeasurement,
  CarbonMonoxideConcentrationMeasurement,
  NitrogenDioxideConcentrationMeasurement,
  OzoneConcentrationMeasurement,
  FormaldehydeConcentrationMeasurement,
  RadonConcentrationMeasurement,
} from 'matterbridge/matter/clusters';

import { HassState, HomeAssistant } from './homeAssistant.js';

/**
 * Convert Fahrenheit to Celsius
 *
 * @param {number} value - Temperature
 * @param {string} [unit] - Optional unit of measurement, if provided it should be '°C' or '°F'
 * @returns {number} Temperature in Celsius
 */
export function temp(value: number, unit?: string): number {
  if (unit === '°F') return ((value - 32) * 5) / 9;
  return value; // If no unit is provided or it is not '°F', return the value as is
}

/**
 * Convert pressure value to hPa (hectopascal)
 * If the unit is 'hPa', it returns the value as is.
 *
 * @param {number} value - Pressure value to convert
 * @param {string} unit - Unit of measurement
 * @returns {number | null} Pressure in hPa, or null if the unit is not recognized
 */
export function pressure(value: number, unit?: string): number | null {
  if (unit === 'hPa') {
    return value;
  }
  if (unit === 'kPa') {
    return value * 10;
  }
  if (unit === 'inHg') {
    return Math.round(value * 33.8639);
  }
  return null;
}

/**
 * Convert AQI value to corresponding AirQuality enum
 * If the value is a string, it will be converted to lowercase and matched against known AQI levels.
 * If the value is a number, it will be checked against AQI ranges.
 *
 * @param {number | string} value - AQI value or string representation of AQI level
 * @param {string} unit - Unit of measurement, expected to be 'AQI'
 * @returns {number | null} Corresponding AirQuality enum value or null if invalid
 */
export function aqi(value: number | string, unit?: string): number | null {
  if (typeof value === 'string') {
    value = value.toLowerCase();
    if (value === 'healthy') return AirQuality.AirQualityEnum.Good;
    if (value === 'fine') return AirQuality.AirQualityEnum.Good;
    if (value === 'good') return AirQuality.AirQualityEnum.Good;
    if (value === 'fair') return AirQuality.AirQualityEnum.Fair;
    if (value === 'moderate') return AirQuality.AirQualityEnum.Moderate;
    if (value === 'poor') return AirQuality.AirQualityEnum.Poor;
    if (value === 'unhealthy_for_sensitive_groups') return AirQuality.AirQualityEnum.Poor;
    if (value === 'very_poor') return AirQuality.AirQualityEnum.VeryPoor;
    if (value === 'unhealthy') return AirQuality.AirQualityEnum.VeryPoor;
    if (value === 'extremely_poor') return AirQuality.AirQualityEnum.ExtremelyPoor;
    if (value === 'very_unhealthy') return AirQuality.AirQualityEnum.ExtremelyPoor;
    if (value === 'hazardous') return AirQuality.AirQualityEnum.ExtremelyPoor;
    return null;
  }
  if (isValidNumber(value, 0, 500) && unit === 'AQI') {
    return Math.round(((value as number) / 500) * 5 + 1);
  }
  return null;
}

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

    { domain: 'climate', with: 'temperature',         clusterId: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'heat' ? temp(value, HomeAssistant.hassConfig?.unit_system.temperature) * 100 : null) },
    { domain: 'climate', with: 'temperature',         clusterId: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'cool' ? temp(value, HomeAssistant.hassConfig?.unit_system.temperature) * 100 : null) },
    { domain: 'climate', with: 'target_temp_high',    clusterId: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'heat_cool' ? temp(value, HomeAssistant.hassConfig?.unit_system.temperature) * 100 : null) },
    { domain: 'climate', with: 'target_temp_low',     clusterId: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && state.state === 'heat_cool' ? temp(value, HomeAssistant.hassConfig?.unit_system.temperature) * 100 : null) },
    { domain: 'climate', with: 'current_temperature', clusterId: Thermostat.Cluster.id, attribute: 'localTemperature', converter: (value: number) => (isValidNumber(value) ? temp(value, HomeAssistant.hassConfig?.unit_system.temperature) * 100 : null) },
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
export const hassDomainSensorsConverter: { domain: string; withStateClass: string; withDeviceClass: string; endpoint?: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId; attribute: string; converter: (value: number | string, unit?: string) => any }[] = [
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'battery',               endpoint: '',             deviceType: powerSource,        clusterId: PowerSource.Cluster.id,                  attribute: 'batPercentRemaining', converter: (value) => (isValidNumber(value, 0, 100) ? Math.round((value) * 2) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'voltage',               endpoint: '',             deviceType: powerSource,        clusterId: PowerSource.Cluster.id,                  attribute: 'batVoltage',      converter: (value, unit) => (isValidNumber(value, 0, 100000) && unit === 'mV'? Math.round(value) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'temperature',                                     deviceType: temperatureSensor,  clusterId: TemperatureMeasurement.Cluster.id,       attribute: 'measuredValue',   converter: (value, unit) => (isValidNumber(value, unit==='°F'?-148:-100, unit==='°F'?212:100) ? Math.round(temp(value, unit) * 100) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'humidity',                                        deviceType: humiditySensor,     clusterId: RelativeHumidityMeasurement.Cluster.id,  attribute: 'measuredValue',   converter: (value) => (isValidNumber(value, 0, 100) ? Math.round((value) * 100) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'pressure',                                        deviceType: pressureSensor,     clusterId: PressureMeasurement.Cluster.id,          attribute: 'measuredValue',   converter: (value, unit) => (isValidNumber(value, 1) ? pressure(value, unit) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'atmospheric_pressure',                            deviceType: pressureSensor,     clusterId: PressureMeasurement.Cluster.id,          attribute: 'measuredValue',   converter: (value, unit) => (isValidNumber(value, 1) ? pressure(value, unit) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'illuminance',                                     deviceType: lightSensor,        clusterId: IlluminanceMeasurement.Cluster.id,       attribute: 'measuredValue',   converter: (value) => (isValidNumber(value) ? Math.round(Math.max(Math.min(10000 * Math.log10(value), 0xfffe), 0)) : null) },
    { domain: 'sensor',     withStateClass: 'total_increasing', withDeviceClass: 'energy',            endpoint: 'PowerEnergy',  deviceType: electricalSensor,   clusterId: ElectricalEnergyMeasurement.Cluster.id,  attribute: 'cumulativeEnergyImported', converter: (value, unit) => (isValidNumber(value) && unit === 'kWh' ? { energy: value *1000000 }: null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'power',                 endpoint: 'PowerEnergy',  deviceType: electricalSensor,   clusterId: ElectricalPowerMeasurement.Cluster.id,   attribute: 'activePower',     converter: (value, unit) => (isValidNumber(value) && unit === 'W' ? (value) * 1000: null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'current',               endpoint: 'PowerEnergy',  deviceType: electricalSensor,   clusterId: ElectricalPowerMeasurement.Cluster.id,   attribute: 'activeCurrent',   converter: (value, unit) => (isValidNumber(value) && unit === 'A' ? (value) * 1000: null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'voltage',               endpoint: 'PowerEnergy',  deviceType: electricalSensor,   clusterId: ElectricalPowerMeasurement.Cluster.id,   attribute: 'voltage',         converter: (value, unit) => (isValidNumber(value) && unit === 'V' ? (value) * 1000: null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'aqi',                   endpoint: 'AirQuality',   deviceType: airQualitySensor,   clusterId: AirQuality.Cluster.id,                   attribute: 'airQuality',      converter: (value, unit) => aqi(value, unit) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'volatile_organic_compounds', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'volatile_organic_compounds_parts', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'carbon_dioxide', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: CarbonDioxideConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'carbon_monoxide', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: CarbonMonoxideConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'nitrogen_dioxide', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: NitrogenDioxideConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'ozone', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: OzoneConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'formaldehyde', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: FormaldehydeConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'radon', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: RadonConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'pm1', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: Pm1ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'pm25', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: Pm25ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'pm2_5', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: Pm25ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'pm2.5', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: Pm25ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'pm10', endpoint: 'AirQuality', deviceType: airQualitySensor, clusterId: Pm10ConcentrationMeasurement.Cluster.id, attribute: 'measuredValue', converter: (value, _unit) => (isValidNumber(value, 0) ? value : null) },
  ];

/** Convert Home Assistant binary_sensor domains attributes to Matterbridge device types and clusterIds */
// prettier-ignore
export const hassDomainBinarySensorsConverter: { domain: string; withDeviceClass: string; endpoint?: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId; attribute: string; converter: (value: string) => any }[] = [
    { domain: 'binary_sensor',    withDeviceClass: 'battery',         endpoint: '',             deviceType: powerSource,          clusterId: PowerSource.Cluster.id,        attribute: 'batChargeLevel',  converter: (value: string) => (value === 'off' ? 0 : 2) },
    { domain: 'binary_sensor',    withDeviceClass: 'window',                                    deviceType: contactSensor,        clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? false : true) },
    { domain: 'binary_sensor',    withDeviceClass: 'door',                                      deviceType: contactSensor,        clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? false : true) },
    { domain: 'binary_sensor',    withDeviceClass: 'garage_door',                               deviceType: contactSensor,        clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? false : true) },
    { domain: 'binary_sensor',    withDeviceClass: 'vibration',                                 deviceType: contactSensor,        clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? false : true) },
    { domain: 'binary_sensor',    withDeviceClass: 'cold',                                      deviceType: waterFreezeDetector,  clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? true : false) },
    { domain: 'binary_sensor',    withDeviceClass: 'moisture',                                  deviceType: waterLeakDetector,    clusterId: BooleanState.Cluster.id,       attribute: 'stateValue',      converter: (value) => (value === 'on' ? true : false) },
    { domain: 'binary_sensor',    withDeviceClass: 'occupancy',                                 deviceType: occupancySensor,      clusterId: OccupancySensing.Cluster.id,   attribute: 'occupancy',       converter: (value) => ({occupied: value === 'on' ? true : false}) },
    { domain: 'binary_sensor',    withDeviceClass: 'motion',                                    deviceType: occupancySensor,      clusterId: OccupancySensing.Cluster.id,   attribute: 'occupancy',       converter: (value) => ({occupied: value === 'on' ? true : false}) },
    { domain: 'binary_sensor',    withDeviceClass: 'presence',                                  deviceType: occupancySensor,      clusterId: OccupancySensing.Cluster.id,   attribute: 'occupancy',       converter: (value) => ({occupied: value === 'on' ? true : false}) },
    { domain: 'binary_sensor',    withDeviceClass: 'smoke',                                     deviceType: smokeCoAlarm,         clusterId: SmokeCoAlarm.Cluster.id,       attribute: 'smokeState',      converter: (value) => (value === 'on' ?  SmokeCoAlarm.AlarmState.Critical :  SmokeCoAlarm.AlarmState.Normal) },
    { domain: 'binary_sensor',    withDeviceClass: 'carbon_monoxide',                           deviceType: smokeCoAlarm,         clusterId: SmokeCoAlarm.Cluster.id,       attribute: 'coState',         converter: (value) => (value === 'on' ?  SmokeCoAlarm.AlarmState.Critical :  SmokeCoAlarm.AlarmState.Normal) },
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
      if( isValidNumber(value, FanControl.FanMode.Low, FanControl.FanMode.Smart) ) {
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
