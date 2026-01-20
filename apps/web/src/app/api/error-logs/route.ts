import { Resend } from "resend"
import { NextResponse } from "next/server"
import { env } from "@/env"

const resend = new Resend(env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { errorMessage, errorStack, errorDigest, url, userAgent } = body

    // Format the error log email
    const emailHtml = `
      <div style="font-family: monospace; padding: 20px;">
        <h2 style="color: #dc2626;">Application Error Report</h2>

        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="margin-top: 0;">Error Details</h3>
          <p><strong>Message:</strong> ${errorMessage || "No message"}</p>
          ${errorDigest ? `<p><strong>Digest:</strong> ${errorDigest}</p>` : ""}
          <p><strong>URL:</strong> ${url || "Unknown"}</p>
          <p><strong>User Agent:</strong> ${userAgent || "Unknown"}</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        </div>

        ${
          errorStack
            ? `
        <div style="background: #1f2937; color: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; overflow-x: auto;">
          <h3 style="margin-top: 0; color: #f9fafb;">Stack Trace</h3>
          <pre style="margin: 0; white-space: pre-wrap;">${errorStack}</pre>
        </div>
        `
            : ""
        }

        <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
          This error was reported from the LTS Tax application error boundary.
        </p>
      </div>
    `

    const data = await resend.emails.send({
      from: "LTS Tax Errors <errors@flawstick.com>",
      to: ["dev@flawstick.com"],
      subject: `[LTS] Application Error: ${errorMessage?.slice(0, 50) || "Unknown Error"}`,
      html: emailHtml,
    })

    return NextResponse.json({ success: true, id: data.data?.id })
  } catch (error) {
    console.error("Failed to send error log:", error)
    return NextResponse.json(
      { error: "Failed to send error log", details: String(error) },
      { status: 500 }
    )
  }
}
