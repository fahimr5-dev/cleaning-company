import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One headline number on the dashboard, with a short line of context. */
export function StatCard({
  label, value, hint, icon: Icon, tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <span
          className={cn(
            "rounded-lg p-2",
            tone === "default" && "bg-primary/10 text-primary",
            tone === "warning" && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
            tone === "danger" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-sm">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
