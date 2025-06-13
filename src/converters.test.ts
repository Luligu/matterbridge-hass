/* eslint-disable jest/no-conditional-expect */
import { FanControl, Thermostat } from 'matterbridge/matter/clusters';
import {
  hassCommandConverter,
  hassDomainAttributeConverter,
  hassDomainBinarySensorsConverter,
  hassDomainConverter,
  hassDomainSensorsConverter,
  hassSubscribeConverter,
  hassUpdateAttributeConverter,
  hassUpdateStateConverter,
} from './converters';
import { HassState } from './homeAssistant';

describe('HassPlatform', () => {
  beforeAll(() => {
    //
  });

  beforeEach(() => {
    //
  });

  afterAll(() => {
    //
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
        converter.converter(2, { attributes: { color_mode: 'color_temp' } } as HassState);
        converter.converter(undefined, {} as HassState);
      }
      if (converter.domain === 'light' && converter.with === 'hs_color') {
        converter.converter([0, 0], { attributes: { color_mode: 'hs' } } as HassState);
        converter.converter([0, 0], { attributes: { color_mode: 'rgb' } } as HassState);
        converter.converter(undefined, {} as HassState);
      }
      if (converter.domain === 'light' && converter.with === 'xy_color') {
        converter.converter([0, 0], { attributes: { color_mode: 'xy' } } as HassState);
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
      if (converter.domain === 'sensor' && converter.withStateClass === 'measurement') {
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
        converter.converter({ level: 1, colorTemperatureMireds: 200, colorX: 0, colorY: 0, hue: 0, saturation: 0 }, { currentHue: 0, currentSaturation: 0 });
      }
    });
  });
  it('should verify the hassSubscribeConverter convertes', () => {
    hassSubscribeConverter.forEach((converter) => {
      expect(converter.domain.length).toBeGreaterThan(0);
      if (converter.domain === 'fan' && converter.service === 'turn_on' && converter.converter) {
        converter.converter(FanControl.FanMode.Low);
        converter.converter(FanControl.FanMode.Medium);
        converter.converter(FanControl.FanMode.High);
        converter.converter(FanControl.FanMode.Auto);
        converter.converter(FanControl.FanMode.Smart);
        converter.converter(FanControl.FanMode.On);
        converter.converter(10);
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
