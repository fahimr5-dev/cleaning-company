import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The coloured pill next to an invoice number.
 *
 * Colour carries the meaning at a glance — red is money that is late — but the
 * word is always there too, because colour alone is not readable for everyone.
 */
export function InvoiceStatusBadge({
  status, label, className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  const tone =
    status === "PAID"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "OVERDUE"
        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
        : status === "PARTIALLY_PAID"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : status === "VOID"
            ? "bg-muted text-muted-foreground line-through"
            : status === "DRAFT"
              ? "bg-muted text-muted-foreground"
              : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";

  return (
    <Badge variant="secondary" data-status={status} className={cn(tone, className)}>
      {label}
    </Badge>
  );
}
