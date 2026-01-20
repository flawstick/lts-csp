"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "@/lib/icons"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isSending, setIsSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    // Log error to console
    console.error("Application error:", error)
  }, [error])

  const handleSendLogs = async () => {
    setIsSending(true)
    try {
      const response = await fetch("/api/error-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          errorMessage: error.message,
          errorStack: error.stack,
          errorDigest: error.digest,
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      })

      if (response.ok) {
        setEmailSent(true)
      } else {
        console.error("Failed to send error logs")
      }
    } catch (err) {
      console.error("Error sending logs:", err)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6 rounded-lg border bg-card p-8 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Something went wrong!
            </h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred in the application.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium">Error Details</h2>
          <div className="rounded-md border bg-muted/50 p-4">
            <p className="break-words font-mono text-sm text-foreground/80">
              {error.message || "Unknown error"}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </div>

        {error.stack && (
          <details className="group space-y-2">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              View Stack Trace
            </summary>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground/70">
                {error.stack}
              </pre>
            </div>
          </details>
        )}

        <div className="space-y-3 rounded-lg border bg-blue-50 p-4 dark:bg-blue-950/20">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Help us fix this issue
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Please send the error logs to the developer. We'll investigate and
            fix this issue as soon as possible.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={reset}
            variant="outline"
            className="flex-1"
            disabled={isSending}
          >
            Try Again
          </Button>
          <Button
            onClick={handleSendLogs}
            variant="default"
            className="flex-1"
            disabled={isSending || emailSent}
          >
            {isSending
              ? "Sending..."
              : emailSent
                ? "Logs Sent ✓"
                : "Send Logs to Developer"}
          </Button>
        </div>

        {emailSent && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/20 dark:text-green-200">
            Thank you! The error logs have been sent to the developer. You
            should receive a fix shortly.
          </div>
        )}
      </div>
    </div>
  )
}
