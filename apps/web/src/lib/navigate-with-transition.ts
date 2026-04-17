"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// `addTransitionType` is available on the React namespace in React 19.2 but
// isn't typed yet. Pull it off dynamically.
const addTransitionType =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (((React as any).unstable_addTransitionType ?? (React as any).addTransitionType) as
    | ((type: string) => void)
    | undefined);

export type TransitionType = "nav-forward" | "nav-back";

/**
 * Returns a navigator that tags the navigation with a transition type:
 *   - `nav-forward` — entering a detail view (list → detail)
 *   - `nav-back`    — leaving a detail view back to the list
 *
 * `<DirectionalTransition>` wrappers on each page read the type via their
 * `enter`/`exit` class maps and run the matching CSS animation.
 *
 * Sibling/sidebar nav should use a plain `<Link>` / `router.push` (no type),
 * which hits `default: "none"` and snaps instantly.
 *
 * Browser back/forward buttons (popstate) cannot trigger view transitions —
 * popstate is synchronous and incompatible with `startViewTransition`. Users
 * who want the slide-back animation should click the in-app back chevron /
 * breadcrumb rather than the browser back button. This limitation is
 * documented in the React view-transitions skill.
 *
 * Usage:
 *   const navigate = useNavigateWithTransition();
 *   navigate(`/org/${orgId}/returns/${returnId}`, "nav-forward");
 */
export function useNavigateWithTransition() {
  const router = useRouter();

  return React.useCallback(
    (href: string, type: TransitionType = "nav-forward") => {
      React.startTransition(() => {
        if (addTransitionType) addTransitionType(type);
        router.push(href);
      });
    },
    [router],
  );
}
