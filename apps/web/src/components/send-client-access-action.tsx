"use client";

import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Loader2 } from "@/lib/icons";
import { api } from "@/trpc/react";

type SendClientAccessActionProps = {
  taxReturnId: string;
  entityName: string;
  mode?: "button" | "menu-item";
  buttonLabel?: string;
  onSent?: () => void;
};

export function SendClientAccessAction({
  taxReturnId,
  entityName,
  mode = "button",
  buttonLabel = "Send to client",
  onSent,
}: SendClientAccessActionProps) {
  const sendMutation = api.taxReturn.sendClientAccessLink.useMutation();

  const handleSend = async () => {
    const toastId = `send-client-${taxReturnId}`;
    try {
      toast.loading(`Sending ${entityName} to client...`, { id: toastId });
      const result = await sendMutation.mutateAsync({
        taxReturnId,
        sendEmail: true,
      });
      toast.success(
        `Sent to ${result.recipientEmails.length} recipient(s).`,
        { id: toastId },
      );
      onSent?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send to client.",
        { id: toastId },
      );
    }
  };

  if (mode === "menu-item") {
    return (
      <DropdownMenuItem
        disabled={sendMutation.isPending}
        onSelect={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        {sendMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Mail className="mr-2 h-4 w-4" />
        )}
        Send to client
      </DropdownMenuItem>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={sendMutation.isPending}
      onClick={() => {
        void handleSend();
      }}
    >
      {sendMutation.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Mail className="mr-2 h-4 w-4" />
      )}
      {buttonLabel}
    </Button>
  );
}
