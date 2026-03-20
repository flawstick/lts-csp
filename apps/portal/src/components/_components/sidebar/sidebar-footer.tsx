"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronsUpDown,
  EyeOff,
  LogOut,
  Minus,
  MessageSquarePlus,
  Settings,
  X,
} from "lucide-react";

import { SidebarIcon } from "@/components/ui/animated-icons";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { FeedbackDialog } from "@/components/feedback-dialog";

import { cn } from "@/lib/utils";

type SidebarFooterSectionProps = {
  email?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  settingsHref?: string | null;
  onLogout: () => Promise<void>;
};

function getInitials(name: string | null | undefined) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function SidebarFooterSection({
  email,
  fullName,
  avatarUrl,
  settingsHref,
  onLogout,
}: SidebarFooterSectionProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCardDismissed, setFeedbackCardDismissed] = useState(() => {
    try {
      return localStorage.getItem("feedback-card-hidden") === "true";
    } catch {
      return false;
    }
  });
  const [feedbackCardHovered, setFeedbackCardHovered] = useState(false);
  const [feedbackDropdownOpen, setFeedbackDropdownOpen] = useState(false);
  const { state: sidebarState } = useSidebar();

  const showFeedbackCard =
    !feedbackCardDismissed && sidebarState !== "collapsed";
  const showFeedbackNavButton =
    feedbackCardDismissed || sidebarState === "collapsed";

  return (
    <SidebarFooter className="px-2.5 pt-0 pb-3 group-data-[collapsible=icon]:px-0">
      <AnimatePresence initial={false}>
        {showFeedbackCard ? (
          <motion.div
            key="feedback-card"
            layout
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onHoverStart={() => setFeedbackCardHovered(true)}
            onHoverEnd={() => {
              if (!feedbackDropdownOpen) setFeedbackCardHovered(false);
            }}
            className="relative overflow-visible"
          >
            <div className="portal-card rounded-xl p-3 text-sm">
              <p className="text-base leading-tight font-semibold">
                We value your feedback
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Leave us a note if you spot any issues or have suggestions.
              </p>
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="hover:bg-muted/50 mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors"
              >
                <MessageSquarePlus className="size-3.5" />
                Send Feedback
              </button>
            </div>

            <AnimatePresence initial={false}>
              {feedbackCardHovered || feedbackDropdownOpen ? (
                <motion.div
                  key="feedback-close"
                  initial={{ opacity: 0, y: 6, scale: 0.86 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.86 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute top-0 right-3 z-10 -translate-y-1/2"
                >
                  <DropdownMenu open={feedbackDropdownOpen} onOpenChange={(open) => {
                    setFeedbackDropdownOpen(open);
                    if (!open) setFeedbackCardHovered(false);
                  }}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Hide feedback card"
                        className="cursor-pointer text-muted-foreground hover:text-foreground hover:border-border hover:bg-background border-border/60 bg-sidebar inline-flex h-5 min-w-6 items-center justify-center rounded-full border px-1.5 shadow-sm transition-colors"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="w-44">
                      <DropdownMenuItem
                        onClick={() => {
                          setFeedbackCardDismissed(true);
                          setFeedbackCardHovered(false);
                        }}
                      >
                        <X className="size-4" />
                        Close
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setFeedbackCardDismissed(true);
                          setFeedbackCardHovered(false);
                          try {
                            localStorage.setItem("feedback-card-hidden", "true");
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        <EyeOff className="size-4" />
                        Never show again
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      <SidebarMenu className="group-data-[collapsible=icon]:items-center">
        {settingsHref ? (
          <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              className="hover:bg-sidebar-accent/80 h-9 rounded-lg text-[15px] transition"
            >
              <Link
                href={settingsHref}
                className="flex w-full min-w-0 items-center gap-2 overflow-hidden transition-[gap] duration-200 ease-linear group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
              >
                <span className="flex shrink-0 items-center justify-center">
                  <SidebarIcon
                    icon={Settings}
                    iconKey="settings"
                    size={18}
                    className="size-4.5 shrink-0"
                  />
                </span>
                <span className="max-w-[10rem] min-w-0 truncate whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-linear group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0">
                  Settings
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className={cn(
                  "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground rounded-xl transition-[padding,width] duration-200 ease-linear group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!p-0",
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 rounded-lg">
                  {avatarUrl ? (
                    <AvatarImage
                      src={avatarUrl}
                      alt={fullName ?? ""}
                      className="rounded-lg"
                    />
                  ) : null}
                  <AvatarFallback className="rounded-lg">
                    {getInitials(fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid max-w-[10rem] flex-1 overflow-hidden text-left text-sm leading-tight transition-[max-width,opacity] duration-200 ease-linear group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium">
                    {fullName ?? email ?? "User"}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {email ?? "Authenticated"}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side="right"
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Account
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {showFeedbackNavButton ? (
                <>
                  <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
                    <SidebarIcon
                      icon={MessageSquarePlus}
                      iconKey="invite"
                      size={16}
                      className="mr-2 size-4"
                    />
                    Feedback
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem onClick={onLogout}>
                <SidebarIcon
                  icon={LogOut}
                  iconKey="logout"
                  size={16}
                  className="mr-2 size-4"
                />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
