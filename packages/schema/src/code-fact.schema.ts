import { z } from "zod";
import type { CodeFactGraphSnapshot } from "./code-fact.js";

export const CodeFactProviderSourceSchema = z.enum(["native", "codegraph", "lsp", "scip"]);

export const CodeFactCapabilitySchema = z.enum([
  "file_structure",
  "imports_exports",
  "symbols",
  "calls",
  "type_relations",
  "routes",
  "references",
  "impact"
]);

export const CodeFactProviderInfoSchema = z.object({
  name: z.string().min(1),
  source: CodeFactProviderSourceSchema,
  version: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  capabilities: z.array(CodeFactCapabilitySchema)
});

export const CodeFactNodeKindSchema = z.enum([
  "project",
  "file",
  "module",
  "class",
  "struct",
  "interface",
  "trait",
  "function",
  "method",
  "property",
  "field",
  "variable",
  "constant",
  "enum",
  "enum_member",
  "type_alias",
  "namespace",
  "import",
  "export",
  "route",
  "component"
]);

export const CodeFactEdgeKindSchema = z.enum([
  "contains",
  "calls",
  "imports",
  "exports",
  "extends",
  "implements",
  "references",
  "type_of",
  "returns",
  "instantiates",
  "overrides",
  "decorates",
  "impacts"
]);

export const CodeFactRangeSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  startColumn: z.number().int().nonnegative().optional(),
  endColumn: z.number().int().nonnegative().optional()
});

export const PartialCodeFactRangeSchema = CodeFactRangeSchema.partial();

export const CodeFactEvidenceRefSchema = z.object({
  source: z.enum(["repository_scan", "codegraph", "tree_sitter", "lsp", "agent_inference", "user_confirmation"]),
  filePath: z.string().min(1),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  excerpt: z.string().optional()
});

export const CodeFactFileSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  language: z.string().min(1),
  extension: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  hash: z.string().min(1).optional(),
  lineCount: z.number().int().nonnegative(),
  roleHint: z.string().min(1),
  nodeIds: z.array(z.string().min(1)),
  evidence: z.array(CodeFactEvidenceRefSchema)
});

export const CodeFactNodeSchema = z.object({
  id: z.string().min(1),
  kind: CodeFactNodeKindSchema,
  name: z.string().min(1),
  qualifiedName: z.string().min(1),
  filePath: z.string().min(1),
  language: z.string().min(1),
  range: CodeFactRangeSchema.optional(),
  signature: z.string().optional(),
  docSummary: z.string().optional(),
  visibility: z.enum(["public", "private", "protected", "internal"]).optional(),
  evidence: z.array(CodeFactEvidenceRefSchema)
});

export const CodeFactEdgeSchema = z.object({
  id: z.string().min(1),
  kind: CodeFactEdgeKindSchema,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  filePath: z.string().min(1).optional(),
  range: PartialCodeFactRangeSchema.optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(CodeFactEvidenceRefSchema)
});

export const CodeFactStatisticsSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  filesByLanguage: z.record(z.number().int().nonnegative()),
  nodesByKind: z.record(z.number().int().nonnegative()),
  edgesByKind: z.record(z.number().int().nonnegative())
});

export const CodeFactWarningSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning"]),
  summary: z.string().min(1)
});

export const CodeFactGraphSnapshotSchema: z.ZodType<CodeFactGraphSnapshot> = z.object({
  schemaVersion: z.literal("praxis.codeFactGraph.v1"),
  root: z.string().min(1),
  generatedAt: z.string().min(1),
  provider: CodeFactProviderInfoSchema,
  files: z.array(CodeFactFileSchema),
  nodes: z.array(CodeFactNodeSchema),
  edges: z.array(CodeFactEdgeSchema),
  statistics: CodeFactStatisticsSchema,
  warnings: z.array(CodeFactWarningSchema)
});
