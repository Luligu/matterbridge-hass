# <img src="https://github.com/Luligu/matterbridge/blob/main/frontend/public/matterbridge%2064x64.png" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge Home Assistant plugin

[![npm version](https://img.shields.io/npm/v/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-hass.svg)](https://www.npmjs.com/package/matterbridge-hass)
[![Docker Version](https://img.shields.io/docker/v/luligu/matterbridge?label=docker%20version&sort=semver)](https://hub.docker.com/r/luligu/matterbridge)
[![Docker Pulls](https://img.shields.io/docker/pulls/luligu/matterbridge.svg)](https://hub.docker.com/r/luligu/matterbridge)
![Node.js CI](https://github.com/Luligu/matterbridge-hass/actions/workflows/build-matterbridge-plugin.yml/badge.svg)

[![power by](https://img.shields.io/badge/powered%20by-matterbridge-blue)](https://www.npmjs.com/package/matterbridge)
[![power by](https://img.shields.io/badge/powered%20by-node--ansi--logger-blue)](https://www.npmjs.com/package/node-ansi-logger)
[![power by](https://img.shields.io/badge/powered%20by-node--persist--manager-blue)](https://www.npmjs.com/package/node-persist-manager)

---

Work in progress, this release is still at development stage!

This plugin allows you to expose the Home Assistant devices to Matter.

Features:

- the plugin can run with Matterbridge running in the Matterbridge Official Add-on or outside Home Assistant.
- the connection with Home Assistant is made throught WebSocket: so Matterbridge can be also in another network if the Home Assistant host is reachable.

Supported devices:

- switch (with state on/off)
- light (with state on/off and attributes brightness/color_mode/color_temp/hs_color/xy_color)
- lock (with state locked/locking/unlocking/unlocked)
- fan (with state on/off and attributes percentage/preset_mode)

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

You may need to set some config values in the frontend (wait that the plugin has been configured before changing the config):

### host

Your Home Assistance address (eg. http://homeassistant.local:8123 or http://IP-ADDRESS:8123).

### token

Home Assistant long term token used to connect to Home Assistant with WebSocket. Click on your user name in the bottom left corner, Security and create a Long-Lived Access Tokens.

### debug

Should be enabled only if you want to debug some issue using the log.

### unregisterOnShutdown

Should be enabled only if you want to remove the devices from the controllers on shutdown.
