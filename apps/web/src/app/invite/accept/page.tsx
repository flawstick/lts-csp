"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Clock } from "@/lib/icons";

interface InvitationDetails {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  isExpired: boolean;
  isAccepted: boolean;
  isRevoked: boolean;
  invitedBy: {
    id: string;
    fullName?: string;
    avatarUrl?: string;
  };
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  );
}

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided");
      setLoading(false);
      return;
    }

    fetch(`/api/invite/accept?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setInvitation(data);
        }
      })
      .catch(() => {
        setError("Failed to load invitation details");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;

    setAccepting(true);
    setError(null);

    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/login?redirect=/invite/accept?token=${token}`);
          return;
        }
        setError(data.error ?? "Failed to accept invitation");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch {
      setError("Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push("/")} variant="outline">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <CardTitle>Welcome to LTS Tax!</CardTitle>
            <CardDescription>
              Your account has been created successfully
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">Redirecting you now...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitation) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">LTS</span>
          </div>

          <CardTitle>Join LTS Tax</CardTitle>
          <CardDescription>
            {invitation.invitedBy.fullName ?? "An administrator"} has invited you to join the LTS Tax platform
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {(invitation.isExpired || invitation.isAccepted || invitation.isRevoked) ? (
            <div className="text-center space-y-4">
              {invitation.isExpired && (
                <>
                  <Clock className="h-12 w-12 text-amber-500 mx-auto" />
                  <p className="text-muted-foreground">This invitation has expired</p>
                </>
              )}
              {invitation.isAccepted && (
                <>
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-muted-foreground">This invitation has already been accepted</p>
                </>
              )}
              {invitation.isRevoked && (
                <>
                  <XCircle className="h-12 w-12 text-destructive mx-auto" />
                  <p className="text-muted-foreground">This invitation has been revoked</p>
                </>
              )}
              <Button onClick={() => router.push("/")} variant="outline" className="w-full">
                Go Home
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium">{invitation.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Expires</span>
                  <span className="text-sm">
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                LTS Tax is an AI-powered tax compliance platform that helps automate ESR returns and other tax filings.
              </p>

              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                  {error}
                </div>
              )}

              <Button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                {accepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  "Accept Invitation"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By accepting, you agree to join LTS Tax and follow our terms of service
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
