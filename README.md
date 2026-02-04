# <img src="https://matterbridge.io/assets/matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge Home Assistant plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge/latest?label=docker%20version)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge?label=docker%20pulls)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-hass/actions/workflows/build.yml/badge.svg)
![CodeQL](https://github.com/Luligu/matterbridge-hass/actions/workflows/codeql.yml/badge.svg)
[![codecov](https://codecov.io/gh/Luligu/matterbridge-hass/branch/main/graph/badge.svg)](https://codecov.io/gh/Luligu/matterbridge-hass)
[![styled with prettier](https://img.shields.io/badge/styled_with-Prettier-f8bc45.svg?logo=prettier)](https://github.com/prettier/prettier)
[![linted with eslint](https://img.shields.io/badge/linted_with-ES_Lint-4B32C3.svg?logo=eslint)](https://github.com/eslint/eslint)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ESM](https://img.shields.io/badge/ESM-Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/api/esm.html)
[![matterbridge.io](https://img.shields.io/badge/matterbridge.io-online-brightgreen)](https://matterbridge.io)

[![powered by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![powered by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![powered by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

This plugin allows you to expose the Home Assistant devices and individual entities to Matter.

It is the ideal companion of the official [Matterbridge Home Assistant Add-on](https://github.com/Luligu/matterbridge-home-assistant-addon/blob/main/README.md).

Features:

- The plugin can be used with Matterbridge running in the Matterbridge Official Add-on or outside Home Assistant.
- The state of the Home Assistant core is checked before starting. The plugin waits for the core to be `RUNNING`.
- The connection with Home Assistant is made throught WebSocket: so Matterbridge can be also in another network if the Home Assistant host is reachable.
- The connection with Home Assistant can be also made with ssl WebSocket (i.e. wss://homeassistant:8123). Self signed certificates are also supported.
- It is possible to filter entities and devices by Area.
- It is possible to filter entities and devices by Label.
- It is possible to select from a list the individual entities to include in the white or black list. Select by name, id or entity_id.
- It is possible to select from a list the devices to include in the white or black list. Select by name or id.
- It is possible to select from a list the entities to include in the device entity black list.
- It is possible to pickup from a list the split entities.
- It is possible to postfix the Matter device serialNumber and the Matter device name to avoid collision with other instances.
- Support **Apple Home Adaptive Lighting**. See https://github.com/Luligu/matterbridge/discussions/390.
- Support **transition time**.
- Support system unit **CELSIUS** and **FAHRENHEIT**.
- Jest test coverage = 100%.

## Supported device entities:

| Domain     | Supported states                          | Supported attributes                                                                    |
| ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| switch     | on, off                                   |                                                                                         |
| light      | on, off                                   | brightness, color_mode, color_temp, hs_color, xy_color                                  |
| lock       | locked, locking, unlocking, unlocked      |                                                                                         |
| fan        | on, off                                   | percentage, preset_mode (1), direction, oscillating                                     |
| cover      | open, closed, opening, closing            | current_position                                                                        |
| climate    | off, heat, cool, heat_cool, auto          | current_temperature, temperature, target_temp_low, target_temp_high, min_temp, max_temp |
| valve      | open, closed, opening, closing            | current_position                                                                        |
| vacuum (2) | idle, cleaning, paused, docked, returning |                                                                                         |

(1) - Supported preset_modes: auto, low, medium, high.

(2) - The Apple Home crashes if the Rvc is inside the bridge. If you pair with Apple Home use the server mode in the config.

These domains are supported also like individual and split entities.

## Supported individual entities:

| Domain        | Category    |
| ------------- | ----------- |
| automation    | Automations |
| scene         | Scenes      |
| script        | Scripts     |
| input_boolean | Helpers     |
| input_button  | Helpers     |

These individual entities are exposed as on/off outlets. When the outlet is turned on, it triggers the associated entity. After triggering, the outlet automatically switches back to the off state. The helper of domain input_boolean maintains the on/off state.

## Supported sensors:

| Domain | Supported state class | Supported device class     | Unit           | Matter device type |
| ------ | --------------------- | -------------------------- | -------------- | ------------------ |
| sensor | measurement           | temperature                | °C, °F         | temperatureSensor  |
| sensor | measurement           | humidity                   | %              | humiditySensor     |
| sensor | measurement           | pressure                   | inHg, hPa, kPa | pressureSensor     |
| sensor | measurement           | atmospheric_pressure       | inHg, hPa, kPa | pressureSensor     |
| sensor | measurement           | illuminance                | lx             | lightSensor        |
| sensor | measurement           | battery (3)                | %              | powerSource        |
| sensor | measurement           | voltage (battery) (3)      | mV             | powerSource        |
| sensor | measurement           | voltage                    | V              | electricalSensor   |
| sensor | measurement           | current                    | A              | electricalSensor   |
| sensor | measurement           | power                      | W              | electricalSensor   |
| sensor | measurement           | energy                     | kWh            | electricalSensor   |
| sensor | measurement           | aqi (1)                    |                | airQualitySensor   |
| sensor | measurement           | volatile_organic_compounds | ugm3 (2)       | airQualitySensor   |
| sensor | measurement           | carbon_dioxide             | ppm (2)        | airQualitySensor   |
| sensor | measurement           | carbon_monoxide            | ppm (2)        | airQualitySensor   |
| sensor | measurement           | nitrogen_dioxide           | ugm3 (2)       | airQualitySensor   |
| sensor | measurement           | ozone                      | ugm3 (2)       | airQualitySensor   |
| sensor | measurement           | formaldehyde               | mgm3 (2)       | airQualitySensor   |
| sensor | measurement           | radon                      | bqm3 (2)       | airQualitySensor   |
| sensor | measurement           | pm1                        | ugm3 (2)       | airQualitySensor   |
| sensor | measurement           | pm25                       | ugm3 (2)       | airQualitySensor   |
| sensor | measurement           | pm10                       | ugm3 (2)       | airQualitySensor   |

(1) - If the air quality entity is not standard (e.g. state class = measurement, device class = aqi and state number range 0-500), it is possible to set a regexp. See below.

(2) - On the controller side.

(3) - Must be an entity that belongs to a device. Battery alone is not a device in Matter.

## Supported binary_sensors:

| Domain        | Supported device class               | Matter device type  |
| ------------- | ------------------------------------ | ------------------- |
| binary_sensor | window, garage_door, door, vibration | contactSensor       |
| binary_sensor | motion, occupancy, presence          | occupancySensor     |
| binary_sensor | cold                                 | waterFreezeDetector |
| binary_sensor | moisture                             | waterLeakDetector   |
| binary_sensor | smoke                                | smokeCoAlarm        |
| binary_sensor | carbon_monoxide                      | smokeCoAlarm        |
| binary_sensor | battery                              | powerSource         |

## Supported events:

| Domain | Supported events                                         | Matter device type |
| ------ | -------------------------------------------------------- | ------------------ |
| event  | single, single_push, press, initial_press, multi_press_1 | genericSwitch      |
| event  | double, double_press, double_push, multi_press_2         | genericSwitch      |
| event  | long, long_push, long_press, hold_press                  | genericSwitch      |

If any commonly used integration use other useful events, let me know please.

### Naming issues explained

For the naming issues (expecially upsetting with Alexa) read the explanation and the three possible actual solutions [here](https://github.com/Luligu/matterbridge-hass/discussions/86).

### Usage warning

> **Warning:** Since this plugin takes the devices from Home Assistant, it cannot be paired back to Home Assistant. This would lead to duplicate devices! If you run Matterbridge like a Home Assistant Add-on and also use other plugins to expose their devices to Home Assistant, then change to child bridge mode and pair the other plugins to Home Assistant and this plugin wherever you need it.

## Sponsoring

If you like this project and find it useful, please consider giving it a **star** on GitHub at https://github.com/Luligu/matterbridge-hass and **sponsoring** it.

<a href="https://www.buymeacoffee.com/luligugithub"><img src="https://matterbridge.io/assets/bmc-button.svg" alt="Buy me a coffee" width="120"></a>

## Prerequisites

### Matterbridge

See the complete guidelines on [Matterbridge](https://github.com/Luligu/matterbridge/blob/main/README.md) for more information.

## How to install the plugin

Just open the frontend, select the matterbridge-hass plugin and click on install. If you are using Matterbridge with `Docker`, all plugins are already loaded in the container so you just need to select the matterbridge-hass plugin and add it. If you are using Matterbridge with the `Matterbridge Home Assistant Add-on`, you need to install the matterbridge-hass plugin.

## How to use it

There are 2 different source of Matter devices coming from matterbridge-hass plugin:

- Regular devices with their entities that use the main whiteList, blackList and deviceEntityBlackList.

You find them in Home Assistant at http://localhost:8123/config/devices/dashboard.

- Individual entities with domain scene, script, automation.

You find these special entities in Home Assistant at http://localhost:8123/config/automation/dashboard, http://localhost:8123/config/scene/dashboard and http://localhost:8123/config/script/dashboard.

- Individual entities (helpers) with domain input_boolean, input_button.

You find these special entities in Home Assistant at http://localhost:8123/config/helpers.

- Individual entities from template.

You find these special entities in Home Assistant at http://localhost:8123/config/helpers.

All the individual entities use the main whiteList, blackList.

Since the release 0.4.0 it is also possible to pickup any device entity and split ("decompose") it to make it an independent Matter device.

## Config

You may need to set some config values in the frontend (wait that the plugin has been configured before changing the config):

I suggest to always use the filters by Area and Label or the whiteList adding each entity or device you want to expose to Matter.

If any device or entity creates issues put it in the blackList.

### host

Your Home Assistance address (eg. ws://homeassistant.local:8123 or ws://IP-ADDRESS:8123). Use the IP only if it is stable. It is also possible to use ssl websocket (i.e. wss://). If you use selfsigned certificates you need to provide either the ca certificate or to unselect rejectUnauthorized. With normal certificates you don't need ca certificate and rejectUnauthorized should be selected.

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

Filter devices and individual entities by area. If enabled, only devices and individual entities in the selected areas will be exposed. If disabled, all devices and individual entities will be exposed. This doesn't filter entities that belong to a device unless applyFiltersToDeviceEntities is set (in this case also the device needs to belong to this area).

### filterByLabel

Filter devices and individual entities by label. If enabled, only devices and individual entities with the selected labels will be exposed. If disabled, all devices and individual entities will be exposed. This doesn't filter entities that belong to a device unless applyFiltersToDeviceEntities is set is set (in this case also the device must have this label).

### applyFiltersToDeviceEntities

Apply the filters also to device entities. If enabled, the filters will be applied to device entities as well (both the device and its entities needs to have the area and label set in the filter). If disabled, the filters will only be applied to devices (all the device entities will be included) and individual entities.

### whiteList

If the whiteList is defined only the devices and the individual and split entities included are exposed to Matter. Use the device/entity name or the device/entity id.

### blackList

If the blackList is defined the devices and the individual and split entities included will not be exposed to Matter. Use the device/entity name or the device/entity id.

### deviceEntityBlackList

List of entities not to be exposed for a single device. Enter in the first field the name of the device and in the second field add all the entity names you want to exclude for that device.

### splitEntities

The device entities in the list will be exposed like an independent device and removed from their device. Use the entity id (i.e. switch.plug_child_lock).

Let's make an example.

Suppose we have a device named "Computer plug" with 3 entities:

- id switch.computer_plug named "Computer plug Power" that is the main Power for the plug
- id switch.computer_plug_child_lock named "Computer plug Child lock" that is the child lock for the plug
- id temperature.computer_plug named "Computer plug Device temperature" that is the device temperature (very used in the zigbee world)

Without further setup, the controller will show 2 switch with the same name (difficult to distinguish them). Alexa will show 3 devices "Computer plug", "First plug" and "Second plug".

Solution:

- add switch.computer_plug_child_lock (use entity_id) to splitEntities and restart.
- if you use the whiteList, select your switch.computer_plug_child_lock (will show up with the entity name "Computer plug Child lock") and restart.

In this way, the controller will show one switch with name "Computer plug" and a second with name "Computer plug Child lock".

If you don't need the device temperature, just add it to deviceEntityBlackList.

If you want a more technical explanation for the naming issues (expecially upsetting with Alexa) read the explanation [here](https://github.com/Luligu/matterbridge-hass/discussions/86).

**Adding an entity to splitEntities doesn't automatically add it to the whiteList so it has to be added manually if you use whiteList.**

**If you enable the filters (area and label) also the split entity must sattisfy the filter criteria**

### airQualityRegex

Custom regex pattern to match air quality sensors that don't follow the standard Air Quality entity sensor.

**Examples:**

- For sensor entities ending with `_air_quality`: `^sensor\..*_air_quality$`.
- For sensor entities containing `air_quality` anywhere: `^sensor\..*air_quality.*$`.
- For a single specific entity: `sensor.air_quality_sensor` (exact entity ID).
- For two specific entities: `^(sensor\.kitchen_air_quality|sensor\.living_room_aqi)$`.

If your setup has only one air quality sensor, you can simply put the exact entity ID here (e.g., `sensor.air_quality_sensor`) and it will match that specific entity.

### enableServerRvc

Enable the Robot Vacuum Cleaner in server mode. Apple Home will crash unless you use this mode! Don't try it with Apple Home cause the bridge will become unstable even if you remove it after.

In addition to this well known bugs, the rvc must be a single device, it cannot have any other device types like switch or whatever. So if your integration adds any other device types, blacklist them.

### debug

Should be enabled only if you want to debug some issue using the log.
