import type { Metadata } from "next"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"
import { Building2, Clock, User } from "@/lib/icons"

export const metadata: Metadata = {
  title: "Personal Tax Returns · LTS Tax",
}

/**
 * Placeholder for personal (individual) tax returns. It is reachable from
 * the sidebar without an organisation and deliberately reads and stores
 * nothing until the feature is built.
 */
export default function PersonalTaxReturnsPage() {
  return (
    <>
      <PageHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Personal Tax Returns</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6 sm:pt-10">
          <section
            aria-labelledby="personal-returns-heading"
            className="bg-card text-card-foreground relative overflow-hidden rounded-xl border shadow-xs"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] opacity-70"
            />
            <div className="relative flex flex-col items-start gap-5 p-6 sm:p-8">
              <span
                aria-hidden
                className="bg-muted text-foreground/70 flex size-11 items-center justify-center rounded-lg border"
              >
                <User className="size-5" />
              </span>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1
                    id="personal-returns-heading"
                    className="text-xl font-semibold tracking-tight sm:text-2xl"
                  >
                    Personal Tax Returns
                  </h1>
                  <Badge variant="outline" className="text-muted-foreground gap-1.5">
                    <Clock aria-hidden />
                    In development
                  </Badge>
                </div>
                <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
                  A space for your own personal tax returns, kept apart from the organisations you
                  work with. It isn&apos;t available yet, so there is nothing to set up here.
                </p>
              </div>
            </div>
          </section>

          <ul aria-label="What to expect" className="grid gap-3 sm:grid-cols-2">
            <li className="flex gap-3 rounded-xl border p-4">
              <User aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Yours, not an organisation&apos;s</p>
                <p className="text-muted-foreground text-sm">
                  You won&apos;t need to belong to or select an organisation to use it.
                </p>
              </div>
            </li>
            <li className="flex gap-3 rounded-xl border p-4">
              <Building2 aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Organisation returns are unchanged</p>
                <p className="text-muted-foreground text-sm">
                  Corporate returns stay on each organisation&apos;s Returns page.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </main>
    </>
  )
}
