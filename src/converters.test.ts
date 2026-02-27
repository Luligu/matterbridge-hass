// src\converters.test.ts

/* eslint-disable jest/no-conditional-expect */

import { airQualitySensor, electricalSensor, powerSource, pressureSensor } from 'matterbridge';
import { AirQuality, FanControl, Thermostat } from 'matterbridge/matter/clusters';

import {
  clamp,
  convertHAXYToMatter,
  convertMatterXYToHA,
  getFeatureNames,
  hassCommandConverter,
  hassDomainBinarySensorsConverter,
  hassDomainConverter,
  hassDomainSensorsConverter,
  hassSubscribeConverter,
  hassUpdateAttributeConverter,
  hassUpdateStateConverter,
  kelvinToMireds,
  miredsToKelvin,
  roundTo,
  temp,
  tempToFahrenheit,
} from './converters.js';
import { ClimateEntityFeature, ColorMode, FanEntityFeature, HassConfig, HassState, HassUnitSystem, HomeAssistant, HVACMode, UnitOfTemperature } from './homeAssistant.js';

describe('HassPlatform', () => {
  it('should return the feature names for supported features', () => {
    expect(getFeatureNames(FanEntityFeature, 0)).toEqual([]);
    expect(getFeatureNames(FanEntityFeature, undefined)).toEqual([]);
    expect(getFeatureNames(FanEntityFeature, 63)).toEqual(['SET_SPEED', 'OSCILLATE', 'DIRECTION', 'PRESET_MODE', 'TURN_OFF', 'TURN_ON']);
    // hvac_modes: [ 'auto', 'heat', 'off' ]
    expect(getFeatureNames(ClimateEntityFeature, 401)).toEqual(['TARGET_TEMPERATURE', 'PRESET_MODE', 'TURN_OFF', 'TURN_ON']);
    // hvac_modes: [ 'off', 'heat' ]
    expect(getFeatureNames(ClimateEntityFeature, 409)).toEqual(['TARGET_TEMPERATURE', 'FAN_MODE', 'PRESET_MODE', 'TURN_OFF', 'TURN_ON']);
    // hvac_modes: [ 'off', 'heat', 'cool' ]
    expect(getFeatureNames(ClimateEntityFeature, 409)).toEqual(['TARGET_TEMPERATURE', 'FAN_MODE', 'PRESET_MODE', 'TURN_OFF', 'TURN_ON']);
    // Demo Ecobee: hvac_modes: [ "off", "cool", "heat_cool", "auto", "dry", "fan_only" ]
    expect(getFeatureNames(ClimateEntityFeature, 442)).toEqual(['TARGET_TEMPERATURE_RANGE', 'FAN_MODE', 'PRESET_MODE', 'SWING_MODE', 'TURN_OFF', 'TURN_ON']);
    // Demo Hvac: hvac_modes: [ "off", "heat", "cool", "auto", "dry", "fan_only" ]
    expect(getFeatureNames(ClimateEntityFeature, 943)).toEqual([
      'TARGET_TEMPERATURE',
      'TARGET_TEMPERATURE_RANGE',
      'TARGET_HUMIDITY',
      'FAN_MODE',
      'SWING_MODE',
      'TURN_OFF',
      'TURN_ON',
      'SWING_HORIZONTAL_MODE',
    ]);
  });

  it('should clamp values between a minimum and maximum', () => {
    expect(clamp(32, 30, 40)).toBe(32);
    expect(clamp(25, 30, 40)).toBe(30);
    expect(clamp(45, 30, 40)).toBe(40);
  });

  it('should convert Fahrenheit to Celsius', () => {
    expect(temp(32)).toBe(32);
    expect(temp(212, '°F')).toBe(100);
    expect(temp(-40)).toBe(-40);
    expect(temp(-148, '°F')).toBe(-100);
  });

  it('should convert Celsius to Fahrenheit', () => {
    HomeAssistant.hassConfig = {
      unit_system: {
        temperature: UnitOfTemperature.FAHRENHEIT,
      } as HassUnitSystem,
    } as HassConfig;
    expect(tempToFahrenheit(32)).toBe(89.6);
    expect(tempToFahrenheit(100)).toBe(212);
    expect(tempToFahrenheit(-40)).toBe(-40);
    expect(tempToFahrenheit(-100)).toBe(-148);
    HomeAssistant.hassConfig = {
      unit_system: {
        temperature: UnitOfTemperature.CELSIUS,
      } as HassUnitSystem,
    } as HassConfig;
    expect(tempToFahrenheit(32.1)).toBe(32.1);
    expect(tempToFahrenheit(100.8)).toBe(100.8);
    expect(tempToFahrenheit(-40.6)).toBe(roundTo(-40.6, 2));
    expect(tempToFahrenheit(-99.99)).toBe(roundTo(-99.99, 2));
  });

  it('should convert mireds and kelvin', () => {
    // Mireds to Kelvin
    expect(miredsToKelvin(500, 'floor')).toBe(2000);
    expect(miredsToKelvin(333, 'floor')).toBe(3003);
    expect(miredsToKelvin(250, 'floor')).toBe(4000);
    expect(miredsToKelvin(200, 'floor')).toBe(5000);
    expect(miredsToKelvin(200, 'ceil')).toBe(5000);
    expect(miredsToKelvin(200)).toBe(5000);
    expect(miredsToKelvin(200, 'floor')).toBe(5000);
    expect(miredsToKelvin(153, 'floor')).toBe(6535);
    expect(miredsToKelvin(147, 'floor')).toBe(6802);

    // Kelvin to Mireds
    expect(kelvinToMireds(2000, 'floor')).toBe(500);
    expect(kelvinToMireds(2500, 'floor')).toBe(400);
    expect(kelvinToMireds(3000, 'floor')).toBe(333);
    expect(kelvinToMireds(4000, 'floor')).toBe(250);
    expect(kelvinToMireds(5000, 'floor')).toBe(200);
    expect(kelvinToMireds(5000, 'ceil')).toBe(200);
    expect(kelvinToMireds(5000)).toBe(200);
    expect(kelvinToMireds(6500, 'floor')).toBe(153);
    expect(kelvinToMireds(6800, 'floor')).toBe(147);
  });

  it('should verify the hassUpdateStateConverter converter', () => {
    hassUpdateStateConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.domain === 'climate' && converter.state === 'auto') {
        expect(converter.clusterId).toBeUndefined();
      }
    });
  });

  it('should verify the hassUpdateAttributeConverter converter', () => {
    hassUpdateAttributeConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.domain === 'light' && converter.with === 'brightness') {
        expect(converter.converter(0, {} as HassState)).toBe(null);
        expect(converter.converter(1, {} as HassState)).toBe(1);
        expect(converter.converter(255, {} as HassState)).toBe(254);
      }
      if (converter.domain === 'light' && converter.with === 'color_mode') {
        converter.converter('', {} as HassState);
        converter.converter('unknown', {} as HassState);
        converter.converter('hs', {} as HassState);
        converter.converter('rgb', {} as HassState);
        converter.converter('xy', {} as HassState);
        converter.converter('color_temp', {} as HassState);
      }
      if (converter.domain === 'light' && converter.with === 'color_temp_kelvin') {
        converter.converter(2, {
          attributes: { color_mode: ColorMode.COLOR_TEMP },
        } as HassState);
        converter.converter(undefined, {} as HassState);
      }
      if (converter.domain === 'light' && converter.with === 'hs_color') {
        converter.converter([0, 0], {
          attributes: { color_mode: 'hs' },
        } as HassState);
        converter.converter([0, 0], {
          attributes: { color_mode: 'rgb' },
        } as HassState);
        converter.converter(undefined, {} as HassState);
      }
      if (converter.domain === 'light' && converter.with === 'xy_color') {
        converter.converter([0, 0], {
          attributes: { color_mode: 'xy' },
        } as HassState);
        converter.converter(undefined, {} as HassState);
      }
      if (converter.domain === 'fan' && converter.with === 'percentage') {
        converter.converter(0, {} as HassState);
        converter.converter(50, {} as HassState);
      }
      if (converter.domain === 'fan' && converter.with === 'preset_mode' && converter.attribute === 'fanMode') {
        converter.converter('low', {} as HassState);
        converter.converter('medium', {} as HassState);
        converter.converter('high', {} as HassState);
        converter.converter('auto', {} as HassState);
        converter.converter('none', {} as HassState);
        converter.converter('on', {} as HassState);
      }
      if (converter.domain === 'fan' && converter.with === 'direction') {
        converter.converter('forward', {} as HassState);
        converter.converter('reverse', {} as HassState);
        converter.converter('short', {} as HassState);
      }
      if (converter.domain === 'fan' && converter.with === 'oscillating') {
        converter.converter(true, {} as HassState);
        converter.converter(false, {} as HassState);
        converter.converter('wrong', {} as HassState);
      }
      if (converter.domain === 'cover' && converter.with === 'current_position') {
        expect(converter.converter(0, {} as HassState)).toBe(10000);
        expect(converter.converter(100, {} as HassState)).toBe(0);
        expect(converter.converter(-1, {} as HassState)).toBe(null);
      }
      if (converter.domain === 'climate' && converter.with === 'temperature') {
        expect(converter.converter(20, { state: HVACMode.AUTO, attributes: { hvac_modes: [HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        expect(converter.converter(20, { state: HVACMode.AUTO, attributes: { hvac_modes: [HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        if (converter.attribute === 'occupiedHeatingSetpoint')
          expect(converter.converter(20, { state: HVACMode.HEAT, attributes: { hvac_modes: [HVACMode.HEAT] } } as HassState)).toBe(2000);
        if (converter.attribute === 'occupiedHeatingSetpoint')
          expect(converter.converter(20, { state: HVACMode.COOL, attributes: { hvac_modes: [HVACMode.COOL] } } as HassState)).toBe(null);
        if (converter.attribute === 'occupiedCoolingSetpoint')
          expect(converter.converter(20, { state: HVACMode.COOL, attributes: { hvac_modes: [HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        if (converter.attribute === 'occupiedCoolingSetpoint')
          expect(converter.converter(20, { state: HVACMode.HEAT, attributes: { hvac_modes: [HVACMode.HEAT] } } as HassState)).toBe(null);
        converter.converter(20, { state: '' } as HassState);
        expect(converter.converter('20', { state: '' } as HassState)).toBe(null);
      }
      if (converter.domain === 'climate' && converter.with === 'target_temp_high') {
        expect(converter.converter(20, { state: HVACMode.HEAT, attributes: { hvac_modes: [HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        expect(converter.converter(20, { state: HVACMode.COOL, attributes: { hvac_modes: [HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        expect(converter.converter(20, { state: HVACMode.HEAT_COOL, attributes: { hvac_modes: [HVACMode.HEAT_COOL, HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        expect(converter.converter('20', { state: HVACMode.HEAT_COOL } as HassState)).toBe(null);
      }
      if (converter.domain === 'climate' && converter.with === 'target_temp_low') {
        expect(converter.converter(20, { state: HVACMode.HEAT, attributes: { hvac_modes: [HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        expect(converter.converter(20, { state: HVACMode.COOL, attributes: { hvac_modes: [HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        expect(converter.converter(20, { state: HVACMode.HEAT_COOL, attributes: { hvac_modes: [HVACMode.HEAT_COOL, HVACMode.HEAT, HVACMode.COOL] } } as HassState)).toBe(2000);
        expect(converter.converter('20', { state: HVACMode.HEAT_COOL } as HassState)).toBe(null);
      }
      if (converter.domain === 'climate' && converter.with === 'current_temperature') {
        expect(converter.converter(20, {} as HassState)).toBe(2000);
        expect(converter.converter('20', {} as HassState)).toBe(null);
      }
      if (converter.domain === 'valve' && converter.with === 'current_position') {
        expect(converter.converter(0, {} as HassState)).toBe(0);
        expect(converter.converter(100, {} as HassState)).toBe(100);
        expect(converter.converter(-1, {} as HassState)).toBe(null);
      }
    });
  });

  it('should verify the hassDomainConverter converter', () => {
    hassDomainConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
    });
  });

  it('should verify the hassDomainSensorsConverter converter', () => {
    hassDomainSensorsConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.withStateClass === 'measurement' && converter.withDeviceClass === 'temperature') {
        expect(converter.converter(32, '°F')).toBe(0);
        expect(converter.converter(212, '°F')).toBe(10000);
        expect(converter.converter(-40, '°C')).toBe(-4000);
      } else if (converter.withStateClass === 'measurement' && converter.deviceType === pressureSensor) {
        expect(converter.converter(900, 'hPa')).toBe(900);
        expect(converter.converter(90, 'kPa')).toBe(900);
        expect(converter.converter(29.4, 'inHg')).toBe(996);
        expect(converter.converter(14.5038, 'psi')).toBe(1000);
        expect(converter.converter(29.4)).toBe(null);
        expect(converter.converter(0, 'inHg')).toBe(null);
      } else if (converter.withStateClass === 'measurement' && converter.withDeviceClass === 'voltage' && converter.deviceType === powerSource) {
        expect(converter.converter(32, 'mV')).toBe(32);
        expect(converter.converter(1.5, 'V')).toBe(1500);
        expect(converter.converter(-40, 'V')).toBe(null);
      } else if (converter.withStateClass === 'measurement' && converter.withDeviceClass === 'voltage' && converter.deviceType === electricalSensor) {
        expect(converter.converter(32, 'V')).toBe(32000);
        expect(converter.converter(212, 'mV')).toBe(null);
      } else if (converter.withStateClass === 'total_increasing' && converter.withDeviceClass === 'energy' && converter.deviceType === electricalSensor) {
        expect(converter.converter(32, 'kWh')).toEqual({ energy: 32000000 });
        expect(converter.converter(212, 'Wh')).toBe(null);
      } else if (converter.withStateClass === 'measurement' && converter.withDeviceClass === 'power' && converter.deviceType === electricalSensor) {
        expect(converter.converter(32, 'W')).toBe(32000);
        expect(converter.converter(212, 'Wh')).toBe(null);
      } else if (converter.withStateClass === 'measurement' && converter.withDeviceClass === 'current' && converter.deviceType === electricalSensor) {
        expect(converter.converter(32, 'A')).toBe(32000);
        expect(converter.converter(212, 'Ah')).toBe(null);
      } else if (converter.withStateClass === 'measurement' && converter.withDeviceClass === 'aqi' && converter.deviceType === airQualitySensor) {
        // Test numeric AQI values
        expect(converter.converter(0, 'AQI')).toBe(AirQuality.AirQualityEnum.Good); // 1 -> 1
        expect(converter.converter(1, 'AQI')).toBe(AirQuality.AirQualityEnum.Good); // 1 -> 1
        expect(converter.converter(100, 'AQI')).toBe(AirQuality.AirQualityEnum.Fair); // 100 -> 2
        expect(converter.converter(200, 'AQI')).toBe(AirQuality.AirQualityEnum.Moderate); // 200 -> 3
        expect(converter.converter(300, 'AQI')).toBe(AirQuality.AirQualityEnum.Poor); // 300 -> 4
        expect(converter.converter(400, 'AQI')).toBe(AirQuality.AirQualityEnum.VeryPoor); // 400 -> 5
        expect(converter.converter(500, 'AQI')).toBe(AirQuality.AirQualityEnum.ExtremelyPoor); // 500 -> 6
        expect(converter.converter(-1, 'AQI')).toBe(null);
        expect(converter.converter(501, 'AQI')).toBe(null);
        expect(converter.converter(10, 'other')).toBe(AirQuality.AirQualityEnum.Good);

        // Test enum/text AQI values
        expect(converter.converter('excellent')).toBe(AirQuality.AirQualityEnum.Good);
        expect(converter.converter('healthy')).toBe(AirQuality.AirQualityEnum.Good);
        expect(converter.converter('fine')).toBe(AirQuality.AirQualityEnum.Good);
        expect(converter.converter('good')).toBe(AirQuality.AirQualityEnum.Good);
        expect(converter.converter('fair')).toBe(AirQuality.AirQualityEnum.Fair);
        expect(converter.converter('moderate')).toBe(AirQuality.AirQualityEnum.Moderate);
        expect(converter.converter('poor')).toBe(AirQuality.AirQualityEnum.Poor);
        expect(converter.converter('unhealthy_for_sensitive_groups')).toBe(AirQuality.AirQualityEnum.Poor);
        expect(converter.converter('unhealthy')).toBe(AirQuality.AirQualityEnum.VeryPoor);
        expect(converter.converter('very_poor')).toBe(AirQuality.AirQualityEnum.VeryPoor);
        expect(converter.converter('very_unhealthy')).toBe(AirQuality.AirQualityEnum.ExtremelyPoor);
        expect(converter.converter('hazardous')).toBe(AirQuality.AirQualityEnum.ExtremelyPoor);
        expect(converter.converter('extremely_poor')).toBe(AirQuality.AirQualityEnum.ExtremelyPoor);
        expect(converter.converter('GOOD')).toBe(AirQuality.AirQualityEnum.Good); // Test case insensitive
        expect(converter.converter('unknown')).toBe(null);
        expect(converter.converter('invalid')).toBe(null);
      } else if (converter.withStateClass === 'measurement') {
        // console.warn(`Converter for ${converter.domain} with state class ${converter.withStateClass} and device class ${converter.withDeviceClass}`);
        expect(converter.converter(0)).not.toBe(null);
        expect(converter.converter(undefined as unknown as number)).toBe(null);
      }
    });
  });

  it('should verify the hassDomainBinarySensorsConverter converter', () => {
    hassDomainBinarySensorsConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.domain === 'binary_sensor') {
        expect(converter.converter('on')).not.toBe(null);
        expect(converter.converter('off')).not.toBe(null);
      }
    });
  });

  it('should verify the hassCommandConverter converter', () => {
    hassCommandConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.converter && converter.domain === 'cover' && converter.service === 'set_cover_position') {
        expect(converter.converter({ liftPercent100thsValue: 10000 }, {}, undefined)).toEqual({ position: 0 });
      }
      if (converter.converter && converter.domain === 'cover' && converter.service === 'set_cover_position') {
        expect(converter.converter({ liftPercent100thsValue: 3000 }, {}, undefined)).toEqual({ position: 70 });
      }
      if (converter.converter && converter.domain === 'cover' && converter.service === 'set_cover_position') {
        expect(converter.converter({ liftPercent100thsValue: 0 }, {}, undefined)).toEqual({ position: 100 });
      }
      if (converter.converter && converter.domain === 'valve' && converter.service === 'set_valve_position') {
        expect(converter.converter({ targetLevel: 100 }, {}, undefined)).toEqual({ position: 100 });
      }
      if (converter.converter && converter.domain === 'valve' && converter.service === 'set_valve_position') {
        expect(converter.converter({ targetLevel: 0 }, {}, undefined)).toEqual({ position: 0 });
      }
      if (converter.converter && converter.command === 'moveToLevel') {
        expect(converter.converter({ level: 254 }, undefined as any, undefined as any)).toEqual({ brightness: 255 });
      }
      if (converter.converter && converter.command === 'moveToLevelWithOnOff') {
        expect(converter.converter({ level: 56 }, undefined as any, undefined as any)).toEqual({ brightness: 56 });
      }
      if (converter.converter && converter.command === 'moveToColorTemperature') {
        expect(converter.converter({ colorTemperatureMireds: 200 }, undefined as any, { attributes: {} } as HassState)).toEqual({ color_temp_kelvin: 5000 });
      }
      if (converter.converter && converter.command === 'moveToColorTemperature') {
        expect(
          converter.converter({ colorTemperatureMireds: 200 }, undefined as any, { attributes: { min_color_temp_kelvin: 1, max_color_temp_kelvin: 10000 } } as HassState),
        ).toEqual({ color_temp_kelvin: 5000 });
      }
      if (converter.converter && converter.command === 'moveToColor') {
        expect(converter.converter({ colorX: 32000, colorY: 32000 }, undefined as any, undefined as any)).toEqual({ xy_color: [0.4883, 0.4883] });
      }
      if (converter.converter && converter.command === 'moveToHue') {
        expect(converter.converter({ hue: 100 }, { currentSaturation: { value: 50 } }, undefined as any)).toEqual({ hs_color: [142, 20] });
      }
      if (converter.converter && converter.command === 'moveToSaturation') {
        expect(converter.converter({ saturation: 50 }, { currentHue: { value: 100 } }, undefined as any)).toEqual({ hs_color: [142, 20] });
      }
      if (converter.converter && converter.command === 'moveToHueAndSaturation') {
        expect(
          converter.converter(
            {
              hue: 100,
              saturation: 50,
            },
            undefined as any,
            undefined as any,
          ),
        ).toEqual({ hs_color: [142, 20] });
      }
    });
  });

  it('should verify the hassSubscribeConverter converter', () => {
    hassSubscribeConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.domain === 'fan' && converter.service === 'turn_on' && converter.with === 'preset_mode' && converter.converter) {
        expect(converter.converter(FanControl.FanMode.Low)).toBe('low');
        expect(converter.converter(FanControl.FanMode.Medium)).toBe('medium');
        expect(converter.converter(FanControl.FanMode.High)).toBe('high');
        expect(converter.converter(FanControl.FanMode.Auto)).toBe('auto');
        expect(converter.converter(FanControl.FanMode.Smart)).toBe('auto');
        expect(converter.converter(FanControl.FanMode.On)).toBe('auto');
        expect(converter.converter(10)).toBe(null);
      }
      if (converter.domain === 'fan' && converter.service === 'turn_on' && converter.with === 'percentage' && converter.converter) {
        expect(converter.converter(0)).toBe(null);
        expect(converter.converter(10)).toBe(10);
      }
      if (converter.domain === 'fan' && converter.service === 'set_direction' && converter.converter) {
        expect(converter.converter(FanControl.AirflowDirection.Forward)).toBe('forward');
        expect(converter.converter(FanControl.AirflowDirection.Reverse)).toBe('reverse');
      }
      if (converter.domain === 'fan' && converter.service === 'oscillate' && converter.converter) {
        expect(converter.converter({ rockRound: true } as any)).toBe(true);
        expect(converter.converter({ rockRound: false } as any)).toBe(false);
      }
      if (converter.domain === 'climate' && converter.service === 'set_hvac_mode' && converter.converter) {
        expect(converter.converter(Thermostat.SystemMode.Auto)).toBe('heat_cool');
        expect(converter.converter(Thermostat.SystemMode.Cool)).toBe('cool');
        expect(converter.converter(Thermostat.SystemMode.Heat)).toBe('heat');
        expect(converter.converter(Thermostat.SystemMode.Off)).toBe(null);
        expect(converter.converter(10)).toBe(null);
      }
      if (converter.domain === 'climate' && converter.service === 'set_temperature' && converter.converter) {
        HomeAssistant.hassConfig = {
          unit_system: {
            temperature: UnitOfTemperature.FAHRENHEIT,
          } as HassUnitSystem,
        } as HassConfig;
        expect(converter.converter(2250)).toBe(72.5);
        HomeAssistant.hassConfig = {
          unit_system: {
            temperature: UnitOfTemperature.CELSIUS,
          } as HassUnitSystem,
        } as HassConfig;
        expect(converter.converter(1000)).toBe(10);
      }
    });
  });

  it('temperature sensor converter boundary cases (line 288)', () => {
    const c = hassDomainSensorsConverter.find((x) => x.domain === 'sensor' && x.withDeviceClass === 'temperature' && x.attribute === 'measuredValue');
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.converter(-148, '°F')).toBe(-10000); // lower bound
    expect(c.converter(212, '°F')).toBe(10000); // upper bound
    expect(c.converter(-149, '°F')).toBe(null); // below bound
    expect(c.converter(213, '°F')).toBe(null); // above bound
  });

  it('fan preset subscribe maps smart/on to auto (line 376)', () => {
    const c = hassSubscribeConverter.find((x) => x.domain === 'fan' && x.service === 'turn_on' && x.with === 'preset_mode');
    expect(c).toBeDefined();
    if (!c || !c.converter) return;
    expect(c.converter(FanControl.FanMode.Smart)).toBe('auto');
    expect(c.converter(FanControl.FanMode.On)).toBe('auto');
  });

  it('fan preset subscribe invalid value returns null (line 379)', () => {
    const c = hassSubscribeConverter.find((x) => x.domain === 'fan' && x.service === 'turn_on' && x.with === 'preset_mode');
    expect(c).toBeDefined();
    if (!c || !c.converter) return;
    expect(c.converter(-1 as any)).toBe(null); // below range
    expect(c.converter(999 as any)).toBe(null); // above range
  });

  describe('convertMatterXYToHA', () => {
    it('should convert 0,0 to [0,0]', () => {
      expect(convertMatterXYToHA(0, 0)).toEqual([0, 0]);
    });
    it('should convert max values to [0.9962, 0.9962]', () => {
      expect(convertMatterXYToHA(65279, 65279)).toEqual([0.9961, 0.9961]);
    });
    it('should convert mid values', () => {
      expect(convertMatterXYToHA(32768, 32768)).toEqual([0.5, 0.5]);
    });
    it('should handle floats and round to 4 decimals', () => {
      expect(convertMatterXYToHA(12345, 54321)).toEqual([parseFloat((12345 / 65536).toFixed(4)), parseFloat((54321 / 65536).toFixed(4))]);
    });
    it('should clamp negative X and valid Y', () => {
      expect(convertMatterXYToHA(-10, 100)).toEqual([0, parseFloat((100 / 65536).toFixed(4))]);
    });
    it('should clamp valid X and Y above max', () => {
      expect(convertMatterXYToHA(100, 70000)).toEqual([parseFloat((100 / 65536).toFixed(4)), parseFloat((65279 / 65536).toFixed(4))]);
    });
    it('should clamp X below min and Y above max', () => {
      expect(convertMatterXYToHA(-5, 70000)).toEqual([0, parseFloat((65279 / 65536).toFixed(4))]);
    });
    it('should clamp X above max and Y below min', () => {
      expect(convertMatterXYToHA(70000, -5)).toEqual([parseFloat((65279 / 65536).toFixed(4)), 0]);
    });
  });

  describe('convertHAXYToMatter', () => {
    it('should convert [0,0] to {currentX:0,currentY:0}', () => {
      expect(convertHAXYToMatter([0, 0])).toEqual({ currentX: 0, currentY: 0 });
    });
    it('should convert [1,1] to {currentX:65279,currentY:65279}', () => {
      expect(convertHAXYToMatter([1, 1])).toEqual({ currentX: 65279, currentY: 65279 });
    });
    it('should convert [0.5,0.5] to correct mid values', () => {
      const mid = Math.round(0.5 * 65536);
      expect(convertHAXYToMatter([0.5, 0.5])).toEqual({ currentX: mid, currentY: mid });
    });
    it('should clamp values above 1 to 65279', () => {
      expect(convertHAXYToMatter([2, 2])).toEqual({ currentX: 65279, currentY: 65279 });
    });
    it('should handle negative values (resulting in 0)', () => {
      expect(convertHAXYToMatter([-1, -1])).toEqual({ currentX: 0, currentY: 0 });
    });
    it('should handle floats and round', () => {
      const x = 0.1234;
      const y = 0.9876;
      const expectedX = Math.round(x * 65536);
      let expectedY = Math.round(y * 65536);
      if (expectedY > 65279) expectedY = 65279;
      expect(convertHAXYToMatter([x, y])).toEqual({ currentX: expectedX, currentY: expectedY });
    });
    it('should clamp X below 0 and Y above 1', () => {
      expect(convertHAXYToMatter([-0.5, 1.5])).toEqual({ currentX: 0, currentY: 65279 });
    });
    it('should clamp X above 1 and Y below 0', () => {
      expect(convertHAXYToMatter([2, -1])).toEqual({ currentX: 65279, currentY: 0 });
    });
    it('should clamp X valid and Y above 1', () => {
      const x = 0.5;
      expect(convertHAXYToMatter([x, 2])).toEqual({ currentX: Math.round(x * 65536), currentY: 65279 });
    });
    it('should clamp X below 0 and Y valid', () => {
      const y = 0.5;
      expect(convertHAXYToMatter([-2, y])).toEqual({ currentX: 0, currentY: Math.round(y * 65536) });
    });
  });
});
