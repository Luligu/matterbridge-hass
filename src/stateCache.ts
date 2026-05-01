/**
 * @description This file contains the class StateCache.
 * @file src\stateCache.ts
 * @author Luca Liguori
 * @created 2026-04-28
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

import { AnsiLogger, TimestampFormat } from 'matterbridge/logger';
import type { NodeStorage } from 'node-persist-manager';

import type { EntityId, HassState } from './homeAssistant.js';

const CACHE_KEY = 'stateCache';

/**
 * @description This class represents the state cache for the Home Assistant platform.
 * It is used to store the latest available state of entities when they turn to unavailable.
 */
export class StateCache {
  /** The cache storing the latest available state of entities keyed by their entity ID. */
  private cache: Map<EntityId, HassState> = new Map();
  log = new AnsiLogger({ logName: 'StateCache', logTimestampFormat: TimestampFormat.TIME_MILLIS });

  /**
   * Load cached Home Assistant states from persistent storage.
   *
   * @param {NodeStorage} context - The NodeStorage instance used to read the cached states.
   * @returns {Promise<void>} Resolves when the in-memory cache has been populated from storage.
   */
  async load(context: NodeStorage): Promise<void> {
    this.log.debug('Loading cached states from storage...');
    const storedCache = await context.get<HassState[]>(CACHE_KEY, []);
    for (const state of storedCache) {
      this.cache.set(state.entity_id, state);
    }
    this.log.debug(`Loaded ${this.cache.size} cached states from storage`);
  }

  /**
   * Persist the current in-memory state cache to storage.
   *
   * @param {NodeStorage} context - The NodeStorage instance used to persist the cached states.
   * @returns {Promise<void>} Resolves when all cached states have been written to storage.
   */
  async save(context: NodeStorage): Promise<void> {
    this.log.debug('Saving cached states to storage...');
    const states = Array.from(this.cache.values());
    await context.set(CACHE_KEY, states);
    this.log.debug(`Saved ${this.cache.size} cached states to storage`);
  }

  /**
   * Clear all cached Home Assistant states from memory.
   *
   * @returns {void} Does not return a value.
   */
  clear(): void {
    this.cache.clear();
    this.log.debug('Cleared all cached states from memory');
  }

  /**
   * Get the number of cached Home Assistant states currently stored in memory.
   *
   * @returns {number} The number of cached states in memory.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Add or replace a cached Home Assistant state.
   *
   * @param {HassState} state - The Home Assistant state to store for the entity.
   * @returns {void} Does not return a value.
   */
  add(state: HassState): void {
    this.cache.set(state.entity_id, state);
    this.log.debug(`Added/Updated cached state for entity ${state.entity_id}`);
  }

  /**
   * Get a cached Home Assistant state for an entity.
   *
   * @param {EntityId} entityId - The Home Assistant entity ID used as the cache key.
   * @returns {HassState | undefined} The cached state if present, otherwise undefined.
   */
  get(entityId: EntityId): HassState | undefined {
    return this.cache.get(entityId);
  }

  /**
   * Remove a cached Home Assistant state for an entity.
   *
   * @param {EntityId} entityId - The Home Assistant entity ID to remove from the cache.
   * @returns {void} Does not return a value.
   */
  remove(entityId: EntityId): void {
    this.cache.delete(entityId);
    this.log.debug(`Removed cached state for entity ${entityId}`);
  }
}
