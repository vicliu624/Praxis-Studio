export type RuntimeMode = "explain" | "plan" | "apply" | "execute";

export type ToolRiskLevel = "read" | "plan" | "write_memory" | "write_docs" | "write_source" | "shell" | "network";

export interface PermissionSet {
  allowRead: boolean;
  allowPlan: boolean;
  allowWriteMemory: boolean;
  allowWriteDocs: boolean;
  allowWriteSource: boolean;
  allowShell: boolean;
  allowNetwork: boolean;
}

export interface ToolContext {
  projectRoot: string;
  traceId: string;
  mode: RuntimeMode;
  permissions: PermissionSet;
}

export interface ToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  riskLevel: ToolRiskLevel;
  requiredMode: RuntimeMode;
  isReadOnly: boolean;
  call(input: Input, context: ToolContext): Promise<Output>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export const explainPermissions: PermissionSet = {
  allowRead: true,
  allowPlan: false,
  allowWriteMemory: false,
  allowWriteDocs: false,
  allowWriteSource: false,
  allowShell: false,
  allowNetwork: true
};

export const planPermissions: PermissionSet = {
  ...explainPermissions,
  allowPlan: true
};

export const applyPermissions: PermissionSet = {
  ...planPermissions,
  allowWriteMemory: true,
  allowWriteDocs: true
};
