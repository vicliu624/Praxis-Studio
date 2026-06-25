import type { ModelRoute } from "@praxis/model-router";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ModelCallRequest {
  route: ModelRoute;
  messages: ChatMessage[];
  responseFormat?: "json" | "text";
  tools?: OpenAIToolDef[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  signal?: AbortSignal;
}

export interface ModelCallResponse {
  provider: string;
  model: string;
  content: string;
  reasoningContent?: string;
  toolCalls?: OpenAIToolCall[];
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
      apiKey?: string;
      apiKeyEnv?: string;
      baseUrl?: string;
      timeoutMs?: number;
    } = {}
  ) {}

  async call(request: ModelCallRequest): Promise<ModelCallResponse> {
    const apiKeyEnv = this.options.apiKeyEnv ?? "DEEPSEEK_API_KEY";
    const apiKey = this.options.apiKey?.trim() || process.env[apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `DeepSeek API key is required. Add it in Praxis Studio Model Settings or set ${apiKeyEnv} before launching Praxis.`
      );
    }

    const baseUrl = this.options.baseUrl ?? "https://api.deepseek.com";
    const controller = new AbortController();
    const configuredTimeoutMs = request.route.timeoutMs ?? this.options.timeoutMs ?? 180_000;
    const timeoutMs = configuredTimeoutMs > 0 ? configuredTimeoutMs : 0;
    const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    let abortedByCaller = false;
    const abortFromCaller = () => {
      abortedByCaller = true;
      controller.abort(request.signal?.reason);
    };

    if (request.signal?.aborted) abortFromCaller();
    else request.signal?.addEventListener("abort", abortFromCaller, { once: true });

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
          response_format: request.responseFormat === "json" ? { type: "json_object" } : undefined,
          tools: request.tools?.length ? request.tools : undefined,
          tool_choice: request.toolChoice ?? (request.tools?.length ? "auto" : undefined)
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`DeepSeek request failed: ${response.status} ${body}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { role?: string; content?: string | null; tool_calls?: OpenAIToolCall[] }; finish_reason?: string }[];
        usage?: Record<string, unknown>;
      };
      const msg = data.choices?.[0]?.message as { role?: string; content?: string | null; reasoning_content?: string; tool_calls?: OpenAIToolCall[] };
      return {
        provider: this.name,
        model: request.route.model,
        content: msg?.content ?? "",
        reasoningContent: msg?.reasoning_content,
        toolCalls: msg?.tool_calls,
        usage: data.usage
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (abortedByCaller || request.signal?.aborted) {
          throw new Error("DeepSeek request aborted.");
        }
        if (timeoutMs > 0) {
          throw new Error(`DeepSeek request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
        }
        throw new Error("DeepSeek request aborted.");
      }
      throw error;
    } finally {
      request.signal?.removeEventListener("abort", abortFromCaller);
      if (timeout) clearTimeout(timeout);
    }
  }
}

export function createProvider(providerName: string, options?: { apiKey?: string; apiKeyEnv?: string; baseUrl?: string }): ModelProvider {
  if (providerName === "deepseek") return new DeepSeekProvider(options);
  throw new Error(`Unsupported model provider: ${providerName}`);
}
