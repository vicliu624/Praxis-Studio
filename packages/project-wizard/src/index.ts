import { writeGeneratedFiles, type GeneratedFile } from "@praxis/file-generator";
import { generateTemplateFiles, type ProjectTemplateKind } from "@praxis/template-generator";
import type { DevelopmentGraph, DevelopmentNode } from "@praxis/development-graph";

export interface RequirementItem {
  id: string;
  title: string;
  description: string;
}

export interface ArchitectureComponentCandidate {
  id: string;
  title: string;
  responsibility: string;
}

export interface NewProjectPlan {
  projectName: string;
  productIdea: string;
  projectKind: ProjectTemplateKind;
  stack: string[];
  requirements: RequirementItem[];
  architecture: ArchitectureComponentCandidate[];
  graph: DevelopmentGraph;
  files: GeneratedFile[];
  assumptions: { id: string; summary: string }[];
  questions: { id: string; question: string }[];
}

export function createNewProjectPlan(input: {
  projectName: string;
  productIdea: string;
  projectKind?: ProjectTemplateKind;
  stack?: string[];
}): NewProjectPlan {
  const projectKind = input.projectKind ?? "documentation-first";
  const requirements: RequirementItem[] = [
    {
      id: "REQ-001",
      title: "Clarify product intent",
      description: input.productIdea
    },
    {
      id: "REQ-002",
      title: "Create governed project memory",
      description: "Persist graph, decisions, traces, and AI constraints in .distinction."
    }
  ];
  const architecture: ArchitectureComponentCandidate[] = [
    {
      id: "ARCH-001",
      title: "Product Requirements",
      responsibility: "Capture product intent and requirements."
    },
    {
      id: "ARCH-002",
      title: "Development Graph",
      responsibility: "Track requirements, architecture, tasks, memory, and progress."
    }
  ];
  const nodes: DevelopmentNode[] = [
    {
      id: "project:root",
      kind: "project",
      title: input.projectName,
      status: "draft",
      progress: 0.1,
      confidence: "medium",
      knowledgeKind: "CANDIDATE"
    },
    ...requirements.map((requirement) => ({
      id: `requirement:${requirement.id}`,
      kind: "requirement" as const,
      title: requirement.title,
      description: requirement.description,
      status: "draft" as const,
      progress: 0.1,
      confidence: "medium" as const,
      knowledgeKind: "CANDIDATE" as const
    })),
    ...architecture.map((component) => ({
      id: `architecture:${component.id}`,
      kind: "architecture_component" as const,
      title: component.title,
      description: component.responsibility,
      status: "draft" as const,
      progress: 0.1,
      confidence: "medium" as const,
      knowledgeKind: "CANDIDATE" as const
    }))
  ];
  const graph: DevelopmentGraph = {
    id: `graph:${input.projectName}`,
    title: `${input.projectName} Development Graph`,
    nodes,
    edges: nodes
      .filter((node) => node.id !== "project:root")
      .map((node) => ({
        id: `edge:project-contains-${node.id}`,
        source: "project:root",
        target: node.id,
        kind: "contains" as const,
        title: "contains",
        status: "draft" as const,
        progress: 0.1,
        riskLevel: "none" as const,
        confidence: "medium" as const,
        knowledgeKind: "CANDIDATE" as const
      })),
    updatedAt: new Date().toISOString()
  };
  const files = [
    ...generateTemplateFiles(projectKind, input.projectName),
    { path: ".distinction/graph/nodes.json", content: `${JSON.stringify(graph.nodes, null, 2)}\n` },
    { path: ".distinction/graph/edges.json", content: `${JSON.stringify(graph.edges, null, 2)}\n` },
    { path: ".distinction/memory/changes.md", content: "# Changes\n\n" },
    { path: ".distinction/memory/decisions.md", content: "# Decisions\n\n" },
    { path: ".distinction/rules/ai-constraints.md", content: "# AI Constraints\n\n- Do not automatically modify existing source code in v0.1.\n" }
  ];
  return {
    projectName: input.projectName,
    productIdea: input.productIdea,
    projectKind,
    stack: input.stack ?? [],
    requirements,
    architecture,
    graph,
    files,
    assumptions: [{ id: "assumption:template", summary: "Initial project files are generated from v0.1 templates." }],
    questions: [{ id: "question:confirm-scope", question: "Which generated requirements should become CONFIRMED memory?" }]
  };
}

export async function applyNewProjectPlan(root: string, plan: NewProjectPlan) {
  return writeGeneratedFiles(root, plan.files);
}
