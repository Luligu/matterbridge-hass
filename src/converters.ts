/**
 * @description This file contains the HomeAssistantPlatform converters.
 * @file src\converters.ts
 * @author Luca Liguori
 * @created 2024-09-13
 * @version 1.2.0
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
  roboticVacuumCleaner,
  smokeCoAlarm,
  temperatureSensor,
  thermostatDevice,
  waterFreezeDetector,
  waterLeakDetector,
  waterValve,
} from 'matterbridge';
import {
  AirQuality,
  BooleanState,
  CarbonDioxideConcentrationMeasurement,
  CarbonMonoxideConcentrationMeasurement,
  ColorControl,
  DoorLock,
  ElectricalEnergyMeasurement,
  ElectricalPowerMeasurement,
  FanControl,
  FormaldehydeConcentrationMeasurement,
  IlluminanceMeasurement,
  LevelControl,
  NitrogenDioxideConcentrationMeasurement,
  OccupancySensing,
  OnOff,
  OzoneConcentrationMeasurement,
  Pm1ConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  PowerSource,
  PressureMeasurement,
  RadonConcentrationMeasurement,
  RelativeHumidityMeasurement,
  RvcCleanMode,
  RvcOperationalState,
  RvcRunMode,
  SmokeCoAlarm,
  TemperatureMeasurement,
  Thermostat,
  TotalVolatileOrganicCompoundsConcentrationMeasurement,
  ValveConfigurationAndControl,
  WindowCovering,
} from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { isValidArray, isValidBoolean, isValidNumber, isValidString } from 'matterbridge/utils';

import { ColorMode, HassState, HomeAssistant, HVACMode, UnitOfTemperature } from './homeAssistant.js';

/**
 * Returns the names of enabled bit-flag features for any numeric enum.
 *
 * @template T
 * @param {T} featureEnum - The enum containing bit-flag values.
 * @param {number | undefined} supported_features - The bitmask to decode.
 * @returns {string[]} Array of feature names enabled in the mask.
 *
 * @example
 * const names = getFeatureNames(FanEntityFeature, 63);
 * // names = ['SET_SPEED', 'DIRECTION', 'OSCILLATE', 'PRESET_MODE', 'TIMER', 'NATURAL_WIND']
 */
export function getFeatureNames<T extends Record<string, number | string>>(featureEnum: T, supported_features: number | undefined): string[] {
  if (supported_features === undefined) return [];
  return Object.entries(featureEnum)
    .filter(([_, value]) => typeof value === 'number' && (supported_features & (value as number)) !== 0)
    .map(([key]) => key);
}

/**
 * Converts mireds to kelvin.
 *
 * @param {number} mired - The mired value to convert.
 * @param {'floor' | 'ceil'} round - The rounding method to use (optional).
 * @returns {number} The converted kelvin value.
 *
 * @remarks
 * HomeAssistant uses always floor.
 */
export function miredsToKelvin(mired: number, round?: 'floor' | 'ceil'): number {
  if (round === 'floor') return Math.floor(1000000 / mired);
  else if (round === 'ceil') return Math.ceil(1000000 / mired);
  else return Math.round(1000000 / mired);
}

/**
 * Converts kelvin to mireds.
 *
 * @param {number} kelvin - The kelvin value to convert.
 * @param {'floor' | 'ceil'} round - The rounding method to use (optional).
 * @returns {number} The converted mired value.
 *
 * @remarks
 * HomeAssistant uses always floor.
 */
export function kelvinToMireds(kelvin: number, round?: 'floor' | 'ceil'): number {
  if (round === 'floor') return Math.floor(1000000 / kelvin);
  else if (round === 'ceil') return Math.ceil(1000000 / kelvin);
  else return Math.round(1000000 / kelvin);
}

/**
 * Clamp a number between a minimum and maximum value
 *
 * @param {number} value - The number to clamp
 * @param {number} min - The minimum value
 * @param {number} max - The maximum value
 * @returns {number} The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round a number to the number of digits specified
 *
 * @param {number} value - The number to round
 * @param {number} digits - The number of digits to round to
 * @returns {number} The rounded number
 */
export function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/**
 * Convert Fahrenheit to Celsius
 *
 * @param {number} value - Temperature
 * @param {string} [unit] - Optional unit of measurement, if provided it should be '°C' or '°F'
 * @returns {number} Temperature in Celsius
 */
export function temp(value: number, unit?: string): number {
  if (unit === UnitOfTemperature.FAHRENHEIT) return ((value - 32) * 5) / 9;
  return value; // If no unit is provided or it is not '°F', return the value as is
}

/**
 * Convert Celsius to Fahrenheit if the config.unit_system.temperature is '°F'
 *
 * @param {number} value - Temperature
 * @returns {number} Temperature in Fahrenheit
 */
export function tempToFahrenheit(value: number): number {
  if (HomeAssistant.hassConfig?.unit_system.temperature === UnitOfTemperature.FAHRENHEIT) return (value * 9) / 5 + 32;
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
  if (unit === 'psi') {
    return Math.round(value * 68.9475729318);
  }
  return null;
}

/**
 * Convert AQI value to corresponding AirQuality enum
 * If the value is a string, it will be converted to lowercase and matched against known AQI levels.
 * If the value is a number, it will be checked against AQI ranges.
 *
 * @param {number | string} value - AQI value or string representation of AQI level
 * @param {string} _unit - Unit of measurement, expected to be 'AQI'
 * @returns {number | null} Corresponding AirQuality enum value or null if invalid
 */
export function aqi(value: number | string, _unit?: string): number | null {
  // console.log(`Converting AQI value(${typeof value}): ${value} with unit: ${unit}`);
  if (typeof value === 'string') {
    value = value.toLowerCase();
    if (value === 'excellent') return AirQuality.AirQualityEnum.Good;
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
  if (isValidNumber(value, 0, 500)) {
    return Math.round(((value as number) / 500) * 5 + 1);
  }
  return null;
}

/**
 * Converts Matter currentX/currentY to Home Assistant xy_color format.
 *
 * The value of x shall be related to the CurrentX attribute by the relationship
 * x = "CurrentX" / 65536
 * where CurrentX is in the range from 0 to 65279 inclusive.
 *
 * The value of y shall be related to the CurrentY attribute by the relationship
 * y = "CurrentY" / 65536
 * where CurrentY is in the range from 0 to 65279 inclusive.
 *
 * It clamps the input values to the range [0, 65279] and normalizes them to [0.0, 1.0].
 *
 * @param {number} currentX - The current X value (range 0–65279).
 * @param {number} currentY - The current Y value (range 0–65279).
 * @returns {[number, number]} - Normalized xy_color tuple for Home Assistant.
 */
export function convertMatterXYToHA(currentX: number, currentY: number): [number, number] {
  const SCALE = 65536;
  const MAX = 65279;
  const MIN = 0;
  // Clamp input values to [0, 65279]
  const safeX = Math.max(MIN, Math.min(currentX, MAX));
  const safeY = Math.max(MIN, Math.min(currentY, MAX));
  const x = parseFloat((safeX / SCALE).toFixed(4));
  const y = parseFloat((safeY / SCALE).toFixed(4));
  return [x, y];
}

/**
 * Converts Home Assistant xy_color to Matter currentX/currentY format.
 * It clamps the input values to the range [0.0, 1.0] and scales them to the Matter range [0, 65279].
 *
 * @param {[number, number]} xyColor - Normalized xy_color tuple (range 0.0–1.0).
 * @returns {{ currentX: number, currentY: number }} - Scaled Matter values.
 */
export function convertHAXYToMatter(xyColor: [number, number]): { currentX: number; currentY: number } {
  const SCALE = 65536;
  const MAX_MATTER_VALUE = 65279;
  // Clamp xyColor values to [0, 1]
  const safeX = Math.max(0, Math.min(xyColor[0], 1));
  const safeY = Math.max(0, Math.min(xyColor[1], 1));
  const rawX = Math.round(safeX * SCALE);
  const rawY = Math.round(safeY * SCALE);
  const currentX = Math.min(rawX, MAX_MATTER_VALUE);
  const currentY = Math.min(rawY, MAX_MATTER_VALUE);
  return { currentX, currentY };
}

/** Update Home Assistant state to Matterbridge device states */
// prettier-ignore
export const hassUpdateStateConverter: { domain: string; state: string; clusterId: ClusterId | undefined; attribute: string; value: any }[] = [
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
    { domain: 'climate', state: 'auto', clusterId: undefined, attribute: '', value: null }, // 'auto' is not updated directly

    { domain: 'valve', state: 'opening', clusterId: ValveConfigurationAndControl.Cluster.id, attribute: 'currentState', value: ValveConfigurationAndControl.ValveState.Transitioning },
    { domain: 'valve', state: 'open', clusterId: ValveConfigurationAndControl.Cluster.id, attribute: 'currentState', value: ValveConfigurationAndControl.ValveState.Open },
    { domain: 'valve', state: 'closing', clusterId: ValveConfigurationAndControl.Cluster.id, attribute: 'currentState', value: ValveConfigurationAndControl.ValveState.Transitioning },
    { domain: 'valve', state: 'closed', clusterId: ValveConfigurationAndControl.Cluster.id, attribute: 'currentState', value: ValveConfigurationAndControl.ValveState.Closed },

    // The implementation has RvcRunMode currentMode 1 = Idle 2 = Cleaning
    { domain: 'vacuum', state: 'idle', clusterId: RvcRunMode.Cluster.id, attribute: 'currentMode', value: 1 },
    { domain: 'vacuum', state: 'idle', clusterId: RvcOperationalState.Cluster.id, attribute: 'operationalState', value: RvcOperationalState.OperationalState.Stopped },
    { domain: 'vacuum', state: 'paused', clusterId: RvcRunMode.Cluster.id, attribute: 'currentMode', value: 1 },
    { domain: 'vacuum', state: 'paused', clusterId: RvcOperationalState.Cluster.id, attribute: 'operationalState', value: RvcOperationalState.OperationalState.Paused },
    { domain: 'vacuum', state: 'docked', clusterId: RvcRunMode.Cluster.id, attribute: 'currentMode', value: 1 },
    { domain: 'vacuum', state: 'docked', clusterId: RvcOperationalState.Cluster.id, attribute: 'operationalState', value: RvcOperationalState.OperationalState.Docked },
    { domain: 'vacuum', state: 'returning', clusterId: RvcRunMode.Cluster.id, attribute: 'currentMode', value: 1 },
    { domain: 'vacuum', state: 'returning', clusterId: RvcOperationalState.Cluster.id, attribute: 'operationalState', value: RvcOperationalState.OperationalState.SeekingCharger },
    { domain: 'vacuum', state: 'cleaning', clusterId: RvcRunMode.Cluster.id, attribute: 'currentMode', value: 2 },
    { domain: 'vacuum', state: 'cleaning', clusterId: RvcOperationalState.Cluster.id, attribute: 'operationalState', value: RvcOperationalState.OperationalState.Running },

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
    { domain: 'light', with: 'color_temp_kelvin', clusterId: ColorControl.Cluster.id, attribute: 'colorTemperatureMireds', converter: (value: number, state: HassState) => ( isValidNumber(value, 0, 65279) && state.attributes['color_mode'] === ColorMode.COLOR_TEMP ? kelvinToMireds(value, 'floor') : null ) },
    { domain: 'light', with: 'hs_color', clusterId: ColorControl.Cluster.id, attribute: 'currentHue', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[0], 0, 360) && (state.attributes['color_mode'] === ColorMode.HS || state.attributes['color_mode'] === ColorMode.RGB) ? Math.round(value[0] / 360 * 254) : null ) },
    { domain: 'light', with: 'hs_color', clusterId: ColorControl.Cluster.id, attribute: 'currentSaturation', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[1], 0, 100) && (state.attributes['color_mode'] === ColorMode.HS || state.attributes['color_mode'] === ColorMode.RGB) ? Math.round(value[1] / 100 * 254) : null ) },
    { domain: 'light', with: 'xy_color', clusterId: ColorControl.Cluster.id, attribute: 'currentX', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[0], 0, 1) && state.attributes['color_mode'] === ColorMode.XY ? convertHAXYToMatter([value[0], value[1]]).currentX : null ) },
    { domain: 'light', with: 'xy_color', clusterId: ColorControl.Cluster.id, attribute: 'currentY', converter: (value: number[], state: HassState) => ( isValidArray(value, 2, 2) && isValidNumber(value[1], 0, 1) && state.attributes['color_mode'] === ColorMode.XY ? convertHAXYToMatter([value[0], value[1]]).currentY : null ) },
  
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
    { domain: 'fan', with: 'direction', clusterId: FanControl.Cluster.id, attribute: 'airflowDirection', converter: (value: 'forward' | 'reverse') => (isValidString(value, 7, 7) ? value === 'forward' ? FanControl.AirflowDirection.Forward : FanControl.AirflowDirection.Reverse : null) },
    { domain: 'fan', with: 'oscillating', clusterId: FanControl.Cluster.id, attribute: 'rockSetting', converter: (value: boolean) => (isValidBoolean(value) ? value === true ? { rockLeftRight: false, rockUpDown: false, rockRound: true } : { rockLeftRight: false, rockUpDown: false, rockRound: false } : null) },

    // Matter WindowCovering: 0 = open 10000 = closed
    { domain: 'cover', with: 'current_position', clusterId: WindowCovering.Cluster.id, attribute: 'currentPositionLiftPercent100ths', converter: (value: number) => (isValidNumber(value, 0, 100) ? Math.round(10000 - value * 100) : null) },
    { domain: 'cover', with: 'current_position', clusterId: WindowCovering.Cluster.id, attribute: 'targetPositionLiftPercent100ths', converter: (value: number) => (isValidNumber(value, 0, 100) ? Math.round(10000 - value * 100) : null) },

    { domain: 'climate', with: 'temperature',         clusterId: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && (state.state === HVACMode.HEAT || (state.state === HVACMode.AUTO && state.attributes?.hvac_modes?.includes(HVACMode.HEAT))) ? Math.round(temp(value, HomeAssistant.hassConfig?.unit_system?.temperature) * 100) : null) },
    { domain: 'climate', with: 'temperature',         clusterId: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && (state.state === HVACMode.COOL || (state.state === HVACMode.AUTO && state.attributes?.hvac_modes?.includes(HVACMode.COOL))) ? Math.round(temp(value, HomeAssistant.hassConfig?.unit_system?.temperature) * 100) : null) },
    { domain: 'climate', with: 'target_temp_high',    clusterId: Thermostat.Cluster.id, attribute: 'occupiedCoolingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && (state.attributes?.hvac_modes?.includes(HVACMode.HEAT_COOL) || state.attributes?.hvac_modes?.includes(HVACMode.COOL)) ? Math.round(temp(value, HomeAssistant.hassConfig?.unit_system?.temperature) * 100) : null) },
    { domain: 'climate', with: 'target_temp_low',     clusterId: Thermostat.Cluster.id, attribute: 'occupiedHeatingSetpoint', converter: (value: number, state: HassState) => (isValidNumber(value) && (state.attributes?.hvac_modes?.includes(HVACMode.HEAT_COOL) || state.attributes?.hvac_modes?.includes(HVACMode.HEAT)) ? Math.round(temp(value, HomeAssistant.hassConfig?.unit_system?.temperature) * 100) : null) },
    { domain: 'climate', with: 'current_temperature', clusterId: Thermostat.Cluster.id, attribute: 'localTemperature', converter: (value: number) => (isValidNumber(value) ? Math.round(temp(value, HomeAssistant.hassConfig?.unit_system?.temperature) * 100) : null) },

    { domain: 'valve', with: 'current_position', clusterId: ValveConfigurationAndControl.Cluster.id, attribute: 'currentLevel', converter: (value: number) => (isValidNumber(value, 0, 100) ? Math.round(value) : null) },
  ];

/**
 * Convert Home Assistant domains (with attributes) to Matterbridge device types and clusterIds.
 * If the device type is null, no device type will be added. It will use hassDomainSensorsConverter and hassDomainBinarySensorsConverter to determine the device type and clusterId.
 */
// prettier-ignore
export const hassDomainConverter: { domain: string; withAttribute?: string; deviceType: DeviceTypeDefinition | null; clusterId: ClusterId | null }[] = [
    { domain: 'switch',                                 deviceType: onOffOutlet,            clusterId: OnOff.Cluster.id },
    { domain: 'light',                                  deviceType: onOffLight,             clusterId: OnOff.Cluster.id },
    { domain: 'light',    withAttribute: 'brightness',  deviceType: dimmableLight,          clusterId: LevelControl.Cluster.id },
    { domain: 'light',    withAttribute: 'color_temp_kelvin',  deviceType: colorTemperatureLight,  clusterId: ColorControl.Cluster.id },
    { domain: 'light',    withAttribute: 'hs_color',    deviceType: extendedColorLight,     clusterId: ColorControl.Cluster.id },
    { domain: 'light',    withAttribute: 'rgb_color',   deviceType: extendedColorLight,     clusterId: ColorControl.Cluster.id },
    { domain: 'light',    withAttribute: 'xy_color',    deviceType: extendedColorLight,     clusterId: ColorControl.Cluster.id },
    { domain: 'lock',                                   deviceType: doorLockDevice,         clusterId: DoorLock.Cluster.id },
    { domain: 'fan',                                    deviceType: fanDevice,              clusterId: FanControl.Cluster.id },
    { domain: 'cover',                                  deviceType: coverDevice,            clusterId: WindowCovering.Cluster.id },
    { domain: 'climate',                                deviceType: thermostatDevice,       clusterId: Thermostat.Cluster.id },
    { domain: 'valve',                                  deviceType: waterValve,             clusterId: ValveConfigurationAndControl.Cluster.id },
    { domain: 'vacuum',                                 deviceType: roboticVacuumCleaner,   clusterId: RvcRunMode.Cluster.id },
    { domain: 'vacuum',                                 deviceType: roboticVacuumCleaner,   clusterId: RvcCleanMode.Cluster.id },
    { domain: 'vacuum',                                 deviceType: roboticVacuumCleaner,   clusterId: RvcOperationalState.Cluster.id },
    { domain: 'sensor',                                 deviceType: null,                   clusterId: null },
    { domain: 'binary_sensor',                          deviceType: null,                   clusterId: null },
  ];

/** Convert Home Assistant sensor domains attributes to Matterbridge device types and clusterIds */
// prettier-ignore
export const hassDomainSensorsConverter: { domain: string; withStateClass: string; withDeviceClass: string; endpoint?: string; deviceType: DeviceTypeDefinition; clusterId: ClusterId; attribute: string; converter: (value: number | string, unit?: string) => any }[] = [
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'battery',               endpoint: '',             deviceType: powerSource,        clusterId: PowerSource.Cluster.id,                  attribute: 'batPercentRemaining', converter: (value) => (isValidNumber(value, 0, 100) ? Math.round((value) * 2) : null) },
    { domain: 'sensor',     withStateClass: 'measurement',  withDeviceClass: 'voltage',               endpoint: '',             deviceType: powerSource,        clusterId: PowerSource.Cluster.id,                  attribute: 'batVoltage',      converter: (value, unit) => (isValidNumber(value, 0, 100000) ? Math.round(value * (unit === 'V' ? 1000 : 1)) : null) },
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

/** Convert Home Assistant event types to Matterbridge event types */
// prettier-ignore
export const hassDomainEventConverter: { hassEventType: string; matterbridgeEventType: 'Single' | 'Double' | 'Long' | 'Press' | 'Release'; }[] = [
    { hassEventType: 'single',            matterbridgeEventType: 'Single' },
    { hassEventType: 'single_push',       matterbridgeEventType: 'Single' },
    { hassEventType: 'press',             matterbridgeEventType: 'Single' },
    { hassEventType: 'initial_press',     matterbridgeEventType: 'Single' },
    { hassEventType: 'multi_press_1',     matterbridgeEventType: 'Single' },
    { hassEventType: 'double',            matterbridgeEventType: 'Double' },
    { hassEventType: 'double_press',      matterbridgeEventType: 'Double' },
    { hassEventType: 'double_push',       matterbridgeEventType: 'Double' },
    { hassEventType: 'multi_press_2',     matterbridgeEventType: 'Double' },
    { hassEventType: 'long',              matterbridgeEventType: 'Long' },
    { hassEventType: 'long_push',         matterbridgeEventType: 'Long' },
    { hassEventType: 'long_press',        matterbridgeEventType: 'Long' },
    { hassEventType: 'hold_press',        matterbridgeEventType: 'Long' },
  ];

/** Convert Home Assistant domains services to Matterbridge commands for device types */
// prettier-ignore
export const hassCommandConverter: { command: keyof MatterbridgeEndpointCommands; domain: string; service: string; converter?: (request: Record<string, any>, attributes: Record<string, any>, state: HassState | undefined) => any }[] = [
    { command: 'on',                      domain: 'switch', service: 'turn_on' },
    { command: 'off',                     domain: 'switch', service: 'turn_off' },
    { command: 'toggle',                  domain: 'switch', service: 'toggle' },
  
    { command: 'on',                      domain: 'light', service: 'turn_on' },
    { command: 'off',                     domain: 'light', service: 'turn_off' },
    { command: 'toggle',                  domain: 'light', service: 'toggle' },
    { command: 'moveToLevel',             domain: 'light', service: 'turn_on', converter: (request) => { return { brightness: Math.round(request.level / 254 * 255) } } },
    { command: 'moveToLevelWithOnOff',    domain: 'light', service: 'turn_on', converter: (request) => { return { brightness: Math.round(request.level / 254 * 255) } } },
    { command: 'moveToColorTemperature',  domain: 'light', service: 'turn_on', converter: (request, attributes, state) => { return { color_temp_kelvin: state && state.attributes.min_color_temp_kelvin && state.attributes.max_color_temp_kelvin ? clamp(miredsToKelvin(request.colorTemperatureMireds, 'floor'), state.attributes.min_color_temp_kelvin, state.attributes.max_color_temp_kelvin) : miredsToKelvin(request.colorTemperatureMireds, 'floor') } } },
    { command: 'moveToColor',             domain: 'light', service: 'turn_on', converter: (request) => { return { xy_color: convertMatterXYToHA(request.colorX, request.colorY) } } },
    { command: 'moveToHue',               domain: 'light', service: 'turn_on', converter: (request, attributes) => { return { hs_color: [Math.round(request.hue / 254 * 360), Math.round(attributes.currentSaturation.value / 254 * 100)] } } },
    { command: 'moveToSaturation',        domain: 'light', service: 'turn_on', converter: (request, attributes) => { return { hs_color: [Math.round(attributes.currentHue.value / 254 * 360), Math.round(request.saturation / 254 * 100)] } } },
    { command: 'moveToHueAndSaturation',  domain: 'light', service: 'turn_on', converter: (request) => { return { hs_color: [Math.round(request.hue / 254 * 360), Math.round(request.saturation / 254 * 100)] } } },
    
    { command: 'lockDoor',                domain: 'lock', service: 'lock' },
    { command: 'unlockDoor',              domain: 'lock', service: 'unlock' },
  
    { command: 'upOrOpen',                domain: 'cover', service: 'open_cover' },
    { command: 'downOrClose',             domain: 'cover', service: 'close_cover' },
    { command: 'stopMotion',              domain: 'cover', service: 'stop_cover' },
    { command: 'goToLiftPercentage',      domain: 'cover', service: 'set_cover_position', converter: (request) => { return { position: Math.round(100 - request.liftPercent100thsValue / 100) } } },

    { command: 'open',                    domain: 'valve', service: 'set_valve_position', converter: (request) => { return { position: Math.round(request.targetLevel) } } },
    { command: 'close',                   domain: 'valve', service: 'close_valve' },

    { command: 'pause',                   domain: 'vacuum', service: 'pause' },
    { command: 'resume',                  domain: 'vacuum', service: 'start' },
    { command: 'goHome',                  domain: 'vacuum', service: 'return_to_base' },
    { command: 'changeToMode',            domain: 'vacuum', service: 'start' },
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
        else return 'auto'; // For FanControl.FanMode.Auto, FanControl.FanMode.Smart, FanControl.FanMode.On
      } else {
        return null;
      }
    }},
    { domain: 'fan',      service: 'turn_on',         with: 'percentage',  clusterId: FanControl.Cluster.id,  attribute: 'percentSetting', converter: (value: number) => { return value === 0 ? null : value; } },
    { domain: 'fan',      service: 'set_direction',   with: 'direction',   clusterId: FanControl.Cluster.id,  attribute: 'airflowDirection', converter: (value: any) => { return value === FanControl.AirflowDirection.Forward ? 'forward' : 'reverse' } },
    { domain: 'fan',      service: 'oscillate',       with: 'oscillating', clusterId: FanControl.Cluster.id,  attribute: 'rockSetting', converter: (value: any) => { return value.rockRound === true } },
  
    { domain: 'climate',  service: 'set_hvac_mode',   with: 'hvac_mode',   clusterId: Thermostat.Cluster.id,  attribute: 'systemMode', converter: (value) => {
      if( isValidNumber(value, Thermostat.SystemMode.Off, Thermostat.SystemMode.Heat) ) {
        if (value === Thermostat.SystemMode.Auto) return 'heat_cool';
        else if (value === Thermostat.SystemMode.Cool) return 'cool';
        else if (value === Thermostat.SystemMode.Heat) return 'heat';
        else return null; // Thermostat.SystemMode 2 doesn't exist
      } else {
        return null;
      }
    }},
    { domain: 'climate',  service: 'set_temperature', with: 'temperature',  clusterId: Thermostat.Cluster.id,  attribute: 'occupiedHeatingSetpoint', converter: (value) => { return tempToFahrenheit(value / 100) } },
    { domain: 'climate',  service: 'set_temperature', with: 'temperature',  clusterId: Thermostat.Cluster.id,  attribute: 'occupiedCoolingSetpoint', converter: (value) => { return tempToFahrenheit(value / 100) } },
  ]
