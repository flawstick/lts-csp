"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Sparkles, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useChat } from "@ai-sdk/react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "radix-ui";
import { VisuallyHidden } from "radix-ui";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { api } from "@/trpc/react";

type AskAiDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  orgName: string | null;
  userAvatarUrl: string | null;
  userFullName: string | null;
  initialPrompt?: string | null;
};

// ─── Helpers to extract text from UIMessage parts ──────────────────

function getMessageText(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

// ─── Thinking dots ─────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-[5px] rounded-full bg-current"
          style={{
            animation: "ask-ai-dot 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes ask-ai-dot {
          0%, 60%, 100% { opacity: 0.25; transform: scale(0.85); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  );
}

// ─── Dialog ────────────────────────────────────────────────────────

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AskAiDialog({ open, onOpenChange, orgId, orgName, userAvatarUrl, userFullName, initialPrompt }: AskAiDialogProps) {
  const {
    messages,
    sendMessage,
    stop,
    status,
  } = useChat();

  const pathname = usePathname();
  const router = useRouter();

  // Custom link component that resolves /org/current to actual orgId
  const streamdownComponents = useMemo(() => ({
    a: ({ href, children }: React.ComponentProps<"a">) => {
      let resolvedHref = href ?? "#";
      if (orgId) {
        resolvedHref = resolvedHref.replace("/org/current", `/org/${orgId}`);
      }
      const isInternal = resolvedHref.startsWith("/");
      return (
        <a
          href={resolvedHref}
          className="font-medium text-amber-600 underline decoration-amber-500/30 underline-offset-2 transition-colors hover:text-amber-500 hover:decoration-amber-500/60 dark:text-amber-400 dark:hover:text-amber-300"
          onClick={(e) => {
            if (isInternal) {
              e.preventDefault();
              router.push(resolvedHref);
              onOpenChange(false);
            }
          }}
          {...(!isInternal && { target: "_blank", rel: "noopener noreferrer" })}
        >
          {children}
        </a>
      );
    },
  }), [orgId, router, onOpenChange]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef("");

  // Extract returnId from pathname if on a return page
  const returnId = useMemo(() => {
    const match = /\/returns\/([a-f0-9-]+)/.exec(pathname);
    return match?.[1] ?? null;
  }, [pathname]);

  // Fetch return data if viewing a specific return
  const returnsQuery = api.portalReturns.listByOrg.useQuery(
    { orgId: orgId! },
    { enabled: !!orgId },
  );

  const currentReturn = useMemo(() => {
    if (!returnId || !returnsQuery.data) return null;
    return returnsQuery.data.find((r) => r.id === returnId) ?? null;
  }, [returnId, returnsQuery.data]);

  const isStreaming = status === "streaming" || status === "submitted";

  const hasSentInitialPrompt = useRef(false);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    } else {
      hasSentInitialPrompt.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialPrompt || hasSentInitialPrompt.current) return;
    hasSentInitialPrompt.current = true;

    void sendMessage({ text: initialPrompt }, {
      body: {
        context: {
          orgId,
          orgName,
          currentReturn: currentReturn ? {
            id: currentReturn.id,
            entityName: currentReturn.entityName,
            taxYear: currentReturn.taxYear,
            status: currentReturn.status,
            returnType: currentReturn.returnType,
            jurisdictionCode: currentReturn.jurisdictionCode,
            jurisdictionName: currentReturn.jurisdictionName,
          } : null,
          currentPage: pathname,
        },
      },
    });
  }, [open, initialPrompt, sendMessage, orgId, orgName, currentReturn, pathname]);

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [messages, status]);

  const handleSend = () => {
    const text = textareaRef.current?.value.trim();
    if (!text || isStreaming) return;

    void sendMessage({ text }, {
      body: {
        context: {
          orgId,
          orgName,
          currentReturn: currentReturn ? {
            id: currentReturn.id,
            entityName: currentReturn.entityName,
            taxYear: currentReturn.taxYear,
            status: currentReturn.status,
            returnType: currentReturn.returnType,
            jurisdictionCode: currentReturn.jurisdictionCode,
            jurisdictionName: currentReturn.jurisdictionName,
          } : null,
          currentPage: pathname,
        },
      },
    });

    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
    inputRef.current = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    inputRef.current = e.target.value;
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[520px]",
            "data-open:animate-in data-closed:animate-out",
            "data-closed:fade-out-0 data-open:fade-in-0",
            "data-closed:slide-out-to-right data-open:slide-in-from-right",
            "duration-300 ease-out",
          )}
        >
          <VisuallyHidden.Root>
            <DialogTitle>Ask AI</DialogTitle>
          </VisuallyHidden.Root>

          {/* ── Header ─────────────────────────────── */}
          <div className="relative flex shrink-0 items-center justify-between border-b px-5 py-4">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10">
                <Sparkles className="size-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight">
                  Ask AI
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  Tax return assistant
                </p>
              </div>
            </div>

            <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* ── Messages ───────────────────────────── */}
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col px-5 py-4">
              {messages.length === 0 && !isStreaming ? (
                <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/[0.08] ring-1 ring-amber-500/20">
                    <Sparkles className="size-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="mt-5 text-[14px] font-medium text-foreground">
                    Ask anything about your tax return
                  </p>
                  <p className="mt-1.5 max-w-[240px] text-[12px] leading-relaxed text-muted-foreground">
                    I can help with field explanations, compliance questions, and filing guidance.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                      const text = getMessageText(msg.parts as { type: string; text?: string }[]);
                      if (!text) return null;

                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className={cn(
                            "flex gap-2.5",
                            msg.role === "user" ? "flex-row-reverse" : "flex-row",
                          )}
                        >
                          {msg.role === "assistant" ? (
                            <Image
                              src="/logo.png"
                              alt="LTS"
                              width={24}
                              height={24}
                              className="mt-0.5 size-6 shrink-0 object-contain"
                            />
                          ) : (
                            <Avatar size="sm" className="mt-0.5">
                              <AvatarImage
                                src={userAvatarUrl ?? undefined}
                                alt={userFullName ?? "You"}
                              />
                              <AvatarFallback className="text-[10px]">
                                {getInitials(userFullName)}
                              </AvatarFallback>
                            </Avatar>
                          )}

                          <div
                            className={cn(
                              "max-w-[82%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/70 text-foreground",
                            )}
                          >
                            {msg.role === "assistant" ? (
                              <Streamdown
                                components={streamdownComponents}
                                isAnimating={isStreaming && msg.id === messages[messages.length - 1]?.id}
                              >
                                {text}
                              </Streamdown>
                            ) : (
                              text
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* Thinking indicator */}
                  {isStreaming &&
                  messages.length > 0 &&
                  messages[messages.length - 1]?.role === "user" ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-2.5"
                    >
                      <Image
                        src="/logo.png"
                        alt="LTS"
                        width={24}
                        height={24}
                        className="mt-0.5 size-6 shrink-0 object-contain"
                      />
                      <div className="rounded-xl bg-muted/70 px-3.5 py-2.5 text-muted-foreground">
                        <ThinkingDots />
                      </div>
                    </motion.div>
                  ) : null}
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          {/* ── Input ──────────────────────────────── */}
          <div className="shrink-0 border-t px-4 py-3">
            <div className="flex items-end gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-amber-500/40 focus-within:ring-1 focus-within:ring-amber-500/20">
              <textarea
                ref={textareaRef}
                defaultValue=""
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={currentReturn ? `Ask about ${currentReturn.entityName}...` : "Ask a question..."}
                rows={1}
                className="flex-1 resize-none bg-transparent py-0.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                style={{ maxHeight: 120 }}
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                >
                  <Square className="size-3" fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg transition-all",
                    "bg-amber-500 text-white shadow-sm hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400",
                  )}
                >
                  <ArrowUp className="size-3.5" strokeWidth={2.5} />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
              AI may make mistakes. Verify important information.
            </p>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
