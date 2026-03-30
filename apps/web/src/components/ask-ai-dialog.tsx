"use client"

import { useEffect, useMemo, useRef } from "react"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { ArrowUp, Sparkles, Square, X } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { useChat } from "@ai-sdk/react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { VisuallyHidden } from "radix-ui"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

type AskAiDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgName: string | null
  userAvatarUrl: string | null
  userFullName: string | null
}

function getMessageText(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
}

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
  )
}

function getInitials(name: string | null) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function AskAiDialog({ open, onOpenChange, orgName, userAvatarUrl, userFullName }: AskAiDialogProps) {
  const { messages, sendMessage, stop, status } = useChat()
  const pathname = usePathname()
  const router = useRouter()

  const streamdownComponents = useMemo(() => ({
    a: ({ href, children }: React.ComponentProps<"a">) => {
      const resolvedHref = href ?? "#"
      const isInternal = resolvedHref.startsWith("/")
      return (
        <a
          href={resolvedHref}
          className="font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:text-primary/80 hover:decoration-primary/60"
          onClick={(e) => {
            if (isInternal) {
              e.preventDefault()
              router.push(resolvedHref)
              onOpenChange(false)
            }
          }}
          {...(!isInternal && { target: "_blank", rel: "noopener noreferrer" })}
        >
          {children}
        </a>
      )
    },
  }), [router, onOpenChange])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef("")

  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    if (open) {
      document.documentElement.style.overflow = "hidden"
      setTimeout(() => textareaRef.current?.focus(), 100)
    } else {
      document.documentElement.style.overflow = ""
    }
    return () => { document.documentElement.style.overflow = "" }
  }, [open])

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })
    })
  }, [messages, status])

  const handleSend = () => {
    const text = textareaRef.current?.value.trim()
    if (!text || isStreaming) return

    void sendMessage({ text }, {
      body: {
        context: {
          orgName,
          currentPage: pathname,
        },
      },
    })

    if (textareaRef.current) {
      textareaRef.current.value = ""
      textareaRef.current.style.height = "auto"
    }
    inputRef.current = ""
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    inputRef.current = e.target.value
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-[calc(100vw-var(--sidebar-width,0px))] flex-col overflow-hidden border-l bg-background shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            "duration-300 ease-out",
          )}
        >
          <VisuallyHidden.Root>
            <DialogTitle>Ask AI</DialogTitle>
          </VisuallyHidden.Root>

          {/* Header */}
          <div className="relative flex shrink-0 items-center justify-between border-b px-5 py-4">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight">Ask AI</h2>
                <p className="text-[10px] text-muted-foreground">Tax processing assistant</p>
              </div>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Messages */}
          <ScrollArea className="min-h-0 min-w-0 flex-1">
            <div className="flex min-w-0 flex-col px-5 py-4">
              {messages.length === 0 && !isStreaming ? (
                <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/[0.08] ring-1 ring-primary/20">
                    <Sparkles className="size-5 text-primary" />
                  </div>
                  <p className="mt-5 text-[14px] font-medium text-foreground">
                    Ask anything about tax returns
                  </p>
                  <p className="mt-1.5 max-w-[240px] text-[12px] leading-relaxed text-muted-foreground">
                    I can help with field explanations, processing status, and automation issues.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                      const text = getMessageText(msg.parts as { type: string; text?: string }[])
                      if (!text) return null

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
                            <Avatar className="mt-0.5 size-6">
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
                              "min-w-0 max-w-[82%] overflow-hidden break-words rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed [&_*]:min-w-0 [&_pre]:overflow-x-auto [&_a]:break-all",
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
                      )
                    })}
                  </AnimatePresence>

                  {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === "user" ? (
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

          {/* Input */}
          <div className="shrink-0 border-t px-4 py-3">
            <div className="flex items-end gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20">
              <textarea
                ref={textareaRef}
                defaultValue=""
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
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
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
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
  )
}
