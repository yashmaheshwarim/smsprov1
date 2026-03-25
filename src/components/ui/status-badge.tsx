import { cn } from "@/lib/utils";

export type StatusVariant = "success" | "warning" | "destructive" | "default" | "primary" | "info" | "danger";

const variantStyles: Record<StatusVariant, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  danger: "bg-destructive/10 text-destructive",
  default: "bg-secondary text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  info: "bg-primary/10 text-primary",
};

interface StatusBadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
      variantStyles[variant],
      className
    )}>
      {children}
    </span>
  );
}
