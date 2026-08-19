import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Supabase implicit recovery links return the session in the browser URL hash.
  // The server cannot read that hash, so preserve it in the browser and route to the reset form.
  if (next === "/auth/reset-password") {
    const resetUrl = `${origin}/auth/reset-password`;
    return new NextResponse(
      `<!doctype html><html><body><script>window.location.replace(${JSON.stringify(resetUrl)} + window.location.hash)</script></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`);
}
