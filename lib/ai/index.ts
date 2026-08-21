import { requestChatCompletion } from "@/lib/ai/client";

export interface CapabilityInsight {
  capabilityName: string;
  asIsState?: string;
  asIsScore?: number;
  opportunities?: string[];
  weaknesses?: string[];
  notes?: string;
}

export interface AIProvider {
  analyzeTranscript(transcript: string): Promise<CapabilityInsight[]>;
  generateInsights(context: string): Promise<string>;
}

function extractJson(text: string): unknown {
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch { return []; }
  }
  try { return JSON.parse(text); } catch { return []; }
}

class GatewayProvider implements AIProvider {
  async analyzeTranscript(transcript: string): Promise<CapabilityInsight[]> {
    const text = await requestChatCompletion({
      maxTokens: 4096,
      system: "Extract structured capability insights from assessment evidence. Return JSON only.",
      user: `Transcript:\n${transcript}\n\nReturn a JSON array with capabilityName, asIsState, asIsScore (0-5), opportunities, weaknesses, and notes.`,
    });
    const parsed = extractJson(text);
    return Array.isArray(parsed) ? parsed as CapabilityInsight[] : [];
  }

  async generateInsights(context: string): Promise<string> {
    return requestChatCompletion({
      maxTokens: 1024,
      system: "Provide concise strategic insight from capability assessment data.",
      user: `Assessment data:\n${context}\n\nReturn a brief 2-3 sentence insight.`,
    });
  }
}

export function getAIProvider(): AIProvider {
  return new GatewayProvider();
}
