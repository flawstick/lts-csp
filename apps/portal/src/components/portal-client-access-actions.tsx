"use client";

import { Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
      <div
        className="grid grid-cols-2 gap-2 px-2 pb-1"
        onClick={(event) => event.stopPropagation()}
      >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={copyMutation.isPending || sendMutation.isPending}
        onClick={() => {
          void handleCopy();
        }}
      >
        {copyMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Copy className="size-4" />
        )}
        Copy link
      </Button>

      <Button
        type="button"
        size="sm"
        disabled={sendMutation.isPending || copyMutation.isPending}
        onClick={() => {
          void handleSend();
        }}
      >
        {sendMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Mail className="size-4" />
        )}
        Send
      </Button>
      </div>
      <DropdownMenuSeparator />
    </>
  );
}
