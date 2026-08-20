import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationMembership } from "@/lib/auth/organization";
import { getAIProvider } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationMembership(user.email))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { transcript } = await req.json();
  if (!transcript?.trim()) {
    return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
  }

  const ai = getAIProvider();
  const insights = await ai.analyzeTranscript(transcript);

  return NextResponse.json({ insights });
}
