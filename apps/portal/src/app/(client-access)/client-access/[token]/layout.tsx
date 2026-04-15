import { Toaster } from "@/components/ui/sonner";

import { ClientAccessShell } from "./_components/client-access-shell";

export default async function ClientAccessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <>
      <ClientAccessShell token={token}>{children}</ClientAccessShell>
      <Toaster />
    </>
  );
}
