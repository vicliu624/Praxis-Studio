import { ProjectedGraphInspectorPage } from "./ProjectedGraphInspectorPage";
import type { RuntimeGraph } from "../runtimeClient";

interface DevelopmentGraphWorkspacePageProps {
  projectRoot: string;
  graph: RuntimeGraph | null;
  onGraphLoaded: (graph: RuntimeGraph) => void;
  onProjectRootChange?: (root: string) => void;
  onOpenAssistantDraft?: (text: string, mode?: "explain" | "plan") => void;
}

export function DevelopmentGraphWorkspacePage({ projectRoot, onProjectRootChange, onOpenAssistantDraft }: DevelopmentGraphWorkspacePageProps) {
  return (
    <ProjectedGraphInspectorPage
      projectRoot={projectRoot}
      onProjectRootChange={onProjectRootChange ?? (() => undefined)}
      initialMode="project-plan"
      scope="plan"
      onOpenAssistantDraft={onOpenAssistantDraft}
    />
  );
}
