import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The coloured pill saying whether somebody's papers are in order.
 *
 * Red means they legally must not be sent to a job today. The word is always
 * there alongside the colour, because colour alone is not readable for everyone.
 */
export function ComplianceBadge({
  status, label, className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  const tone =
    status === "EXPIRED"
      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      : status === "MISSING"
        ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
        : status === "EXPIRING"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";

  return (
    <Badge variant="secondary" data-compliance={status} className={cn(tone, className)}>
      {label}
    </Badge>
  );
}
