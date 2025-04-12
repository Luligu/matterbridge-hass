# <img src="matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge Home Assistant plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge?label=docker%20version&sort=semver)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge.svg)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-hass/actions/workflows/build-matterbridge-plugin.yml/badge.svg)

[![power by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![power by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![power by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

This plugin allows you to expose the Home Assistant devices and entities to Matter.

It is the ideal companion of the official [Matterbridge Home Assistant Add-on](https://github.com/Luligu/matterbridge-home-assistant-addon/blob/main/README.md).

Features:

- The plugin can be used with Matterbridge running in the Matterbridge Official Add-on or outside Home Assistant.
- The connection with Home Assistant is made throught WebSocket: so Matterbridge can be also in another network if the Home Assistant host is reachable.
- It is possible to select from a list the devices to include in the device white or black list.
- It is possible to select from a list the entities to include in the entity white or black list.
- It is possible to postfix the Matter device serialNumber or name to avoid collision with other instances.

Supported devices:

- switch (with state on/off)

- light (with state on/off and attributes brightness/color_mode/color_temp/hs_color/xy_color)

- lock (with state locked/locking/unlocking/unlocked)

- fan (with state on/off and attributes percentage/preset_mode)

- cover (with state open/closed/opening/closing and attribute current_position)

- climate (with state off/heat/cool/heat_cool and attribute temperature/current_temperature/target_temp_low/target_temp_high)

- sensor (with deviceClass temperature/humidity/pressure/illuminance)

Supported individual entities:

- automation

- scene

- script

- helpers of domain input_boolean

These entities are exposed as on/off outlets. When the outlet is turned on, it triggers the associated automation, scene, or script. After triggering, the outlet automatically switches back to the off state. The helpers of domain input_boolean maintain the on / off state.

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

on Linux you may need the necessary permissions:

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

On linux:

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

- Regular devices with their entities that use the main whiteList, blackList, entityBlackList and deviceEntityBlackList.

You find them in Home Assistant at http://localhost:8123/config/devices/dashboard.

- Individual entities with domain scene, script, automation and input_boolean that use individualEntityWhiteList and individualEntityBlackList.

You find these special entities in Home Assistant at http://localhost:8123/config/automation/dashboard, http://localhost:8123/config/scene/dashboard, http://localhost:8123/config/script/dashboard and http://localhost:8123/config/helpers.

You may need to set some config values in the frontend (wait that the plugin has been configured before changing the config):

I suggest to always use the whiteList and individualEntityWhiteList adding each device you want to expose to Matter.

If any device or individual entity creates issues put it in the blackList or in the individualEntityBlackList.

### host

Your Home Assistance address (eg. ws://homeassistant.local:8123 or ws://IP-ADDRESS:8123). It is better to use the IP if it is stable.

### token

Home Assistant long term token used to connect to Home Assistant with WebSocket. Click on your user name in the bottom left corner of the Home Assistand frontend, then Security and create a Long-Lived Access Tokens.

### individualEntityWhiteList

White list of individual entities without associated device to be exposed. It allows to expose scenes, scripts, automations and input_boolean.
Enter the entity_id (i.e. automation.turn_off_all_switches) or the entity name (i.e. Turn off all switches).

### individualEntityBlackList

Black list of individual entities without associated device to be exposed. It allows to expose scenes, scripts, automations.
Enter the entity_id (i.e. automation.turn_off_all_switches) or the entity name (i.e. Turn off all switches).

### whiteList

If the whiteList is defined only the devices included are exposed to Matter. Use the device name or the device id.

### blackList

If the blackList is defined the devices included will not be exposed to Matter. Use the device name or the device id.

### entityBlackList

The entities in the list will not be exposed for all devices. Use the entity name. This doesn't concern the individual entities.

### deviceEntityBlackList

List of entities not to be exposed for a single device. Enter in the first field the name of the device and in the second field add all the entity names you want to exclude for that device.

### debug

Should be enabled only if you want to debug some issue using the log.

### unregisterOnShutdown

Should be enabled only if you want to remove the devices from the controllers on shutdown.
