# <img src="matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge Home Assistant plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge?label=docker%20version&sort=semver)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge.svg)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-hass/actions/workflows/build-matterbridge-plugin.yml/badge.svg)
![CodeQL](https://github.com/Luligu/matterbridge-hass/actions/workflows/codeql.yml/badge.svg)
[![codecov](https://codecov.io/gh/Luligu/matterbridge-hass/branch/main/graph/badge.svg)](https://codecov.io/gh/Luligu/matterbridge-hass)

[![power by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![power by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![power by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

This plugin allows you to expose the Home Assistant devices and entities to Matter.

It is the ideal companion of the official [Matterbridge Home Assistant Add-on](https://github.com/Luligu/matterbridge-home-assistant-addon/blob/main/README.md).

Features:

- The plugin can be used with Matterbridge running in the Matterbridge Official Add-on or outside Home Assistant.
- The connection with Home Assistant is made throught WebSocket: so Matterbridge can be also in another network if the Home Assistant host is reachable.
- The connection with Home Assistant can be also made with ssl WebSocket (i.e. wss://homeassistant:8123). Self signed certificates are also supported.
- It is possible to filter entities and devices by Area.
- It is possible to filter entities and devices by Label.
- It is possible to select from a list the individual entities to include in the white or black list. Select by name, id or entity_id.
- It is possible to select from a list the devices to include in the white or black list. Select by name or id.
- It is possible to select from a list the entities to include in the device entity black list.
- It is possible to postfix the Matter device serialNumber or the Matter device name to avoid collision with other instances.

## Supported devices:

| Domain  | Supported states                     | Supported attributes                                                |
| ------- | ------------------------------------ | ------------------------------------------------------------------- |
| switch  | on, off                              |                                                                     |
| light   | on, off                              | brightness, color_mode, color_temp, hs_color, xy_color              |
| lock    | locked, locking, unlocking, unlocked |                                                                     |
| fan     | on, off                              | percentage, preset_mode                                             |
| cover   | open, closed, opening, closing       | current_position                                                    |
| climate | off, heat, cool, heat_cool           | temperature, current_temperature, target_temp_low, target_temp_high |

## Supported sensors:

| Domain        | Supported state class | Supported device class               | Unit                 | Matter device type  |
| ------------- | --------------------- | ------------------------------------ | -------------------- | ------------------- |
| sensor        | measurement           | temperature                          | °C, °F               | temperatureSensor   |
| sensor        | measurement           | humidity                             | %                    | humiditySensor      |
| sensor        | measurement           | pressure                             | inHg, hPa, kPa       | pressureSensor      |
| sensor        | measurement           | atmospheric_pressure                 | inHg, hPa, kPa       | pressureSensor      |
| sensor        | measurement           | illuminance                          | lx                   | lightSensor         |
| sensor        | measurement           | battery                              | %                    | powerSource         |
| sensor        | measurement           | voltage (battery)                    | mV                   | powerSource         |
| sensor        | measurement           | voltage                              | V                    | electricalSensor    |
| sensor        | measurement           | current                              | A                    | electricalSensor    |
| sensor        | measurement           | power                                | W                    | electricalSensor    |
| sensor        | measurement           | energy                               | kWh                  | electricalSensor    |
| sensor        | measurement           | aqi (1)                              | AQI (number or text) | airQualitySensor    |
| sensor        | measurement           | volatile_organic_compounds           | ppm (2)              | airQualitySensor    |
| sensor        | measurement           | carbon_dioxide                       | ppm (2)              | airQualitySensor    |
| sensor        | measurement           | carbon_monoxide                      | ppm (2)              | airQualitySensor    |
| sensor        | measurement           | nitrogen_dioxide                     | ugm3 (2)             | airQualitySensor    |
| sensor        | measurement           | ozone                                | ugm3 (2)             | airQualitySensor    |
| sensor        | measurement           | formaldehyde                         | ppm (2)              | airQualitySensor    |
| sensor        | measurement           | radon                                | ppm (2)              | airQualitySensor    |
| sensor        | measurement           | pm1                                  | ppm (2)              | airQualitySensor    |
| sensor        | measurement           | pm25                                 | ppm (2)              | airQualitySensor    |
| sensor        | measurement           | pm10                                 | ppm (2)              | airQualitySensor    |
| binary_sensor |                       | window, garage_door, door, vibration |                      | contactSensor       |
| binary_sensor |                       | motion, occupancy, presence          |                      | occupancySensor     |
| binary_sensor |                       | cold                                 |                      | waterFreezeDetector |
| binary_sensor |                       | moisture                             |                      | waterLeakDetector   |
| binary_sensor |                       | smoke                                |                      | smokeCoAlarm        |
| binary_sensor |                       | carbon_monoxide                      |                      | smokeCoAlarm        |
| binary_sensor |                       | battery                              |                      | powerSource         |

(1) - If the air quality entity is not standard (e.g. device class = aqi and unit AQI number or text), it is possible to set a regexp. See below.
(2) - On the controller side.

## Supported individual entities:

| Domain        | Category    |
| ------------- | ----------- |
| automation    | Automations |
| scene         | Scenes      |
| script        | Scripts     |
| input_boolean | Helpers     |
| input_button  | Helpers     |
| switch        | Template    |

These individual entities are exposed as on/off outlets. When the outlet is turned on, it triggers the associated entity. After triggering, the outlet automatically switches back to the off state. The helpers of domain input_boolean and the switch template maintain the on/off state.

> **Warning:** Since this plugin takes the devices from Home Assistant, it cannot be paired back to Home Assistant. This would lead to duplicate devices! If you run Matterbridge like a Home Assistant Add-on and also use other plugins to expose their devices to Home Assistant, then change to child bridge mode and pair the other plugins to Home Assistant and this plugin wherever you need it.

If you like this project and find it useful, please consider giving it a star on GitHub at https://github.com/Luligu/matterbridge-hass and sponsoring it.

<a href="https://www.buymeacoffee.com/luligugithub">
  <img src="bmc-button.svg" alt="Buy me a coffee" width="120">
</a>

## Prerequisites

### Matterbridge

Follow these steps to install or update Matterbridge if it is not already installed and up to date:

```
npm install -g matterbridge --omit=dev
```

on Linux and macOS you may need the necessary permissions:

```
sudo npm install -g matterbridge --omit=dev
```

See the complete guidelines on [Matterbridge](https://github.com/Luligu/matterbridge/blob/main/README.md) for more information.

## How to install the plugin

### With the frontend (preferred method)

Just open the frontend, select the matterbridge-hass plugin and click on install. If you are using Matterbridge with Docker (I suggest you do it), all plugins are already loaded in the container so you just need to select and add it.

### Without the frontend

On windows:

```
cd $HOME\Matterbridge
npm install -g matterbridge-hass --omit=dev
matterbridge -add matterbridge-hass
```

On linux or macOS:

```
cd ~/Matterbridge
sudo npm install -g matterbridge-hass --omit=dev
matterbridge -add matterbridge-hass
```

Then start Matterbridge from a terminal

```
matterbridge
```

## How to use it

There are 2 different source of Matter devices coming from matterbridge-hass plugin:

- Regular devices with their entities that use the main whiteList, blackList and deviceEntityBlackList.

You find them in Home Assistant at http://localhost:8123/config/devices/dashboard.

- Individual entities with domain scene, script, automation and input_boolean, input_button helpers, switch template that use the main whiteList, blackList.

You find these special entities in Home Assistant at http://localhost:8123/config/automation/dashboard, http://localhost:8123/config/scene/dashboard, http://localhost:8123/config/script/dashboard and http://localhost:8123/config/helpers.

You may need to set some config values in the frontend (wait that the plugin has been configured before changing the config):

I suggest to always use the filters by Area and Label or the whiteList adding each entity or device you want to expose to Matter.

If any device or entity creates issues put it in the blackList.

### host

Your Home Assistance address (eg. ws://homeassistant.local:8123 or ws://IP-ADDRESS:8123). You can also use the IP if it is stable. It is also possible to use ssl websocket (i.e. wss://). If you use selfsigned certificates you need to provide either the ca certificate or to unselect rejectUnauthorized. With normal certificates you don't need ca certificate and rejectUnauthorized should be selected.

### token

Home Assistant long term token used to connect to Home Assistant with WebSocket. Click on your user name in the bottom left corner of the Home Assistand frontend, then Security and create a Long-Lived Access Tokens.

### certificatePath

Fully qualified path to the SSL ca certificate file. This is only needed if you use a self-signed certificate and rejectUnauthorized is enabled.

### rejectUnauthorized

Ignore SSL certificate errors. It allows to connect to Home Assistant with self-signed certificates without providing the ca certificate.

### reconnectTimeout

Reconnect timeout in seconds.

### reconnectRetries

Number of times to try to reconnect before giving up.

### filterByArea

Filter devices and individual entities by area. If enabled, only devices and individual entities in the selected areas will be exposed. If disabled, all devices and individual entities will be exposed. This doesn't filter entities that belong to a device unless applyFiltersToDeviceEntities is set.

### filterByLabel

Filter devices and individual entities by label. If enabled, only devices and individual entities with the selected labels will be exposed. If disabled, all devices and individual entities will be exposed. This doesn't filter entities that belong to a device unless applyFiltersToDeviceEntities is set.

### applyFiltersToDeviceEntities

Apply the filters also to device entities. If enabled, the filters will be applied to device entities as well. If disabled, the filters will only be applied to devices and individual entities.

### whiteList

If the whiteList is defined only the devices and the individual entities included are exposed to Matter. Use the device/entity name or the device/entity id.

### blackList

If the blackList is defined the devices and the individual entities included will not be exposed to Matter. Use the device/entity name or the device/entity id.

### deviceEntityBlackList

List of entities not to be exposed for a single device. Enter in the first field the name of the device and in the second field add all the entity names you want to exclude for that device.

### airQualityRegex

Custom regex pattern to match air quality sensors that don't follow the standard naming convention.

**Examples:**

- For sensor entities ending with `_air_quality`: `^sensor\..*_air_quality$`
- For sensor entities containing `air_quality` anywhere: `^sensor\..*air_quality.*$`
- For a single specific entity: `sensor.air_quality_sensor` (exact entity ID)
- For two specific entities: `^(sensor\.kitchen_air_quality|sensor\.living_room_aqi)$`

If your setup has only one air quality sensor, you can simply put the exact entity ID here (e.g., `sensor.air_quality_sensor`) and it will match that specific entity.

### debug

Should be enabled only if you want to debug some issue using the log.
