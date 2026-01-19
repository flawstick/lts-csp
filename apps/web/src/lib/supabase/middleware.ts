import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

type CookieToSet = { name: string; value: string; options?: Partial<ResponseCookie> };

// Routes that don't require authentication
const publicRoutes = ["/login", "/auth/callback", "/auth/auth-code-error", "/api/debug", "/tos", "/privacy-policy"];

// Routes that authenticated but unauthorized users can access
const waitingRoutes = ["/waiting-for-invite", "/invite/accept"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  const isWaitingRoute = waitingRoutes.some((route) => pathname.startsWith(route));

  // If no user and trying to access protected route, redirect to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If user is logged in, check if they're authorized (skip for API routes)
  if (user && !isPublicRoute && !isWaitingRoute && !pathname.startsWith("/api/")) {
    // Check if user has an account and is authorized
    const { data: account } = await supabase
      .from("lts_account")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (account) {
      // Check if user is a global admin
      const { data: globalAdmin } = await supabase
        .from("lts_global_admin")
        .select("id")
        .eq("account_id", account.id)
        .single();

      // If not a global admin, redirect to waiting page
      if (!globalAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/waiting-for-invite";
        return NextResponse.redirect(url);
      }
    } else {
      // No account record yet, redirect to waiting page
      const url = request.nextUrl.clone();
      url.pathname = "/waiting-for-invite";
      return NextResponse.redirect(url);
    }
  }

  // If user is on waiting page but is actually authorized, redirect to home
  if (user && pathname === "/waiting-for-invite") {
    const { data: account } = await supabase
      .from("lts_account")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (account) {
      const { data: globalAdmin } = await supabase
        .from("lts_global_admin")
        .select("id")
        .eq("account_id", account.id)
        .single();

      if (globalAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
    }
  }

  // If user is logged in and trying to access login page, redirect to home
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
