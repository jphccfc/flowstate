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

class ClaudeProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeTranscript(transcript: string): Promise<CapabilityInsight[]> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `Analyze this capability assessment interview transcript and extract structured capability data. Return a JSON array of capability insights.

Transcript:
${transcript}

Return JSON array with objects containing: capabilityName, asIsState (description), asIsScore (1-10), opportunities (array of strings), weaknesses (array of strings), notes (string).`,
          },
        ],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  }

  async generateInsights(context: string): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Based on this capability assessment data, provide a brief strategic insight (2-3 sentences):\n\n${context}`,
          },
        ],
      }),
    });
    const data = await response.json();
    return data.content?.[0]?.text ?? "";
  }
}

class OpenAIProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyzeTranscript(transcript: string): Promise<CapabilityInsight[]> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: `Analyze this capability assessment interview transcript and extract structured capability data. Return a JSON array of capability insights.

Transcript:
${transcript}

Return JSON array with objects containing: capabilityName, asIsState (description), asIsScore (1-10), opportunities (array of strings), weaknesses (array of strings), notes (string).`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "[]";
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed.capabilities ?? [];
  }

  async generateInsights(context: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: `Based on this capability assessment data, provide a brief strategic insight (2-3 sentences):\n\n${context}`,
          },
        ],
      }),
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}

export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "claude";
  if (provider === "openai") {
    return new OpenAIProvider(process.env.OPENAI_API_KEY ?? "");
  }
  return new ClaudeProvider(process.env.ANTHROPIC_API_KEY ?? "");
}
