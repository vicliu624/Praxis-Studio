import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { CodeGraphIndexStatus, CodeGraphRawQueryNode, CodeGraphRawRelationResponse, CodeGraphRelation } from "./CodeGraphTypes.js";

const require = createRequire(import.meta.url);
const CODEGRAPH_JSON_BUFFER_BYTES = 32 * 1024 * 1024;

export class CodeGraphCli {
  isAvailable(): boolean {
    return this.run(["--version"], { allowFailure: true }).ok;
  }

  version(): string | undefined {
    const result = this.run(["--version"], { allowFailure: true });
    return result.ok ? result.stdout.trim() || undefined : undefined;
  }

  ensureIndexed(root: string): CodeGraphIndexStatus | undefined {
    const status = this.status(root);
    if (!status?.initialized) {
      this.run(["init", root, "-i"]);
      return this.status(root);
    }

    this.run(["index", root, "--quiet"]);
    return this.status(root);
  }

  status(root: string): CodeGraphIndexStatus | undefined {
    const result = this.run(["status", root, "--json"], { allowFailure: true });
    if (!result.ok) return undefined;
    const parsed = safeJson(result.stdout);
    return isRecord(parsed) ? (parsed as unknown as CodeGraphIndexStatus) : undefined;
  }

  querySymbols(root: string, query: string, limit = 20): CodeGraphRawQueryNode[] {
    const result = this.run(["query", query, "--path", root, "--limit", String(limit), "--json"], { allowFailure: true });
    if (!result.ok) return [];
    const parsed = safeJson(result.stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (isRecord(item) && isRecord(item.node) ? (item.node as CodeGraphRawQueryNode) : undefined))
      .filter((item): item is CodeGraphRawQueryNode => Boolean(item));
  }

  readRelations(root: string, direction: "callers" | "callees", symbolName: string): CodeGraphRelation[] {
    const result = this.run([direction, symbolName, "--path", root, "--json"], { allowFailure: true });
    if (!result.ok) return [];
    const parsed = safeJson(result.stdout);
    if (!isRecord(parsed)) return [];
    const values = (parsed as CodeGraphRawRelationResponse)[direction];
    return Array.isArray(values) ? values.filter(isRelationRecord) : [];
  }

  run(args: string[], options: { allowFailure?: boolean } = {}): { ok: boolean; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [codeGraphShimPath(), ...args], {
      encoding: "utf8",
      maxBuffer: CODEGRAPH_JSON_BUFFER_BYTES,
      windowsHide: true
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const ok = result.status === 0 && !result.error;
    if (!ok && !options.allowFailure) {
      const command = `codegraph ${args.join(" ")}`;
      const detail = stderr.trim() || stdout.trim() || result.error?.message || "unknown error";
      throw new Error(`CodeGraph command failed: ${command}\n${detail}`);
    }
    return { ok, stdout, stderr };
  }
}

function codeGraphShimPath(): string {
  return require.resolve("@colbymchenry/codegraph/npm-shim.js");
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRelationRecord(value: unknown): value is CodeGraphRelation {
  return isRecord(value) && typeof value.name === "string";
}
