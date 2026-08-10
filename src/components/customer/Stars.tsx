import { Star } from "lucide-react";

export function Stars({
  value,
  size = "sm",
  className = "",
}: {
  value: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const dimension = size === "md" ? "size-5" : "size-3.5";
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${dimension} ${
            n <= Math.round(value) ? "fill-accent text-accent" : "text-muted-foreground/40"
          }`}
        />
      ))}
    </span>
  );
}

export function RatingBadge({ average, total }: { average: number | null; total: number }) {
  if (average == null || total === 0) {
    return <span className="text-xs text-muted-foreground">No reviews yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Stars value={average} />
      <span className="font-semibold">{average.toFixed(1)}</span>
      <span className="text-muted-foreground">
        ({total} {total === 1 ? "review" : "reviews"})
      </span>
    </span>
  );
}
