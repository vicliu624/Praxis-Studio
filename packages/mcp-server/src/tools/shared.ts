import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseGraphAnchor } from "@praxis/context-builder";
import type { McpToolContext, JsonSchema } from "./types.js";

export function resolveToolRoot(context: McpToolContext, requestedRoot?: string): string {
  if (!requestedRoot) return context.root;
  const resolved = path.isAbsolute(requestedRoot) ? path.resolve(requestedRoot) : path.resolve(context.root, requestedRoot);
  if (normalizeForCompare(resolved) !== normalizeForCompare(context.root)) {
    throw new Error(`MCP server is scoped to ${context.root}; refusing root ${resolved}`);
  }
  return context.root;
}

export function pathMatches(filePath: string, filter: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const normalizedFilter = filter.toLowerCase();
  return normalizedPath === normalizedFilter || normalizedPath.startsWith(`${normalizedFilter}/`) || normalizedPath.includes(normalizedFilter);
}

export async function readJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T> {
  return schema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

export async function tryReadJsonWithSchema<T>(filePath: string, schema: JsonSchema<T>): Promise<T | undefined> {
  try {
    return await readJsonWithSchema(filePath, schema);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

export async function writeSchemaJson<T>(filePath: string, value: T, schema: JsonSchema<T>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(schema.parse(value), null, 2)}\n`, "utf8");
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

export function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

export function projectRelativePath(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return filePath.replace(/\\/g, "/");
  return relative.replace(/\\/g, "/");
}

export async function listJsonFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(absolute)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(absolute);
    }
  }
  return files;
}

export function normalizeContextPacketInput(rawInput: unknown): unknown {
  if (typeof rawInput !== "object" || rawInput === null || !("anchor" in rawInput)) return rawInput;
  const input = rawInput as { anchor?: unknown };
  if (typeof input.anchor !== "string") return rawInput;
  return { ...(rawInput as Record<string, unknown>), anchor: parseGraphAnchor(input.anchor) };
}

export function normalizeAnchorInput(rawInput: unknown): unknown {
  if (typeof rawInput !== "object" || rawInput === null || !("anchor" in rawInput)) return rawInput;
  const input = rawInput as { anchor?: unknown };
  if (typeof input.anchor !== "string") return rawInput;
  return { ...(rawInput as Record<string, unknown>), anchor: parseGraphAnchor(input.anchor) };
}

export function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "artifact";
}

export function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeForCompare(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}
