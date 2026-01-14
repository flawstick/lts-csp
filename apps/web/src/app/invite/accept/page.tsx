"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Building2, CheckCircle2, XCircle, Clock, Users, AlertTriangle } from "lucide-react"
import Link from "next/link"

interface InvitationDetails {
  email: string
  role: "owner" | "admin" | "member"
  expiresAt: string
  organisation: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
  }
  invitedBy: {
    id: string
    fullName: string | null
    avatarUrl: string | null
  }
}

export default function AcceptInvitationPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAccepting, setIsAccepting] = useState(false)
  const [acceptResult, setAcceptResult] = useState<{
    success: boolean
    message: string
    orgSlug?: string
  } | null>(null)

  useEffect(() => {
    async function fetchInvitation() {
      if (!token) {
        setError("No invitation token provided")
        setIsLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/invite/accept?token=${token}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Failed to load invitation")
          setIsLoading(false)
          return
        }

        setInvitation(data)
      } catch {
        setError("Failed to load invitation details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchInvitation()
  }, [token])

  async function handleAccept() {
    if (!token) return

    setIsAccepting(true)
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) {
          // Not logged in - redirect to login
          const returnUrl = encodeURIComponent(`/invite/accept?token=${token}`)
          router.push(`/login?returnUrl=${returnUrl}`)
          return
        }
        setError(data.error || "Failed to accept invitation")
        return
      }

      setAcceptResult({
        success: true,
        message: data.message,
        orgSlug: data.orgSlug,
      })
    } catch {
      setError("Failed to accept invitation")
    } finally {
      setIsAccepting(false)
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default"
      case "admin":
        return "secondary"
      default:
        return "outline"
    }
  }

  const getRoleLabel = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
            <Skeleton className="h-6 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Invitation Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unable to process invitation</AlertTitle>
              <AlertDescription>
                {error.includes("expired")
                  ? "This invitation link has expired. Please ask the organization admin to send a new invitation."
                  : "Please check the invitation link or contact the organization admin."}
              </AlertDescription>
            </Alert>
            <Button asChild className="w-full">
              <Link href="/">Go to Homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (acceptResult?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Welcome!</CardTitle>
            <CardDescription>{acceptResult.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={acceptResult.orgSlug ? `/org/${acceptResult.orgSlug}` : "/"}>
                Go to Organization
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!invitation) {
    return null
  }

  const expiresAt = new Date(invitation.expiresAt)
  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {invitation.organisation.logoUrl ? (
            <Avatar className="h-16 w-16 mx-auto mb-4">
              <AvatarImage src={invitation.organisation.logoUrl} alt={invitation.organisation.name} />
              <AvatarFallback>
                <Building2 className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          )}
          <CardTitle>Join {invitation.organisation.name}</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join this organization
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Invitation details */}
          <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Invited as</span>
              <Badge variant={getRoleBadgeVariant(invitation.role)}>
                {getRoleLabel(invitation.role)}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Invited by</span>
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={invitation.invitedBy.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs">
                    {invitation.invitedBy.fullName?.[0] || "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {invitation.invitedBy.fullName || "Team member"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Your email</span>
              <span className="text-sm font-medium">{invitation.email}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Expires</span>
              <div className="flex items-center gap-1.5 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {daysUntilExpiry > 1 ? `${daysUntilExpiry} days` : "Less than a day"}
                </span>
              </div>
            </div>
          </div>

          {/* Role explanation */}
          <div className="text-sm text-muted-foreground">
            <Users className="inline-block h-4 w-4 mr-1.5" />
            As a <strong>{getRoleLabel(invitation.role)}</strong>, you&apos;ll{" "}
            {invitation.role === "owner" && "have full control over the organization."}
            {invitation.role === "admin" && "be able to manage members and settings."}
            {invitation.role === "member" && "be able to view and work on tasks."}
          </div>

          {/* Accept button */}
          <Button
            onClick={handleAccept}
            disabled={isAccepting}
            className="w-full"
            size="lg"
          >
            {isAccepting ? "Accepting..." : "Accept Invitation"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By accepting, you&apos;ll join {invitation.organisation.name} and be able to collaborate with the team.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
