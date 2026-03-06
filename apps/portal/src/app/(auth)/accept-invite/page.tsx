import { Suspense } from "react";
import { AcceptInvitePageClient } from "./accept-invite-page-client";

function AcceptInviteFallback() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Accept Portal Invitation</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Loading invitation details...
      </p>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInvitePageClient />
    </Suspense>
  );
}
