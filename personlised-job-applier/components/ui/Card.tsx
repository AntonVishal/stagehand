import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border-solid bg-bg-top transition-shadow hover:shadow-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-x-4 gap-y-2 border-b border-border-faint px-5 py-4">
      <div className="min-w-0">
        <h2 className="type-header text-text-primary">{title}</h2>
        {subtitle ? (
          <p className="type-caption mt-1 text-text-tertiary">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </div>
  );
}
