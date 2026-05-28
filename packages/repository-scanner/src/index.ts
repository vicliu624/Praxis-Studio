import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface RepositoryScannerOptions {
  root: string;
  maxFiles?: number;
  maxFileSizeBytes?: number;
  includeHidden?: boolean;
  ignore?: string[];
}

export interface SourceFileSummary {
  path: string;
  extension: string;
  language: string;
  sizeBytes: number;
  lineCount: number;
  roleHint: SourceRoleHint;
  importedPaths: string[];
  isIgnored: boolean;
}

export type SourceRoleHint =
  | "application"
  | "runtime"
  | "domain"
  | "infrastructure"
  | "storage"
  | "ui"
  | "test"
  | "documentation"
  | "config"
  | "unknown";

export interface DirectorySummary {
  path: string;
  fileCount: number;
  roleHint: SourceRoleHint;
}

export interface ProjectManifest {
  path: string;
  kind: string;
  data?: Record<string, unknown>;
}

export interface DocumentSummary {
  path: string;
  title?: string;
  lineCount: number;
}

export interface GitSummary {
  present: boolean;
}

export interface RepositoryStatistics {
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  languages: Record<string, number>;
}

export interface RepositorySnapshot {
  root: string;
  name: string;
  scannedAt: string;
  files: SourceFileSummary[];
  directories: DirectorySummary[];
  manifests: ProjectManifest[];
  docs: DocumentSummary[];
  git?: GitSummary;
  statistics: RepositoryStatistics;
}

export interface RepositoryScanner {
  scan(options: RepositoryScannerOptions): Promise<RepositorySnapshot>;
}

const DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  ".next",
  ".turbo",
  ".cache",
  ".distinction",
  ".venv",
  "__pycache__"
];

const ALLOWED_HIDDEN_DIRECTORIES = new Set([".github"]);

const MANIFESTS = new Set([
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "vite.config.ts",
  "tauri.conf.json",
  "Cargo.toml",
  "CMakeLists.txt",
  "platformio.ini",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Directory.Build.props",
  "Directory.Build.targets"
]);

export class FileSystemRepositoryScanner implements RepositoryScanner {
  async scan(options: RepositoryScannerOptions): Promise<RepositorySnapshot> {
    const root = path.resolve(options.root);
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) throw new Error(`Repository root is not a directory: ${root}`);

    const ignore = [...DEFAULT_IGNORE, ...(options.ignore ?? [])];
    const maxFiles = options.maxFiles ?? 12000;
    const maxFileSizeBytes = options.maxFileSizeBytes ?? 1_000_000;
    const files: SourceFileSummary[] = [];
    const directories = new Map<string, DirectorySummary>();
    const manifests: ProjectManifest[] = [];
    const docs: DocumentSummary[] = [];

    await this.walk(root, root, {
      files,
      directories,
      manifests,
      docs,
      ignore,
      includeHidden: options.includeHidden ?? false,
      maxFiles,
      maxFileSizeBytes
    });

    const languages: Record<string, number> = {};
    let totalBytes = 0;
    for (const file of files) {
      languages[file.language] = (languages[file.language] ?? 0) + 1;
      totalBytes += file.sizeBytes;
    }

    return {
      root,
      name: path.basename(root),
      scannedAt: new Date().toISOString(),
      files,
      directories: Array.from(directories.values()).sort((a, b) => a.path.localeCompare(b.path)),
      manifests,
      docs,
      git: { present: await exists(path.join(root, ".git")) },
      statistics: {
        fileCount: files.length,
        directoryCount: directories.size,
        totalBytes,
        languages
      }
    };
  }

  private async walk(current: string, root: string, context: WalkContext): Promise<void> {
    if (context.files.length >= context.maxFiles) return;

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (context.files.length >= context.maxFiles) return;
      if (shouldSkipEntry(entry.name, context)) continue;

      const absolute = path.join(current, entry.name);
      const relative = toRepositoryPath(path.relative(root, absolute));

      if (entry.isDirectory()) {
        context.directories.set(relative, {
          path: relative,
          fileCount: 0,
          roleHint: detectRoleHint(relative, true)
        });
        await this.walk(absolute, root, context);
        continue;
      }

      if (!entry.isFile()) continue;
      const info = await stat(absolute);
      const extension = path.extname(entry.name).toLowerCase();
      const language = detectLanguage(relative, extension);
      const roleHint = detectRoleHint(relative, false);
      const canRead = info.size <= context.maxFileSizeBytes && isTextLike(language, extension, relative);
      const content = canRead ? await readFile(absolute, "utf8").catch(() => "") : "";
      const lineCount = content ? content.split(/\r?\n/).length : 0;
      const importedPaths = content ? extractImports(content, language) : [];
      const file: SourceFileSummary = {
        path: relative,
        extension,
        language,
        sizeBytes: info.size,
        lineCount,
        roleHint,
        importedPaths,
        isIgnored: false
      };
      context.files.push(file);

      const directory = toRepositoryPath(path.dirname(relative));
      if (directory !== ".") {
        const existing = context.directories.get(directory);
        if (existing) existing.fileCount += 1;
      }

      if (isManifest(relative)) {
        context.manifests.push({ path: relative, kind: manifestKind(relative), data: parseManifestData(relative, content) });
      }

      if (language === "Markdown" || relative.toLowerCase().startsWith("docs/")) {
        context.docs.push({
          path: relative,
          title: extractMarkdownTitle(content),
          lineCount
        });
      }
    }
  }
}

interface WalkContext {
  files: SourceFileSummary[];
  directories: Map<string, DirectorySummary>;
  manifests: ProjectManifest[];
  docs: DocumentSummary[];
  ignore: string[];
  includeHidden: boolean;
  maxFiles: number;
  maxFileSizeBytes: number;
}

function shouldSkipEntry(name: string, context: WalkContext): boolean {
  if (name.startsWith(".distinction.backup-") || name.startsWith(".distinction.previous-")) return true;
  if (context.ignore.includes(name)) return true;
  if (!context.includeHidden && name.startsWith(".") && !ALLOWED_HIDDEN_DIRECTORIES.has(name)) return true;
  return false;
}

export async function scanRepository(options: RepositoryScannerOptions): Promise<RepositorySnapshot> {
  return new FileSystemRepositoryScanner().scan(options);
}

export function toRepositoryPath(value: string): string {
  return value.split(path.sep).join("/");
}

function detectLanguage(filePath: string, extension: string): string {
  const name = path.basename(filePath);
  if (extension === ".ts" || extension === ".tsx") return "TypeScript";
  if (extension === ".js" || extension === ".jsx" || extension === ".mjs" || extension === ".cjs") return "JavaScript";
  if (extension === ".rs") return "Rust";
  if (extension === ".py") return "Python";
  if (extension === ".cs") return "C#";
  if (extension === ".xaml" || extension === ".axaml") return "XAML";
  if ([".cpp", ".cc", ".cxx", ".c", ".h", ".hpp"].includes(extension)) return "C/C++";
  if (extension === ".sh") return "Shell";
  if (extension === ".ps1") return "PowerShell";
  if (extension === ".bat" || extension === ".cmd") return "Batch";
  if (extension === ".md") return "Markdown";
  if ([".json", ".yaml", ".yml", ".toml", ".ini", ".csproj", ".sln", ".props", ".targets"].includes(extension)) return "Config";
  if (name === "CMakeLists.txt" || name === "Dockerfile") return "Config";
  return "Unknown";
}

function detectRoleHint(filePath: string, isDirectory: boolean): SourceRoleHint {
  const lower = filePath.toLowerCase();
  if (lower.includes("test") || lower.includes("spec")) return "test";
  if (lower.includes("readme") || lower.startsWith("docs") || lower.endsWith(".md")) return "documentation";
  if (
    lower.endsWith(".xaml") ||
    lower.endsWith(".axaml") ||
    /(^|[\/._-])(ui|views?|components?|pages?)([\/._-]|$)/.test(lower)
  ) {
    return "ui";
  }
  if (lower.includes("domain") || lower.includes("model") || lower.includes("entity")) return "domain";
  if (lower.includes("runtime") || lower.includes("agent")) return "runtime";
  if (lower.includes("infra") || lower.includes("adapter") || lower.includes("platform")) return "infrastructure";
  if (lower.includes("storage") || lower.includes("store") || lower.includes("knowledge")) return "storage";
  if (
    !isDirectory &&
    (lower.endsWith(".json") ||
      lower.endsWith(".yaml") ||
      lower.endsWith(".toml") ||
      lower.endsWith(".csproj") ||
      lower.endsWith(".sln") ||
      lower.endsWith(".props") ||
      lower.endsWith(".targets"))
  ) {
    return "config";
  }
  return "unknown";
}

function extractImports(content: string, language: string): string[] {
  const imports = new Set<string>();
  const patterns =
    language === "TypeScript" || language === "JavaScript"
      ? [/import\s+[^'"]*from\s+["']([^"']+)["']/g, /import\s*\(\s*["']([^"']+)["']\s*\)/g]
      : language === "Rust"
        ? [/\buse\s+([^;]+);/g, /\bmod\s+([A-Za-z0-9_]+)\s*;/g]
        : language === "C/C++"
          ? [/#include\s+[<"]([^>"]+)[>"]/g]
          : language === "C#"
            ? [/^\s*using\s+([A-Za-z0-9_.]+)\s*;/gm]
            : language === "Python"
              ? [/^\s*import\s+([A-Za-z0-9_.,\s]+)/gm, /^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+/gm]
              : [];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) imports.add(match[1].trim());
    }
  }
  return Array.from(imports).slice(0, 100);
}

function isTextLike(language: string, extension: string, filePath: string): boolean {
  return language !== "Unknown" || MANIFESTS.has(path.basename(filePath)) || [".gitignore", ".env.example"].includes(path.basename(filePath));
}

function isManifest(filePath: string): boolean {
  const name = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();
  return MANIFESTS.has(name) || extension === ".csproj" || extension === ".sln" || filePath.startsWith(".github/workflows/");
}

function manifestKind(filePath: string): string {
  const name = path.basename(filePath);
  if (filePath.startsWith(".github/workflows/")) return "github_workflow";
  if (name === "package.json") return "node_package";
  if (name.startsWith("tsconfig")) return "typescript_config";
  if (name === "tauri.conf.json") return "tauri_config";
  if (name === "Cargo.toml") return "rust_package";
  if (name === "vite.config.ts") return "vite_config";
  if (name.endsWith(".csproj")) return "dotnet_project";
  if (name.endsWith(".sln")) return "dotnet_solution";
  if (name === "Directory.Build.props" || name === "Directory.Build.targets") return "msbuild_config";
  return name;
}

function parseManifestData(filePath: string, content: string): Record<string, unknown> | undefined {
  if (!content) return undefined;
  if (filePath.endsWith(".json")) {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  if (filePath.endsWith(".csproj")) {
    return {
      packageReferences: [...content.matchAll(/<PackageReference\s+[^>]*Include=["']([^"']+)["']/gi)].map((match) => match[1]),
      projectReferences: [...content.matchAll(/<ProjectReference\s+[^>]*Include=["']([^"']+)["']/gi)].map((match) => match[1]),
      targetFrameworks:
        content.match(/<TargetFrameworks?>([^<]+)<\/TargetFrameworks?>/i)?.[1]?.split(";").map((item) => item.trim()).filter(Boolean) ?? []
    };
  }
  if (filePath.endsWith(".sln")) {
    return {
      projects: [...content.matchAll(/Project\("[^"]+"\)\s*=\s*"([^"]+)",\s*"([^"]+)"/g)].map((match) => ({
        name: match[1],
        path: match[2]
      }))
    };
  }
  return undefined;
}

function extractMarkdownTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
