import { supabase, isUuid } from './supabase';
import { invalidateCachePrefix, invalidateCache } from './data-cache';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SyncEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface SyncEvent {
  table: string;
  event: SyncEventType;
  new?: Record<string, any>;
  old?: Record<string, any>;
  instituteId: string;
}

export type SyncCallback = (event: SyncEvent) => void;

interface TableConfig {
  table: string;
  filterField: string | null; // The column used to filter by institute (e.g., 'institute_id'), null = no filter
  cachePrefix: string | null; // Cache key prefix to invalidate on change, null = no cache invalidation
  enabled: boolean;
}

interface SubscriptionEntry {
  channel: ReturnType<typeof supabase.channel>;
  table: string;
  listeners: Set<SyncCallback>;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const TABLES: TableConfig[] = [
  { table: 'students', filterField: 'institute_id', cachePrefix: 'students:', enabled: true },
  { table: 'teachers', filterField: 'institute_id', cachePrefix: null, enabled: true },
  { table: 'batches', filterField: 'institute_id', cachePrefix: 'batch:', enabled: true },
  { table: 'attendance', filterField: 'institute_id', cachePrefix: 'attendance:', enabled: true },
  { table: 'fees', filterField: 'institute_id', cachePrefix: 'fees:', enabled: true },
  { table: 'invoices', filterField: 'institute_id', cachePrefix: 'invoices:', enabled: true },
  { table: 'marks', filterField: 'institute_id', cachePrefix: 'marks:', enabled: true },
  { table: 'leaves', filterField: 'institute_id', cachePrefix: 'leaves:', enabled: true },
  { table: 'notifications', filterField: 'institute_id', cachePrefix: null, enabled: false }, // notifications have dedicated channel in notification-service.ts
  { table: 'exam_attendance', filterField: 'institute_id', cachePrefix: null, enabled: true },
  { table: 'batch_fees', filterField: 'institute_id', cachePrefix: null, enabled: true },
  { table: 'classroom_mappings', filterField: null, cachePrefix: null, enabled: true },
  { table: 'institute_config', filterField: null, cachePrefix: null, enabled: true }
];

// ─── Subscription Manager ───────────────────────────────────────────────────

const _subscriptions = new Map<string, SubscriptionEntry[]>();
const _globalListeners = new Set<SyncCallback>();
let _activeInstituteId: string | null = null;

/**
 * Invalidate relevant cache entries when a data change is detected.
 */
function _invalidateCache(table: string, event: SyncEventType, newData?: Record<string, any>): void {
  const config = TABLES.find((t) => t.table === table);
  if (!config || !config.cachePrefix) {
    // No specific cache prefix, invalidate broadly
    invalidateCachePrefix(`${table}:`);
    return;
  }
  invalidateCachePrefix(config.cachePrefix);

  // If we have specific IDs, invalidate those too
  if (newData?.id) {
    invalidateCache(`${table}:${newData.id}`);
  }
  if (newData?.batch_id) {
    invalidateCachePrefix(`batch:${newData.batch_id}`);
  }
  if (newData?.student_id) {
    invalidateCachePrefix(`student:${newData.student_id}`);
  }
}

/**
 * Notify all listeners about a data change event.
 */
function _notifyListeners(table: string, event: SyncEventType, payload: any, instituteId: string): void {
  const syncEvent: SyncEvent = {
    table,
    event,
    new: payload.new || undefined,
    old: payload.old || undefined,
    instituteId,
  };

  // Notify global listeners
  _globalListeners.forEach((cb) => {
    try {
      cb(syncEvent);
    } catch (err) {
      console.error(`[RealtimeSync] Global listener error for ${table}:`, err);
    }
  });

  // Notify table-specific listeners
  const entries = _subscriptions.get(instituteId);
  if (!entries) return;
  for (const entry of entries) {
    if (entry.table === table) {
      entry.listeners.forEach((cb) => {
        try {
          cb(syncEvent);
        } catch (err) {
          console.error(`[RealtimeSync] Table listener error for ${table}:`, err);
        }
      });
    }
  }
}

/**
 * Create a Supabase realtime subscription for a specific table/institute combination.
 */
function _createTableSubscription(instituteId: string, config: TableConfig): ReturnType<typeof supabase.channel> {
  const channelName = `sync:${config.table}:${instituteId}`;
  const filter = config.filterField
    ? `${config.filterField}=eq.${instituteId}`
    : undefined;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: config.table,
        ...(filter ? { filter } : {}),
      } as any,
      (payload: any) => {
        const { eventType, new: newData, old: oldData } = payload;

        // Extract institute_id from the data if not filtered directly
        const eventInstituteId =
          newData?.[config.filterField || ''] ||
          oldData?.[config.filterField || ''] ||
          instituteId;

        // Invalidate cache
        _invalidateCache(config.table, eventType as SyncEventType, newData);

        // Notify listeners
        _notifyListeners(config.table, eventType as SyncEventType, payload, eventInstituteId);
      }
    )
    .subscribe((status: string) => {
      if (status !== 'SUBSCRIBED') {
        console.warn(`[RealtimeSync] Channel ${channelName} status: ${status}`);
      }
    });

  return channel;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize realtime sync subscriptions for a given institute.
 * Call this when the user authenticates or switches institute.
 * Automatically cleans up previous subscriptions.
 */
export function initializeRealtimeSync(instituteId: string): void {
  if (!isUuid(instituteId)) {
    console.warn('[RealtimeSync] Invalid institute ID, cannot initialize');
    return;
  }

  // Clean up existing subscriptions for this institute
  destroyRealtimeSync(instituteId);

  if (_activeInstituteId && _activeInstituteId !== instituteId) {
    destroyRealtimeSync(_activeInstituteId);
  }

  _activeInstituteId = instituteId;

  const entries: SubscriptionEntry[] = [];

  for (const config of TABLES) {
    if (!config.enabled) continue;

    try {
      const channel = _createTableSubscription(instituteId, config);

      entries.push({
        channel,
        table: config.table,
        listeners: new Set(),
      });
    } catch (err) {
      console.error(`[RealtimeSync] Failed to create subscription for ${config.table}:`, err);
    }
  }

  _subscriptions.set(instituteId, entries);
  console.log(`[RealtimeSync] Initialized ${entries.length} subscriptions for institute ${instituteId}`);
}

/**
 * Destroy all realtime sync subscriptions for a given institute.
 */
export function destroyRealtimeSync(instituteId: string): void {
  const entries = _subscriptions.get(instituteId);
  if (!entries) return;

  for (const entry of entries) {
    try {
      supabase.removeChannel(entry.channel);
    } catch (err) {
      console.error(`[RealtimeSync] Error removing channel for ${entry.table}:`, err);
    }
  }

  _subscriptions.delete(instituteId);

  if (_activeInstituteId === instituteId) {
    _activeInstituteId = null;
  }
}

/**
 * Subscribe to data changes for a specific table.
 * Returns an unsubscribe function.
 */
export function subscribeToTable(
  table: string,
  instituteId: string,
  callback: SyncCallback
): () => void {
  let entries = _subscriptions.get(instituteId);
  if (!entries) {
    // Auto-initialize if not already done
    initializeRealtimeSync(instituteId);
    entries = _subscriptions.get(instituteId) || [];
  }

  let entry = entries.find((e) => e.table === table);
  if (!entry) {
    // If this table wasn't pre-configured, create a dynamic subscription
    const config = TABLES.find((t) => t.table === table);
    if (config) {
      const channel = _createTableSubscription(instituteId, config);
      entry = { channel, table, listeners: new Set() };
      entries.push(entry);
      _subscriptions.set(instituteId, entries);
    } else {
      console.warn(`[RealtimeSync] No config found for table: ${table}`);
      return () => {};
    }
  }

  entry.listeners.add(callback);

  return () => {
    if (entry) {
      entry.listeners.delete(callback);
    }
  };
}

/**
 * Subscribe to ALL data changes for an institute.
 * Useful for global sync indicators or logging.
 * Returns an unsubscribe function.
 */
export function subscribeToAll(instituteId: string, callback: SyncCallback): () => void {
  _globalListeners.add(callback);

  return () => {
    _globalListeners.delete(callback);
  };
}

/**
 * Check if realtime sync is active for a given institute.
 */
export function isRealtimeSyncActive(instituteId: string): boolean {
  return _subscriptions.has(instituteId);
}

/**
 * Get the list of active subscription tables for an institute.
 */
export function getActiveSubscriptions(instituteId: string): string[] {
  const entries = _subscriptions.get(instituteId);
  if (!entries) return [];
  return entries.map((e) => e.table);
}
