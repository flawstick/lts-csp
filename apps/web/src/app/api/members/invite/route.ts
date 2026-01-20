import { db } from "@repo/database"
import { eq } from "drizzle-orm"
import { accounts, globalAdmins, pendingInvitations } from "@repo/database"
import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { generateSecureToken } from "@/lib/email"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

async function checkGlobalAdmin(accountId: string): Promise<boolean> {
  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, accountId),
  })
  return !!admin
}

// POST - Invite a new user to the platform (global admin only)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!isGlobalAdmin) {
      return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 })
    }

    const body = await request.json()
    const { email } = body

    console.log("Invite request:", { accountId: account.id, isGlobalAdmin, email })

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Check if user already exists
    const existingAccount = await db.query.accounts.findFirst({
      where: eq(accounts.fullName, "placeholder"), // Just to check - we actually need to check by email
    })

    // Check via Supabase auth using admin client
    const adminClient = createAdminClient()
    const { data: authData } = await adminClient.auth.admin.listUsers()
    const existingUser = authData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existingUser) {
      const existingAcc = await db.query.accounts.findFirst({
        where: eq(accounts.userId, existingUser.id),
      })
      if (existingAcc) {
        return NextResponse.json({ error: "User already exists on the platform" }, { status: 400 })
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await db.query.pendingInvitations.findFirst({
      where: eq(pendingInvitations.email, email.toLowerCase()),
    })

    if (existingInvitation) {
      if (existingInvitation.status === "pending") {
        return NextResponse.json({ error: "An invitation has already been sent to this email" }, { status: 400 })
      }
      // If expired or revoked, delete and create new
      await db.delete(pendingInvitations).where(eq(pendingInvitations.id, existingInvitation.id))
    }

    // Generate secure token and expiry (7 days)
    const token = generateSecureToken(32) // 32 bytes = 64 hex chars (matches DB limit)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Create pending invitation
    const [invitation] = await db
      .insert(pendingInvitations)
      .values({
        email: email.toLowerCase(),
        token,
        invitedBy: account.id,
        expiresAt,
      })
      .returning()

    if (!invitation) {
      return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 })
    }

    // Build accept URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
    const acceptUrl = `${baseUrl}/invite/accept?token=${token}`

    // Send invitation email
    try {
      const expiryDate = expiresAt.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })

      const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"

      await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: "You've been invited to join LTS Tax",
        headers: {
          'X-Entity-Ref-ID': invitation.id,
        },
        tags: [
          { name: 'category', value: 'invitation' }
        ],
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">LTS Tax</h1>
              </div>

              <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
                <h2 style="color: #1f2937; margin-top: 0;">You're Invited!</h2>

                <p style="color: #4b5563;">
                  <strong>${account.fullName ?? "An administrator"}</strong> has invited you to join the LTS Tax platform.
                </p>

                <p style="color: #4b5563;">
                  LTS Tax is an AI-powered tax compliance platform that automates ESR returns and other tax filings.
                </p>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${acceptUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                    Accept Invitation
                  </a>
                </div>

                <div style="background: #f9fafb; border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                  <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Or copy your invitation token:</p>
                  <p style="font-size: 16px; font-weight: bold; letter-spacing: 2px; margin: 0; color: #1f2937; font-family: monospace; word-break: break-all;">
                    ${token}
                  </p>
                </div>

                <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
                  If you didn't expect this invitation, you can safely ignore this email.
                  <br><br>
                  This invitation link will expire on ${expiryDate}.
                </p>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  <p style="color: #6b7280; font-size: 13px; margin: 0;">
                    Questions? Reply to this email or contact us at <a href="mailto:hello@email.aionarete.com" style="color: #667eea; text-decoration: none;">hello@email.aionarete.com</a>
                  </p>
                </div>
              </div>

              <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
                <p>&copy; ${new Date().getFullYear()} LTS Tax. All rights reserved.</p>
              </div>
            </body>
          </html>
        `,
      })
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError)
      await db.delete(pendingInvitations).where(eq(pendingInvitations.id, invitation.id))
      return NextResponse.json({ error: "Failed to send invitation email" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Invitation sent to ${email}`,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      },
    })
  } catch (error) {
    console.error("Failed to invite user:", error)
    return NextResponse.json({ error: "Failed to invite user" }, { status: 500 })
  }
}

// GET - List all pending invitations (global admin only)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!isGlobalAdmin) {
      return NextResponse.json({ error: "Only admins can view invitations" }, { status: 403 })
    }

    const invitations = await db.query.pendingInvitations.findMany({
      where: eq(pendingInvitations.status, "pending"),
      with: {
        invitedByAccount: {
          columns: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: (invitations, { desc }) => [desc(invitations.createdAt)],
    })

    return NextResponse.json(invitations)
  } catch (error) {
    console.error("Failed to get invitations:", error)
    return NextResponse.json({ error: "Failed to get invitations" }, { status: 500 })
  }
}
