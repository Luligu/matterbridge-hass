# <img src="https://github.com/Luligu/matterbridge/blob/main/frontend/public/matterbridge%2064x64.png" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge hass plugin changelog

All notable changes to this project will be documented in this file.

If you like this project and find it useful, please consider giving it a star on GitHub at https://github.com/Luligu/matterbridge-hass and sponsoring it.

## [0.0.6] - 2024-12-24

### Added

- [entity]: Added individual entity of domain automation, scene and script.
- [config]: Added individual entity white and black list.

### Changed

- [package]: Update package.
- [package]: Update dependencies.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
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
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
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
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [0.0.3] - 2024-12-07

### Added

- [climate]: Add state heat_cool and attributes target_temp_low target_temp_high to domain climate.

### Changed

- [homeassistant]: Changed to debug the log of processing event.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
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
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [0.0.1-dev.6] - 2024-12-05

### Added

- [homeassistant]: Add event processing for device_registry_updated and entity_registry_updated.
- [homeassistant]: Refactor validateDeviceWhiteBlackList and added validateEntityBlackList.
- [homeassistant]: Add reconnectTimeout configuration.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [0.0.1-dev.5] - 2024-12-05

### Added

- [homeassistant]: Add cover domain to supported devices.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [0.0.1-dev.4] - 2024-12-04

### Changed

- [homeassistant]: Change reconnect timeout to 60 seconds.
- [homeassistant]: Add callServiceAsync and reconnect timeout.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
</a>

## [0.0.1-dev.2] - 2024-12-03

First published release.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="./yellow-button.png" alt="Buy me a coffee" width="120">
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
