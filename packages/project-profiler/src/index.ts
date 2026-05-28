import { createEvidence, unique, type Confidence, type Evidence } from "@praxis/core";
import type { RepositorySnapshot, SourceRoleHint } from "@praxis/repository-scanner";

export type ProjectKind = "monorepo" | "desktop_app" | "web_app" | "cli" | "library" | "docs" | "unknown";

export interface ProfileEvidence {
  id: string;
  summary: string;
  references: string[];
}

export interface ModuleCandidate {
  id: string;
  title: string;
  path: string;
  kind:
    | "ui"
    | "application"
    | "domain"
    | "runtime"
    | "infrastructure"
    | "storage"
    | "agent"
    | "model"
    | "tooling"
    | "test"
    | "docs"
    | "unknown";
  confidence: Confidence;
  evidence: string[];
}

export interface ProjectProfile {
  name: string;
  root: string;
  projectKinds: ProjectKind[];
  languages: string[];
  frameworks: string[];
  buildSystems: string[];
  packageManagers: string[];
  entrypoints: string[];
  testFiles: string[];
  testCommands: string[];
  runCommands: string[];
  buildCommands: string[];
  moduleCandidates: ModuleCandidate[];
  confidence: Confidence;
  evidence: ProfileEvidence[];
}

export interface ProjectProfiler {
  profile(snapshot: RepositorySnapshot): Promise<ProjectProfile>;
}

export class RuleBasedProjectProfiler implements ProjectProfiler {
  async profile(snapshot: RepositorySnapshot): Promise<ProjectProfile> {
    const evidence: ProfileEvidence[] = [];
    const projectKinds = new Set<ProjectKind>();
    const frameworks = new Set<string>();
    const buildSystems = new Set<string>();
    const packageManagers = new Set<string>();
    const entrypoints = new Set<string>();
    const runCommands = new Set<string>();
    const buildCommands = new Set<string>();
    const testCommands = new Set<string>();

    const packageJson = snapshot.manifests.find((manifest) => manifest.path === "package.json")?.data;
    if (packageJson) {
      packageManagers.add("npm");
      evidence.push({ id: "profile:package-json", summary: "Detected package.json", references: ["package.json"] });
      const workspaces = (packageJson as { workspaces?: unknown }).workspaces;
      if (Array.isArray(workspaces) || typeof workspaces === "object") {
        projectKinds.add("monorepo");
        evidence.push({ id: "profile:workspaces", summary: "package.json declares workspaces", references: ["package.json"] });
      }
      const scripts = ((packageJson as { scripts?: Record<string, string> }).scripts ?? {}) as Record<string, string>;
      collectScripts(scripts, runCommands, buildCommands, testCommands);
      const dependencies = {
        ...(((packageJson as { dependencies?: Record<string, string> }).dependencies ?? {}) as Record<string, string>),
        ...(((packageJson as { devDependencies?: Record<string, string> }).devDependencies ?? {}) as Record<string, string>)
      };
      if (dependencies.react) frameworks.add("React");
      if (dependencies.vite || snapshot.manifests.some((manifest) => manifest.path.endsWith("vite.config.ts"))) frameworks.add("Vite");
      if (dependencies["@tauri-apps/api"] || dependencies["@tauri-apps/cli"]) frameworks.add("Tauri");
    }

    if (snapshot.manifests.some((manifest) => manifest.path.endsWith("tauri.conf.json"))) {
      projectKinds.add("desktop_app");
      frameworks.add("Tauri");
      evidence.push({ id: "profile:tauri", summary: "Detected tauri.conf.json", references: matching(snapshot, "tauri.conf.json") });
    }
    if (snapshot.manifests.some((manifest) => manifest.path.endsWith("Cargo.toml"))) {
      buildSystems.add("Cargo");
      evidence.push({ id: "profile:cargo", summary: "Detected Cargo.toml", references: matching(snapshot, "Cargo.toml") });
    }
    const dotnetManifests = snapshot.manifests.filter((manifest) => manifest.kind === "dotnet_project" || manifest.kind === "dotnet_solution");
    if (dotnetManifests.length > 0 || snapshot.files.some((file) => file.language === "C#")) {
      buildSystems.add("MSBuild");
      packageManagers.add("dotnet");
      evidence.push({
        id: "profile:dotnet",
        summary: "Detected .NET solution/project files or C# source files",
        references: dotnetManifests.map((manifest) => manifest.path).slice(0, 12)
      });
    }
    if (hasAvaloniaSignal(snapshot)) {
      projectKinds.add("desktop_app");
      frameworks.add("Avalonia");
      evidence.push({
        id: "profile:avalonia",
        summary: "Detected Avalonia project signals",
        references: avaloniaReferences(snapshot).slice(0, 12)
      });
    }
    if (snapshot.manifests.some((manifest) => manifest.path.endsWith("vite.config.ts"))) {
      buildSystems.add("Vite");
      frameworks.add("Vite");
    }
    if (snapshot.manifests.some((manifest) => manifest.path.endsWith("tsconfig.base.json") || manifest.path.endsWith("tsconfig.json"))) {
      buildSystems.add("TypeScript");
    }

    for (const file of snapshot.files) {
      if (/src\/main\.(ts|tsx|rs)$/.test(file.path) || /src-tauri\/src\/main\.rs$/.test(file.path)) {
        entrypoints.add(file.path);
      }
    }

    const moduleCandidates = detectModules(snapshot);
    if (moduleCandidates.some((module) => module.path.startsWith("apps/"))) projectKinds.add("web_app");
    if (moduleCandidates.some((module) => module.path.endsWith(".Main") || module.path.endsWith(".Shell"))) projectKinds.add("desktop_app");
    if (moduleCandidates.some((module) => module.path.startsWith("packages/"))) projectKinds.add("library");
    if (snapshot.docs.length > 0 && projectKinds.size === 0) projectKinds.add("docs");

    return {
      name: snapshot.name,
      root: snapshot.root,
      projectKinds: projectKinds.size ? Array.from(projectKinds) : ["unknown"],
      languages: Object.entries(snapshot.statistics.languages)
        .filter(([language]) => language !== "Unknown")
        .sort((a, b) => b[1] - a[1])
        .map(([language]) => language),
      frameworks: Array.from(frameworks).sort(),
      buildSystems: Array.from(buildSystems).sort(),
      packageManagers: Array.from(packageManagers).sort(),
      entrypoints: Array.from(entrypoints).sort(),
      testFiles: snapshot.files.filter((file) => file.roleHint === "test").map((file) => file.path),
      testCommands: Array.from(testCommands),
      runCommands: Array.from(runCommands),
      buildCommands: Array.from(buildCommands),
      moduleCandidates,
      confidence: moduleCandidates.length > 0 ? "high" : "medium",
      evidence
    };
  }
}

export async function profileProject(snapshot: RepositorySnapshot): Promise<ProjectProfile> {
  return new RuleBasedProjectProfiler().profile(snapshot);
}

export function moduleEvidence(path: string, source = "project-profiler"): Evidence {
  return createEvidence({
    kind: "FACT",
    source,
    summary: `Detected module candidate at ${path}`,
    confidence: "medium",
    references: [path]
  });
}

function collectScripts(
  scripts: Record<string, string>,
  runCommands: Set<string>,
  buildCommands: Set<string>,
  testCommands: Set<string>
): void {
  for (const [name, command] of Object.entries(scripts)) {
    const full = `npm run ${name}`;
    if (name.includes("dev") || name.includes("start")) runCommands.add(full);
    if (name.includes("build")) buildCommands.add(full);
    if (name.includes("test") || name.includes("typecheck")) testCommands.add(full);
    if (command.includes("vite")) buildCommands.add(full);
  }
}

function detectModules(snapshot: RepositorySnapshot): ModuleCandidate[] {
  const modulePaths = new Set<string>();
  for (const directory of snapshot.directories) {
    if (/^apps\/[^/]+$/.test(directory.path)) modulePaths.add(directory.path);
    if (/^packages\/[^/]+$/.test(directory.path)) modulePaths.add(directory.path);
    if (directory.path === "docs") modulePaths.add(directory.path);
    if (/^[A-Za-z0-9_.-]+$/.test(directory.path) && snapshot.manifests.some((manifest) => manifest.path.startsWith(`${directory.path}/`) && manifest.kind === "dotnet_project")) {
      modulePaths.add(directory.path);
    }
  }
  for (const manifest of snapshot.manifests) {
    if (manifest.path.includes("/package.json")) modulePaths.add(manifest.path.split("/").slice(0, -1).join("/"));
    if (manifest.path.includes("/Cargo.toml")) modulePaths.add(manifest.path.split("/").slice(0, -1).join("/"));
    if (manifest.path.includes("/") && manifest.kind === "dotnet_project") modulePaths.add(manifest.path.split("/").slice(0, -1).join("/"));
  }

  return Array.from(modulePaths)
    .sort()
    .map((modulePath) => {
      const files = snapshot.files.filter((file) => file.path.startsWith(`${modulePath}/`));
      const roleHints = unique(files.map((file) => file.roleHint));
      return {
        id: `module:${modulePath}`,
        title: modulePath,
        path: modulePath,
        kind: moduleKind(modulePath, roleHints),
        confidence: files.length > 0 ? "high" : "medium",
        evidence: [
          `Directory exists: ${modulePath}`,
          ...snapshot.manifests.filter((manifest) => manifest.path.startsWith(`${modulePath}/`)).map((manifest) => `Manifest: ${manifest.path}`)
        ]
      };
    });
}

function moduleKind(modulePath: string, roleHints: SourceRoleHint[]): ModuleCandidate["kind"] {
  const lower = modulePath.toLowerCase();
  if (modulePath === "docs") return "docs";
  if (lower.endsWith(".sharedui") || lower.endsWith(".shell") || lower.endsWith(".main") || /(^|[\/._-])(ui|views?|components?|pages?)([\/._-]|$)/.test(lower)) return "ui";
  if (lower.endsWith(".services") || lower.endsWith(".runtime")) return "runtime";
  if (lower.includes("contracts")) return "domain";
  if (lower.includes("studio-desktop")) return "ui";
  if (lower.includes("runtime-cli")) return "tooling";
  if (lower.includes("agent")) return "agent";
  if (lower.includes("model")) return "model";
  if (lower.includes("knowledge") || lower.includes("store")) return "storage";
  if (lower.includes("tool") || lower.includes("trace")) return "infrastructure";
  if (lower.includes("core") || lower.includes("graph")) return "domain";
  if (roleHints.includes("ui")) return "ui";
  if (roleHints.includes("runtime")) return "runtime";
  if (roleHints.includes("storage")) return "storage";
  if (roleHints.includes("domain")) return "domain";
  if (roleHints.includes("infrastructure")) return "infrastructure";
  return modulePath.startsWith("apps/") ? "application" : "unknown";
}

function hasAvaloniaSignal(snapshot: RepositorySnapshot): boolean {
  return avaloniaReferences(snapshot).length > 0;
}

function avaloniaReferences(snapshot: RepositorySnapshot): string[] {
  const references = new Set<string>();
  for (const file of snapshot.files) {
    if (file.path.endsWith(".axaml") || file.path.endsWith(".xaml") || file.importedPaths.some((item) => item.includes("Avalonia"))) {
      references.add(file.path);
    }
  }
  for (const manifest of snapshot.manifests) {
    const packages = Array.isArray(manifest.data?.packageReferences) ? manifest.data.packageReferences : [];
    if (packages.some((item) => typeof item === "string" && item.includes("Avalonia"))) references.add(manifest.path);
  }
  return Array.from(references);
}

function matching(snapshot: RepositorySnapshot, name: string): string[] {
  return snapshot.manifests.filter((manifest) => manifest.path.endsWith(name)).map((manifest) => manifest.path);
}
