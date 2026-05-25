import { z } from "zod";

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);

export const KnowledgeKindSchema = z.enum(["FACT", "INFERENCE", "CANDIDATE", "CONFIRMED"]);
