"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmation) { setError("Passwords do not match."); return; }
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
        <p className="text-sm text-[var(--muted)]">Choose a new password for your Flowstate account.</p>
        <label className="block text-sm font-medium">New password<input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--card-border)] rounded-lg" /></label>
        <label className="block text-sm font-medium">Confirm new password<input required type="password" minLength={8} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--card-border)] rounded-lg" /></label>
        {error && <div role="alert" className="text-sm text-[var(--destructive)] bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <button disabled={saving} className="w-full py-2.5 px-4 bg-[var(--primary)] text-white rounded-lg font-medium disabled:opacity-50">{saving ? "Saving..." : "Set new password"}</button>
      </form>
    </main>
  );
}
