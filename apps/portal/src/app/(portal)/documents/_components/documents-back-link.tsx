"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

type DocumentsBackLinkProps = {
  href: string;
  label: string;
};

export function DocumentsBackLink({ href, label }: DocumentsBackLinkProps) {
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="group h-8 cursor-pointer rounded-full border-border/70 bg-background/80 px-2.5 shadow-xs backdrop-blur-sm hover:bg-muted/70"
    >
      <Link href={href} prefetch>
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted/70 transition group-hover:bg-primary/15">
          <ArrowLeft className="size-3.5" />
        </span>
        <span className="pr-1 text-xs font-semibold tracking-tight">{label}</span>
      </Link>
    </Button>
  );
}
