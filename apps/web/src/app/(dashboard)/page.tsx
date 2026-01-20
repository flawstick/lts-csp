import { redirect } from "next/navigation"
import { db } from "@repo/database"
import { createClient } from "@/lib/supabase/server"
import { eq } from "drizzle-orm"
import { accounts } from "@repo/database"

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

  // Get the first org
  const orgs = await db.query.organisations.findMany({
    orderBy: (o, { asc }) => [asc(o.name)],
    limit: 1,
  })

  if (orgs.length > 0) {
    redirect(`/org/${orgs[0].id}`)
  }

  // No orgs found - redirect to a no-orgs page or error
  redirect("/waiting-for-invite")
}
