"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Check, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrgSettingsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const orgQuery = api.portalAccess.getOrg.useQuery({ orgId });
  const utils = api.useUtils();

  const [accountName, setAccountName] = useState<string | null>(null);
  const [hasEdited, setHasEdited] = useState(false);

  const displayValue = hasEdited
    ? (accountName ?? "")
    : (orgQuery.data?.accountName ?? "");

  const updateAccountName = api.portalAccess.updateAccountName.useMutation({
    onSuccess: () => {
      toast.success("Account name updated");
      setHasEdited(false);
      void utils.portalAccess.getOrg.invalidate({ orgId });
    },
    onError: (err) => toast.error(err.message),
  });

  const isAdmin = orgQuery.data?.role === "admin";

  if (orgQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="portal-card p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
              <Settings className="size-4.5" />
            </span>
            <div>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-1.5 h-3.5 w-48" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-1.5 h-3 w-64" />
          <Skeleton className="mt-4 h-9 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="portal-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
            <Settings className="size-4.5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage settings for {orgQuery.data?.name}.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
        <p className="text-sm font-semibold">Accounting name</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Used as the &quot;Prepared by&quot; name on tax returns. Defaults to your organisation name if not set.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Input
            placeholder={orgQuery.data?.name ?? "Organisation name"}
            value={displayValue}
            onChange={(e) => {
              setAccountName(e.target.value);
              setHasEdited(true);
            }}
            disabled={!isAdmin}
            className="max-w-sm"
          />
          {isAdmin && hasEdited ? (
            <Button
              size="sm"
              disabled={updateAccountName.isPending}
              onClick={() =>
                updateAccountName.mutate({
                  orgId,
                  accountName: accountName?.trim() ?? null,
                })
              }
            >
              {updateAccountName.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Save
            </Button>
          ) : null}
        </div>

        {!isAdmin ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Only admins can change this setting.
          </p>
        ) : null}
      </div>
    </div>
  );
}
