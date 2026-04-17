"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronRight,
  Copy,
  Loader2,
  Mail,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import Folder from "@/components/Folder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ClientSharedElement, SharedElement } from "@/components/view-transitions";
import { api } from "@/trpc/react";
import { DocumentsBackLink } from "../../_components/documents-back-link";
import {
  buildFolderPreviewItems,
  formatDateTime,
  getFolderColor,
  getReturnHref,
  useDocumentsTree,
} from "../../_components/documents-tree";

export default function ClientDocumentsPage() {
  const params = useParams<{ clientSlug: string }>();
  const router = useRouter();
  const { clients, error, isLoading } = useDocumentsTree();
  const [searchValue, setSearchValue] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [secondaryEmails, setSecondaryEmails] = useState("");
  const [sendingReturnId, setSendingReturnId] = useState<string | null>(null);
  const [recipientsOpen, setRecipientsOpen] = useState(false);

  const clientSlug = params.clientSlug;
  const client = useMemo(
    () => clients.find((entry) => entry.slug === clientSlug) ?? null,
    [clientSlug, clients],
  );

  const yearOptions = useMemo(() => {
    if (!client) return [{ label: "All years", value: "all" }];
    const years = Array.from(new Set(client.returns.map((r) => r.taxYear))).sort(
      (a, b) => b - a,
    );
    return [
      { label: "All years", value: "all" },
      ...years.map((y) => ({ label: `${y}`, value: `${y}` })),
    ];
  }, [client]);

  const filteredReturns = useMemo(() => {
    if (!client) return [];
    const q = searchValue.trim().toLowerCase();

    return client.returns.filter((rf) => {
      if (yearFilter !== "all" && `${rf.taxYear}` !== yearFilter) return false;
      if (!q) return true;
      return (
        rf.name.toLowerCase().includes(q) ||
        rf.jurisdictionCode.toLowerCase().includes(q) ||
        rf.jurisdictionName.toLowerCase().includes(q) ||
        `${rf.taxYear}`.includes(q)
      );
    });
  }, [client, searchValue, yearFilter]);

  const clientProfileQuery = api.portalAccess.getClientProfile.useQuery(
    client
      ? { orgId: client.orgId, entityName: client.name }
      : { orgId: "", entityName: "" },
    { enabled: Boolean(client) },
  );

  const upsertClientProfileMutation =
    api.portalAccess.upsertClientProfile.useMutation();
  const sendClientAccessLinkMutation =
    api.portalAccess.sendClientAccessLink.useMutation();

  useEffect(() => {
    setPrimaryEmail(clientProfileQuery.data?.primaryEmail ?? "");
    setSecondaryEmails(
      (clientProfileQuery.data?.secondaryEmails ?? []).join("\n"),
    );
  }, [
    clientProfileQuery.data?.primaryEmail,
    clientProfileQuery.data?.secondaryEmails,
    client?.id,
  ]);

  useEffect(() => {
    if (!client || !filteredReturns.length) return;
    filteredReturns.slice(0, 10).forEach((rf) => {
      router.prefetch(getReturnHref(client.slug, rf.id));
    });
  }, [client, filteredReturns, router]);

  const secondaryCount = useMemo(
    () =>
      secondaryEmails.split(/[\n,]+/).map((e) => e.trim()).filter(Boolean)
        .length,
    [secondaryEmails],
  );
  const recipientsSummary =
    !primaryEmail && secondaryCount === 0
      ? "No recipients"
      : `${primaryEmail ? "Primary set" : "No primary"}${
          secondaryCount > 0
            ? ` · +${secondaryCount} secondary`
            : ""
        }`;

  async function persistEmailsIfNeeded() {
    if (!client) return;
    await upsertClientProfileMutation.mutateAsync({
      orgId: client.orgId,
      entityName: client.name,
      displayName: client.name,
      primaryEmail: primaryEmail.trim() ? primaryEmail.trim() : null,
      secondaryEmails: secondaryEmails
        .split(/[\n,]+/)
        .map((e) => e.trim())
        .filter(Boolean),
    });
  }

  return (
    <main className="mx-auto max-w-[1280px] space-y-4">
      <section className="portal-card overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
          {client ? (
            <ClientSharedElement slug={client.slug}>
              <div className="space-y-2 min-w-0 flex-1">
                <DocumentsBackLink href="/documents" label="Back to clients" />
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                    {client.name}
                  </h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {client.orgName}
                  </p>
                </div>
              </div>
            </ClientSharedElement>
          ) : (
            <div className="space-y-2 min-w-0">
              <DocumentsBackLink href="/documents" label="Back to clients" />
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">
                  {isLoading ? (
                    <Skeleton className="h-6 w-56" />
                  ) : (
                    "Client not found"
                  )}
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Open a return to review files and available autofill.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {client ? (
              <>
                <span className="bg-muted/40 text-muted-foreground rounded-lg border px-2.5 py-1.5">
                  {client.returns.length} returns
                </span>
                <span className="bg-muted/40 text-muted-foreground rounded-lg border px-2.5 py-1.5">
                  {client.totalFiles} files
                </span>
                {client.autofillFieldCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-blue-700 dark:text-blue-300">
                    <Sparkles className="size-3" />
                    {client.autofillFieldCount} autofill
                  </span>
                ) : null}
                <Dialog open={recipientsOpen} onOpenChange={setRecipientsOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5">
                      <Users className="size-3.5" />
                      <span>Recipients</span>
                      <span className="text-muted-foreground hidden sm:inline">
                        · {recipientsSummary}
                      </span>
                    </Button>
                  </DialogTrigger>
                  <RecipientsDialogContent
                    primaryEmail={primaryEmail}
                    setPrimaryEmail={setPrimaryEmail}
                    secondaryEmails={secondaryEmails}
                    setSecondaryEmails={setSecondaryEmails}
                    saving={upsertClientProfileMutation.isPending}
                    onSave={async () => {
                      try {
                        await persistEmailsIfNeeded();
                        toast.success("Client recipient emails saved.");
                        void clientProfileQuery.refetch();
                        setRecipientsOpen(false);
                      } catch (err) {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Unable to save client emails.",
                        );
                      }
                    }}
                  />
                </Dialog>
              </>
            ) : null}
          </div>
        </div>

        {client && client.autofillFields.length > 0 ? (
          <div className="bg-blue-500/[0.04] border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]">
                <Sparkles className="size-3.5 text-blue-500" />
                Company autofill
              </span>
              <div className="flex flex-wrap gap-1.5">
                {client.autofillFields.slice(0, 10).map((field) => (
                  <span
                    key={field.key}
                    className="rounded-full border border-blue-500/25 bg-blue-500/[0.06] px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300"
                  >
                    {field.label}
                  </span>
                ))}
                {client.autofillFields.length > 10 ? (
                  <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium">
                    +{client.autofillFields.length - 10} more
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {client ? (
          <div className="bg-muted/20 flex flex-wrap items-center gap-2 border-b p-4">
            <div className="relative w-full max-w-sm">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search return, jurisdiction, or year"
                className="bg-background h-9 pl-9"
              />
            </div>

            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger
                aria-label="Filter by year"
                className="bg-background h-9 w-[160px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {yearOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-muted-foreground ml-auto text-xs">
              {filteredReturns.length}/{client.returns.length} returns
            </span>
          </div>
        ) : null}

        {error ? (
          <p className="p-6 text-sm text-red-600">{error.message}</p>
        ) : null}

        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="size-12 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && !error && client && filteredReturns.length > 0 ? (
          <ul className="divide-y">
            {filteredReturns.map((returnFolder) => {
              const href = getReturnHref(client.slug, returnFolder.id);
              const folderItems = buildFolderPreviewItems(
                returnFolder.files.map((f) => f.name),
              );
              const isSending = sendingReturnId === returnFolder.id;

              return (
                <li
                  key={returnFolder.id}
                  className="hover:bg-muted/15 group flex flex-wrap items-center gap-4 px-4 py-3 transition"
                >
                  <Link
                    href={href}
                    prefetch
                    onMouseEnter={() => router.prefetch(href)}
                    onFocus={() => router.prefetch(href)}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <SharedElement name={`doc-return-${returnFolder.id}`}>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Folder
                          color={getFolderColor(returnFolder.id)}
                          size={0.36}
                          items={folderItems}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <p className="text-base font-semibold leading-none">
                              {returnFolder.taxYear}
                            </p>
                            <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.15em]">
                              {returnFolder.jurisdictionCode}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-1 truncate text-xs">
                            {returnFolder.jurisdictionName} ·{" "}
                            {returnFolder.files.length} file
                            {returnFolder.files.length === 1 ? "" : "s"} · Updated{" "}
                            {formatDateTime(returnFolder.updatedAt)}
                          </p>
                        </div>
                      </div>
                    </SharedElement>
                  </Link>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={isSending}
                      onClick={async () => {
                        setSendingReturnId(returnFolder.id);
                        try {
                          await persistEmailsIfNeeded();
                          const result =
                            await sendClientAccessLinkMutation.mutateAsync({
                              taxReturnId: returnFolder.id,
                              sendEmail: true,
                            });
                          if (result.accessUrl) {
                            await navigator.clipboard.writeText(result.accessUrl);
                          }
                          toast.success(
                            `Access link emailed to ${result.recipientEmails.length} recipient(s).`,
                          );
                        } catch (err) {
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "Unable to send access link.",
                          );
                        } finally {
                          setSendingReturnId(null);
                        }
                      }}
                    >
                      {isSending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Mail className="size-3.5" />
                      )}
                      Send link
                    </Button>

                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Copy access link"
                      className="h-8 w-8"
                      disabled={isSending}
                      onClick={async () => {
                        setSendingReturnId(returnFolder.id);
                        try {
                          await persistEmailsIfNeeded();
                          const result =
                            await sendClientAccessLinkMutation.mutateAsync({
                              taxReturnId: returnFolder.id,
                              sendEmail: false,
                            });
                          if (!result.accessUrl) {
                            throw new Error("No access URL could be generated.");
                          }
                          await navigator.clipboard.writeText(result.accessUrl);
                          toast.success("Access link copied.");
                        } catch (err) {
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "Unable to create access link.",
                          );
                        } finally {
                          setSendingReturnId(null);
                        }
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>

                    <Button
                      asChild
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Open return"
                      className="h-8 w-8"
                    >
                      <Link href={href} prefetch>
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {!isLoading && !error && client && filteredReturns.length === 0 ? (
          <p className="text-muted-foreground p-10 text-center text-sm">
            No returns match your search/filter.
          </p>
        ) : null}

        {!isLoading && !error && !client ? (
          <p className="text-muted-foreground p-10 text-center text-sm">
            Client not found.
          </p>
        ) : null}
      </section>
    </main>
  );
}

function RecipientsDialogContent({
  primaryEmail,
  setPrimaryEmail,
  secondaryEmails,
  setSecondaryEmails,
  saving,
  onSave,
}: {
  primaryEmail: string;
  setPrimaryEmail: (v: string) => void;
  secondaryEmails: string;
  setSecondaryEmails: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Recipient emails</DialogTitle>
        <DialogDescription>
          Access links use the primary email by default and can optionally
          include secondary recipients.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="client-primary-email">Primary email</Label>
          <Input
            id="client-primary-email"
            type="email"
            value={primaryEmail}
            onChange={(e) => setPrimaryEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-secondary-emails">Secondary emails</Label>
          <Textarea
            id="client-secondary-emails"
            value={secondaryEmails}
            onChange={(e) => setSecondaryEmails(e.target.value)}
            placeholder={"finance@example.com\nops@example.com"}
            className="min-h-24"
          />
          <p className="text-muted-foreground text-xs">
            One email per line. Access links will be sent to the primary email
            and all secondary emails.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button disabled={saving} onClick={onSave}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Save emails
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
