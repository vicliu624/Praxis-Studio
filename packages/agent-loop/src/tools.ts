import type { ToolDefinition, ToolContext } from "@praxis/tool-registry";
import { readDevelopmentGraph, writeDevelopmentGraph, getLocalKnowledgePaths, appendChange } from "@praxis/local-knowledge";
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

// ─── Utility ─────────────────────────────────────────────────

function safeRelative(root: string, target: string): string {
  const resolved = path.resolve(root, target);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new Error(`Path escape prevented: ${target}`);
  }
  return resolved;
}

function ignorePatterns(): string[] {
  return [".git", "node_modules", "dist", "build", "target", ".next", ".turbo", ".cache", ".venv", "__pycache__", ".distinction"];
}

function shouldIgnore(filePath: string): boolean {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts.some((p) => ignorePatterns().includes(p));
}

// ─── ListFilesTool ───────────────────────────────────────────

export const ListFilesTool: ToolDefinition = {
  name: "list_files",
  description: "List files and directories in a given path.",
  riskLevel: "read",
  requiredMode: "explain",
  isReadOnly: true,
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { directory?: string; maxEntries?: number };
    const dir = params.directory ? safeRelative(context.projectRoot, params.directory) : context.projectRoot;
    const max = params.maxEntries ?? 100;
    const entries: { name: string; kind: "file" | "directory"; size?: number }[] = [];

    try {
      const names = readdirSync(dir).filter((n) => !n.startsWith(".") || n === ".distinction");
      for (const name of names.slice(0, max)) {
        const full = path.join(dir, name);
        try {
          const s = statSync(full);
          entries.push({ name, kind: s.isDirectory() ? "directory" : "file", size: s.size });
        } catch {
          entries.push({ name, kind: "file" });
        }
      }
      return { directory: params.directory ?? ".", entries, count: entries.length, truncated: names.length > max };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
};

// ─── ReadFileTool ────────────────────────────────────────────

export const ReadFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file.",
  riskLevel: "read",
  requiredMode: "explain",
  isReadOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Relative path from project root." },
      startLine: { type: "number", description: "Optional: start line (1-indexed)." },
      endLine: { type: "number", description: "Optional: end line (1-indexed, inclusive)." }
    },
    required: ["filePath"]
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { filePath: string; startLine?: number; endLine?: number };
    const filePath = safeRelative(context.projectRoot, params.filePath);
    try {
      const content = await readFile(filePath, "utf8");
      const lines = content.split("\n");
      const start = Math.max(0, (params.startLine ?? 1) - 1);
      const end = params.endLine ? Math.min(lines.length, params.endLine) : lines.length;
      const selected = lines.slice(start, end);
      const lineCount = selected.length;
      const preview = selected.slice(0, 200).map((l, i) => `${start + i + 1}\t${l}`).join("\n");
      return {
        filePath: params.filePath,
        totalLines: lines.length,
        shownLines: lineCount,
        content: lineCount <= 200 ? preview : preview + `\n... (${lineCount - 200} more lines)`
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
};

// ─── SearchFilesTool (Glob) ──────────────────────────────────

export const SearchFilesTool: ToolDefinition = {
  name: "search_files",
  description: "Find files matching a glob pattern.",
  riskLevel: "read",
  requiredMode: "explain",
  isReadOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern like **/*.ts or src/**/*.tsx." },
      directory: { type: "string", description: "Optional: directory to search in (relative to project root)." }
    },
    required: ["pattern"]
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { pattern: string; directory?: string };
    const baseDir = params.directory ? safeRelative(context.projectRoot, params.directory) : context.projectRoot;
    const results: string[] = [];

    function globDir(dir: string, patternParts: string[], patternIdx: number): void {
      if (patternIdx >= patternParts.length) return;
      const part = patternParts[patternIdx];

      if (part === "**") {
        // Match current dir and recurse
        if (patternIdx === patternParts.length - 1) {
          results.push(dir);
          walk(dir, true);
        } else {
          // Try matching next part at this level, and recurse
          const nextParts = patternParts.slice(patternIdx + 1);
          if (matchGlobDir(dir, nextParts)) results.push(dir);
          walk(dir, false);
        }
        return;
      }

      // Match current part
      let entries: string[];
      try { entries = readdirSync(dir); } catch { return; }

      const regex = globPartToRegex(part);

      for (const entry of entries) {
        if (shouldIgnore(entry)) continue;
        const full = path.join(dir, entry);
        if (!regex.test(entry)) continue;

        if (patternIdx === patternParts.length - 1) {
          results.push(path.relative(baseDir, full));
        } else {
          try {
            if (statSync(full).isDirectory()) {
              globDir(full, patternParts, patternIdx + 1);
            }
          } catch { /* skip */ }
        }
      }
    }

    function walk(dir: string, addDirs: boolean): void {
      let entries: string[];
      try { entries = readdirSync(dir); } catch { return; }
      for (const entry of entries) {
        if (shouldIgnore(entry)) continue;
        const full = path.join(dir, entry);
        try {
          const s = statSync(full);
          if (s.isDirectory()) {
            if (addDirs) results.push(path.relative(baseDir, full));
            walk(full, addDirs);
          } else {
            if (addDirs) results.push(path.relative(baseDir, full));
          }
        } catch { /* skip */ }
      }
    }

    function matchGlobDir(dir: string, parts: string[]): boolean {
      if (parts.length === 0) return true;
      const regex = globPartToRegex(parts[0]);
      let entries: string[];
      try { entries = readdirSync(dir); } catch { return false; }
      for (const entry of entries) {
        if (regex.test(entry)) {
          if (parts.length === 1) return true;
          const full = path.join(dir, entry);
          try {
            if (statSync(full).isDirectory()) return matchGlobDir(full, parts.slice(1));
          } catch { continue; }
        }
      }
      return false;
    }

    function globPartToRegex(part: string): RegExp {
      const escaped = part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${escaped}$`);
    }

    const parts = params.pattern.replace(/\\/g, "/").split("/").filter(Boolean);
    globDir(baseDir, parts, 0);

    const unique = [...new Set(results)].slice(0, 200);
    return { pattern: params.pattern, matches: unique, count: unique.length };
  }
};

// ─── GrepTool ────────────────────────────────────────────────

export const GrepTool: ToolDefinition = {
  name: "grep",
  description: "Search file contents with a regex pattern.",
  riskLevel: "read",
  requiredMode: "explain",
  isReadOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for." },
      directory: { type: "string", description: "Optional: directory to search in." },
      filePattern: { type: "string", description: "Optional: glob to filter files (e.g. *.ts)." },
      maxResults: { type: "number", description: "Max results (default 50)." }
    },
    required: ["pattern"]
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { pattern: string; directory?: string; filePattern?: string; maxResults?: number };
    const baseDir = params.directory ? safeRelative(context.projectRoot, params.directory) : context.projectRoot;
    const maxResults = params.maxResults ?? 50;
    const results: { file: string; line: number; content: string }[] = [];

    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, "gi");
    } catch {
      return { error: `Invalid regex: ${params.pattern}` };
    }

    const fileRegex = params.filePattern ? globPartToFileRegex(params.filePattern) : null;

    function globPartToFileRegex(part: string): RegExp {
      const escaped = part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
      return new RegExp(`^${escaped}$`);
    }

    async function searchDir(dir: string): Promise<void> {
      if (results.length >= maxResults) return;
      let entries: string[];
      try { entries = readdirSync(dir); } catch { return; }
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (shouldIgnore(entry)) continue;
        const full = path.join(dir, entry);
        try {
          const s = statSync(full);
          if (s.isDirectory()) {
            await searchDir(full);
          } else if (s.isFile() && (!fileRegex || fileRegex.test(entry)) && s.size < 1_000_000) {
            try {
              const content = await readFile(full, "utf8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                if (regex.test(lines[i])) {
                  regex.lastIndex = 0; // reset after test
                  results.push({
                    file: path.relative(baseDir, full).replace(/\\/g, "/"),
                    line: i + 1,
                    content: lines[i].trim().slice(0, 200)
                  });
                }
              }
            } catch { /* skip unreadable */ }
          }
        } catch { /* skip */ }
      }
    }

    await searchDir(baseDir);
    return {
      pattern: params.pattern,
      results,
      count: results.length,
      truncated: results.length >= maxResults
    };
  }
};

// ─── ReadGraphTool ───────────────────────────────────────────

export const ReadGraphTool: ToolDefinition = {
  name: "read_graph",
  description: "Read the Development Graph (nodes and edges).",
  riskLevel: "read",
  requiredMode: "explain",
  isReadOnly: true,
  async call(_input: unknown, context: ToolContext): Promise<unknown> {
    try {
      const graph = await readDevelopmentGraph(context.projectRoot);
      return {
        nodes: graph.nodes.map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          description: n.description?.slice(0, 200),
          progress: n.progress,
          status: n.status,
          knowledgeKind: n.knowledgeKind
        })),
        edges: graph.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          kind: e.kind,
          title: e.title,
          progress: e.progress,
          riskLevel: e.riskLevel,
          blockedReason: e.blockedReason,
          knowledgeKind: e.knowledgeKind
        })),
        summary: `${graph.nodes.length} nodes, ${graph.edges.length} edges`
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
};

// ─── ReadMemoryTool ──────────────────────────────────────────

export const ReadMemoryTool: ToolDefinition = {
  name: "read_memory",
  description: "Read project memory files (.distinction/memory/).",
  riskLevel: "read",
  requiredMode: "explain",
  isReadOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Which memory file: changes, decisions, traces, incidents, do-not-repeat, or rules."
      }
    }
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { file?: string };
    const paths = getLocalKnowledgePaths(context.projectRoot);
    const filename = params.file ?? "changes";

    const fileMap: Record<string, string> = {
      changes: path.join(paths.memoryDir, "changes.md"),
      decisions: path.join(paths.memoryDir, "decisions.md"),
      traces: path.join(paths.memoryDir, "traces.jsonl"),
      incidents: path.join(paths.memoryDir, "incidents.json"),
      "do-not-repeat": path.join(paths.memoryDir, "do-not-repeat.md"),
      rules: path.join(paths.rulesDir, "ai-constraints.md"),
      architecture: path.join(paths.rulesDir, "architecture.md"),
      boundaries: path.join(paths.rulesDir, "boundaries.md")
    };

    const filePath = fileMap[filename];
    if (!filePath) return { error: `Unknown memory file: ${filename}. Options: ${Object.keys(fileMap).join(", ")}` };

    try {
      const content = await readFile(filePath, "utf8");
      const lines = content.split("\n");
      return {
        file: filename,
        lines: lines.length,
        preview: lines.slice(0, 100).join("\n") + (lines.length > 100 ? `\n... (${lines.length - 100} more lines)` : "")
      };
    } catch {
      return { file: filename, content: "(file not found or empty)" };
    }
  }
};

// ─── WriteMemoryTool ─────────────────────────────────────────

export const WriteMemoryTool: ToolDefinition = {
  name: "write_memory",
  description: "Append a change entry to project memory.",
  riskLevel: "write_memory",
  requiredMode: "plan",
  isReadOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Title of the memory entry." },
      summary: { type: "string", description: "Summary of the change or finding." },
      kind: { type: "string", description: "Kind: CANDIDATE or CONFIRMED." }
    },
    required: ["title", "summary"]
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { title: string; summary: string; kind?: string };
    await appendChange(context.projectRoot, {
      title: params.title,
      summary: params.summary,
      kind: (params.kind as "CANDIDATE" | "CONFIRMED") ?? "CANDIDATE"
    });
    return { ok: true, title: params.title };
  }
};

// ─── UpdateGraphTool ─────────────────────────────────────────

export const UpdateGraphTool: ToolDefinition = {
  name: "update_graph",
  description: "Update node progress or edge blocked reason in the Development Graph.",
  riskLevel: "write_memory",
  requiredMode: "plan",
  isReadOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "update_node_progress, update_edge_progress, or update_edge." },
      targetId: { type: "string", description: "Node or edge ID." },
      progress: { type: "number", description: "Progress value (0-1). For node/edge progress updates." },
      blockedReason: { type: "string", description: "Blocked reason text. For edge updates." },
      description: { type: "string", description: "Description of the change." }
    },
    required: ["action", "targetId"]
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { action: string; targetId: string; progress?: number; blockedReason?: string; description?: string };
    const graph = await readDevelopmentGraph(context.projectRoot);

    if (params.action === "update_node_progress" && typeof params.progress === "number") {
      const node = graph.nodes.find((n) => n.id === params.targetId);
      if (!node) return { error: `Node not found: ${params.targetId}` };
      node.progress = Math.max(0, Math.min(1, params.progress > 1 ? params.progress / 100 : params.progress));
      await writeDevelopmentGraph(context.projectRoot, graph);
      return { ok: true, nodeId: params.targetId, progress: node.progress };
    }

    if (params.action === "update_edge_progress" && typeof params.progress === "number") {
      const edge = graph.edges.find((e) => e.id === params.targetId);
      if (!edge) return { error: `Edge not found: ${params.targetId}` };
      edge.progress = Math.max(0, Math.min(1, params.progress > 1 ? params.progress / 100 : params.progress));
      await writeDevelopmentGraph(context.projectRoot, graph);
      return { ok: true, edgeId: params.targetId, progress: edge.progress };
    }

    if (params.action === "update_edge") {
      const edge = graph.edges.find((e) => e.id === params.targetId);
      if (!edge) return { error: `Edge not found: ${params.targetId}` };
      if (params.blockedReason) edge.blockedReason = params.blockedReason;
      if (params.description) edge.description = params.description;
      await writeDevelopmentGraph(context.projectRoot, graph);
      return { ok: true, edgeId: params.targetId };
    }

    return { error: `Unknown action: ${params.action}` };
  }
};

// ─── ProposePatchTool ────────────────────────────────────────

export const ProposePatchTool: ToolDefinition = {
  name: "propose_patch",
  description: "Propose a file edit as a unified diff preview. Does NOT write the file.",
  riskLevel: "write_source",
  requiredMode: "plan",
  isReadOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Relative path to file." },
      oldContent: { type: "string", description: "The exact content to replace." },
      newContent: { type: "string", description: "The replacement content." }
    },
    required: ["filePath", "oldContent", "newContent"]
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { filePath: string; oldContent: string; newContent: string };
    const filePath = safeRelative(context.projectRoot, params.filePath);

    try {
      const original = await readFile(filePath, "utf8");
      if (!original.includes(params.oldContent)) {
        return {
          error: "oldContent not found in file. Make sure it matches exactly.",
          filePath: params.filePath,
          hint: "The file exists but the old content could not be matched."
        };
      }

      const diff = computeUnifiedDiff(params.filePath, original, params.oldContent, params.newContent);
      return {
        filePath: params.filePath,
        diff,
        status: "proposed",
        hint: "Review the diff above. Use apply_patch to apply this change after user approval."
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), filePath: params.filePath };
    }
  }
};

// ─── ApplyPatchTool ──────────────────────────────────────────

export const ApplyPatchTool: ToolDefinition = {
  name: "apply_patch",
  description: "Apply a previously proposed file patch. Writes the file.",
  riskLevel: "write_source",
  requiredMode: "apply",
  isReadOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Relative path to file." },
      oldContent: { type: "string", description: "The exact content to replace (must match proposal)." },
      newContent: { type: "string", description: "The replacement content." }
    },
    required: ["filePath", "oldContent", "newContent"]
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { filePath: string; oldContent: string; newContent: string };
    const filePath = safeRelative(context.projectRoot, params.filePath);

    try {
      const original = await readFile(filePath, "utf8");
      if (!original.includes(params.oldContent)) {
        return { error: "oldContent not found. File may have changed since proposal." };
      }
      const updated = original.replace(params.oldContent, params.newContent);
      await writeFile(filePath, updated, "utf8");

      // Record in memory
      await appendChange(context.projectRoot, {
        title: `Applied patch to ${params.filePath}`,
        summary: `File ${params.filePath} was modified via apply_patch.`,
        kind: "CONFIRMED"
      });

      return { ok: true, filePath: params.filePath, status: "applied" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
};

// ─── RunCommandTool ──────────────────────────────────────────

import { spawn } from "node:child_process";

export const RunCommandTool: ToolDefinition = {
  name: "run_command",
  description: "Execute a shell command in the project root. Commands like npm run build, npm run typecheck, cargo build, etc.",
  riskLevel: "shell",
  requiredMode: "execute",
  isReadOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run." },
      timeoutMs: { type: "number", description: "Timeout in milliseconds (default 60000)." }
    },
    required: ["command"]
  },
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { command: string; timeoutMs?: number };
    const timeoutMs = params.timeoutMs ?? 60_000;

    return new Promise((resolve) => {
      const shell = process.platform === "win32" ? "powershell.exe" : "bash";
      const shellArgs = process.platform === "win32"
        ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", params.command]
        : ["-lc", params.command];
      const child = spawn(shell, shellArgs, {
        cwd: context.projectRoot,
        env: { ...process.env, FORCE_COLOR: "0" },
        timeout: timeoutMs
      });

      let stdout = "";
      let stderr = "";
      const startTime = Date.now();

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("error", (err) => {
        resolve({
          command: params.command,
          exitCode: -1,
          stdout,
          stderr: err.message,
          durationMs: Date.now() - startTime,
          status: "error"
        });
      });

      child.on("close", (code) => {
        resolve({
          command: params.command,
          exitCode: code ?? -1,
          stdout: stdout.slice(0, 5000),
          stderr: stderr.slice(0, 2000),
          durationMs: Date.now() - startTime,
          status: code === 0 ? "success" : "failed"
        });
      });
    });
  }
};

// ─── RunBuildTool ────────────────────────────────────────────

export const RunBuildTool: ToolDefinition = {
  name: "run_build",
  description: "Run the project build command (npm run build).",
  riskLevel: "shell",
  requiredMode: "execute",
  isReadOnly: false,
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { command?: string };
    return RunCommandTool.call({
      command: params.command ?? "npm run build"
    }, context);
  }
};

// ─── RunTestTool ─────────────────────────────────────────────

export const RunTestTool: ToolDefinition = {
  name: "run_test",
  description: "Run project tests (npm run typecheck or similar).",
  riskLevel: "shell",
  requiredMode: "execute",
  isReadOnly: false,
  async call(input: unknown, context: ToolContext): Promise<unknown> {
    const params = input as { command?: string };
    return RunCommandTool.call({
      command: params.command ?? "npm run typecheck"
    }, context);
  }
};

// ─── Unified Diff ────────────────────────────────────────────

export function computeUnifiedDiff(
  filePath: string,
  original: string,
  oldContent: string,
  newContent: string
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const origIdx = original.indexOf(oldContent);
  const before = original.slice(0, origIdx);
  const beforeLineCount = before.split("\n").length;
  const startLine = beforeLineCount;

  const lines: string[] = [];
  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);
  lines.push(`@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@`);

  for (const line of oldLines) {
    lines.push(`-${line}`);
  }
  for (const line of newLines) {
    lines.push(`+${line}`);
  }

  return lines.join("\n");
}

// ─── Register all tools ──────────────────────────────────────

import { ToolRegistry } from "@praxis/tool-registry";

export function registerAgentTools(registry: ToolRegistry): void {
  registry.register(ListFilesTool);
  registry.register(ReadFileTool);
  registry.register(SearchFilesTool);
  registry.register(GrepTool);
  registry.register(ReadGraphTool);
  registry.register(ReadMemoryTool);
  registry.register(WriteMemoryTool);
  registry.register(UpdateGraphTool);
  registry.register(ProposePatchTool);
  registry.register(ApplyPatchTool);
  registry.register(RunCommandTool);
  registry.register(RunBuildTool);
  registry.register(RunTestTool);
}

// ─── Permission helpers ──────────────────────────────────────

export function requiresPermission(tool: ToolDefinition, mode: string): boolean {
  if (tool.riskLevel === "read") return false;
  if ((tool.riskLevel === "write_memory" || tool.riskLevel === "write_docs") && mode !== "explain") return false;
  return true; // write_source, shell, network always require permission
}

export function permissionLabel(riskLevel: string): string {
  switch (riskLevel) {
    case "read": return "Read (auto-allowed)";
    case "write_memory": return "Write memory (light confirm)";
    case "write_docs": return "Write docs (light confirm)";
    case "write_source": return "Write source (must confirm)";
    case "shell": return "Run command (must confirm)";
    case "network": return "Network access (must confirm)";
    default: return riskLevel;
  }
}
