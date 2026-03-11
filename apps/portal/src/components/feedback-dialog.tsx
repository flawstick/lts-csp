"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 2000;
const MIN_LENGTH = 5;

type FeedbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const trimmed = message.trim();
  const isValid = trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH;

  const sendFeedback = api.portalFeedback.send.useMutation({
    onSuccess: () => {
      toast.success("Thanks for your feedback!");
      setMessage("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = () => {
    if (!isValid || sendFeedback.isPending) return;
    sendFeedback.mutate({ message: trimmed });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="relative overflow-hidden border-b px-6 pb-4 pt-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/[0.04] blur-2xl"
          />
          <DialogHeader className="relative">
            <DialogTitle className="text-base">Send Feedback</DialogTitle>
            <DialogDescription>
              Let us know if you spot any issues or have suggestions.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-4">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleSubmit();
            }}
            placeholder="What's on your mind?"
            rows={5}
            className={cn(
              "w-full resize-none rounded-lg border bg-muted/30 px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors",
              "placeholder:text-muted-foreground/60",
              "focus:border-primary/40 focus:bg-muted/50",
            )}
          />
          <div className="mt-1.5 flex items-center justify-end">
            <span
              className={cn(
                "text-[11px] tabular-nums transition-colors",
                trimmed.length > MAX_LENGTH - 100
                  ? "text-amber-500"
                  : "text-muted-foreground/50",
              )}
            >
              {trimmed.length}/{MAX_LENGTH}
            </span>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={sendFeedback.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!isValid || sendFeedback.isPending}
            onClick={handleSubmit}
            className="gap-1.5"
          >
            {sendFeedback.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {sendFeedback.isPending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
