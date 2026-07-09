import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "error";
}) {
  return (
    <Card className="p-4">
      <p className="type-caption text-text-tertiary">{label}</p>
      <p
        className={cn(
          "mt-2 text-[28px] font-semibold leading-none tabular-nums",
          tone === "error" ? "text-error" : "text-text-primary",
        )}
      >
        {value}
      </p>
    </Card>
  );
}
