import type { InteractionModelCandidate } from "@praxis/schema";

type UseCaseDrilldownDiagram = InteractionModelCandidate["useCaseDrilldowns"][number];

interface DrilldownDocSection {
  heading: string;
  body?: string;
  items?: string[];
  layer: string;
}

export function renderDrilldownKindSpecificMarkdown(diagram: UseCaseDrilldownDiagram): string[] {
  return drilldownDocSections(diagram).flatMap((section) => {
    const lines = [`## ${section.heading}`, ""];
    if (section.body) lines.push(section.body, "");
    if (section.items) {
      lines.push(...listOrNone(section.items), "");
    }
    return lines;
  });
}

export function renderDrilldownKindSpecificHtml(diagram: UseCaseDrilldownDiagram): string {
  const sections = drilldownDocSections(diagram).map((section) => {
    const body = section.body ? `      <p>${escapeHtmlText(section.body)}</p>` : "";
    const items = section.items
      ? `      <ul>${listOrNone(section.items).map((item) => `<li>${escapeHtmlText(item)}</li>`).join("")}</ul>`
      : "";
    return [
      `    <section class="semantic-layer kind-specific-layer ${escapeHtmlAttr(section.layer)}" data-praxis-kind="annotation" data-praxis-layer="${escapeHtmlAttr(section.layer)}" data-praxis-anchor="${escapeHtmlAttr(diagram.id)}" data-praxis-status="${escapeHtmlAttr(diagram.status)}" data-praxis-confidence="${escapeHtmlAttr(diagram.confidence)}">`,
      `      <h3>${escapeHtmlText(section.heading)}</h3>`,
      body,
      items,
      "    </section>"
    ].filter(Boolean).join("\n");
  });
  return sections.join("\n");
}

function drilldownDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  if (diagram.kind === "activity") return activityDocSections(diagram);
  if (diagram.kind === "sequence") return sequenceDocSections(diagram);
  if (diagram.kind === "state_machine") return stateMachineDocSections(diagram);
  if (diagram.kind === "interaction_overview") return interactionOverviewDocSections(diagram);
  if (diagram.kind === "communication") return communicationDocSections(diagram);
  if (diagram.kind === "timing") return timingDocSections(diagram);
  if (diagram.kind === "object_snapshot") return objectSnapshotDocSections(diagram);
  if (diagram.kind === "composite_structure") return compositeStructureDocSections(diagram);
  return classCollaborationDocSections(diagram);
}

function activityDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  return [
    { heading: "业务流程目标", body: diagram.explanation.business, layer: "activity_business_goal" },
    { heading: "流程边界", body: diagram.coverage.boundary, layer: "activity_flow_boundary" },
    { heading: "参与泳道 / 阶段", items: activityLaneHints(diagram), layer: "activity_lanes" },
    { heading: "主成功路径", body: diagram.coverage.scenario, items: flowReferences(diagram, "mainSuccessScenario"), layer: "activity_main_path" },
    { heading: "决策点与分支", items: activityDecisionHints(diagram), layer: "activity_decisions" },
    { heading: "失败 / 补偿路径", items: flowReferences(diagram, "failureFlows"), layer: "activity_failures" },
    { heading: "流程业务规则", body: diagram.explanation.design, layer: "activity_business_rules" },
    { heading: "Activity UML 读图说明", body: diagram.explanation.uml, layer: "activity_uml_reading" },
    { heading: "实现范围锚点", items: implementationScopeItems(diagram.coverage.implementationScope), layer: "implementation_scope" },
    { heading: "不覆盖范围", items: diagram.coverage.notCovered, layer: "activity_not_covered" }
  ];
}

function sequenceDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  return [
    { heading: "交互场景", body: diagram.explanation.business, layer: "sequence_scenario" },
    { heading: "参与者 / 生命线", items: sequenceParticipantHints(diagram), layer: "sequence_lifelines" },
    { heading: "消息时序", items: sequenceMessageHints(diagram), layer: "sequence_messages" },
    { heading: "同步 / 异步 / 回调", items: sequenceInteractionPatternHints(diagram), layer: "sequence_interaction_patterns" },
    { heading: "返回 / 异常 / 补偿", items: sequenceReturnAndExceptionHints(diagram), layer: "sequence_returns" },
    { heading: "事务 / 幂等 / 重试边界", body: diagram.explanation.design, items: flowReferences(diagram, "failureFlows"), layer: "sequence_transaction_boundary" },
    { heading: "Sequence UML 读图说明", body: diagram.explanation.uml, layer: "sequence_uml_reading" },
    { heading: "实现范围锚点", items: implementationScopeItems(diagram.coverage.implementationScope), layer: "implementation_scope" },
    { heading: "不覆盖场景", items: diagram.coverage.notCovered, layer: "sequence_not_covered" }
  ];
}

function stateMachineDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  return [
    { heading: "被建模的业务对象", body: diagram.explanation.business, layer: "state_subject" },
    { heading: "状态证据", body: diagram.explanation.implementation, items: implementationScopeItems(diagram.coverage.implementationScope), layer: "state_evidence" },
    { heading: "初始状态", items: stateMachineInitialHints(diagram), layer: "state_initial" },
    { heading: "稳定状态", items: stateMachineStateHints(diagram), layer: "state_stable" },
    { heading: "状态迁移事件", items: stateMachineTransitionHints(diagram), layer: "state_transitions" },
    { heading: "Guard / Condition", items: stateMachineGuardHints(diagram), layer: "state_guards" },
    { heading: "终态", items: stateMachineTerminalHints(diagram), layer: "state_terminal" },
    { heading: "非法 / 待确认迁移", items: unique([...diagram.questions, ...diagram.coverage.notCovered]), layer: "state_invalid_or_questions" },
    { heading: "状态不变量 / 设计约束", body: diagram.explanation.design, layer: "state_invariants" },
    { heading: "State Machine UML 读图说明", body: diagram.explanation.uml, layer: "state_uml_reading" }
  ];
}

function classCollaborationDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  const classHints = classDiagramClassHints(diagram);
  return [
    { heading: "Use Case 的结构承载目标", body: diagram.explanation.business, layer: "class_structural_goal" },
    { heading: "协作角色清单", items: classHints.length ? classHints : implementationScopeItems(diagram.coverage.implementationScope), layer: "class_roles" },
    { heading: "应用服务 / Use Case Service", items: classKeywordHints(diagram, ["Application", "Service", "UseCase", "Handler", "Command"]), layer: "class_application_service" },
    { heading: "领域对象 / 聚合 / 领域服务", items: classKeywordHints(diagram, ["Domain", "Aggregate", "Entity", "Value", "Policy", "Rule"]), layer: "class_domain_objects" },
    { heading: "Port / Interface", items: classKeywordHints(diagram, ["Port", "Interface", "<<interface>>", "Gateway"]), layer: "class_ports" },
    { heading: "Adapter / Gateway / Repository", items: classKeywordHints(diagram, ["Adapter", "Gateway", "Repository", "Client", "Provider"]), layer: "class_adapters" },
    { heading: "Strategy / Policy / Specification", items: classKeywordHints(diagram, ["Strategy", "Policy", "Specification", "Resolver", "Router"]), layer: "class_patterns" },
    { heading: "Command / Query / Event", items: classKeywordHints(diagram, ["Command", "Query", "Event", "Message"]), layer: "class_messages" },
    { heading: "设计模式说明", body: diagram.explanation.design, layer: "class_design_patterns" },
    { heading: "稳定依赖关系", items: classDiagramRelationHints(diagram), layer: "class_stable_dependencies" },
    { heading: "实现细节排除", items: unique([...diagram.coverage.notCovered, ...diagram.coverage.implementationScope.outOfScopeCode]), layer: "class_excluded_details" },
    { heading: "Class Diagram 读图说明", body: diagram.explanation.uml, layer: "class_uml_reading" },
    { heading: "实现范围锚点", items: implementationScopeItems(diagram.coverage.implementationScope), layer: "implementation_scope" }
  ];
}

function interactionOverviewDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  return [
    { heading: "交互组合目标", body: diagram.explanation.business, layer: "interaction_overview_goal" },
    { heading: "片段边界", body: diagram.coverage.boundary, layer: "interaction_overview_boundary" },
    { heading: "被组合的流程片段", items: diagram.coverage.coveredUseCaseFlows, layer: "interaction_overview_fragments" },
    { heading: "分支 / 并行 / 汇合点", items: activityDecisionHints(diagram), layer: "interaction_overview_control" },
    { heading: "为什么不能只看单张 Sequence", body: diagram.explanation.design, layer: "interaction_overview_rationale" },
    { heading: "Interaction Overview UML 读图说明", body: diagram.explanation.uml, layer: "interaction_overview_uml_reading" },
    { heading: "实现范围锚点", items: implementationScopeItems(diagram.coverage.implementationScope), layer: "implementation_scope" },
    { heading: "不覆盖范围", items: diagram.coverage.notCovered, layer: "interaction_overview_not_covered" }
  ];
}

function communicationDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  return [
    { heading: "对象消息网络目标", body: diagram.explanation.business, layer: "communication_goal" },
    { heading: "协作对象", items: communicationNodeHints(diagram), layer: "communication_objects" },
    { heading: "消息关系", items: sequenceMessageHints(diagram), layer: "communication_messages" },
    { heading: "协作中心 / 扇入扇出", body: diagram.explanation.design, layer: "communication_center" },
    { heading: "Communication UML 读图说明", body: diagram.explanation.uml, layer: "communication_uml_reading" },
    { heading: "实现范围锚点", items: implementationScopeItems(diagram.coverage.implementationScope), layer: "implementation_scope" },
    { heading: "不覆盖范围", items: diagram.coverage.notCovered, layer: "communication_not_covered" }
  ];
}

function timingDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  return [
    { heading: "时间语义目标", body: diagram.explanation.business, layer: "timing_goal" },
    { heading: "时间窗口 / 状态变化", items: timingHints(diagram), layer: "timing_windows" },
    { heading: "超时 / 重试 / 轮询证据", items: sequenceReturnAndExceptionHints(diagram), layer: "timing_retry_timeout" },
    { heading: "时间约束的设计影响", body: diagram.explanation.design, layer: "timing_design_impact" },
    { heading: "Timing UML 读图说明", body: diagram.explanation.uml, layer: "timing_uml_reading" },
    { heading: "实现范围锚点", items: implementationScopeItems(diagram.coverage.implementationScope), layer: "implementation_scope" },
    { heading: "不覆盖范围", items: diagram.coverage.notCovered, layer: "timing_not_covered" }
  ];
}

function objectSnapshotDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  return [
    { heading: "对象快照目标", body: diagram.explanation.business, layer: "object_snapshot_goal" },
    { heading: "关键对象实例", items: classDiagramClassHints(diagram), layer: "object_snapshot_instances" },
    { heading: "实例关系", items: classDiagramRelationHints(diagram), layer: "object_snapshot_links" },
    { heading: "快照成立的业务时刻", body: diagram.coverage.scenario, layer: "object_snapshot_moment" },
    { heading: "Object UML 读图说明", body: diagram.explanation.uml, layer: "object_snapshot_uml_reading" },
    { heading: "实现范围锚点", items: implementationScopeItems(diagram.coverage.implementationScope), layer: "implementation_scope" },
    { heading: "不覆盖范围", items: diagram.coverage.notCovered, layer: "object_snapshot_not_covered" }
  ];
}

function compositeStructureDocSections(diagram: UseCaseDrilldownDiagram): DrilldownDocSection[] {
  return [
    { heading: "复合结构目标", body: diagram.explanation.business, layer: "composite_structure_goal" },
    { heading: "内部部件 / Port / Connector", items: classDiagramClassHints(diagram), layer: "composite_structure_parts" },
    { heading: "内部连接关系", items: classDiagramRelationHints(diagram), layer: "composite_structure_connectors" },
    { heading: "边界与协作责任", body: diagram.explanation.design, layer: "composite_structure_boundary" },
    { heading: "Composite Structure UML 读图说明", body: diagram.explanation.uml, layer: "composite_structure_uml_reading" },
    { heading: "实现范围锚点", items: implementationScopeItems(diagram.coverage.implementationScope), layer: "implementation_scope" },
    { heading: "不覆盖范围", items: diagram.coverage.notCovered, layer: "composite_structure_not_covered" }
  ];
}

function flowReferences(diagram: UseCaseDrilldownDiagram, prefix: string): string[] {
  return diagram.coverage.coveredUseCaseFlows.filter((item) => item.startsWith(prefix));
}

function implementationScopeItems(scope: UseCaseDrilldownDiagram["coverage"]["implementationScope"]): string[] {
  return [
    ...scope.modules.map((item) => `模块：${item}`),
    ...scope.entryPoints.map((item) => `入口：${item}`),
    ...scope.keyFiles.map((item) => `关键文件：${item}`),
    ...scope.codeAnchors.map((item) => `代码锚点：${item}`),
    ...scope.outOfScopeCode.map((item) => `不覆盖代码：${item}`)
  ];
}

function mermaidLines(diagram: UseCaseDrilldownDiagram): string[] {
  return diagram.mermaid.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function activityLaneHints(diagram: UseCaseDrilldownDiagram): string[] {
  const subgraphs = mermaidLines(diagram)
    .filter((line) => /^subgraph\s+/i.test(line))
    .map((line) => line.replace(/^subgraph\s+/i, "").trim());
  return subgraphs.length ? subgraphs : ["未显式声明泳道；请结合节点标签和实现范围判断业务阶段。"];
}

function activityDecisionHints(diagram: UseCaseDrilldownDiagram): string[] {
  const lines = mermaidLines(diagram);
  const decisions = lines.filter((line) => /\{.+\}/.test(line));
  const branches = lines.filter((line) => /-->\|.+\|/.test(line));
  return unique([...decisions, ...branches]).map(cleanMermaidLine);
}

function sequenceParticipantHints(diagram: UseCaseDrilldownDiagram): string[] {
  return mermaidLines(diagram)
    .filter((line) => /^participant\s+|^actor\s+/i.test(line))
    .map(cleanMermaidLine);
}

function sequenceMessageHints(diagram: UseCaseDrilldownDiagram): string[] {
  return mermaidLines(diagram)
    .filter((line) => /-+>>|-->>|->|-->|-\)/.test(line) && !/^participant\s+|^actor\s+/i.test(line))
    .map(cleanMermaidLine);
}

function communicationNodeHints(diagram: UseCaseDrilldownDiagram): string[] {
  const lines = mermaidLines(diagram)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*(\[|\(|\{)/.test(line))
    .map(cleanMermaidLine);
  return lines.length ? lines : sequenceParticipantHints(diagram);
}

function timingHints(diagram: UseCaseDrilldownDiagram): string[] {
  const lines = mermaidLines(diagram)
    .filter((line) => /超时|重试|轮询|等待|定时|timeout|retry|poll|schedule|wait/i.test(line))
    .map(cleanMermaidLine);
  return lines.length ? lines : ["当前图未显式标注时间窗口；请结合实现范围和证据判断时间语义。"];
}

function sequenceInteractionPatternHints(diagram: UseCaseDrilldownDiagram): string[] {
  const patternLines = mermaidLines(diagram)
    .filter((line) => /^(alt|opt|loop|par|critical|break)\b/i.test(line) || /-->>|-\)/.test(line))
    .map(cleanMermaidLine);
  return patternLines.length ? patternLines : ["当前 Mermaid 未显式声明异步、回调、循环或并行片段。"];
}

function sequenceReturnAndExceptionHints(diagram: UseCaseDrilldownDiagram): string[] {
  const lines = mermaidLines(diagram).filter((line) => /-->>|异常|失败|补偿|超时|重试|拒绝|error|fail|timeout|retry/i.test(line));
  return lines.length ? lines.map(cleanMermaidLine) : ["当前场景未显式记录返回、异常、补偿或重试片段。"];
}

function stateMachineInitialHints(diagram: UseCaseDrilldownDiagram): string[] {
  return mermaidLines(diagram).filter((line) => /\[\*\]\s*-->/.test(line)).map(cleanMermaidLine);
}

function stateMachineStateHints(diagram: UseCaseDrilldownDiagram): string[] {
  const states = new Set<string>();
  for (const line of mermaidLines(diagram)) {
    const transition = line.match(/(?:\[\*\]|([A-Za-z0-9_.:-]+))\s*-->\s*(?:\[\*\]|([A-Za-z0-9_.:-]+))/);
    if (transition?.[1]) states.add(transition[1]);
    if (transition?.[2]) states.add(transition[2]);
    const state = line.match(/^state\s+"?([^"]+)"?\s+as\s+([A-Za-z0-9_.:-]+)/i);
    if (state?.[1]) states.add(state[1]);
  }
  return Array.from(states);
}

function stateMachineTransitionHints(diagram: UseCaseDrilldownDiagram): string[] {
  return mermaidLines(diagram).filter((line) => /-->/.test(line)).map(cleanMermaidLine);
}

function stateMachineGuardHints(diagram: UseCaseDrilldownDiagram): string[] {
  const guards = mermaidLines(diagram).filter((line) => /\[.+\]/.test(line) && !/\[\*\]/.test(line));
  return guards.length ? guards.map(cleanMermaidLine) : ["当前状态机未显式声明 guard / condition。"];
}

function stateMachineTerminalHints(diagram: UseCaseDrilldownDiagram): string[] {
  return mermaidLines(diagram).filter((line) => /-->\s*\[\*\]/.test(line)).map(cleanMermaidLine);
}

function classDiagramClassHints(diagram: UseCaseDrilldownDiagram): string[] {
  return mermaidLines(diagram)
    .filter((line) => /^class\s+|<<interface>>|<<abstract>>/.test(line))
    .map(cleanMermaidLine);
}

function classDiagramRelationHints(diagram: UseCaseDrilldownDiagram): string[] {
  return mermaidLines(diagram)
    .filter((line) => /(<\|--|\*--|o--|-->|--|\.\.>|<\.\.)/.test(line) && !/^class\s+/.test(line))
    .map(cleanMermaidLine);
}

function classKeywordHints(diagram: UseCaseDrilldownDiagram, keywords: string[]): string[] {
  const lowered = keywords.map((item) => item.toLowerCase());
  return unique(mermaidLines(diagram)
    .filter((line) => lowered.some((keyword) => line.toLowerCase().includes(keyword)))
    .map(cleanMermaidLine));
}

function cleanMermaidLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function listOrNone(values: string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ["- 无"];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/`/g, "&#96;");
}
