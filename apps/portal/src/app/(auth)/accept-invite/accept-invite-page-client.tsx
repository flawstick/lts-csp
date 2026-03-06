"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/trpc/react";

interface InvitationInfo {
  id: string;
  email: string;
  status: string;
  org: { id: string; name: string; slug: string };
  expiresAt: string;
}

export function AcceptInvitePageClient() {
  const router = useRouter();
  const params = useSearchParams();
  const initialToken = useMemo(() => params.get("token") ?? "", [params]);

  const [token, setToken] = useState(initialToken);
  const [message, setMessage] = useState<string | null>(null);
  const inviteQuery = api.portalAccess.getInvitationByToken.useQuery(
    { token: initialToken },
    { enabled: initialToken.length > 0, retry: false },
  );

  const acceptInviteMutation = api.portalAccess.acceptInvitation.useMutation({
    onSuccess: () => {
      router.push("/");
      router.refresh();
    },
  });

  const acceptInvite = async () => {
    setMessage(null);

    try {
      await acceptInviteMutation.mutateAsync({ token });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to accept invitation");
    }
  };

  const invitation = inviteQuery.data?.invitation as InvitationInfo | undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Accept Portal Invitation</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Use your invite token to activate access to your client organisation.
      </p>

      <div className="mt-6 space-y-3">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste invitation token"
          className="w-full rounded-md border px-3 py-2"
        />
        <button
          onClick={acceptInvite}
          disabled={acceptInviteMutation.isPending || token.length < 8}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {acceptInviteMutation.isPending ? "Accepting..." : "Accept invite"}
        </button>
      </div>

      {invitation ? (
        <div className="mt-6 rounded-md border p-4 text-sm">
          <p><strong>Organization:</strong> {invitation.org.name}</p>
          <p><strong>Invited email:</strong> {invitation.email}</p>
          <p><strong>Status:</strong> {invitation.status}</p>
        </div>
      ) : null}

      {inviteQuery.error && !message ? (
        <p className="mt-4 text-sm text-red-600">{inviteQuery.error.message}</p>
      ) : null}
      {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}
    </main>
  );
}
