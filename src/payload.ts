/**
 * @description This file contains the Home Assistant payload helper.
 * @file src\payload.ts
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

import { type AnsiLogger } from 'matterbridge/logger';

import { type HomeAssistant } from './homeAssistant.js';

/**
 * Save the Home Assistant payload to a file.
 * The payload contains devices, entities, areas, labels, states, config and services.
 *
 * @param {HomeAssistant} ha The Home Assistant instance.
 * @param {string} filename The name of the file to save the payload to.
 * @param {AnsiLogger} log The logger instance.
 */
export async function savePayload(ha: HomeAssistant, filename: string, log: AnsiLogger) {
  const payload = {
    devices: Array.from(ha.hassDevices.values()),
    entities: Array.from(ha.hassEntities.values()),
    areas: Array.from(ha.hassAreas.values()),
    labels: Array.from(ha.hassLabels.values()),
    states: Array.from(ha.hassStates.values()),
    config: ha.hassConfig,
    services: ha.hassServices,
  };
  try {
    await fs.promises.writeFile(filename, JSON.stringify(payload, null, 2));
    log.debug(`Payload successfully written to ${filename}`);
    return;
  } catch (error) {
    log.error(`Error writing payload to file ${filename}: ${error}`);
  }
}
