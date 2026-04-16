// src\report.test.ts

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createReport, writeReport } from './report.js';

describe('report', () => {
  type ReportPlatform = Parameters<typeof createReport>[0];

  const createPlatform = (): ReportPlatform => {
    return {
      config: {
        filterByArea: 'Living Room',
        filterByLabel: 'Important',
        splitByLabel: 'Split',
        splitEntities: [],
      },
      ha: {
        hassAreas: new Map([
          ['area-1', { area_id: 'area-1', name: 'Living Room' }],
          ['area-2', { area_id: 'area-2', name: 'Kitchen' }],
        ]),
        hassLabels: new Map([
          ['label-1', { label_id: 'label-1', name: 'Important' }],
          ['label-split', { label_id: 'label-split', name: 'Split' }],
        ]),
        hassDevices: new Map([
          [
            'device-1',
            {
              id: 'device-1',
              name: 'Desk Lamp',
              name_by_user: 'Desk Lamp Renamed With A Very Long Name',
              entry_type: 'service',
              area_id: 'area-1',
              labels: ['label-1'],
            },
          ],
        ]),
        hassEntities: new Map([
          [
            'light.desk',
            {
              id: 'entity-1',
              entity_id: 'light.desk',
              device_id: 'device-1',
              area_id: 'area-1',
              labels: ['label-1', 'label-split'],
              hidden_by: 'user',
              name: 'Desk Light',
              original_name: 'Desk Light Original',
            },
          ],
          [
            'sensor.temperature',
            {
              id: 'entity-2',
              entity_id: 'sensor.temperature',
              device_id: 'device-1',
              area_id: null,
              labels: [],
              hidden_by: null,
              name: 'Temperature',
              original_name: 'Temperature',
            },
          ],
          [
            'scene.movie',
            {
              id: 'entity-3',
              entity_id: 'scene.movie',
              device_id: null,
              area_id: 'area-1',
              labels: ['label-1'],
              hidden_by: 'user',
              name: 'Movie Mode',
              original_name: 'Movie Mode',
            },
          ],
          [
            'script.night',
            {
              id: 'entity-4',
              entity_id: 'script.night',
              device_id: null,
              area_id: 'area-2',
              labels: [],
              hidden_by: null,
              name: 'Night Mode',
              original_name: 'Night Mode',
            },
          ],
        ]),
        hassStates: new Map([
          [
            'light.desk',
            {
              entity_id: 'light.desk',
              attributes: { friendly_name: 'Desk Accent Light With A Very Long Friendly Name' },
            },
          ],
          [
            'sensor.temperature',
            {
              entity_id: 'sensor.temperature',
              attributes: { friendly_name: 'Temperature' },
            },
          ],
          [
            'scene.movie',
            {
              entity_id: 'scene.movie',
              attributes: { friendly_name: 'Movie Mode' },
            },
          ],
          [
            'script.night',
            {
              entity_id: 'script.night',
              attributes: { friendly_name: 'Night Mode' },
            },
          ],
        ]),
      },
    } as unknown as ReportPlatform;
  };

  const createFallbackPlatform = (): ReportPlatform => {
    return {
      config: {
        filterByArea: '',
        filterByLabel: '',
        splitByLabel: 'Split',
        splitEntities: [],
      },
      ha: {
        hassAreas: new Map(),
        hassLabels: new Map([['label-split', { label_id: 'label-split', name: 'Split' }]]),
        hassDevices: new Map([
          [
            'device-2',
            {
              id: 'device-2',
              name: null,
              name_by_user: null,
              entry_type: null,
              area_id: null,
              labels: [],
            },
          ],
        ]),
        hassEntities: new Map([
          [
            'switch.entity_name',
            {
              id: 'entity-4',
              entity_id: 'switch.entity_name',
              device_id: 'device-2',
              area_id: null,
              labels: [],
              name: 'Entity Name',
              original_name: 'Entity Original',
            },
          ],
          [
            'sensor.original_only',
            {
              id: 'entity-5',
              entity_id: 'sensor.original_only',
              device_id: 'device-2',
              area_id: null,
              labels: [],
              name: null,
              original_name: 'Original Device Entity Name',
            },
          ],
          [
            'script.scene_name',
            {
              id: 'entity-6',
              entity_id: 'script.scene_name',
              device_id: null,
              area_id: null,
              labels: [],
              name: 'Scene Name',
              original_name: 'Scene Original',
            },
          ],
          [
            'scene.original_only',
            {
              id: 'entity-7',
              entity_id: 'scene.original_only',
              device_id: null,
              area_id: null,
              labels: [],
              name: null,
              original_name: 'Original Individual Entity Name',
            },
          ],
        ]),
        hassStates: new Map(),
      },
    } as unknown as ReportPlatform;
  };

  it('should create the Home Assistant report content', () => {
    expect(createReport(createPlatform())).toBe(
      `Home Assistant Devices and Entities Report\n\nFilter by area: Living Room >>> area-1\n\nFilter by label: Important >>> label-1\n\nDevice Entities\n\nDevice: "Desk Lamp Renamed With A Very Long Name" LONGNAME SERVICE AREA LABEL\n-  Entity: light.desk "Desk Accent Light With A Very Long Friendly Name" - "Desk Light" LONGNAME AREA LABEL HIDDEN SPLIT\n-  Entity: sensor.temperature "Temperature" - "Temperature"\n\nIndividual Entities\n\nIndividual Entity: scene.movie "Movie Mode" - "Movie Mode" AREA LABEL HIDDEN\nIndividual Entity: script.night "Night Mode" - "Night Mode"\n`,
    );
  });

  it('should create the Home Assistant report content with empty filters and fallback names', () => {
    expect(createReport(createFallbackPlatform())).toBe(
      `Home Assistant Devices and Entities Report\n\nFilter by area: None\n\nFilter by label: None\n\nDevice Entities\n\nDevice: "null"\n-  Entity: switch.entity_name "undefined" - "Entity Name"\n-  Entity: sensor.original_only "undefined" - "Original Device Entity Name"\n\nIndividual Entities\n\nIndividual Entity: script.scene_name "undefined" - "Scene Name"\nIndividual Entity: scene.original_only "undefined" - "Original Individual Entity Name"\n`,
    );
  });

  it('should write the report to the plugin report path', async () => {
    const pluginDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'matterbridge-hass-report-'));
    fs.mkdirSync(path.join(pluginDirectory, 'matterbridge-hass'), { recursive: true });

    try {
      const reportPath = await writeReport(createPlatform(), pluginDirectory);
      expect(reportPath).toBe(path.join(pluginDirectory, 'matterbridge-hass', 'report.log'));
      expect(fs.readFileSync(reportPath, 'utf8')).toContain('Filter by area: Living Room >>> area-1');
      expect(fs.readFileSync(reportPath, 'utf8')).toContain('Individual Entity: scene.movie "Movie Mode" - "Movie Mode" AREA LABEL');
    } finally {
      fs.rmSync(pluginDirectory, { recursive: true, force: true });
    }
  });
});
