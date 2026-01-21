import { redirect } from "next/navigation"
import { db } from "@repo/database"
import { createClient } from "@/lib/supabase/server"
import { eq } from "drizzle-orm"
import { accounts } from "@repo/database"
import { OrgRedirect } from "@/components/org-redirect"

export default async function DashboardRedirect() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Check if user has an account
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, user.id),
  })

  if (!account) {
    redirect("/waiting-for-invite")
  }

  // Get all orgs (not just the first one)
  const orgs = await db.query.organisations.findMany({
    orderBy: (o, { asc }) => [asc(o.name)],
  })

  if (orgs.length === 0) {
    redirect("/waiting-for-invite")
  }

  // Let the client component handle the redirect based on localStorage
  return <OrgRedirect orgs={orgs} />
}
