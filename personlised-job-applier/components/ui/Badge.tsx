import { cn } from "@/lib/utils";

export function Badge({
  children,
  color,
  className,
}: {
  children: React.ReactNode;
  /** any CSS color (hex or var) used for text + tinted background */
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 type-caption font-medium",
        className,
      )}
      style={
        color
          ? {
              color,
              backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}
