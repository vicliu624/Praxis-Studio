import { readFile } from "node:fs/promises";
import path from "node:path";
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import { CodeGraphCli } from "./CodeGraphCli.js";
import type { CodeGraphIndexedEdge, CodeGraphIndexedFile, CodeGraphIndexedNode, CodeGraphIndexReadResult, CodeGraphIndexStatus } from "./CodeGraphTypes.js";

export class SqliteCodeGraphIndexReader {
  constructor(private readonly cli = new CodeGraphCli()) {}

  async isAvailable(root: string): Promise<boolean> {
    void root;
    return this.cli.isAvailable();
  }

  async ensureIndexed(root: string): Promise<CodeGraphIndexStatus | undefined> {
    return this.cli.ensureIndexed(root);
  }

  async readIndex(root: string): Promise<CodeGraphIndexReadResult> {
    const status = await this.ensureIndexed(root);
    const databaseBytes = await tryReadDatabase(root);
    if (!databaseBytes) {
      return {
        status,
        files: [],
        nodes: [],
        edges: [],
        readMode: "cli_fallback",
        warnings: ["CodeGraph SQLite index was not readable; provider will use CLI fallback."]
      };
    }

    const SQL = await initSqlJs();
    const db = new SQL.Database(databaseBytes);
    try {
      return {
        status,
        files: readFiles(db),
        nodes: readNodes(db),
        edges: readEdges(db),
        readMode: "sqlite_index",
        warnings: []
      };
    } catch (error) {
      return {
        status,
        files: [],
        nodes: [],
        edges: [],
        readMode: "cli_fallback",
        warnings: [`CodeGraph SQLite index could not be normalized: ${error instanceof Error ? error.message : String(error)}`]
      };
    } finally {
      db.close();
    }
  }
}

async function tryReadDatabase(root: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path.join(root, ".codegraph", "codegraph.db"));
  } catch {
    return undefined;
  }
}

function readFiles(db: Database): CodeGraphIndexedFile[] {
  return execRows(db, "select path, content_hash, language, size, node_count, errors from files order by path").map((row) => ({
    path: stringCell(row.path),
    contentHash: optionalStringCell(row.content_hash),
    language: stringCell(row.language),
    size: numberCell(row.size),
    nodeCount: optionalNumberCell(row.node_count),
    errors: parseJsonArray(row.errors)
  }));
}

function readNodes(db: Database): CodeGraphIndexedNode[] {
  return execRows(
    db,
    [
      "select id, kind, name, qualified_name, file_path, language, start_line, end_line,",
      "start_column, end_column, docstring, signature, visibility, is_exported",
      "from nodes order by file_path, start_line, kind, name"
    ].join(" ")
  ).map((row) => ({
    id: stringCell(row.id),
    kind: stringCell(row.kind),
    name: stringCell(row.name),
    qualifiedName: stringCell(row.qualified_name),
    filePath: stringCell(row.file_path),
    language: stringCell(row.language),
    range: {
      startLine: numberCell(row.start_line),
      endLine: numberCell(row.end_line),
      startColumn: numberCell(row.start_column),
      endColumn: numberCell(row.end_column)
    },
    docstring: optionalStringCell(row.docstring),
    signature: optionalStringCell(row.signature),
    visibility: optionalStringCell(row.visibility),
    isExported: numberCell(row.is_exported) === 1
  }));
}

function readEdges(db: Database): CodeGraphIndexedEdge[] {
  return execRows(db, "select id, source, target, kind, metadata, line, col, provenance from edges order by id").map((row) => ({
    id: String(numberCell(row.id)),
    source: stringCell(row.source),
    target: stringCell(row.target),
    kind: stringCell(row.kind),
    metadata: parseJsonObject(row.metadata),
    line: optionalNumberCell(row.line),
    col: optionalNumberCell(row.col),
    provenance: optionalStringCell(row.provenance)
  }));
}

function execRows(db: Database, sql: string): Record<string, SqlValue>[] {
  const [result] = db.exec(sql);
  if (!result) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((column, index) => [column, values[index]])));
}

function stringCell(value: SqlValue): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function optionalStringCell(value: SqlValue): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberCell(value: SqlValue): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumberCell(value: SqlValue): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseJsonObject(value: SqlValue): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonArray(value: SqlValue): unknown[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
