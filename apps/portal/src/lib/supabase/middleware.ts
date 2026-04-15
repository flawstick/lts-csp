import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

type CookieToSet = { name: string; value: string; options?: Partial<ResponseCookie> };

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/accept-invite",
  "/waiting-for-invite",
  "/client-access",
  "/api/client-upload",
  "/api/trpc",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: account } = await supabase
      .from("lts_account")
      .select("id, account_type")
      .eq("user_id", user.id)
      .maybeSingle();

    let accountId = account?.id as string | undefined;

    if (!account) {
      const { error } = await supabase
        .from("lts_account")
        .insert({
          user_id: user.id,
          full_name: (user.user_metadata.full_name ?? user.user_metadata.name ?? null) as string | null,
          avatar_url: (user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null) as string | null,
          account_type: "portal",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Failed to bootstrap portal account:", error);
      } else {
        const fresh = await supabase
          .from("lts_account")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        accountId = fresh.data?.id as string | undefined;
      }
    } else {
      accountId = account.id as string;
    }

    const accountType = (account?.account_type ?? "portal") as string;
    const isInternalOnly = accountType === "internal";

    if (isInternalOnly && !isPublicRoute && !pathname.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/waiting-for-invite";
      return NextResponse.redirect(url);
    }

    if (!isPublicRoute && !pathname.startsWith("/api/")) {
      const { data: activeMembership } = await supabase
        .from("lts_portal_membership")
        .select("id")
        .eq("account_id", accountId ?? "")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!activeMembership) {
        const url = request.nextUrl.clone();
        url.pathname = "/waiting-for-invite";
        return NextResponse.redirect(url);
      }
    }

    if (pathname === "/login" || pathname === "/signup") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
