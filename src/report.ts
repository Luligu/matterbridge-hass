/**
 * @description This file contains the Home Assistant report helper.
 * @file src\report.ts
 * @author Luca Liguori
 * @created 2026-04-05
 * @version 1.0.0
 * @license Apache-2.0
 * @copyright 2026, 2027, 2028 Luca Liguori.
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

import fs from 'node:fs';
import path from 'node:path';

import { isHidden, isIndividualEntity, isSplitEntity } from './helpers.js';
import type { HomeAssistantPlatform } from './module.js';

/**
 * Returns the LONGNAME suffix when the provided name exceeds Matter's limit.
 *
 * @param {string | null | undefined} name - The name to check.
 * @returns {string} The LONGNAME suffix or an empty string.
 */
function getLongNameSuffix(name: string | null | undefined): string {
  return (name ?? '').length > 32 ? ' LONGNAME' : '';
}

/**
 * Formats the configured filter value and its resolved Home Assistant identifier.
 *
 * @param {string} name - The configured filter name.
 * @param {string | undefined} id - The resolved Home Assistant identifier.
 * @returns {string} The rendered filter value.
 */
function getFilterValue(name: string, id: string | undefined): string {
  return name ? `${name} >>> ${id}` : 'None';
}

/**
 * Creates the Home Assistant devices and entities report content.
 *
 * @param {HomeAssistantReportPlatform} platform - The Home Assistant platform data.
 * @returns {string} The report content.
 */
export function createReport(platform: HomeAssistantPlatform): string {
  const areaId = Array.from(platform.ha.hassAreas.values()).find((area) => area.name === platform.config.filterByArea)?.area_id;
  const labelId = Array.from(platform.ha.hassLabels.values()).find((label) => label.name === platform.config.filterByLabel)?.label_id;
  const entities = Array.from(platform.ha.hassEntities.values());
  const lines = [
    'Home Assistant Devices and Entities Report',
    '',
    `Filter by area: ${getFilterValue(platform.config.filterByArea, areaId)}`,
    '',
    `Filter by label: ${getFilterValue(platform.config.filterByLabel, labelId)}`,
    '',
    'Device Entities',
    '',
  ];

  for (const device of platform.ha.hassDevices.values()) {
    const deviceName = device.name_by_user ?? device.name;
    lines.push(
      `Device: "${deviceName}"` +
        `${getLongNameSuffix(deviceName)}` +
        `${device.entry_type === 'service' ? ' SERVICE' : ''}` +
        `${areaId && device.area_id === areaId ? ' AREA' : ''}` +
        `${labelId && device.labels?.includes(labelId) ? ' LABEL' : ''}`,
    );

    for (const entity of entities.filter((entry) => entry.device_id === device.id)) {
      const state = platform.ha.hassStates.get(entity.entity_id);
      const entityName = entity.name ?? entity.original_name;
      const reportName = state?.attributes?.friendly_name ?? entity.name ?? entity.original_name;

      lines.push(
        `-  Entity: ${entity.entity_id} "${state?.attributes?.friendly_name}" - "${entityName}"` +
          `${getLongNameSuffix(reportName)}` +
          `${areaId && entity.area_id === areaId ? ' AREA' : ''}` +
          `${labelId && entity.labels?.includes(labelId) ? ' LABEL' : ''}` +
          `${isHidden(entity) ? ' HIDDEN' : ''}` +
          `${isSplitEntity(platform, entity) ? ' SPLIT' : ''}`,
      );
    }
  }

  lines.push('', 'Individual Entities', '');

  for (const entity of entities.filter(isIndividualEntity)) {
    const state = platform.ha.hassStates.get(entity.entity_id);
    const entityName = entity.name ?? entity.original_name;
    const reportName = state?.attributes?.friendly_name ?? entity.name ?? entity.original_name;

    lines.push(
      `Individual Entity: ${entity.entity_id} "${state?.attributes?.friendly_name}" - "${entityName}"` +
        `${getLongNameSuffix(reportName)}` +
        `${areaId && entity.area_id === areaId ? ' AREA' : ''}` +
        `${labelId && entity.labels?.includes(labelId) ? ' LABEL' : ''}` +
        `${isHidden(entity) ? ' HIDDEN' : ''}`,
    );
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Writes the Home Assistant report into the plugin directory.
 *
 * @param {HomeAssistantPlatform} platform - The Home Assistant platform data.
 * @returns {string} The generated report path.
 */
export async function writeReport(platform: HomeAssistantPlatform): Promise<string> {
  const pluginDirectory = platform.matterbridge.matterbridgePluginDirectory;
  const reportPath = path.join(pluginDirectory, 'matterbridge-hass', 'report.log');

  try {
    await fs.promises.writeFile(reportPath, createReport(platform));
    platform.log.debug(`Home Assistant report successfully written to ${reportPath}`);
  } catch (error) {
    platform.log.error(`Error writing Home Assistant report to ${reportPath}: ${error}`);
  }

  return reportPath;
}
