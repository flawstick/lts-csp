import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AcceptInvitePageClient } from "./accept-invite-page-client";

function AcceptInviteFallback() {
  return (
    <div className="flex h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading invitation...</p>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInvitePageClient />
    </Suspense>
  );
}
