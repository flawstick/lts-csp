"use client";

import { Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { api } from "@/trpc/react";

type PortalClientAccessMenuSectionProps = {
  taxReturnId: string;
  entityName: string;
};

export function PortalClientAccessMenuSection({
  taxReturnId,
  entityName,
}: PortalClientAccessMenuSectionProps) {
  const sendMutation = api.portalAccess.sendClientAccessLink.useMutation();
  const copyMutation = api.portalAccess.sendClientAccessLink.useMutation();

  const isBusy = sendMutation.isPending || copyMutation.isPending;

  const handleSend = async () => {
    try {
      const result = await sendMutation.mutateAsync({
        taxReturnId,
        sendEmail: true,
      });

      toast.success(
        result.recipientEmails.length > 0
          ? `Access link sent to ${result.recipientEmails.length} recipient(s).`
          : `Access link sent for ${entityName}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send access link.",
      );
    }
  };

  const handleCopy = async () => {
    try {
      const result = await copyMutation.mutateAsync({
        taxReturnId,
        sendEmail: false,
      });

      if (!result.accessUrl) {
        throw new Error("No access URL could be generated.");
      }

      await navigator.clipboard.writeText(result.accessUrl);
      toast.success("Access link copied.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create access link.",
      );
    }
  };

  return (
    <>
      <DropdownMenuLabel>Client access</DropdownMenuLabel>
      <DropdownMenuItem
        disabled={isBusy}
        onSelect={(event) => {
          event.preventDefault();
          void handleCopy();
        }}
      >
        {copyMutation.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Copy />
        )}
        Copy link
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={isBusy}
        onSelect={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        {sendMutation.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Mail />
        )}
        Send to client
      </DropdownMenuItem>
    </>
  );
}
