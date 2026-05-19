import type { DevelopmentGraph } from "@praxis/development-graph";

export interface GraphStore {
  read(): Promise<DevelopmentGraph>;
  write(graph: DevelopmentGraph): Promise<void>;
}

export class InMemoryGraphStore implements GraphStore {
  constructor(private graph: DevelopmentGraph) {}

  async read(): Promise<DevelopmentGraph> {
    return this.graph;
  }

  async write(graph: DevelopmentGraph): Promise<void> {
    this.graph = graph;
  }
}
