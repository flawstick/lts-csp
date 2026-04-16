"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrgSettingsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const orgQuery = api.portalAccess.getOrg.useQuery({ orgId });
  const utils = api.useUtils();

  const [accountName, setAccountName] = useState<string | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoClientSearch, setDemoClientSearch] = useState("");
  const [visibleClientNames, setVisibleClientNames] = useState<string[]>([]);
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [hasEdited, setHasEdited] = useState(false);
  const [hasDemoEdited, setHasDemoEdited] = useState(false);
  const [hasContactEdited, setHasContactEdited] = useState(false);

  const displayValue = hasEdited
    ? (accountName ?? "")
    : (orgQuery.data?.accountName ?? "");
  const displayContactName = hasContactEdited
    ? (contactName ?? "")
    : (orgQuery.data?.contactInfo?.name ?? "");
  const displayContactEmail = hasContactEdited
    ? (contactEmail ?? "")
    : (orgQuery.data?.contactInfo?.email ?? "");
  const displayContactPhone = hasContactEdited
    ? (contactPhone ?? "")
    : (orgQuery.data?.contactInfo?.phone ?? "");

  const availableDemoClients = orgQuery.data?.availableDemoClients ?? [];
  const filteredDemoClients = useMemo(() => {
    const query = demoClientSearch.trim().toLowerCase();
    if (!query) {
      return availableDemoClients;
    }

    return availableDemoClients.filter((clientName) =>
      clientName.toLowerCase().includes(query),
    );
  }, [availableDemoClients, demoClientSearch]);

  useEffect(() => {
    if (!orgQuery.data) {
      return;
    }

    setDemoEnabled(orgQuery.data.demoMode?.enabled === true);
    setVisibleClientNames(orgQuery.data.demoMode?.visibleClientNames ?? []);
    setHasDemoEdited(false);
    setContactName(orgQuery.data.contactInfo?.name ?? null);
    setContactEmail(orgQuery.data.contactInfo?.email ?? null);
    setContactPhone(orgQuery.data.contactInfo?.phone ?? null);
    setHasContactEdited(false);
  }, [orgQuery.data]);

  const updateAccountName = api.portalAccess.updateAccountName.useMutation({
    onSuccess: () => {
      toast.success("Account name updated");
      setHasEdited(false);
      void utils.portalAccess.getOrg.invalidate({ orgId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateDemoMode = api.portalAccess.updateDemoMode.useMutation({
    onSuccess: () => {
      toast.success("Demo mode updated");
      setHasDemoEdited(false);
      void utils.portalAccess.getOrg.invalidate({ orgId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateContactInfo = api.portalAccess.updateContactInfo.useMutation({
    onSuccess: () => {
      toast.success("Contact information updated");
      setHasContactEdited(false);
      void utils.portalAccess.getOrg.invalidate({ orgId });
    },
    onError: (err) => toast.error(err.message),
  });

  const isAdmin = orgQuery.data?.role === "admin";

  function toggleDemoClient(clientName: string) {
    setVisibleClientNames((current) => {
      const next = current.includes(clientName)
        ? current.filter((name) => name !== clientName)
        : [...current, clientName];
      return next;
    });
    setHasDemoEdited(true);
  }

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
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-1.5 h-3 w-56" />
          <Skeleton className="mt-4 h-9 w-full" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-1.5 h-3 w-72" />
          <Skeleton className="mt-4 h-9 w-full" />
          <Skeleton className="mt-3 h-9 w-full" />
          <Skeleton className="mt-3 h-9 w-full" />
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

      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
        <p className="text-sm font-semibold">Client portal contact information</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Shown to external clients in their access link and emails. Leave any field blank to fall back to the default LTS contact information.
        </p>

        <div className="mt-4 grid gap-3 max-w-xl">
          <Input
            placeholder={orgQuery.data?.effectiveContactInfo?.name ?? "Jonny Woodgate"}
            value={displayContactName}
            onChange={(e) => {
              setContactName(e.target.value);
              setHasContactEdited(true);
            }}
            disabled={!isAdmin}
          />
          <Input
            placeholder={
              orgQuery.data?.effectiveContactInfo?.email ??
              "taxenquiries@lts-tax.com"
            }
            type="email"
            value={displayContactEmail}
            onChange={(e) => {
              setContactEmail(e.target.value);
              setHasContactEdited(true);
            }}
            disabled={!isAdmin}
          />
          <Input
            placeholder={orgQuery.data?.effectiveContactInfo?.phone ?? "01481 755862"}
            value={displayContactPhone}
            onChange={(e) => {
              setContactPhone(e.target.value);
              setHasContactEdited(true);
            }}
            disabled={!isAdmin}
          />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Default fallback: {orgQuery.data?.effectiveContactInfo?.name ?? "Jonny Woodgate"} ·{" "}
          {orgQuery.data?.effectiveContactInfo?.email ?? "taxenquiries@lts-tax.com"} ·{" "}
          {orgQuery.data?.effectiveContactInfo?.phone ?? "01481 755862"}
        </p>

        {isAdmin && hasContactEdited ? (
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              disabled={updateContactInfo.isPending}
              onClick={() =>
                updateContactInfo.mutate({
                  orgId,
                  name: contactName?.trim() ? contactName.trim() : null,
                  email: contactEmail?.trim() ? contactEmail.trim() : null,
                  phone: contactPhone?.trim() ? contactPhone.trim() : null,
                })
              }
            >
              {updateContactInfo.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Save contact information
            </Button>
          </div>
        ) : null}

        {!isAdmin ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Only admins can change this setting.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Demo mode</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Restrict the portal to selected clients only for demos.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={demoEnabled}
              disabled={!isAdmin}
              onCheckedChange={(checked) => {
                setDemoEnabled(checked === true);
                setHasDemoEdited(true);
              }}
            />
            Enable
          </label>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Choose which clients stay visible while demo mode is on.
            </p>
            <span className="inline-flex items-center rounded-full border border-border/70 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {visibleClientNames.length} selected
            </span>
          </div>

          <Input
            value={demoClientSearch}
            onChange={(e) => setDemoClientSearch(e.target.value)}
            placeholder="Search clients"
            disabled={!isAdmin || availableDemoClients.length === 0}
            className="max-w-sm"
          />

          {availableDemoClients.length > 0 ? (
            <ScrollArea className="h-56 rounded-lg border border-border/70">
              <div className="space-y-1 p-3">
                {filteredDemoClients.length > 0 ? (
                  filteredDemoClients.map((clientName) => {
                    const selected = visibleClientNames.includes(clientName);

                    return (
                      <label
                        key={clientName}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {clientName}
                        </span>
                        <Checkbox
                          checked={selected}
                          disabled={!isAdmin}
                          onCheckedChange={() => toggleDemoClient(clientName)}
                        />
                      </label>
                    );
                  })
                ) : (
                  <p className="px-2 py-6 text-sm text-muted-foreground">
                    No clients match your search.
                  </p>
                )}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">
              No clients are available for this organisation yet.
            </p>
          )}

          {isAdmin && hasDemoEdited ? (
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={updateDemoMode.isPending}
                onClick={() =>
                  updateDemoMode.mutate({
                    orgId,
                    enabled: demoEnabled,
                    visibleClientNames,
                  })
                }
              >
                {updateDemoMode.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Save demo mode
              </Button>
            </div>
          ) : null}

          {!isAdmin ? (
            <p className="text-xs text-muted-foreground">
              Only admins can change this setting.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
