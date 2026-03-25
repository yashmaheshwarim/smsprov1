import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  className?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn("surface-elevated rounded-lg p-4 animate-fade-in", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">{title}</p>
          <p className="text-xl sm:text-2xl font-semibold text-foreground tabular-nums truncate">{value}</p>
        </div>
        <div className="p-2 rounded-md bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      {change && (
        <p className={cn(
          "mt-2 text-xs font-medium",
          changeType === "positive" && "text-success",
          changeType === "negative" && "text-destructive",
          changeType === "neutral" && "text-muted-foreground",
        )}>
          {change}
        </p>
      )}
    </div>
  );
}
