import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  initializeRealtimeSync,
  destroyRealtimeSync,
  subscribeToTable,
  subscribeToAll,
  type SyncEvent,
  type SyncCallback,
} from '../lib/realtime-sync';
import { useAuth } from './AuthContext';
import { invalidateCachePrefix } from '../lib/data-cache';

interface RealtimeDataContextValue {
  /** Subscribe to changes on a specific table */
  onTableChange: (table: string, callback: SyncCallback) => () => void;
  /** Subscribe to ALL data changes */
  onAnyChange: (callback: SyncCallback) => () => void;
  /** The last sync event received (for UI indicators) */
  lastEvent: SyncEvent | null;
  /** Whether realtime sync is currently active */
  isActive: boolean;
  /** Manually refresh/force re-sync all data */
  forceRefresh: () => void;
}

const RealtimeDataContext = createContext<RealtimeDataContextValue>({
  onTableChange: () => () => {},
  onAnyChange: () => () => {},
  lastEvent: null,
  isActive: false,
  forceRefresh: () => {},
});

/**
 * Provider that initializes realtime data sync for the current
 * authenticated user's institute. Automatically manages subscriptions
 * when the user changes or logs out.
 */
export function RealtimeDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null);
  const [isActive, setIsActive] = useState(false);
  const lastEventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalUnsubRef = useRef<(() => void) | null>(null);

  // Resolve institute ID based on user role
  const instituteId = (user as any)?.instituteId || '';

  // ── Initialize / cleanup realtime sync on user/institute change ──
  useEffect(() => {
    if (!instituteId) {
      // Clean up if no institute (e.g., super_admin or logged out)
      if (globalUnsubRef.current) {
        globalUnsubRef.current();
        globalUnsubRef.current = null;
      }
      setIsActive(false);
      return;
    }

    // Initialize subscriptions
    initializeRealtimeSync(instituteId);
    setIsActive(true);

    // Subscribe to all changes for cache invalidation and UI updates
    globalUnsubRef.current = subscribeToAll(instituteId, (event: SyncEvent) => {
      setLastEvent(event);

      // Auto-clear the "last event" indicator after 5 seconds
      if (lastEventTimeoutRef.current) {
        clearTimeout(lastEventTimeoutRef.current);
      }
      lastEventTimeoutRef.current = setTimeout(() => {
        setLastEvent(null);
      }, 5000);
    });

    return () => {
      destroyRealtimeSync(instituteId);
      setIsActive(false);
      if (globalUnsubRef.current) {
        globalUnsubRef.current();
        globalUnsubRef.current = null;
      }
      if (lastEventTimeoutRef.current) {
        clearTimeout(lastEventTimeoutRef.current);
      }
    };
  }, [instituteId]);

  // ── Subscribe to changes on a specific table ──
  const onTableChange = useCallback(
    (table: string, callback: SyncCallback): (() => void) => {
      if (!instituteId) return () => {};
      return subscribeToTable(table, instituteId, callback);
    },
    [instituteId]
  );

  // ── Subscribe to ALL changes ──
  const onAnyChange = useCallback(
    (callback: SyncCallback): (() => void) => {
      if (!instituteId) return () => {};
      return subscribeToAll(instituteId, callback);
    },
    [instituteId]
  );

  // ── Force refresh by invalidating all cache ──
  const forceRefresh = useCallback(() => {
    invalidateCachePrefix('');
  }, []);

  return (
    <RealtimeDataContext.Provider
      value={{
        onTableChange,
        onAnyChange,
        lastEvent,
        isActive,
        forceRefresh,
      }}
    >
      {children}
    </RealtimeDataContext.Provider>
  );
}

/**
 * Hook to access realtime data sync context.
 * Use onTableChange to subscribe to specific table changes.
 * Use onAnyChange to subscribe to all data changes.
 * Use lastEvent to show a "data synced" indicator.
 */
export function useRealtimeData(): RealtimeDataContextValue {
  return useContext(RealtimeDataContext);
}

/**
 * Convenience hook: subscribe to changes on a specific table.
 * Automatically cleans up when the component unmounts.
 *
 * @param table - The table name to watch (e.g., 'students', 'attendance')
 * @param callback - Function to call when data changes
 * @param deps - Additional dependency array values (optional)
 *
 * @example
 * useTableChange('students', (event) => {
 *   console.log('Students changed:', event);
 * });
 */
export function useTableChange(
  table: string,
  callback: SyncCallback,
  deps: any[] = []
): void {
  const { onTableChange } = useRealtimeData();

  useEffect(() => {
    return onTableChange(table, callback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, onTableChange, ...deps]);
}
