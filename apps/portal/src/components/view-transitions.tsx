"use client";

import * as React from "react";
import type { ReactNode } from "react";

// React 19.2 / Next 16: ViewTransition is available on the React namespace but
// not yet in the stable `@types/react` d.ts. Pull it off dynamically.
const ViewTransition =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
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

export { ViewTransition };

/**
 * Pair the same `name` on a list row and a detail page header to get an
 * "expand into the page" morph. Uses `text-morph` (CSS in globals.css) to
 * avoid raster-scaling artifacts when text changes size (e.g. row `<p>` →
 * header `<h1>`). Wrap JUST the text element — not the surrounding row —
 * so the morph target has the same shape on both sides.
 *
 * `default="none"` prevents the browser cross-fade from firing on unrelated
 * transitions (Suspense resolves, filter updates, lateral nav).
 */
export function SharedElement({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition name={name} share="text-morph" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Mixed-content shared element — for wrappers that contain an icon/image
 * alongside text (e.g. a client monogram + name). Uses the `morph` recipe
 * (controlled duration + mid-animation blur) because `text-morph` hides the
 * old snapshot, which would make the icon disappear abruptly.
 */
export function MixedSharedElement({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Client-name shared element for documents pages — name is prefixed so it
 * doesn't collide with returns/tasks shared elements.
 */
export function ClientSharedElement({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  return <SharedElement name={`client-${slug}`}>{children}</SharedElement>;
}

/**
 * Wraps a page so it slides forward when navigated INTO from a parent route,
 * and slides back when navigated OUT. Controlled by the `nav-forward` /
 * `nav-back` transition types set by `useNavigateWithTransition`.
 *
 * Lateral/sibling nav (e.g. /tasks ↔ /returns via the sidebar) sets no
 * transition type, so `default="none"` keeps those route changes instant.
 *
 * Can be composed with `<SharedElement>` inside — the named shared element
 * morphs while the surrounding content slides.
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
