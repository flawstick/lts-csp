import { db } from "@repo/database"
import { eq, and } from "drizzle-orm"
import { orgMembers, accounts, globalAdmins, organisations, pendingInvitations } from "@repo/database"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canManageMembers, canEditMemberRoles, type OrgRole } from "@/lib/permissions"
import { sendInvitationEmail, generateSecureToken } from "@/lib/email"

async function checkGlobalAdmin(accountId: string): Promise<boolean> {
  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, accountId),
  })
  return !!admin
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get account by user ID
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Check if user is a member with permission
    const currentMembership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!currentMembership && !isGlobalAdmin) {
      return NextResponse.json({ error: "Not a member of this organisation" }, { status: 403 })
    }

    // Only admins, owners, or global admins can invite
    if (!isGlobalAdmin && !canManageMembers(currentMembership?.role as OrgRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const { email, role } = body

    if (!email || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 })
    }

    if (!["owner", "admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    // Only owners or global admins can invite owners
    if (role === "owner" && !isGlobalAdmin && !canEditMemberRoles(currentMembership?.role as OrgRole)) {
      return NextResponse.json({ error: "Only owners can invite other owners" }, { status: 403 })
    }

    // Get organisation details
    const org = await db.query.organisations.findFirst({
      where: eq(organisations.id, orgId),
    })

    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 })
    }

    // Check if there's already an existing member with this email
    // We need to look up the user in Supabase by email
    const { data: userByEmail } = await supabase.auth.admin.listUsers().catch(() => ({ data: { users: [] } }))
    const matchingUser = userByEmail?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (matchingUser) {
      // Check if this user is already a member
      const matchingAccount = await db.query.accounts.findFirst({
        where: eq(accounts.userId, matchingUser.id),
      })

      if (matchingAccount) {
        const existingMembership = await db.query.orgMembers.findFirst({
          where: and(
            eq(orgMembers.orgId, orgId),
            eq(orgMembers.accountId, matchingAccount.id)
          ),
        })

        if (existingMembership) {
          return NextResponse.json({ error: "User is already a member of this organisation" }, { status: 400 })
        }
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await db.query.pendingInvitations.findFirst({
      where: and(
        eq(pendingInvitations.orgId, orgId),
        eq(pendingInvitations.email, email.toLowerCase()),
        eq(pendingInvitations.status, "pending")
      ),
    })

    if (existingInvitation) {
      return NextResponse.json({ error: "An invitation has already been sent to this email" }, { status: 400 })
    }

    // Generate secure token and expiry (7 days)
    const token = generateSecureToken(48)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Create pending invitation
    const [invitation] = await db
      .insert(pendingInvitations)
      .values({
        orgId,
        email: email.toLowerCase(),
        role: role as "owner" | "admin" | "member",
        token,
        invitedBy: account.id,
        expiresAt,
      })
      .returning()

    // Build accept URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"
    const acceptUrl = `${baseUrl}/invite/accept?token=${token}`

    // Send invitation email
    try {
      await sendInvitationEmail({
        to: email,
        inviterName: account.fullName || "A team member",
        organisationName: org.name,
        role: role as "owner" | "admin" | "member",
        acceptUrl,
        expiresAt,
      })
    } catch (emailError) {
      // If email fails, delete the invitation and return error
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
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
    })
  } catch (error) {
    console.error("Failed to invite member:", error)
    return NextResponse.json({ error: "Failed to invite member" }, { status: 500 })
  }
}

// GET pending invitations for an organisation
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params
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

    const currentMembership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!currentMembership && !isGlobalAdmin) {
      return NextResponse.json({ error: "Not a member of this organisation" }, { status: 403 })
    }

    // Get pending invitations
    const invitations = await db.query.pendingInvitations.findMany({
      where: and(
        eq(pendingInvitations.orgId, orgId),
        eq(pendingInvitations.status, "pending")
      ),
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
