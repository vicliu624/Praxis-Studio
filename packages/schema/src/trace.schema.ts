import { z } from "zod";
import type { TraceRecord } from "./trace.js";

export const TraceTargetSchema = z.object({
  type: z.enum(["project", "node", "edge", "subgraph", "task", "finding", "memory", "result", "external_agent_result"]),
  id: z.string().min(1).optional()
});

export const TraceRecordSchema: z.ZodType<TraceRecord> = z.object({
  schemaVersion: z.literal("praxis.traceRecord.v1").optional(),
  id: z.string().min(1),
  traceId: z.string().min(1),
  timestamp: z.string().min(1),
  kind: z.string().min(1),
  target: TraceTargetSchema.optional(),
  summary: z.string().min(1),
  data: z.record(z.unknown()).optional()
});
