import type { Database } from "sql.js";

export interface CodeGraphDbSchemaProbeResult {
  ok: boolean;
  warnings: string[];
}

const REQUIRED_COLUMNS: Record<string, string[]> = {
  files: ["path", "content_hash", "language", "size", "node_count", "errors"],
  nodes: [
    "id",
    "kind",
    "name",
    "qualified_name",
    "file_path",
    "language",
    "start_line",
    "end_line",
    "start_column",
    "end_column",
    "docstring",
    "signature",
    "visibility",
    "is_exported"
  ],
  edges: ["id", "source", "target", "kind", "metadata", "line", "col", "provenance"]
};

export function probeCodeGraphDbSchema(db: Database): CodeGraphDbSchemaProbeResult {
  const warnings: string[] = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const existing = readTableColumns(db, table);
    if (!existing) {
      warnings.push(`CodeGraph SQLite schema mismatch: missing table '${table}'.`);
      continue;
    }
    for (const column of columns) {
      if (!existing.has(column)) warnings.push(`CodeGraph SQLite schema mismatch: table '${table}' missing column '${column}'.`);
    }
  }
  return { ok: warnings.length === 0, warnings };
}

function readTableColumns(db: Database, table: string): Set<string> | undefined {
  const escaped = table.replace(/'/g, "''");
  const [result] = db.exec(`pragma table_info('${escaped}')`);
  if (!result || result.values.length === 0) return undefined;
  const nameIndex = result.columns.indexOf("name");
  if (nameIndex < 0) return undefined;
  return new Set(result.values.map((row) => String(row[nameIndex])));
}
