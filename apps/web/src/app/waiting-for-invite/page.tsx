import { Mail, Clock } from "@/lib/icons"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { db } from "@repo/database"
import { eq, and } from "drizzle-orm"
import { pendingInvitations } from "@repo/database"
import { AcceptInviteButton } from "./accept-invite-button"
import { SignOutButton } from "./sign-out-button"

export default async function WaitingForInvitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const email = user.email || ""

  // Check for pending invitation for this email
  let invitationToken: string | null = null
  if (email) {
    const invitation = await db.query.pendingInvitations.findFirst({
      where: and(
        eq(pendingInvitations.email, email),
        eq(pendingInvitations.status, "pending")
      ),
    })

    if (invitation) {
      const isExpired = new Date() > invitation.expiresAt
      if (!isExpired) {
        invitationToken = invitation.token
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
            <Clock className="h-8 w-8 text-purple-600" />
          </div>
          <CardTitle className="text-2xl">Waiting for Invitation</CardTitle>
          <CardDescription className="text-base">
            Your account has been created successfully
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-foreground">
                  You're signed in as:
                </p>
                <p className="text-muted-foreground">{email}</p>
              </div>
            </div>
          </div>

          {invitationToken ? (
            <>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="text-green-600 font-medium">
                  Great news! You have a pending invitation.
                </p>
                <p>
                  Click the button below to accept your invitation and get started.
                </p>
              </div>

              <AcceptInviteButton token={invitationToken} />
            </>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                You need to be invited by a platform administrator to access LTS Tax.
              </p>
              <p>
                Once you receive an invitation email, click the link in the email to accept.
              </p>
            </div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  )
}
