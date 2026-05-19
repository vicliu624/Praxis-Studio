import { createEvidence, slugify, type Evidence } from "@praxis/core";
import {
  dedupeEdges,
  normalizeProgress,
  type DevelopmentEdge,
  type DevelopmentGraph,
  type DevelopmentGraphCandidate,
  type DevelopmentNode,
  type GraphQuestion,
  type GraphWarning
} from "@praxis/development-graph";
import type { ModuleCandidate, ProjectProfile } from "@praxis/project-profiler";
import type { RepositorySnapshot, SourceFileSummary } from "@praxis/repository-scanner";

export interface GraphGeneratorInput {
  snapshot: RepositorySnapshot;
  profile: ProjectProfile;
}

const REQUIRED_ALPHA_PACKAGES = [
  "packages/core",
  "packages/development-graph",
  "packages/local-knowledge",
  "packages/repository-scanner",
  "packages/project-profiler",
  "packages/graph-generator",
  "packages/agent-runtime",
  "packages/model-router",
  "packages/provider-deepseek",
  "packages/context-builder",
  "packages/tool-registry",
  "packages/trace-recorder",
  "packages/coding-agent-adapter"
];

export function generateDevelopmentGraphCandidate(input: GraphGeneratorInput): DevelopmentGraphCandidate {
  const { snapshot, profile } = input;
  const projectNode: DevelopmentNode = {
    id: "project:root",
    kind: "project",
    title: profile.name,
    description: `Repository project at ${snapshot.root}`,
    status: "active",
    progress: normalizeProgress(estimateProjectProgress(profile)),
    confidence: "high",
    knowledgeKind: "FACT",
    evidence: [factEvidence("repository-scanner", "Repository root scanned", [snapshot.root])],
    metadata: { root: snapshot.root, projectKinds: profile.projectKinds }
  };

  const moduleNodes = profile.moduleCandidates.map((module) => moduleNode(module, snapshot));
  const documentNodes = snapshot.docs.slice(0, 40).map((doc) => documentNode(doc.path, doc.title));
  const codeUnitNodes = detectCodeUnitNodes(snapshot, profile);
  const testNodes = snapshot.files
    .filter((file) => file.roleHint === "test")
    .slice(0, 40)
    .map((file) => testNode(file));

  const warnings = generateWarnings(snapshot, profile);
  const riskNodes = warnings.slice(0, 30).map(riskNode);
  const taskNodes = warnings.slice(0, 12).map(taskNode);
  const nodes: DevelopmentNode[] = [projectNode, ...moduleNodes, ...documentNodes, ...codeUnitNodes, ...testNodes, ...riskNodes, ...taskNodes];
  const edges: DevelopmentEdge[] = [];

  for (const module of profile.moduleCandidates) {
    edges.push({
      id: edgeId("project:root", "contains", `module:${module.path}`),
      source: "project:root",
      target: `module:${module.path}`,
      kind: "contains",
      title: "contains",
      status: "active",
      progress: 1,
      riskLevel: "none",
      confidence: "high",
      knowledgeKind: "FACT",
      evidence: [factEvidence("project-profiler", `Project contains module ${module.path}`, [module.path])]
    });
  }

  for (const doc of snapshot.docs.slice(0, 40)) {
    const owner = findOwningModule(profile.moduleCandidates, doc.path);
    edges.push({
      id: edgeId(owner ? `module:${owner.path}` : "project:root", "records", `document:${doc.path}`),
      source: owner ? `module:${owner.path}` : "project:root",
      target: `document:${doc.path}`,
      kind: "records",
      title: "records",
      status: "active",
      progress: owner ? 0.5 : 0.4,
      riskLevel: "none",
      confidence: "medium",
      knowledgeKind: "INFERENCE",
      evidence: [factEvidence("repository-scanner", `Detected documentation ${doc.path}`, [doc.path])]
    });
  }

  for (const codeUnit of codeUnitNodes) {
    const codePath = String(codeUnit.metadata?.path ?? "");
    const owner = findOwningModule(profile.moduleCandidates, codePath);
    if (!owner) continue;
    edges.push({
      id: edgeId(`module:${owner.path}`, "contains", codeUnit.id),
      source: `module:${owner.path}`,
      target: codeUnit.id,
      kind: "contains",
      title: "contains",
      status: "active",
      progress: 1,
      riskLevel: "none",
      confidence: "medium",
      knowledgeKind: "FACT",
      evidence: [factEvidence("repository-scanner", `Module contains code unit ${codePath}`, [codePath])]
    });
  }

  for (const test of snapshot.files.filter((file) => file.roleHint === "test").slice(0, 40)) {
    const owner = inferTestTarget(profile.moduleCandidates, test.path);
    edges.push({
      id: edgeId(`test:${test.path}`, "validates", owner ? `module:${owner.path}` : "project:root"),
      source: `test:${test.path}`,
      target: owner ? `module:${owner.path}` : "project:root",
      kind: "validates",
      title: "validates",
      status: "active",
      progress: owner ? 0.6 : 0.3,
      riskLevel: "none",
      confidence: owner ? "medium" : "low",
      knowledgeKind: "INFERENCE",
      evidence: [factEvidence("repository-scanner", `Detected test file ${test.path}`, [test.path])]
    });
  }

  edges.push(...dependencyEdges(snapshot, profile));
  for (const risk of riskNodes) {
    const targetId = String(risk.metadata?.targetId ?? "project:root");
    edges.push({
      id: edgeId(risk.id, "impacts", targetId),
      source: risk.id,
      target: targetId,
      kind: "impacts",
      title: "impacts",
      status: "active",
      progress: 0.2,
      riskLevel: "medium",
      confidence: "medium",
      knowledgeKind: "INFERENCE",
      evidence: [factEvidence("graph-generator", `Generated risk candidate ${risk.title}`, [])]
    });
  }
  for (const task of taskNodes) {
    edges.push({
      id: edgeId("project:root", "contains", task.id),
      source: "project:root",
      target: task.id,
      kind: "contains",
      title: "contains",
      status: "draft",
      progress: 0,
      riskLevel: "none",
      confidence: "low",
      knowledgeKind: "CANDIDATE",
      evidence: [factEvidence("graph-generator", `Generated task candidate ${task.title}`, [])]
    });
  }

  const unresolvedQuestions = generateQuestions(profile, warnings);

  const graph: DevelopmentGraph = {
    id: `graph:${slugify(profile.name) || "project"}`,
    title: `${profile.name} Development Graph Candidate`,
    rootPath: snapshot.root,
    nodes,
    edges: dedupeEdges(edges),
    updatedAt: new Date().toISOString(),
    metadata: {
      profile: {
        projectKinds: profile.projectKinds,
        languages: profile.languages,
        frameworks: profile.frameworks,
        buildSystems: profile.buildSystems,
        packageManagers: profile.packageManagers,
        entrypoints: profile.entrypoints,
        testCommands: profile.testCommands,
        runCommands: profile.runCommands,
        buildCommands: profile.buildCommands,
        moduleCandidates: profile.moduleCandidates
      },
      snapshotSummary: {
        fileCount: snapshot.statistics.fileCount,
        directoryCount: snapshot.statistics.directoryCount,
        manifests: snapshot.manifests.map((manifest) => manifest.path),
        docs: snapshot.docs.map((doc) => doc.path)
      }
    }
  };

  return {
    graph,
    generatedAt: new Date().toISOString(),
    source: "repository_scan",
    confidence: profile.confidence,
    assumptions: [
      {
        id: "assumption:module-boundaries",
        summary: "Module boundaries are inferred from apps/*, packages/*, docs/*, and package manifests.",
        confidence: "medium"
      }
    ],
    warnings,
    unresolvedQuestions
  };
}

function moduleNode(module: ModuleCandidate, snapshot: RepositorySnapshot): DevelopmentNode {
  return {
    id: `module:${module.path}`,
    kind: module.kind === "docs" ? "document" : "architecture_component",
    title: module.title,
    description: `Module candidate detected at ${module.path}`,
    status: "active",
    progress: normalizeProgress(estimateModuleProgress(module, snapshot)),
    confidence: module.confidence,
    knowledgeKind: "FACT",
    tags: [module.kind],
    evidence: [factEvidence("project-profiler", `Detected module candidate ${module.path}`, [module.path])],
    metadata: { path: module.path, moduleKind: module.kind, progressKnowledgeKind: "INFERENCE" }
  };
}

function documentNode(path: string, title?: string): DevelopmentNode {
  return {
    id: `document:${path}`,
    kind: "document",
    title: title ?? path,
    status: "active",
    progress: 0.5,
    confidence: "medium",
    knowledgeKind: "FACT",
    evidence: [factEvidence("repository-scanner", `Detected document ${path}`, [path])],
    metadata: { path }
  };
}

function testNode(file: SourceFileSummary): DevelopmentNode {
  return {
    id: `test:${file.path}`,
    kind: "test_case",
    title: file.path,
    status: "active",
    progress: 0.5,
    confidence: "medium",
    knowledgeKind: "FACT",
    evidence: [factEvidence("repository-scanner", `Detected test file ${file.path}`, [file.path])],
    metadata: { path: file.path }
  };
}

function detectCodeUnitNodes(snapshot: RepositorySnapshot, profile: ProjectProfile): DevelopmentNode[] {
  const candidates = snapshot.files.filter((file) => {
    if (file.roleHint === "test" || file.language === "Markdown" || file.language === "Config") return false;
    return /src\/index\.ts$|src\/main\.tsx?$|src-tauri\/src\/main\.rs$|src\/.*\.(ts|tsx|rs)$/.test(file.path);
  });
  return candidates.slice(0, 60).map((file) => {
    const owner = findOwningModule(profile.moduleCandidates, file.path);
    return {
      id: `code:${file.path}`,
      kind: "code_unit",
      title: file.path,
      description: owner ? `Code unit inside ${owner.path}` : "Code unit detected by repository scanner",
      status: "active",
      progress: 0.3,
      confidence: "medium",
      knowledgeKind: "FACT",
      evidence: [factEvidence("repository-scanner", `Detected code unit ${file.path}`, [file.path])],
      metadata: { path: file.path, ownerModuleId: owner ? `module:${owner.path}` : undefined, progressKnowledgeKind: "INFERENCE" }
    };
  });
}

function riskNode(warning: GraphWarning): DevelopmentNode {
  return {
    id: `risk:${warning.id.replace(/^warning:/, "")}`,
    kind: "risk",
    title: warning.summary,
    status: "active",
    progress: 0,
    confidence: "medium",
    knowledgeKind: "INFERENCE",
    evidence: [factEvidence("graph-generator", warning.summary, [])],
    metadata: { targetId: warning.targetId }
  };
}

function taskNode(warning: GraphWarning, index: number): DevelopmentNode {
  return {
    id: `task:intake-${String(index + 1).padStart(3, "0")}`,
    kind: "task",
    title: `Review: ${warning.summary}`,
    status: "draft",
    progress: 0,
    confidence: "low",
    knowledgeKind: "CANDIDATE",
    evidence: [factEvidence("graph-generator", `Generated review task for warning: ${warning.summary}`, [])],
    metadata: { warningId: warning.id, targetId: warning.targetId }
  };
}

function dependencyEdges(snapshot: RepositorySnapshot, profile: ProjectProfile): DevelopmentEdge[] {
  const edges: DevelopmentEdge[] = [];
  for (const file of snapshot.files) {
    const sourceModule = findOwningModule(profile.moduleCandidates, file.path);
    if (!sourceModule) continue;
    for (const importedPath of file.importedPaths) {
      const targetModule = resolveImportToModule(importedPath, file.path, profile.moduleCandidates);
      if (!targetModule || targetModule.path === sourceModule.path) continue;
      edges.push({
        id: edgeId(`module:${sourceModule.path}`, "depends_on", `module:${targetModule.path}`),
        source: `module:${sourceModule.path}`,
        target: `module:${targetModule.path}`,
        kind: "depends_on",
        title: "depends_on",
        description: `${file.path} imports ${importedPath}`,
        status: "active",
        progress: estimateDependencyProgress(snapshot, sourceModule.path, targetModule.path),
        riskLevel: dependencyRisk(sourceModule.kind, targetModule.kind),
        confidence: "medium",
        knowledgeKind: "INFERENCE",
        evidence: [factEvidence("repository-scanner", `${file.path} imports ${importedPath}`, [file.path])]
      });
    }
  }
  return edges;
}

function resolveImportToModule(importedPath: string, importerPath: string, modules: ModuleCandidate[]): ModuleCandidate | undefined {
  const praxisMatch = importedPath.match(/^@praxis\/([^/]+)/);
  if (praxisMatch) return modules.find((module) => module.path === `packages/${praxisMatch[1]}`);
  if (importedPath.startsWith(".")) {
    const importerDir = importerPath.split("/").slice(0, -1).join("/");
    const normalized = normalizeRelativePath(`${importerDir}/${importedPath}`);
    return modules.find((module) => normalized.startsWith(`${module.path}/`) || normalized === module.path);
  }
  return undefined;
}

function normalizeRelativePath(value: string): string {
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

function findOwningModule(modules: ModuleCandidate[], filePath: string): ModuleCandidate | undefined {
  return modules
    .filter((module) => filePath === module.path || filePath.startsWith(`${module.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

function inferTestTarget(modules: ModuleCandidate[], testPath: string): ModuleCandidate | undefined {
  const owner = findOwningModule(modules, testPath);
  if (owner) return owner;
  const lower = testPath.toLowerCase();
  return modules.find((module) => lower.includes(module.path.split("/").pop() ?? ""));
}

function estimateProjectProgress(profile: ProjectProfile): number {
  let score = 0.2;
  if (profile.moduleCandidates.length > 0) score += 0.2;
  if (profile.frameworks.length > 0) score += 0.15;
  if (profile.buildCommands.length > 0) score += 0.15;
  if (profile.testCommands.length > 0 || profile.testFiles.length > 0) score += 0.15;
  return Math.min(score, 0.8);
}

function estimateModuleProgress(module: ModuleCandidate, snapshot: RepositorySnapshot): number {
  const files = snapshot.files.filter((file) => file.path.startsWith(`${module.path}/`));
  let score = 0;
  if (files.some((file) => !["Markdown", "Config"].includes(file.language))) score += 0.25;
  if (files.some((file) => file.language === "Markdown")) score += 0.1;
  if (files.some((file) => file.roleHint === "test")) score += 0.2;
  if (snapshot.manifests.some((manifest) => manifest.path.startsWith(`${module.path}/`))) score += 0.15;
  if (files.some((file) => /src\/index\.ts$|src\/main\.tsx?$|main\.rs$/.test(file.path))) score += 0.1;
  return Math.min(score || 0.15, 0.8);
}

function estimateDependencyProgress(snapshot: RepositorySnapshot, sourceModule: string, targetModule: string): number {
  let score = 0.3;
  const sourceFiles = snapshot.files.filter((file) => file.path.startsWith(`${sourceModule}/`));
  const targetName = targetModule.split("/").pop() ?? targetModule;
  if (sourceFiles.some((file) => file.path.includes("type") || file.path.includes("interface"))) score = Math.max(score, 0.4);
  if (sourceFiles.some((file) => file.roleHint === "test" && file.importedPaths.some((item) => item.includes(targetName)))) score = Math.max(score, 0.6);
  return score;
}

function dependencyRisk(sourceKind: ModuleCandidate["kind"], targetKind: ModuleCandidate["kind"]): DevelopmentEdge["riskLevel"] {
  if (sourceKind === "domain" && ["ui", "application"].includes(targetKind)) return "high";
  if (sourceKind === "storage" && targetKind === "ui") return "medium";
  return "none";
}

function generateWarnings(snapshot: RepositorySnapshot, profile: ProjectProfile): GraphWarning[] {
  const warnings: GraphWarning[] = [];
  for (const module of profile.moduleCandidates) {
    const files = snapshot.files.filter((file) => file.path.startsWith(`${module.path}/`));
    if (module.confidence === "low" || module.kind === "unknown") {
      warnings.push({
        id: `warning:${slugify(module.path)}:low-confidence`,
        severity: "medium",
        summary: `Module kind has low confidence: ${module.path}`,
        targetId: `module:${module.path}`
      });
    }
    if (!files.some((file) => file.roleHint === "test")) {
      warnings.push({
        id: `warning:${slugify(module.path)}:no-tests`,
        severity: "low",
        summary: `No test files detected for ${module.path}`,
        targetId: `module:${module.path}`
      });
    }
    if (!files.some((file) => file.language === "Markdown")) {
      warnings.push({
        id: `warning:${slugify(module.path)}:no-readme`,
        severity: "low",
        summary: `No README/docs detected inside ${module.path}`,
        targetId: `module:${module.path}`
      });
    }
  }
  if (snapshot.directories.some((directory) => directory.path === ".distinction")) {
    const hasGraph = snapshot.files.some((file) => file.path === ".distinction/graph/nodes.json");
    if (hasGraph) {
      warnings.push({
        id: "warning:distinction-confirmed-graph-detected",
        severity: "medium",
        summary: "Existing confirmed graph detected. Use merge/review, not blind overwrite."
      });
    } else {
      warnings.push({
        id: "warning:distinction-graph-missing",
        severity: "medium",
        summary: "Existing .distinction directory does not contain graph/nodes.json"
      });
    }
  }
  for (const requiredPath of REQUIRED_ALPHA_PACKAGES) {
    if (!profile.moduleCandidates.some((module) => module.path === requiredPath)) {
      warnings.push({
        id: `warning:missing-required-package:${slugify(requiredPath)}`,
        severity: "medium",
        summary: `v0.1 required package is not present yet: ${requiredPath}`
      });
    }
  }
  return warnings;
}

function generateQuestions(profile: ProjectProfile, warnings: GraphWarning[]): GraphQuestion[] {
  const questions: GraphQuestion[] = warnings
    .filter((warning) => warning.summary.includes("low confidence") || warning.summary.includes("required package"))
    .slice(0, 20)
    .map((warning) => ({
      id: warning.id.replace("warning:", "question:"),
      question: `Should Praxis treat this as part of the confirmed v0.1 graph? ${warning.summary}`,
      targetId: warning.targetId
    }));
  if (profile.moduleCandidates.length === 0) {
    questions.push({ id: "question:no-modules", question: "No module candidates were detected. Which directory should define the first graph boundary?" });
  }
  return questions;
}

function factEvidence(source: string, summary: string, references: string[]): Evidence {
  return createEvidence({ kind: "FACT", source, summary, confidence: "medium", references });
}

function edgeId(source: string, kind: string, target: string): string {
  return `edge:${slugify(source)}:${kind}:${slugify(target)}`;
}
