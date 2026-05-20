import type { ModelRoute } from "@praxis/model-router";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelCallRequest {
  route: ModelRoute;
  messages: ChatMessage[];
  responseFormat?: "json" | "text";
}

export interface ModelCallResponse {
  provider: string;
  model: string;
  content: string;
  usage?: Record<string, unknown>;
}

export interface ModelProvider {
  name: string;
  call(request: ModelCallRequest): Promise<ModelCallResponse>;
}

export class DeepSeekProvider implements ModelProvider {
  name = "deepseek";

  constructor(
    private options: {
      apiKeyEnv?: string;
      baseUrl?: string;
      timeoutMs?: number;
    } = {}
  ) {}

  async call(request: ModelCallRequest): Promise<ModelCallResponse> {
    const apiKeyEnv = this.options.apiKeyEnv ?? "DEEPSEEK_API_KEY";
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `DeepSeek API key is required. Add it in Praxis Studio Model Settings or set ${apiKeyEnv} before launching Praxis.`
      );
    }

    const baseUrl = this.options.baseUrl ?? "https://api.deepseek.com";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.route.timeoutMs ?? this.options.timeoutMs ?? 60_000);

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: request.route.model,
          messages: request.messages,
          response_format: request.responseFormat === "json" ? { type: "json_object" } : undefined
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`DeepSeek request failed: ${response.status} ${body}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: Record<string, unknown>;
      };
      return {
        provider: this.name,
        model: request.route.model,
        content: data.choices?.[0]?.message?.content ?? "",
        usage: data.usage
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createProvider(providerName: string, options?: { apiKeyEnv?: string; baseUrl?: string }): ModelProvider {
  if (providerName === "deepseek") return new DeepSeekProvider(options);
  throw new Error(`Unsupported model provider: ${providerName}`);
}
