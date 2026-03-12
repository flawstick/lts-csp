"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { Building2, Loader2, Mail, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShieldCheckIcon, type ShieldCheckIconHandle } from "@/components/ui/shield-check";
import { LockIcon, type LockIconHandle } from "@/components/ui/lock";
import { FileTextIcon, type FileTextIconHandle } from "@/components/ui/file-text";
import { EyeIcon, type EyeIconHandle } from "@/components/ui/eye";
import { api } from "@/trpc/react";

const Grainient = dynamic(() => import("@/components/Grainient"), {
  ssr: false,
});

export default function WaitingForInvitePage() {
  const router = useRouter();
  const shieldRef = useRef<ShieldCheckIconHandle>(null);
  const lockRef = useRef<LockIconHandle>(null);
  const fileRef = useRef<FileTextIconHandle>(null);
  const eyeRef = useRef<EyeIconHandle>(null);

  const animateAll = () => {
    shieldRef.current?.startAnimation();
    lockRef.current?.startAnimation();
    fileRef.current?.startAnimation();
    eyeRef.current?.startAnimation();
  };

  const stopAll = () => {
    shieldRef.current?.stopAnimation();
    lockRef.current?.stopAnimation();
    fileRef.current?.stopAnimation();
    eyeRef.current?.stopAnimation();
  };

  const invitationsQuery = api.portalAccess.getMyPendingInvitations.useQuery(
    undefined,
    { retry: false },
  );

  const acceptMutation = api.portalAccess.acceptInvitationById.useMutation({
    onSuccess: () => {
      router.push("/");
      router.refresh();
    },
  });

  const invitations = invitationsQuery.data?.invitations ?? [];
  const isLoading = invitationsQuery.isLoading;

  return (
    <div className="grid h-svh overflow-hidden lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 font-medium">
            <img src="/logo.png" alt="LTS Tax" width={20} height={20} />
            LTS Client Portal
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <Image src="/logo.png" alt="LTS Tax" width={32} height={32} />
                <h1 className="text-2xl font-bold">
                  {invitations.length > 0 ? "You have an invitation" : "Waiting for invite"}
                </h1>
                <p className="text-muted-foreground text-sm text-balance">
                  {invitations.length > 0
                    ? "Accept the invitation below to access your client portal."
                    : "Your identity is ready. Once your administrator sends an invite, it will appear here."}
                </p>
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-8">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Checking for invitations...</p>
                </div>
              ) : null}

              {!isLoading && invitations.length === 0 ? (
                <div className="flex flex-col items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-6 text-center">
                  <XCircle className="size-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">No pending invitations</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ask your administrator to send you an invitation.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => invitationsQuery.refetch()}
                  >
                    Check again
                  </Button>
                </div>
              ) : null}

              {!isLoading && invitations.length > 0 ? (
                <div className="space-y-4">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="space-y-3">
                      <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-muted/10">
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                            <Building2 className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Organisation</p>
                            <p className="truncate text-sm font-medium">{inv.org.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                            <Mail className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Invited as</p>
                            <p className="truncate text-sm font-medium">{inv.email}</p>
                          </div>
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        size="lg"
                        disabled={acceptMutation.isPending}
                        onClick={() => acceptMutation.mutate({ invitationId: inv.id })}
                      >
                        {acceptMutation.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Accepting...
                          </>
                        ) : (
                          "Accept invitation"
                        )}
                      </Button>
                    </div>
                  ))}

                  {acceptMutation.isError ? (
                    <p className="text-center text-sm text-destructive">
                      {acceptMutation.error.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l lg:block">
        <div className="absolute inset-0">
          <Grainient />
        </div>
        <div className="relative flex h-full items-center justify-center p-10">
          <div className="relative w-full max-w-md">
            <div className="absolute -inset-[5px] rounded-[calc(1rem+5px)] bg-gradient-to-b from-white/70 via-white/40 to-white/25 shadow-[0_0_60px_-4px_rgba(255,255,255,0.2)] dark:from-background/70 dark:via-background/40 dark:to-background/25 dark:shadow-[0_0_60px_-4px_hsl(var(--background)/0.2)]" />
            <div
              className="relative rounded-2xl bg-background/85 px-6 py-5 text-center backdrop-blur-xl"
              onMouseEnter={animateAll}
              onMouseLeave={stopAll}
            >
              <ShieldCheckIcon ref={shieldRef} size={24} className="mx-auto flex justify-center text-foreground" />
              <h2 className="mt-2.5 text-base font-semibold">Secure Client Portal</h2>
              <div className="mx-auto mt-4 flex max-w-xs justify-center gap-6 text-xs text-foreground">
                <span className="flex flex-col items-center gap-1.5">
                  <LockIcon ref={lockRef} size={18} />
                  Encrypted
                </span>
                <span className="flex flex-col items-center gap-1.5">
                  <FileTextIcon ref={fileRef} size={18} />
                  Audit logged
                </span>
                <span className="flex flex-col items-center gap-1.5">
                  <EyeIcon ref={eyeRef} size={18} />
                  Reviewable
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
