"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// `addTransitionType` is available on the React namespace in React 19 but
// isn't typed yet. Pull it off dynamically.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addTransitionType = (React as any).unstable_addTransitionType ??
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (React as any).addTransitionType as ((type: string) => void) | undefined;

type TransitionType = "nav-forward" | "nav-back";

/**
 * Returns a navigator that tags the navigation with a transition type
 * (`nav-forward` for going into a detail view, `nav-back` for coming out).
 *
 * The `<DirectionalTransition>` wrapper on each page picks up the type via
 * its `enter`/`exit` class maps and runs the matching CSS animation.
 *
 * Usage:
 *   const navigate = useNavigateWithTransition();
 *   navigate("/org/123/returns/abc", "nav-forward");
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
