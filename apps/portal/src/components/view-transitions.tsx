"use client";

import * as React from "react";
import type { ReactNode } from "react";

// React 19.2 / Next 16: ViewTransition is available on the React namespace but
// not yet in the stable `@types/react` d.ts. Pull it off dynamically.
const ViewTransition =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((React as any).unstable_ViewTransition ?? (React as any).ViewTransition) as (
    props: {
      children: ReactNode;
      name?: string;
      default?: string | Record<string, string>;
      enter?: string | Record<string, string>;
      exit?: string | Record<string, string>;
      update?: string | Record<string, string>;
      share?: string | Record<string, string>;
    },
  ) => ReactNode;

/**
 * Shared-element wrapper keyed by client slug. Same `name` on the list row
 * and the detail header lets the browser morph the small row into the full-
 * width header ("expand into the page"). The `share="client-morph"` hook
 * lets CSS control the animation timing/easing.
 */
export function ClientSharedElement({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition name={`client-${slug}`} share="client-morph">
      {children}
    </ViewTransition>
  );
}

/**
 * Generic shared-element wrapper. Pair the same `name` on a list-row and the
 * detail-page header to get an "expand into the page" morph. Uses the
 * `client-morph` share class (see globals.css) so timing/easing are shared.
 */
export function SharedElement({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition name={name} share="client-morph">
      {children}
    </ViewTransition>
  );
}

export { ViewTransition };
