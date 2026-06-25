import { useEffect, useMemo, useState } from "react";
import {
  approveProjectChangePlan,
  discussProjectChangePlan,
  readProjectChangePlan,
  runProjectChangePlanGeneration,
  type RuntimeProjectChangePlanModel,
  type RuntimeProjectChangePlanReadResult,
  type RuntimeProjectChangePlanTaskStatus,
  type RuntimeProjectDevelopmentPlanTask,
  type RuntimeScopedAgentHistoryEntry
} from "../runtimeClient";
import { ScopedAgentPanel, type ScopedAgentSubmitResult } from "../chat/ScopedAgentPanel";

interface ProjectPlanPageProps {
  projectRoot: string;
}

const PLAN_PHASES: RuntimeProjectDevelopmentPlanTask["phase"][] = ["docs", "plan", "code", "test", "review", "release"];

export function ProjectPlanPage({ projectRoot }: ProjectPlanPageProps) {
  const [result, setResult] = useState<RuntimeProjectChangePlanReadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rightTab, setRightTab] = useState<"changelog" | "agent">("changelog");
  const [error, setError] = useState("");

  const model = result?.model ?? null;
  const overallProgress = useMemo(() => computeOverallProgress(model), [model]);

  useEffect(() => {
    if (!projectRoot) {
      setResult(null);
      return;
    }
    void loadPlan();
  }, [projectRoot]);

  useEffect(() => {
    if (!projectRoot) return;
    const timer = window.setInterval(() => {
      if (generating || approving) return;
      void readProjectChangePlan(projectRoot)
        .then(setResult)
        .catch(() => undefined);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [projectRoot, generating, approving]);

  async function loadPlan() {
    if (!projectRoot) return;
    setLoading(true);
    setError("");
    try {
      setResult(await readProjectChangePlan(projectRoot));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan(force = false) {
    if (!projectRoot) return;
    setGenerating(true);
    setError("");
    try {
      setResult(await runProjectChangePlanGeneration(projectRoot, { force }));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : String(generateError));
    } finally {
      setGenerating(false);
    }
  }

  async function approvePlan() {
    if (!projectRoot || !model) return;
    setApproving(true);
    setError("");
    try {
      const approved = await approveProjectChangePlan(projectRoot);
      setResult(approved);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : String(approveError));
    } finally {
      setApproving(false);
    }
  }

  async function submitPlanAgent(
    message: string,
    conversationHistory: RuntimeScopedAgentHistoryEntry[]
  ): Promise<ScopedAgentSubmitResult> {
    const response = await discussProjectChangePlan(projectRoot, message, conversationHistory);
    await loadPlan();
    return {
      text: [response.answer, response.guidance].filter(Boolean).join("\n\n"),
      intent: response.intent,
      status: "done",
      documentEdits: response.documentEdits,
      artifactPaths: response.artifactPaths,
      provider: response.provider
    };
  }

  if (!projectRoot) {
    return (
      <section className="project-plan-page">
        <div className="empty-state large">
          <strong>还没有打开项目</strong>
          <span>计划 / 甘特图来自项目 docs，请先打开一个项目。</span>
        </div>
      </section>
    );
  }

  return (
    <section className="project-plan-page" aria-labelledby="project-plan-title">
      <header className="project-plan-header">
        <div>
          <p className="eyebrow">Docs-first delivery</p>
          <h1 id="project-plan-title">计划 / 甘特图</h1>
          <p>
            工程师先与 agent 完成文档，Praxis 再根据文档变更编排项目变更项、开发计划、语义版本和预期 changelog。
          </p>
        </div>
        <div className="project-plan-header-actions">
          <button className="secondary-action" type="button" disabled={loading || generating || approving} onClick={() => void loadPlan()}>
            刷新
          </button>
          <button className="primary-action" type="button" disabled={generating || approving} onClick={() => void generatePlan(Boolean(model))}>
            {generating ? "编排中..." : model ? "重新编排计划" : "生成项目变更计划"}
          </button>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}
      {!model ? (
        <div className="project-plan-missing">
          <strong>{loading ? "正在读取项目计划文档..." : "还没有项目变更计划文档"}</strong>
          <span>将生成 docs/project/project-change-plan.md 和 docs/project/project-change-plan.html，之后页面只渲染这份文档。</span>
          <button className="primary-action" type="button" disabled={generating} onClick={() => void generatePlan(false)}>
            {generating ? "正在调用 agent 编排..." : "生成项目变更计划"}
          </button>
        </div>
      ) : (
        <>
          <section className="project-plan-version-strip">
            <div>
              <span>当前版本</span>
              <strong>{model.currentVersion}</strong>
            </div>
            <div>
              <span>预期版本</span>
              <strong>{model.nextVersion}</strong>
            </div>
            <div>
              <span>SemVer</span>
              <strong>{model.bump}</strong>
            </div>
            <div>
              <span>整体进度</span>
              <strong>{Math.round(overallProgress * 100)}%</strong>
            </div>
            <div>
              <span>状态</span>
              <strong>{planStatusLabel(model.status)}</strong>
            </div>
            <div>
              <span>Git</span>
              <strong>{model.git.shortCommit} / {model.git.branch}{model.git.dirty ? " / dirty" : ""}</strong>
            </div>
          </section>

          {result?.stale ? (
            <div className="project-plan-stale">
              <strong>检测到 docs 已更新</strong>
              <span>最新文档时间：{formatDateTime(result.latestSourceUpdatedAt)}。需要重新编排计划后再进入开发阶段。</span>
              <button className="text-button" type="button" disabled={generating} onClick={() => void generatePlan(true)}>
                重新编排
              </button>
            </div>
          ) : null}

          <section className="project-plan-grid">
            <ProjectChangeColumn model={model} />
            <DevelopmentPlanColumn model={model} />
            <ProjectPlanRightColumn
              projectRoot={projectRoot}
              model={model}
              approving={approving}
              activeTab={rightTab}
              onTabChange={setRightTab}
              onApprove={approvePlan}
              onSubmitAgent={submitPlanAgent}
              onAgentResult={loadPlan}
            />
          </section>
        </>
      )}
    </section>
  );
}

function ProjectChangeColumn({ model }: { model: RuntimeProjectChangePlanModel }) {
  return (
    <aside className="project-plan-column change-column">
      <div className="project-plan-column-header">
        <strong>项目变更项</strong>
        <span>{model.changeItems.length} 项</span>
      </div>
      <div className="project-change-list">
        {model.changeItems.map((item) => (
          <article className={`project-change-item ${item.status}`} key={item.id}>
            <div className="project-change-title-row">
              <strong>{item.title}</strong>
              <span>{explorerLabel(item.sourceExplorer)}</span>
            </div>
            <p>{item.summary}</p>
            <ProgressBar value={item.burnDown.percent / 100} label={`${item.burnDown.done}/${item.burnDown.total}`} />
            <ul className="project-change-checklist">
              {item.checklist.map((check) => (
                <li className={check.status} key={check.id}>
                  <span>{check.status === "done" ? "✓" : check.status === "doing" ? "…" : "□"}</span>
                  <span>{check.text}</span>
                </li>
              ))}
            </ul>
            <div className="project-change-docs">
              {[...item.sourceDocuments, ...item.linkedDesignDocs, ...item.linkedEngineeringDocs, ...item.linkedArchitectureDocs, ...item.linkedReviewDocs]
                .filter((value, index, values) => value && values.indexOf(value) === index)
                .slice(0, 4)
                .map((doc) => <span key={doc}>{doc}</span>)}
            </div>
            {item.linkedReviewFindingIds.length ? (
              <div className="project-change-review-links">
                <strong>评审问题</strong>
                {item.linkedReviewFindingIds.map((findingId) => <span key={findingId}>{findingId}</span>)}
              </div>
            ) : null}
            {item.resolutionEvidence.length ? (
              <div className="project-change-review-links">
                <strong>修复证据</strong>
                {item.resolutionEvidence.map((evidence) => <span key={evidence}>{evidence}</span>)}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </aside>
  );
}

function DevelopmentPlanColumn({ model }: { model: RuntimeProjectChangePlanModel }) {
  const ganttRows = useMemo(() => buildGanttRows(model.developmentPlan), [model.developmentPlan]);
  const [selectedTaskId, setSelectedTaskId] = useState(() => model.developmentPlan[0]?.id ?? "");
  const selectedTask = model.developmentPlan.find((task) => task.id === selectedTaskId) ?? model.developmentPlan[0];

  useEffect(() => {
    if (!model.developmentPlan.length) {
      setSelectedTaskId("");
      return;
    }
    if (!model.developmentPlan.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(model.developmentPlan[0].id);
    }
  }, [model.developmentPlan, selectedTaskId]);

  const completedTasks = model.developmentPlan.filter((task) => task.status === "done").length;
  const blockedTasks = model.developmentPlan.filter((task) => task.status === "blocked").length;
  const activeTasks = model.developmentPlan.filter((task) => task.status === "doing").length;

  return (
    <main className="project-plan-column development-column">
      <div className="project-plan-column-header">
        <strong>Agent 开发计划</strong>
        <span>{model.developmentPlan.length} 个任务</span>
      </div>
      <section className="project-gantt-workbench" aria-label="项目甘特图">
        <div className="project-gantt-toolbar">
          <div>
            <strong>阶段时间轴</strong>
            <span>左侧是任务大纲，右侧是阶段轴；点击任务查看交付物、依赖和验收条件。</span>
          </div>
          <div className="project-gantt-stats" aria-label="任务统计">
            <span>{activeTasks} 进行中</span>
            <span>{completedTasks} 完成</span>
            <span>{blockedTasks} 阻塞</span>
          </div>
        </div>

        <div className="project-gantt-board">
          <div className="project-gantt-board-header">
            <div className="project-gantt-outline-head">
              <span>#</span>
              <span>任务</span>
              <span>状态</span>
              <span>进度</span>
            </div>
            <div className="project-gantt-timeline-head">
              {PLAN_PHASES.map((phase) => <span key={phase}>{phaseLabel(phase)}</span>)}
            </div>
          </div>
          <div className="project-gantt-board-body">
            {ganttRows.map((row) => {
              if (row.kind === "phase") {
                return (
                  <div className="project-gantt-board-row phase-row" key={row.id}>
                    <div className="project-gantt-outline-row phase">
                      <span>{row.index}</span>
                      <strong>{phaseLabel(row.phase)}</strong>
                      <span>{row.tasks.length} 项</span>
                      <span>{Math.round(row.progress * 100)}%</span>
                    </div>
                    <div className="project-gantt-timeline-row">
                      <div
                        className={`project-gantt-bar-frame phase ${row.phase}`}
                        style={{ left: `${phaseStart(row.phase)}%`, width: `${phaseWidth(row.phase)}%` }}
                      >
                        <span style={{ width: `${Math.round(row.progress * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              }

              const selected = selectedTask?.id === row.task.id;
              return (
                <div className={`project-gantt-board-row task-row ${selected ? "selected" : ""}`} key={row.id}>
                  <button
                    className="project-gantt-outline-row task"
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedTaskId(row.task.id)}
                  >
                    <span>{row.wbs}</span>
                    <span>
                      <strong>{row.task.title}</strong>
                      <small>{row.task.dependencies.length ? `依赖 ${row.task.dependencies.length} 项` : "无前置依赖"}</small>
                    </span>
                    <span className={`task-status-pill ${row.task.status}`}>{taskStatusLabel(row.task.status)}</span>
                    <span>{Math.round(row.task.progress * 100)}%</span>
                  </button>
                  <div className="project-gantt-timeline-row">
                    <div
                      className={`project-gantt-bar-frame task ${row.task.status} ${row.task.phase}`}
                      style={{ left: `${phaseStart(row.task.phase)}%`, width: `${phaseWidth(row.task.phase)}%` }}
                    >
                      <span style={{ width: `${Math.round(row.task.progress * 100)}%` }} />
                      <em>{taskStatusLabel(row.task.status)}</em>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selectedTask ? <TaskInspector task={selectedTask} /> : null}

      <section className="agent-progress-feed">
        <div className="project-plan-column-header compact">
          <strong>Agent 开发进度</strong>
          <span>{model.agentProgress.length} 条</span>
        </div>
        {model.agentProgress.length ? (
          <ul>
            {model.agentProgress.slice().reverse().map((event, index) => (
              <li key={`${event.timestamp}-${event.taskId}-${index}`}>
                <time>{formatDateTime(event.timestamp)}</time>
                <span>{taskStatusLabel(event.status)}</span>
                <p>{event.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">核对完成并进入开发阶段后，agent 的任务进展会持续回写到这里。</p>
        )}
      </section>
    </main>
  );
}

function TaskInspector({ task }: { task: RuntimeProjectDevelopmentPlanTask }) {
  return (
    <section className="project-task-inspector" aria-label="任务检查器">
      <header>
        <div>
          <span>{phaseLabel(task.phase)} · {taskStatusLabel(task.status)}</span>
          <h2>{task.title}</h2>
        </div>
        <ProgressBar value={task.progress} label={`${Math.round(task.progress * 100)}%`} />
      </header>
      <p>{task.summary}</p>
      <section className="project-task-brief">
        <strong>施工 Brief</strong>
        <dl>
          <div>
            <dt>目标</dt>
            <dd>{task.implementationBrief.objective}</dd>
          </div>
          <div>
            <dt>当前</dt>
            <dd>{task.implementationBrief.currentBehavior}</dd>
          </div>
          <div>
            <dt>目标状态</dt>
            <dd>{task.implementationBrief.targetBehavior}</dd>
          </div>
          <div>
            <dt>策略</dt>
            <dd>{task.implementationBrief.approach}</dd>
          </div>
          <div>
            <dt>回退</dt>
            <dd>{task.implementationBrief.rollbackPlan}</dd>
          </div>
        </dl>
      </section>
      <div className="project-task-inspector-grid">
        <div>
          <strong>依赖</strong>
          <ul>
            {(task.dependencies.length ? task.dependencies : ["无前置依赖"]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <strong>交付物</strong>
          <ul>
            {(task.deliverables.length ? task.deliverables : ["暂无独立交付物"]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <strong>验收条件</strong>
          <ul>
            {(task.acceptance.length ? task.acceptance : ["暂无验收条件"]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <strong>关联变更</strong>
          <ul>
            {(task.changeItemIds.length ? task.changeItemIds : ["未绑定变更项"]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
      <div className="project-task-inspector-grid workset">
        <TaskList title="必须读取" items={task.workset.readFiles} empty="未指定读取文件" />
        <TaskList title="预计写入" items={task.workset.writeFiles} empty="未指定写入文件" />
        <TaskList title="相关文档" items={task.workset.relatedDocs} empty="未绑定文档" />
        <TaskList title="验证命令" items={task.workset.testCommands} empty="未指定验证命令" />
        <TaskList title="Trace" items={task.workset.traceLinks} empty="未绑定 trace" />
        <TaskList title="上下文说明" items={task.workset.contextNotes} empty="未提供上下文说明" />
      </div>
      <section className="project-task-evidence">
        <strong>验收证据</strong>
        {task.acceptanceEvidence.length ? (
          <ul>
            {task.acceptanceEvidence.map((item) => (
              <li className={item.status} key={item.id}>
                <span>{taskStatusLabel(item.status)}</span>
                <div>
                  <strong>{item.description}</strong>
                  {item.command ? <code>{item.command}</code> : null}
                  <p>{item.expectedResult}</p>
                  {item.evidence ? <small>{item.evidence}</small> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">暂无验收证据槽位。</p>
        )}
      </section>
    </section>
  );
}

function TaskList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <strong>{title}</strong>
      <ul>
        {(items.length ? items : [empty]).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function ProjectPlanRightColumn({
  projectRoot,
  model,
  approving,
  activeTab,
  onTabChange,
  onApprove,
  onSubmitAgent,
  onAgentResult
}: {
  projectRoot: string;
  model: RuntimeProjectChangePlanModel;
  approving: boolean;
  activeTab: "changelog" | "agent";
  onTabChange: (tab: "changelog" | "agent") => void;
  onApprove: () => void;
  onSubmitAgent: (
    message: string,
    conversationHistory: RuntimeScopedAgentHistoryEntry[]
  ) => Promise<ScopedAgentSubmitResult>;
  onAgentResult: () => void | Promise<void>;
}) {
  const canApprove = model.status !== "in_development" && model.status !== "completed";
  return (
    <aside className="project-plan-column changelog-column project-plan-right-column">
      <div className="project-plan-right-tabs" role="tablist" aria-label="计划页面右侧视图">
        <button
          className={activeTab === "changelog" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={activeTab === "changelog"}
          onClick={() => onTabChange("changelog")}
        >
          Changelog
        </button>
        <button
          className={activeTab === "agent" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={activeTab === "agent"}
          onClick={() => onTabChange("agent")}
        >
          Agent
        </button>
      </div>
      {activeTab === "changelog" ? (
        <div className="project-plan-right-scroll">
          <div className="project-plan-column-header">
            <strong>预期 Changelog</strong>
            <span>{model.expectedChangelog.version}</span>
          </div>
          <article className="version-decision-card">
            <h2>{model.currentVersion} → {model.nextVersion}</h2>
            <span>{model.bump}</span>
            <p>{model.versionReason}</p>
          </article>
          <article className="expected-changelog-card">
            <h2>{model.expectedChangelog.version} · {model.expectedChangelog.date}</h2>
            <p>{model.expectedChangelog.summary}</p>
            <ChangelogList title="Added" items={model.expectedChangelog.added} />
            <ChangelogList title="Changed" items={model.expectedChangelog.changed} />
            <ChangelogList title="Fixed" items={model.expectedChangelog.fixed} />
            <ChangelogList title="Risks" items={model.expectedChangelog.risks} />
          </article>
          {model.questions.length ? (
            <article className="plan-question-card">
              <h2>待确认问题</h2>
              <ul>
                {model.questions.map((question) => <li key={question}>{question}</li>)}
              </ul>
            </article>
          ) : null}
          <button className="primary-action approve-plan-button" type="button" disabled={!canApprove || approving} onClick={onApprove}>
            {model.status === "in_development" ? "已进入开发阶段" : approving ? "正在更新计划状态..." : "核对并进入开发阶段"}
          </button>
          <p className="muted-copy">核对后，计划文档会进入 in_development 状态；后续开发、测试和复核进度仍由共享 Agent 回写这份文档。</p>
        </div>
      ) : (
        <ScopedAgentPanel
          projectRoot={projectRoot}
          className="project-plan-agent-panel"
          textareaId="project-plan-agent-input"
          ariaLabel="Plan Agent"
          compactConversation
          scope={{
            id: `project-plan:${projectRoot}`,
            title: "Plan Agent",
            copy: "只围绕项目变更项、开发计划、语义版本、预期 changelog 和开发执行进度讨论。",
            modeLabel: "计划范围",
            placeholder: "询问或调整当前项目变更、开发任务、版本决策、changelog、验收条件...",
            inputLabel: "消息",
            emptyTitle: "Plan Agent",
            emptyCopy: "在这里讨论项目变更和开发计划。修改会回写 docs/project/project-change-plan.md。",
            scopeKind: "plan",
            contextTitle: `${model.currentVersion} -> ${model.nextVersion}`,
            contextPath: "docs/project/project-change-plan.md",
            metadata: [model.status, model.bump, model.expectedChangelog.version]
          }}
          onSubmit={onSubmitAgent}
          onResult={onAgentResult}
        />
      )}
    </aside>
  );
}

function ChangelogList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="changelog-list">
      <h3>{title}</h3>
      <ul>
        {(items.length ? items : ["无。"]).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="inline-progress">
      <div>
        <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </div>
      <strong>{label}</strong>
    </div>
  );
}

function computeOverallProgress(model: RuntimeProjectChangePlanModel | null): number {
  if (!model?.developmentPlan.length) return 0;
  return model.developmentPlan.reduce((sum, task) => sum + task.progress, 0) / model.developmentPlan.length;
}

type ProjectGanttRow =
  | {
      kind: "phase";
      id: string;
      index: number;
      phase: RuntimeProjectDevelopmentPlanTask["phase"];
      tasks: RuntimeProjectDevelopmentPlanTask[];
      progress: number;
    }
  | {
      kind: "task";
      id: string;
      wbs: string;
      task: RuntimeProjectDevelopmentPlanTask;
    };

function buildGanttRows(tasks: RuntimeProjectDevelopmentPlanTask[]): ProjectGanttRow[] {
  return PLAN_PHASES.flatMap((phase, phaseIndex) => {
    const phaseTasks = tasks.filter((task) => task.phase === phase);
    if (!phaseTasks.length) return [];
    const progress = phaseTasks.reduce((sum, task) => sum + task.progress, 0) / phaseTasks.length;
    const phaseRow: ProjectGanttRow = {
      kind: "phase",
      id: `phase:${phase}`,
      index: phaseIndex + 1,
      phase,
      tasks: phaseTasks,
      progress
    };
    const taskRows: ProjectGanttRow[] = phaseTasks.map((task, taskIndex) => ({
      kind: "task",
      id: `task:${task.id}`,
      wbs: `${phaseIndex + 1}.${taskIndex + 1}`,
      task
    }));
    return [phaseRow, ...taskRows];
  });
}

function phaseStart(phase: RuntimeProjectDevelopmentPlanTask["phase"]): number {
  return { docs: 0, plan: 16, code: 32, test: 52, review: 68, release: 84 }[phase];
}

function phaseWidth(phase: RuntimeProjectDevelopmentPlanTask["phase"]): number {
  return { docs: 16, plan: 16, code: 20, test: 16, review: 16, release: 16 }[phase];
}

function phaseLabel(phase: RuntimeProjectDevelopmentPlanTask["phase"]): string {
  return {
    docs: "文档",
    plan: "计划",
    code: "编码",
    test: "测试",
    review: "评审",
    release: "发布"
  }[phase];
}

function taskStatusLabel(status: RuntimeProjectChangePlanTaskStatus): string {
  return {
    todo: "待处理",
    doing: "进行中",
    done: "完成",
    blocked: "阻塞"
  }[status];
}

function planStatusLabel(status: RuntimeProjectChangePlanModel["status"]): string {
  return {
    draft: "草稿",
    ready_for_review: "待核对",
    approved: "已核对",
    in_development: "开发中",
    completed: "已完成"
  }[status];
}

function explorerLabel(explorer: RuntimeProjectChangePlanModel["changeItems"][number]["sourceExplorer"]): string {
  return {
    model: "Model",
    design: "Design",
    engineering: "Engineering",
    architecture: "Architecture",
    project: "Project",
    review: "Review"
  }[explorer];
}

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
