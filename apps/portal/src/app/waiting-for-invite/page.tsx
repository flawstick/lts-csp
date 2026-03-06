"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/trpc/react";

export default function WaitingForInvitePage() {
  const [message, setMessage] = useState<string | null>(null);
  const requestAccessMutation = api.portalAccess.requestAccess.useMutation({
    onSuccess: (result) => {
      setMessage(result.message);
    },
    onError: (error) => {
      setMessage(error.message);
    },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Waiting for Client Invite</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Your identity is created, but you do not have active client memberships yet.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/accept-invite" className="rounded-md bg-black px-4 py-2 text-white">
          Accept invitation
        </Link>
        <button
          type="button"
          onClick={() => requestAccessMutation.mutate()}
          disabled={requestAccessMutation.isPending}
          className="rounded-md border px-4 py-2 disabled:opacity-60"
        >
          {requestAccessMutation.isPending ? "Requesting..." : "Request access"}
        </button>
      </div>
      {message ? <p className="mt-4 text-sm text-neutral-600">{message}</p> : null}
    </main>
  );
}
