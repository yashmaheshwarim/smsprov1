import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface UseTableRealtimeParams {
  /** Table to subscribe to (e.g. "students") */
  table: string;
  /** Optional equality filter, e.g. { column: "institute_id", value: instId } */
  filter?: { column: string; value: string };
  /** Set false to skip subscribing (e.g. not logged in yet) */
  enabled?: boolean;
  /** Called on any insert/update/delete for the table */
  onEvent?: () => void;
  /**
   * Coalesce bursts of events (e.g. bulk attendance save = one event per row)
   * into a single refresh after this many ms. Default 1200ms.
   */
  debounceMs?: number;
}

/**
 * Subscribe to Supabase Realtime `postgres_changes` on a table and fire a
 * callback on any change. The callback is kept in a ref, so it never goes
 * stale and the page does not need to memoize its fetch function.
 *
 * Events are debounced so a burst of changes (bulk insert/update) triggers
 * only one refresh instead of one per row.
 *
 * The subscription is torn down and re-created whenever the table/filter
 * changes (e.g. instituteId changes on logout/login).
 *
 * NOTE: realtime events only flow once the table is added to the
 * `supabase_realtime` publication — see
 * supabase/migrations/20260802000002_enable_realtime_whole_app.sql
 */
export function useTableRealtime({ table, filter, enabled = true, onEvent, debounceMs = 1200 }: UseTableRealtimeParams): void {
  const cbRef = useRef(onEvent);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always point the ref at the latest callback (no stale closures).
  useEffect(() => {
    cbRef.current = onEvent;
  });

  const filterKey = filter ? `${filter.column}=eq.${filter.value}` : "";

  useEffect(() => {
    if (!enabled || !table) return;

    const channel = supabase
      .channel(`rt-${table}-${filterKey || "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filterKey ? { filter: filterKey } : {}),
        },
        () => {
          // Debounce: coalesce bursts of events into one refresh.
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            cbRef.current?.();
          }, debounceMs);
        }
      )
      .subscribe();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filterKey, enabled]);
}
