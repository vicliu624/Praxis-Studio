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
    const prompt = request.messages.find((message) => message.role === "system")?.content ?? "";
    const input = parseMockInput(userMessage);
    const payload = buildMockPayload(prompt, input);
    const content = request.responseFormat === "json" ? JSON.stringify(payload, null, 2) : `MockProvider response.\n\n${userMessage.slice(0, 1200)}`;
    return {
      provider: this.name,
      model: request.route.model,
      content,
      usedMock: true
    };
  }
}

function parseMockInput(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function buildMockPayload(prompt: string, input: any): Record<string, unknown> {
  const edgeContext = input?.context?.data?.edgeContext;
  const nodeContext = input?.context?.data?.nodeContext;
  if (prompt.includes("Requirement Agent")) {
    const idea = input?.productIdea ?? input?.intent ?? "New Praxis project";
    return {
      requirements: [
        {
          id: "REQ-001",
          title: "Clarify product intent",
          description: String(idea)
        },
        {
          id: "REQ-002",
          title: "Persist project memory",
          description: "Generate .distinction graph, decisions, traces, and AI constraints from the initial plan."
        },
        {
          id: "REQ-003",
          title: "Enter graph workspace",
          description: "Open the generated Development Graph after project creation."
        }
      ],
      assumptions: ["MockProvider generated requirements because no provider key was available."],
      nonGoals: ["Do not generate production source code beyond the selected project template in v0.1."],
      successCriteria: [
        "Generated project contains README, product spec, architecture, roadmap, and .distinction graph files.",
        "Generated project can open in the Development Graph Workspace."
      ],
      questions: ["Which requirements should become CONFIRMED memory?"]
    };
  }
  if (prompt.includes("Architecture Agent")) {
    return {
      architecture: [
        {
          id: "ARCH-001",
          title: "Product Requirements",
          responsibility: "Capture product intent, requirements, assumptions, and questions."
        },
        {
          id: "ARCH-002",
          title: "Development Graph",
          responsibility: "Represent product intent, architecture components, tasks, memory, and progress."
        },
        {
          id: "ARCH-003",
          title: "Project Memory",
          responsibility: "Persist graph files, decisions, changes, traces, and AI constraints in .distinction."
        }
      ],
      risks: ["Generated architecture is a candidate until user review."],
      questions: ["Which component boundaries should be confirmed first?"]
    };
  }
  if (prompt.includes("Coding Task Agent")) {
    return {
      title: "Controlled coding task",
      allowedPaths: [".distinction", "packages"],
      forbiddenPaths: ["apps/studio-desktop/src"],
      acceptanceCriteria: ["Patch summary returned", "Changed files returned", "Verification result returned"],
      questions: []
    };
  }
  if (prompt.includes("Graph Planning Agent") && edgeContext?.edge) {
    const edge = edgeContext.edge;
    const source = edgeContext.sourceNode?.title ?? edge.source;
    const target = edgeContext.targetNode?.title ?? edge.target;
    return {
      summary: `Plan for ${source} --${edge.kind}--> ${target}. Current progress is ${Math.round((edge.progress ?? 0) * 100)}%.`,
      missingGluePoints: [
        {
          title: "Confirm relation evidence",
          reason: "The edge was inferred from scan or lightweight rules and needs user confirmation before becoming memory.",
          kind: "INFERENCE"
        },
        {
          title: "Define completion criteria",
          reason: "Edge progress needs explicit evidence for implementation, verification, and memory recording.",
          kind: "CANDIDATE"
        }
      ],
      actions: [
        {
          type: "update_edge",
          title: "Update edge blocked reason",
          description: "Record missing glue points on the selected edge.",
          targetNodeIds: [edge.source, edge.target],
          targetEdgeIds: [edge.id]
        },
        {
          type: "create_memory_event",
          title: "Record plan candidate",
          description: "Write the plan as candidate memory after user confirmation.",
          targetNodeIds: [edge.source, edge.target],
          targetEdgeIds: [edge.id]
        },
        {
          type: "create_task",
          title: "Generate controlled coding task",
          description: "Create a TASK.md for an external coding agent.",
          targetNodeIds: [edge.source, edge.target],
          targetEdgeIds: [edge.id]
        }
      ],
      codingTasks: [
        {
          title: `Improve ${edge.kind} relation between ${source} and ${target}`,
          allowedPaths: ["packages", ".distinction"],
          forbiddenPaths: ["apps/studio-desktop/src"],
          acceptanceCriteria: ["Relation evidence is documented", "Trace is recorded", "Progress suggestion is returned"]
        }
      ],
      questions: ["Should this inferred relation be promoted to confirmed memory?"]
    };
  }
  if (edgeContext?.edge) {
    const edge = edgeContext.edge;
    const source = edgeContext.sourceNode?.title ?? edge.source;
    const target = edgeContext.targetNode?.title ?? edge.target;
    return {
      summary: `${source} --${edge.kind}--> ${target} is currently ${Math.round((edge.progress ?? 0) * 100)}% complete.`,
      facts: [
        `Source node: ${source}`,
        `Target node: ${target}`,
        `Risk level: ${edge.riskLevel}`,
        `Knowledge kind: ${edge.knowledgeKind}`
      ],
      gaps: edge.blockedReason ? [edge.blockedReason] : ["No explicit blocked reason is recorded."],
      questions: ["What evidence should raise this edge progress?"]
    };
  }
  if (nodeContext?.node) {
    const node = nodeContext.node;
    return {
      summary: `${node.title} is a ${node.kind} node at ${Math.round((node.progress ?? 0) * 100)}% progress.`,
      facts: [`Status: ${node.status}`, `Confidence: ${node.confidence}`, `Knowledge kind: ${node.knowledgeKind}`],
      incomingEdges: nodeContext.incomingEdges?.length ?? 0,
      outgoingEdges: nodeContext.outgoingEdges?.length ?? 0,
      questions: ["Which inferred responsibilities should be confirmed?"]
    };
  }
  return {
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
  };
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
