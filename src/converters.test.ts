// src\converters.test.ts

/* eslint-disable jest/no-conditional-expect */

import { airQualitySensor, electricalSensor, powerSource, pressureSensor } from 'matterbridge';
import { AirQuality, FanControl, Thermostat } from 'matterbridge/matter/clusters';

import {
  temp,
  hassCommandConverter,
  hassDomainAttributeConverter,
  hassDomainBinarySensorsConverter,
  hassDomainConverter,
  hassDomainSensorsConverter,
  hassSubscribeConverter,
  hassUpdateAttributeConverter,
  hassUpdateStateConverter,
} from './converters.js';
import { HassState } from './homeAssistant.js';

describe('HassPlatform', () => {
  it('should convert fahrenheit to Celsius', () => {
    expect(temp(32)).toBe(32);
    expect(temp(212, '°F')).toBe(100);
    expect(temp(-40)).toBe(-40);
    expect(temp(-148, '°F')).toBe(-100);
  });

  it('should verify the hassUpdateStateConverter converter', () => {
    hassUpdateStateConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
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
      if (converter.domain === 'light' && converter.with === 'color_temp') {
        converter.converter(2, {
          attributes: { color_mode: 'color_temp' },
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
      if (converter.domain === 'fan' && converter.with === 'preset_mode') {
        converter.converter('low', {} as HassState);
        converter.converter('medium', {} as HassState);
        converter.converter('high', {} as HassState);
        converter.converter('auto', {} as HassState);
        converter.converter('none', {} as HassState);
        converter.converter('on', {} as HassState);
      }
      if (converter.domain === 'cover' && converter.with === 'current_position') {
        converter.converter(0, {} as HassState);
        converter.converter(100, {} as HassState);
        converter.converter(-1, {} as HassState);
      }
      if (converter.domain === 'climate' && converter.with === 'temperature') {
        converter.converter(20, { state: 'heat' } as HassState);
        converter.converter(20, { state: 'cool' } as HassState);
        converter.converter(20, { state: '' } as HassState);
        converter.converter('20', { state: '' } as HassState);
      }
      if (converter.domain === 'climate' && converter.with === 'target_temp_high') {
        converter.converter(20, { state: 'heat' } as HassState);
        converter.converter(20, { state: 'cool' } as HassState);
        converter.converter(20, { state: 'heat_cool' } as HassState);
        converter.converter('20', { state: 'heat_cool' } as HassState);
      }
      if (converter.domain === 'climate' && converter.with === 'target_temp_low') {
        converter.converter(20, { state: 'heat' } as HassState);
        converter.converter(20, { state: 'cool' } as HassState);
        converter.converter(20, { state: 'heat_cool' } as HassState);
        converter.converter('20', { state: 'heat_cool' } as HassState);
      }
      if (converter.domain === 'climate' && converter.with === 'current_temperature') {
        converter.converter(20, { state: 'heat' } as HassState);
        converter.converter('20', { state: 'heat' } as HassState);
      }
    });
  });

  it('should verify the hassDomainConverter converter', () => {
    hassDomainConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
    });
  });

  it('should verify the hassDomainAttributeConverter converter', () => {
    hassDomainAttributeConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
    });
  });

  it('should verify the hassDomainSensorsConverter convertes', () => {
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
        expect(converter.converter(29.4)).toBe(null);
        expect(converter.converter(0, 'inHg')).toBe(null);
      } else if (converter.withStateClass === 'measurement' && converter.withDeviceClass === 'voltage' && converter.deviceType === powerSource) {
        expect(converter.converter(32, 'mV')).toBe(32);
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
        expect(converter.converter(10, 'other')).toBe(null);

        // Test enum/text AQI values
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

  it('should verify the hassDomainBinarySensorsConverter convertes', () => {
    hassDomainBinarySensorsConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.domain === 'binary_sensor') {
        expect(converter.converter('on')).not.toBe(null);
        expect(converter.converter('off')).not.toBe(null);
      }
    });
  });

  it('should verify the hassCommandConverter convertes', () => {
    hassCommandConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.converter && converter.domain === 'cover' && converter.service === 'set_cover_position') {
        converter.converter({ liftPercent100thsValue: 10000 }, {});
      }
      if (converter.converter && converter.command.startsWith('moveTo') && converter.domain === 'light' && converter.service === 'turn_on') {
        converter.converter(
          {
            level: 1,
            colorTemperatureMireds: 200,
            colorX: 0,
            colorY: 0,
            hue: 0,
            saturation: 0,
          },
          { currentHue: 0, currentSaturation: 0 },
        );
      }
    });
  });

  it('should verify the hassSubscribeConverter convertes', () => {
    hassSubscribeConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.domain === 'fan' && converter.service === 'turn_on' && converter.converter) {
        expect(converter.converter(FanControl.FanMode.Low)).toBe('low');
        expect(converter.converter(FanControl.FanMode.Medium)).toBe('medium');
        expect(converter.converter(FanControl.FanMode.High)).toBe('high');
        expect(converter.converter(FanControl.FanMode.Auto)).toBe('auto');
        expect(converter.converter(FanControl.FanMode.Smart)).toBe('auto');
        expect(converter.converter(FanControl.FanMode.On)).toBe('auto');
        expect(converter.converter(10)).toBe(null);
      }
      if (converter.domain === 'climate' && converter.service === 'set_hvac_mode' && converter.converter) {
        converter.converter(Thermostat.SystemMode.Auto);
        converter.converter(Thermostat.SystemMode.Cool);
        converter.converter(Thermostat.SystemMode.Heat);
        converter.converter(Thermostat.SystemMode.Off);
        converter.converter(10);
      }
      if (converter.domain === 'climate' && converter.service === 'set_temperature' && converter.converter) {
        converter.converter(10);
      }
    });
  });
});
