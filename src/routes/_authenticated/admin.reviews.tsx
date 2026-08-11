import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { Stars } from "@/components/customer/Stars";
import { Button } from "@/components/ui/button";
import { moderateReview, ratingSummary, useReviews } from "@/hooks/useReviews";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews — Tablebrew dashboard" },
      { name: "description", content: "Read guest ratings and moderate reviews for your cafe." },
      { property: "og:title", content: "Reviews — Tablebrew dashboard" },
      {
        property: "og:description",
        content: "Read guest ratings and moderate reviews for your cafe.",
      },
    ],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  return (
    <AdminShell title="Reviews" description="Guest ratings from completed orders.">
      {(ctx) => <ReviewsBoard cafeId={ctx.cafe.id} />}
    </AdminShell>
  );
}

function ReviewsBoard({ cafeId }: { cafeId: string }) {
  const { data: reviews = [], isPending } = useReviews(cafeId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const summary = ratingSummary(reviews);

  async function moderate(id: string, patch: { hidden?: boolean; flagged?: boolean }) {
    setBusyId(id);
    try {
      await moderateReview(id, patch);
      toast.success("Review updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this review");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface-card flex flex-wrap items-center gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Average rating
          </p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-semibold">
            {summary.average?.toFixed(1) ?? "—"}
            {summary.average != null && <Stars value={summary.average} size="md" />}
          </p>
        </div>
        <div className="border-l border-border pl-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Visible reviews
          </p>
          <p className="mt-1 text-3xl font-semibold">{summary.total}</p>
        </div>
        <div className="border-l border-border pl-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hidden
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {reviews.filter((r) => r.hidden).length}
          </p>
        </div>
      </section>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="surface-card p-8 text-center text-sm text-muted-foreground">
          No reviews yet. Guests can rate you once an order is completed.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {reviews.map((review) => (
            <li key={review.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Stars value={review.rating} size="md" />
                  <p className="mt-1 text-sm font-semibold">
                    {review.display_name ?? "Guest"}
                    {review.flagged && (
                      <span className="ml-2 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        Flagged
                      </span>
                    )}
                    {review.hidden && (
                      <span className="ml-2 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        Hidden
                      </span>
                    )}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {new Date(review.created_at).toLocaleDateString()}
                </p>
              </div>

              {review.comment ? (
                <p className="mt-3 whitespace-pre-line text-sm text-foreground/90">
                  {review.comment}
                </p>
              ) : (
                <p className="mt-3 text-sm italic text-muted-foreground">Rating only.</p>
              )}

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === review.id}
                  onClick={() => moderate(review.id, { hidden: !review.hidden })}
                >
                  {review.hidden ? (
                    <>
                      <Eye className="size-4" aria-hidden /> Show
                    </>
                  ) : (
                    <>
                      <EyeOff className="size-4" aria-hidden /> Hide
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === review.id}
                  onClick={() => moderate(review.id, { flagged: !review.flagged })}
                >
                  <Flag className="size-4" aria-hidden />
                  {review.flagged ? "Unflag" : "Flag"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Review text cannot be edited — only hidden or flagged.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
