import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "@/lib/customer.functions";

/**
 * Rating + optional review for a completed order. Eligibility, completion state
 * and the one-review-per-order rule are enforced in the database; this form only
 * collects the input.
 */
export function ReviewForm({
  orderId,
  trackingToken,
  defaultName,
  onSubmitted,
}: {
  orderId: string;
  trackingToken: string;
  defaultName?: string | null;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState(defaultName ?? "");
  const [saving, setSaving] = useState(false);

  const shown = hover || rating;

  async function send() {
    if (rating < 1 || saving) return;
    setSaving(true);
    try {
      await submitReview({
        data: {
          id: orderId,
          token: trackingToken,
          rating,
          comment: comment.trim().length >= 5 ? comment.trim() : null,
          display_name: name.trim() || null,
        },
      });
      toast.success("Thank you for the feedback!");
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your review");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface-card space-y-4 p-5">
      <div className="text-center">
        <h2 className="font-display text-lg font-semibold">How was your experience?</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your rating helps {""}
          the team keep things great.
        </p>
      </div>

      <div className="flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            aria-pressed={rating === n}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="rounded-full p-1 transition-transform hover:scale-110"
          >
            <Star
              className={`size-8 transition-colors ${
                n <= shown ? "fill-accent text-accent" : "text-muted-foreground/40"
              }`}
            />
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="review-comment">Tell us more (optional)</Label>
            <Textarea
              id="review-comment"
              rows={3}
              maxLength={500}
              value={comment}
              placeholder="What did you enjoy?"
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-name">Display name (optional)</Label>
            <Input
              id="review-name"
              maxLength={40}
              value={name}
              placeholder="Shown with your review"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button className="w-full rounded-full" disabled={saving} onClick={send}>
            {saving ? "Sending…" : "Submit rating"}
          </Button>
        </div>
      )}
    </section>
  );
}
