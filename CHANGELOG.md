# <img src="matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge hass plugin changelog

All notable changes to this project will be documented in this file.

If you like this project and find it useful, please consider giving it a star on GitHub at https://github.com/Luligu/matterbridge-hass and sponsoring it.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="120">
</a>

### Roadmap to release 1.0.0

- ✅ add rock direction attributes to fan domain (https://github.com/Luligu/matterbridge-hass/issues/77)
- add fan cluster to climate domain or use AirConditioner for climate (Tamer). On hold for Google Home compatibility issue with AirConditioner.
- add vacuum domain
- add water heater domain
- ✅ add valve domain (Ludovic BOUÉ)
- ✅ add group helper (https://github.com/Luligu/matterbridge-hass/issues/75)
- ✅ support all single entities reusing the same code of the device entities
- ✅ add automatic 'merge' ability in MutableDevice: this will merge the entities that belongs to a single Matter device. Used for PowerSource, ElectricalSensor and AirQuality clusters.
- ✅ add automatic 'remap' ability in MutableDevice: this will remap to the main enpoint the not overlapping (the disambiguation matter rule) child endpoints from the device. Useful for Alexa users since Alexa is not able to deal with composed devices.
- add automatic 'split' ability in MutableDevice: this will add the overlapping child endpoints from the device like a single new device. Useful for Alexxa users since Alexa is not able to deal with composed devices. This should not be necessary but right now the taglist is not supported on any controller.

## [0.3.0] - 2025-08-26

### Breaking changes

With this release, all supported domains are available also in the single entities. This will bring in a lot of new Matter devices. I suggest to check carefully the whiteList and the blackList and also the log for duplicated names.

### Added

- [fan]: Added rock direction attributes to fan domain. Creates a complete fan with feature Rocking, AirflowDirection.
- [MutableDevice]: Added automatic 'remap' ability in MutableDevice: this remaps the not overlapping child endpoints to the device main endpoint. Useful for Alexa users since Alexa is not able to deal with composed devices. At the moment this is active for single entities. Soon will be extended to device entities where is more needed for Alexa users.
- [SingleEntities]: Added support in single entities for the domains supported in the device entities.
- [HomeAssistant]: Bumped HomeAssistant to v. 1.1.2.
- [MutableDevice]: Bumped MutableDevice to v. 1.3.0.
- [converters]: Bumped converters to v. 1.1.2.
- [binary_sensor]: Added addBinarySensorEntity function to handle binary_sensor domain in single entities and device entities.
- [sensor]: Added addSensorEntity function to handle sensor domain in single entities and device entities.
- [control]: Added addControlEntity function to handle all core domains in single entities and device entities.
- [valve]: Added valve domain.
- [platform]: Bumped HomeAssistantPlatform to v. 1.3.0.

### Changed

- [package]: Updated dependencies.
- [package]: Requires matterbridge 3.2.3.
- [package]: Automator: update package v. 2.0.4.
- [devContainer]: Updated devContainer with repository name for the container and shallow clone matterbridge for speed and memory optimization.

### Fixed

- [domain]: Unsupported domain entities are no more in the select.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.2.1] - 2025-07-26

### Breaking changes

- [helpers]: All single entities are no more composed devices. This helps the controllers that have issues with composed devices (i.e. Alexa).

### Added

- [airquality]: Refactor the airQuality converter to allow conversion from numbers in the range 0-500 and strings like 'good', 'fair' etc.

### Changed

- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.2.0] - 2025-07-14

### Breaking changes

- [helpers]: All single entities are no more composed devices. This helps the controllers that have issues with composed devices (i.e. Alexa).

### Added

- [platform]: Added the ability to merge HA entities in a single Matter device.
- [temperature]: Added conversion from Fahrenheit to Celsius on single entity state for domain climate.
- [pressure]: Added conversion from kPa and inHg to hPa.
- [sensor]: Added domain sensor with deviceClass 'voltage' unit 'mV'. It sets the battery voltage of the Power Source cluster.
- [sensor]: Added domain sensor with deviceClass 'voltage' unit 'V'. It sets the voltage of the Electrical Sensor cluster.
- [sensor]: Added domain sensor with deviceClass 'current' unit 'A'. It sets the activeCurrent of the Electrical Sensor cluster.
- [sensor]: Added domain sensor with deviceClass 'power' unit 'W'. It sets the activePower of the Electrical Sensor cluster.
- [sensor]: Added domain sensor with deviceClass 'energy' unit 'kWh'. It sets the energy of the Electrical Sensor cluster.
- [sensor]: Added domain sensor with deviceClass 'aqi' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'volatile_organic_compounds' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'carbon_dioxide' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'carbon_monoxide' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'nitrogen_dioxide' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'ozone' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'formaldehyde' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'radon' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'pm1' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'pm25' for the Air Quality clusters.
- [sensor]: Added domain sensor with deviceClass 'pm10' for the Air Quality clusters.
- [airquality]: Added airQualityRegex to the config to match not standard air quality sensors entities (e.g., '^sensor\..\*\_air_quality$'). See the README.md.

### Changed

- [package]: Updated dependencies.
- [storage]: Bumped `MutableDevice` to 1.2.3.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.1.5] - 2025-07-07

### Added

- [converters]: Added endpoint to sensor and binary_sensor converters to merge HA entities.
- [platform]: Add subscribeHandler.
- [platform]: Refactor commandHandler with new Matterbridge API.
- [temperature]: Added conversion from Fahrenheit to Celsius on single entity state for domain sensor and device class temperature.

### Changed

- [PowerSource]: Moved PowerSource cluster to the main endpoint.
- [package]: Updated dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.1.4] - 2025-06-28

### Added

- [homeassistant]: Added HassLabel.
- [homeassistant]: Added core_config_updated message handler to fetch the new config.
- [homeassistant]: Add queue for fetching updates.
- [config]: Added applyFiltersToDeviceEntities option to schema.
- [config]: Improved filtering logic for label. Now is possible to use the label id or the label name in the label filter.
- [DevContainer]: Added support for the [**Matterbridge Plugin Dev Container**](https://github.com/Luligu/matterbridge/blob/dev/README-DEV.md#matterbridge-plugin-dev-container) with optimized named volumes for `matterbridge` and `node_modules`.
- [GitHub]: Added GitHub issue templates for bug reports and feature requests.
- [ESLint]: Refactored the flat config.
- [ESLint]: Added the plugins `eslint-plugin-promise`, `eslint-plugin-jsdoc`, and `@vitest/eslint-plugin`.
- [Jest]: Refactored the flat config.
- [Vitest]: Added Vitest for TypeScript project testing. It will replace Jest, which does not work correctly with ESM module mocks.
- [JSDoc]: Added missing JSDoc comments, including `@param` and `@returns` tags.
- [CodeQL]: Added CodeQL badge in the readme.
- [Codecov]: Added Codecov badge in the readme.

### Changed

- [package]: Updated package to Automator v. 2.0.1.
- [package]: Update dependencies.
- [storage]: Bumped `node-storage-manager` to 2.0.0.
- [logger]: Bumped `node-ansi-logger` to 3.1.1.
- [package]: Requires matterbridge 3.1.0.
- [worflows]: Removed workflows running on node 18 since it reached the end-of-life in April 2025.

### Fixed

- [state]: Fix state update when both old and new state are unavailable.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.1.3] - 2025-06-13

### Added

- [binary_sensor]: Added domain binary_sensor with deviceClass 'presence'. It creates an occupancySensor with OccupancySensing cluster.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'carbon_monoxide'. It creates a smokeCoAlarm with SmokeCoAlarm cluster and feature CoAlarm.
- [sensor]: Added domain sensor with deviceClass 'atmospheric_pressure'. It creates a pressureSensor with PressureMeasurement cluster.
- [sensor]: Added domain sensor with deviceClass 'battery'. It creates a powerSource with PowerSource cluster.
- [binary_sensor]: Added domain sensor with deviceClass 'battery'. It creates a powerSource with PowerSource cluster.

### Changed

- [package]: Update package.
- [package]: Update dependencies.

### Fixed

- [select]: Fixed ghost devices in the Device Home page.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.1.2] - 2025-06-07

### Added

- [homeassistant]: Typed HassWebSocketResponses and HassWebSocketRequests.
- [homeassistant]: Added subscribe() and Jest test.
- [homeassistant]: Added unsubscribe() and Jest test.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'garage_door'. It creates a contactSensor with BooleanState cluster.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'window'. It creates a contactSensor with BooleanState cluster.
- [jest]: Added real Jest test to test the HomeAssistant api with a real Home Assistant setup.

### Changed

- [config]: Enhanced reconnect config description and set minimum value to 30 secs for reconnectTimeout.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.1.1] - 2025-06-04

### Added

- [binary_sensor]: Added domain binary_sensor with deviceClass 'smoke'. It creates a smokeCoAlarm with SmokeCoAlarm cluster and feature SmokeAlarm.

### Changed

- [readme]: Updated readme for clarity.
- [package]: Update package.
- [package]: Update dependencies.

### Fixed

- [reconnect]: Added missed call to fetchData and subscribe on reconnect.
- [startup]: Added the value from state for BooleanState cluster to avoid controller alarms.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.1.0] - 2025-06-02

### Added

- [npm]: The dev of matterbridge-hass is published with tag **dev** on **npm** each day at 00:00 UTC if there is a new commit.
- [input_button]: Added domain input_button for individual entities.
- [switch]: Added domain switch for template individual entities.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'door'. It creates a contactSensor with BooleanState cluster.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'vibration'. It creates a contactSensor with BooleanState cluster.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'motion'. It creates an occupancySensor with OccupancySensing cluster.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'occupancy'. It creates an occupancySensor with OccupancySensing cluster.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'cold'. It creates a waterFreezeDetector with BooleanState cluster.
- [binary_sensor]: Added domain binary_sensor with deviceClass 'moisture'. It creates a waterLeakDetector with BooleanState cluster.
- [online]: Added online / offline setting based on unavailable state.
- [filterByArea]: Added filter of individual entities and devices by Area.
- [filterByLabel]: Added filter of individual entities and devices by Label.
- [HomeAssistant]: Bump HomeAssistant class to v. 1.0.2. Fully async and promise based.

### Changed

- [update]: Skip attributes update when state is off. Provisional!
- [config]: Removed individualEntityWhiteList and individualEntityBlackList. Use the normal white and black lists.
- [config]: Changed serialPostfix to postfix.

### Fixed

- [colorControl]: Fixed possibly missed attributes in the cluster creation (#39).

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.11] - 2025-05-29

### Added

- [homeassistant]: Updated interfaces for Entities and States.
- [homeassistant]: Updated Jest tests.
- [areas]: Added HassArea interface and fetch areas.
- [reconnectRetries]: Added reconnectRetries in the config.
- [ssl]: Added the possibility to use ssl WebSocket connection to Home Assistant (i.e. wss://homeassistant:8123).
- [ssl]: Added certificatePath to the config: enter the fully qualified path to the SSL ca certificate file. This is only needed if you use a self-signed certificate and rejectUnauthorized is enabled.
- [ssl]: Added rejectUnauthorized to the config: it ignores SSL certificate validation errors if enabled. It allows to connect to Home Assistant with self-signed certificates.

### Changed

- [package]: Update package.
- [package]: Update dependencies.
- [package]: Requires matterbridge 3.0.4.
- [platform]: Changed the timeout of the first connection to 30 seconds.

### Fixed

- [reconnect]: Fixed reconnection loop. Now when Home Assistant reboots, the connection is reeastablished correctly if reconnectTimeout and/or reconnectRetries are enabled.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.10] - 2025-04-04

### Added

- [select]: Added calls to select API.

### Changed

- [package]: Update package.
- [package]: Update dependencies.
- [package]: Requires matterbridge 2.2.6.

### Fixed

- [device]: Fixed case where current_temperature is not available on thermostats.
- [device]: Fixed case with device name empty.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.9] - 2025-02-07

### Added

- [hass]: Added support for helpers with domain input_boolean.
- [plugin]: Added check for duplicated device and individual entity names.

### Changed

- [package]: Updated dependencies.
- [package]: Requires matterbridge 2.1.4.

### Fixed

- [cover]: Fixed state closed on domain cover.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.8] - 2025-02-02

### Added

- [config]: Added uniqueItems flag to the lists.
- [readme]: Clarified in the README the difference between single entities and device entities.

### Changed

- [package]: Update package.
- [package]: Update dependencies.
- [package]: Requires matterbridge 2.1.0.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.7] - 2025-01-08

### Added

- [selectDevice]: Added selectDevice to get the device names from a list in the config editor.
- [selectDevice]: Added selectEntity to get the entity names from a list in the config editor (requires matterbridge >= 1.7.2).
- [config]: Added the possibility to validate individual entity in the white and black list by entity_id.
- [config]: Added the possibility to postfix also the Matter device name to avoid collision with other instances.
- [package]: Requires matterbridge 1.7.1.

### Changed

- [package]: Update dependencies.

### Fixed

- [config]: Fix the Matter serial number postfix.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.6] - 2024-12-24

### Added

- [entity]: Added individual entity of domain automation, scene and script.
- [config]: Added individual entity white and black list.

### Changed

- [package]: Update package.
- [package]: Update dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.5] - 2024-12-16

### Added

- [package]: Verified to work with Matterbridege edge.
- [package]: Jest coverage 91%.
- [homeassistant]: Added Jest test.

### Changed

- [package]: Requires Matterbridege 1.6.6.
- [package]: Update dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.4] - 2024-12-12

### Added

- [homeassistant]: Add the possibility to white and black list a device with its name or its device id.
- [homeassistant]: Add the possibility to black list one or more device entities with their entity id globally or on a device base.
- [homeassistant]: Add sensor domain with temperature, humidity, pressure and illuminance.

### Changed

- [package]: Requires Matterbridege 1.6.6.
- [package]: Update dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.3] - 2024-12-07

### Added

- [climate]: Add state heat_cool and attributes target_temp_low target_temp_high to domain climate.

### Changed

- [homeassistant]: Changed to debug the log of processing event.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.2] - 2024-12-06

### Added

- [climate]: Add domain climate.

### Changed

- [fan]: Update domain fan.
- [command]: Jest on hassCommandConverter.
- [command]: Refactor hassCommandConverter.
- [homeassistant]: Refactor HomeAssistant.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.1-dev.6] - 2024-12-05

### Added

- [homeassistant]: Add event processing for device_registry_updated and entity_registry_updated.
- [homeassistant]: Refactor validateDeviceWhiteBlackList and added validateEntityBlackList.
- [homeassistant]: Add reconnectTimeout configuration.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.1-dev.5] - 2024-12-05

### Added

- [homeassistant]: Add cover domain to supported devices.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.1-dev.4] - 2024-12-04

### Changed

- [homeassistant]: Change reconnect timeout to 60 seconds.
- [homeassistant]: Add callServiceAsync and reconnect timeout.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

## [0.0.1-dev.2] - 2024-12-03

First published release.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="80">
</a>

<!-- Commented out section
## [1.1.2] - 2024-03-08

### Added

- [Feature 1]: Description of the feature.
- [Feature 2]: Description of the feature.

### Changed

- [Feature 3]: Description of the change.
- [Feature 4]: Description of the change.

### Deprecated

- [Feature 5]: Description of the deprecation.

### Removed

- [Feature 6]: Description of the removal.

### Fixed

- [Bug 1]: Description of the bug fix.
- [Bug 2]: Description of the bug fix.

### Security

- [Security 1]: Description of the security improvement.
-->
