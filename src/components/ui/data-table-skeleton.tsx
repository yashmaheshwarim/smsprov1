import { Skeleton } from "./skeleton";
import { Loader2 } from "lucide-react";

interface DataTableSkeletonProps {
  /** Custom title skeleton width (default: "w-48") */
  titleWidth?: string;
  /** Number of skeleton table rows (default: 5) */
  rowCount?: number;
  /** Number of skeleton table columns (default: 6) */
  columnCount?: number;
  /** Show header skeleton with title and action buttons */
  showHeader?: boolean;
  /** Show filter/search area skeleton */
  showFilters?: boolean;
  /** Show stat cards skeleton (renders 4 cards) */
  showStats?: boolean;
  /** Show spinner + loading text at the bottom */
  showLoadingIndicator?: boolean;
  /** Custom loading text shown at the bottom */
  loadingText?: string;
}

/**
 * Reusable full-page loading skeleton for data table views.
 * Mirrors the layout of a typical data page: header, stats cards,
 * filters, and a table with rows.
 *
 * @example
 * // Basic usage
 * if (loading) return <DataTableSkeleton />;
 *
 * @example
 * // Customized
 * <DataTableSkeleton
 *   rowCount={8}
 *   columnCount={4}
 *   showStats={false}
 *   loadingText="Loading fee records..."
 * />
 */
export function DataTableSkeleton({
  titleWidth = "w-48",
  rowCount = 5,
  columnCount = 6,
  showHeader = true,
  showFilters = true,
  showStats = true,
  showLoadingIndicator = true,
  loadingText = "Loading data...",
}: DataTableSkeletonProps) {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label={loadingText}>
      {/* ── Header skeleton ──────────────────────────────────────────────── */}
      {showHeader && (
        <div className="flex items-center justify-between">
          <Skeleton className={`h-9 ${titleWidth} rounded-lg`} />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
      )}

      {/* ── Stats cards skeleton ─────────────────────────────────────────── */}
      {showStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl bg-card border border-border space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-28" />
                </div>
              </div>
              <Skeleton className="h-2.5 w-24" />
            </div>
          ))}
        </div>
      )}

      {/* ── Filters / search skeleton ────────────────────────────────────── */}
      {showFilters && (
        <div className="p-4 rounded-lg bg-card border border-border space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="flex-1 min-w-[200px] h-10 rounded-md" />
            <Skeleton className="w-[140px] h-10 rounded-md" />
          </div>
          <Skeleton className="h-4 w-48" />
        </div>
      )}

      {/* ── Table skeleton ───────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 p-4 border-b border-border">
          {[...Array(columnCount)].map((_, i) => (
            <Skeleton key={`hdr-${i}`} className="h-4 flex-1" />
          ))}
        </div>
        {/* Table rows */}
        {[...Array(rowCount)].map((_, i) => (
          <div key={`row-${i}`} className="flex items-center gap-4 p-4 border-b border-border/50">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="flex-[2] space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            {[...Array(Math.max(0, columnCount - 2))].map((_, j) => (
              <Skeleton key={`cell-${i}-${j}`} className="flex-1 h-3.5 w-16" />
            ))}
          </div>
        ))}
      </div>

      {/* ── Loading indicator ────────────────────────────────────────────── */}
      {showLoadingIndicator && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{loadingText}</span>
        </div>
      )}
    </div>
  );
}
