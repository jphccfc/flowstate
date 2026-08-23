import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getLocalQaUser, isLocalQaAuthEnabled } from "./local-qa";

export async function createClient() {
  if (isLocalQaAuthEnabled()) {
    const user = { ...getLocalQaUser(), user_metadata: { name: "Local QA" } };
    return { auth: { getUser: async () => ({ data: { user }, error: null }) } };
  }

  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}
