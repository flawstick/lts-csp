"use client";

import * as React from "react";
import type { ReactNode } from "react";

// React 19 ships ViewTransition on the React namespace, but @types/react
// hasn't caught up yet — pull it off dynamically and type the props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RawViewTransition = ((React as any).unstable_ViewTransition ??
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (React as any).ViewTransition) as (props: {
  children: ReactNode;
  name?: string;
  default?: string | Record<string, string>;
  enter?: string | Record<string, string>;
  exit?: string | Record<string, string>;
  update?: string | Record<string, string>;
  share?: string | Record<string, string>;
}) => ReactNode;

export const ViewTransition = RawViewTransition;

/**
 * Wraps a page component so it slides forward when navigated into from a
 * parent route, and slides back when navigated out. Controlled by the
 * `nav-forward` / `nav-back` transition types set by `useNavigateWithTransition`.
 *
 * Lateral/sibling navigation (e.g. /tasks ↔ /returns via the sidebar) sets no
 * transition type, so `default="none"` keeps those route changes instant.
 */
export function DirectionalTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      exit={{
        "nav-forward": "nav-forward",
        "nav-back": "nav-back",
        default: "none",
      }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
