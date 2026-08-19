"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { getPasswordValidation } from "@/lib/auth/password-reset-validation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const validation = getPasswordValidation(password, confirmation);

  useEffect(() => {
    let active = true;
    async function establishRecoverySession() {
      const supabase = createClient();
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      let sessionError: string | null = null;

      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        sessionError = setSessionError?.message ?? null;
      } else {
        const { data, error: sessionLookupError } = await supabase.auth.getSession();
        sessionError = sessionLookupError?.message ?? (!data.session ? "Recovery session missing. Request a new reset email." : null);
      }

      if (!active) return;
      if (sessionError) setError(sessionError);
      setReady(true);
    }
    establishRecoverySession();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!validation.canSubmit) return;
    setSaving(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl border border-[var(--card-border)] shadow-sm p-8 space-y-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Set a new password</h1>
        {!ready ? <p className="text-sm text-[var(--muted)]">Preparing secure password reset...</p> : <>
          <p className="text-sm text-[var(--muted)]">Choose a new password for your Flowstate account.</p>
          <label className="block text-sm font-medium">New password<input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--card-border)] rounded-lg" /></label>
          <label className="block text-sm font-medium">Confirm new password<input required type="password" minLength={8} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--card-border)] rounded-lg" /></label>
          {(error || validation.message) && <div role="alert" className="text-sm text-[var(--destructive)] bg-red-50 rounded-lg px-3 py-2">{error || validation.message}</div>}
          <button disabled={saving || Boolean(error) || !validation.canSubmit} className="w-full py-2.5 px-4 bg-[var(--primary)] text-white rounded-lg font-medium disabled:opacity-50">{saving ? "Saving..." : "Set new password"}</button>
        </>}
      </form>
    </main>
  );
}
