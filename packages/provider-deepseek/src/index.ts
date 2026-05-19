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
  usedMock: boolean;
  usage?: Record<string, unknown>;
}

export interface ModelProvider {
  name: string;
  call(request: ModelCallRequest): Promise<ModelCallResponse>;
}

export class MockProvider implements ModelProvider {
  name = "mock";

  async call(request: ModelCallRequest): Promise<ModelCallResponse> {
    const userMessage = [...request.messages].reverse().find((message: ChatMessage) => message.role === "user")?.content ?? "";
    const content =
      request.responseFormat === "json"
        ? JSON.stringify(
            {
              summary: "MockProvider response generated without an API key.",
              missingGluePoints: [
                {
                  title: "Confirm graph boundary",
                  reason: "The runtime can only infer graph relations until the user confirms memory.",
                  kind: "INFERENCE"
                }
              ],
              actions: [],
              codingTasks: [],
              questions: ["Which inferred nodes and edges should become confirmed memory?"]
            },
            null,
            2
          )
        : `MockProvider response.\n\n${userMessage.slice(0, 1200)}`;
    return {
      provider: this.name,
      model: request.route.model,
      content,
      usedMock: true
    };
  }
}

export class DeepSeekProvider implements ModelProvider {
  name = "deepseek";

  constructor(
    private options: {
      apiKey?: string;
      apiKeyEnv?: string;
      baseUrl?: string;
      timeoutMs?: number;
    } = {}
  ) {}

  async call(request: ModelCallRequest): Promise<ModelCallResponse> {
    const apiKey = this.options.apiKey ?? process.env[this.options.apiKeyEnv ?? "DEEPSEEK_API_KEY"];
    if (!apiKey) return new MockProvider().call(request);

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
        usedMock: false,
        usage: data.usage
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createProvider(providerName: string, options?: { apiKeyEnv?: string; baseUrl?: string }): ModelProvider {
  if (providerName === "deepseek") return new DeepSeekProvider(options);
  return new MockProvider();
}
