import { useEffect, useRef, useState } from "react";
import {
  acceptGraph,
  acceptUnderstanding,
  readGraph,
  refreshProjectedGraphViews,
  runProjectIntake,
  type RuntimeGraph,
  type RuntimeIntakeResult
} from "../runtimeClient";
import { useI18n } from "../i18n";

interface ProjectIntakeReviewPageProps {
  projectRoot: string;
  intakeResult: RuntimeIntakeResult | null;
  onProjectRootChange: (root: string) => void;
  onIntakeResult: (result: RuntimeIntakeResult) => void;
  autoIntakeToken: number;
  onGraphAccepted: (graph: RuntimeGraph) => void;
  onFoundationAccepted?: () => void;
}

type IntakeState = "idle" | "scanning" | "review" | "saving" | "done" | "error";

type IntakeModuleCandidate = {
  id: string;
  title: string;
  path: string;
  kind: string;
  source: "project_profile" | "architecture_model";
};

export function ProjectIntakeReviewPage({
  projectRoot,
  intakeResult,
  onProjectRootChange,
  onIntakeResult,
  autoIntakeToken,
  onGraphAccepted,
  onFoundationAccepted
}: ProjectIntakeReviewPageProps) {
  const [state, setState] = useState<IntakeState>(intakeResult ? "review" : "idle");
  const [error, setError] = useState("");
  const lastAutoIntakeToken = useRef(0);
  const { t } = useI18n();

  useEffect(() => {
    if (!autoIntakeToken || autoIntakeToken === lastAutoIntakeToken.current || !projectRoot) return;
    lastAutoIntakeToken.current = autoIntakeToken;
    void runIntake();
  }, [autoIntakeToken, projectRoot]);

  async function runIntake() {
    setState("scanning");
    setError("");
    try {
      const result = await runProjectIntake(projectRoot);
      onIntakeResult(result);
      setState("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  }

  async function accept() {
    if (!intakeResult) return;
    setState("saving");
    setError("");
    try {
      if (intakeResult.candidate) {
        await acceptGraph(projectRoot, intakeResult.candidate);
        const graph = await readGraph(projectRoot);
        onGraphAccepted(graph);
      } else {
        await acceptUnderstanding(projectRoot);
        await refreshProjectedGraphViews(projectRoot).catch(() => null);
        onFoundationAccepted?.();
      }
      setState("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  }

  const profile = intakeResult?.profile;
  const candidate = intakeResult?.candidate;
  const summary = intakeResult?.summary;
  const architecture = intakeResult?.architecture;
  const findings = intakeResult?.findings?.findings ?? [];
  const hasFoundationIntake = Boolean(summary);
  const moduleCandidates =
    profile?.moduleCandidates.map((module) => ({
      id: module.id,
      title: module.title,
      path: module.path,
      kind: module.kind,
      source: "project_profile" as const
    })) ??
    architecture?.modules.map((module) => ({
      id: module.id,
      title: module.name,
      path: module.path,
      kind: module.role,
      source: "architecture_model" as const
    })) ??
    [];
  const moduleGroups = groupModulesByRole(moduleCandidates);
  const intakeConcerns = buildIntakeConcerns({
    hasSummary: Boolean(summary),
    moduleCount: moduleCandidates.length,
    architectureModuleCount: architecture?.modules.length ?? 0,
    findingCount: findings.length,
    warningCount: (profile?.warnings?.length ?? 0) + (candidate?.warnings.length ?? 0) + (architecture?.warnings?.length ?? 0),
    hasRequirements: Boolean(candidate?.graph.nodes.some((node) => node.kind === "requirement" || node.id.startsWith("requirement:")))
  });
  const reviewItems = [
    ...(candidate?.warnings.map((warning) => warning.summary) ?? []),
    ...(candidate?.unresolvedQuestions.map((question) => question.question) ?? []),
    ...(architecture?.warnings?.map((warning) => warning.summary) ?? []),
    ...findings.map((finding) => finding.summary)
  ];
  const acceptDisabled = (!candidate && !hasFoundationIntake) || state === "saving" || state === "scanning";
  const projectKindText = formatList(profile?.projectKinds, t("intake.unknown"));
  const languageText = formatList(profile?.languages, t("intake.unknown"));
  const frameworkText = formatList(profile?.frameworks, t("intake.unknown"));

  return (
    <section className="page-grid intake-layout" aria-labelledby="intake-title">
      <section className="panel intake-control-panel">
        <p className="eyebrow">{t("intake.eyebrow")}</p>
        <h1 id="intake-title">{t("intake.title")}</h1>
        <label htmlFor="project-root">{t("intake.projectRoot")}</label>
        <input
          id="project-root"
          className="path-input"
          value={projectRoot}
          placeholder={t("intake.projectRootPlaceholder")}
          onChange={(event) => onProjectRootChange(event.target.value)}
        />
        <button className="primary-action full-width" type="button" onClick={runIntake} disabled={!projectRoot || state === "scanning"}>
          {state === "scanning" ? t("intake.scanning") : t("intake.scan")}
        </button>
        <p className="status-text">{intakeStatusText(state, Boolean(candidate), hasFoundationIntake, summary, t)}</p>
        <p className="intake-boundary-note">{t("intake.boundaryNote")}</p>
        {error ? <p className="error-text">{error}</p> : null}
        <ol className="intake-step-list">
          <li className={summary || candidate ? "done" : state === "scanning" ? "active" : ""}>
            <strong>{t("intake.stepScanFacts")}</strong>
            <span>{t("intake.stepScanFactsCopy")}</span>
          </li>
          <li className={moduleCandidates.length ? "done" : summary || candidate ? "active" : ""}>
            <strong>{t("intake.stepModelProject")}</strong>
            <span>{t("intake.stepModelProjectCopy")}</span>
          </li>
          <li className={summary || candidate ? "active" : ""}>
            <strong>{t("intake.stepConfirmMemory")}</strong>
            <span>{t("intake.stepConfirmMemoryCopy")}</span>
          </li>
        </ol>
      </section>

      <section className="panel intake-main-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("intake.understandingTitle")}</h2>
            <p>{t("intake.understandingCopy")}</p>
          </div>
          <span className="pill">{intakeResult ? t("intake.draftUnderstanding") : t("intake.snapshotRequired")}</span>
        </div>

        <div className="intake-understanding-grid">
          <UnderstandingCard title={t("intake.projectKind")} value={projectKindText} copy={projectKindCopy(projectKindText, t)} />
          <UnderstandingCard title={t("intake.languages")} value={languageText} copy={t("intake.languagesCopy")} />
          <UnderstandingCard title={t("intake.frameworks")} value={frameworkText} copy={frameworkCopy(frameworkText, t)} />
        </div>

        <IntakeConclusion result={intakeResult} moduleCount={moduleCandidates.length} concerns={intakeConcerns} />

        <section className="intake-module-review">
          <div className="section-heading">
            <div>
              <h3>{t("intake.moduleBoundaryTitle")}</h3>
              <p>{t("intake.moduleBoundaryCopy")}</p>
            </div>
            <span className="pill">{intakeResult ? t("intake.moduleCount", { count: moduleCandidates.length }) : t("intake.snapshotRequired")}</span>
          </div>
          {moduleCandidates.length ? (
            <div className="intake-module-boundary-list">
              {moduleGroups.map((group) => (
                <section className="intake-module-group" key={group.role}>
                  <div className="intake-module-group-heading">
                    <strong>{moduleRoleLabel(group.role)}</strong>
                    <span>{moduleRoleGroupCopy(group.role)}</span>
                  </div>
                  <div className="intake-module-rows">
                    {group.modules.slice(0, 8).map((module) => (
                      <ModuleBoundaryRow key={module.id} module={module} />
                    ))}
                    {group.modules.length > 8 ? (
                      <div className="intake-module-row muted">
                        <strong>{t("intake.moreModules", { count: group.modules.length - 8 })}</strong>
                        <span>{t("intake.moreModulesCopy")}</span>
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>{intakeResult ? t("intake.noModules") : t("intake.noRepository")}</strong>
              <span>{intakeResult ? t("intake.noModulesCopy") : t("intake.waitingSnapshot")}</span>
            </div>
          )}
        </section>
      </section>

      <aside className="panel review-panel intake-decision-panel">
        <h2>{t("intake.decisionTitle")}</h2>
        <p>{t("intake.decisionCopy")}</p>
        <ul className="review-list">
          {reviewItems.slice(0, 10).map((item) => (
            <li key={item}>{humanizeReviewItem(item, t)}</li>
          ))}
          {hasFoundationIntake && !reviewItems.length ? <li>{t("intake.noBlockingReviewItems")}</li> : null}
          {!candidate && !hasFoundationIntake ? <li>{t("intake.runForWarnings")}</li> : null}
        </ul>
        <div className="intake-accept-note">
          <strong>{t("intake.acceptWillDo")}</strong>
          <span>{candidate ? t("intake.acceptGraphCopy") : t("intake.acceptUnderstandingCopy")}</span>
        </div>
        <button className="primary-action full-width" type="button" disabled={acceptDisabled} onClick={accept}>
          {state === "saving" ? t("intake.writing") : candidate ? t("intake.acceptGraph") : t("intake.acceptUnderstanding")}
        </button>
      </aside>
    </section>
  );
}

function UnderstandingCard({ title, value, copy }: { title: string; value: string; copy: string }) {
  return (
    <article className="intake-understanding-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{copy}</p>
    </article>
  );
}

function IntakeConclusion({
  result,
  moduleCount,
  concerns
}: {
  result: RuntimeIntakeResult | null;
  moduleCount: number;
  concerns: string[];
}) {
  const summary = result?.summary;
  const acceptedReady = Boolean(summary);
  return (
    <section className="intake-foundation-summary">
      <div className="section-heading">
        <div>
          <h3>接入结论</h3>
          <p>这里展示接入结果背后的工程含义。原始数字和缓存路径只是证据，不是结论。</p>
        </div>
      </div>
      <div className="intake-conclusion-grid">
        <ConclusionItem
          tone={acceptedReady ? "ready" : "pending"}
          title={acceptedReady ? "仓库事实已可用" : "等待仓库事实"}
          detail={
            acceptedReady
              ? "Praxis 已从真实仓库生成本地 FACT 缓存，UML/C4、计划和工程评审可以基于它继续工作。"
              : "先扫描项目，Praxis 才能从真实文件和符号建立理解。"
          }
        />
        <ConclusionItem
          tone={moduleCount ? "candidate" : "pending"}
          title={moduleCount ? "模块边界仍是候选" : "缺少模块边界"}
          detail={
            moduleCount
              ? `Praxis 找到了 ${moduleCount} 个可能的模块边界。它们还不是已确认所有权，接受前需要复核。`
              : "没有模块边界时，Praxis 无法可靠生成 C4 Container、Component 视图或模块级计划。"
          }
        />
        <ConclusionItem
          tone={summary?.memoryPatches ? "candidate" : "pending"}
          title={summary?.memoryPatches ? "候选记忆等待确认" : "还没有候选记忆"}
          detail={
            summary?.memoryPatches
              ? "扫描结果会先成为候选 FACT patch，只有接受理解后才写成已确认记忆。"
              : "没有候选记忆时，后续图谱和评审只能依赖临时扫描输出。"
          }
        />
      </div>
      <section className="intake-concern-list">
        <h3>仍需确认</h3>
        {concerns.map((concern) => (
          <span key={concern}>{concern}</span>
        ))}
      </section>
    </section>
  );
}

function ConclusionItem({ tone, title, detail }: { tone: "ready" | "candidate" | "pending"; title: string; detail: string }) {
  return (
    <article className={`intake-conclusion-item ${tone}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </article>
  );
}

function ModuleBoundaryRow({ module }: { module: IntakeModuleCandidate }) {
  return (
    <article className="intake-module-row">
      <div>
        <strong>{module.title}</strong>
        <span>{module.path}</span>
      </div>
      <p>{moduleRoleCopy(module.kind)}</p>
      <small>
        {module.source === "architecture_model"
          ? "来自架构记忆；这个边界仍需要复核。"
          : "来自仓库扫描；这是等待确认的候选边界。"}
      </small>
    </article>
  );
}

function groupModulesByRole(modules: IntakeModuleCandidate[]): { role: string; modules: IntakeModuleCandidate[] }[] {
  const roleOrder = ["application", "ui", "runtime", "domain", "infrastructure", "storage", "tooling", "config", "test", "docs", "unknown"];
  const groups = new Map<string, IntakeModuleCandidate[]>();
  for (const module of modules) {
    const role = module.kind || "unknown";
    const bucket = groups.get(role) ?? [];
    bucket.push(module);
    groups.set(role, bucket);
  }
  return Array.from(groups.entries())
    .map(([role, roleModules]) => ({ role, modules: roleModules.sort((left, right) => left.path.localeCompare(right.path)) }))
    .sort((left, right) => {
      const leftIndex = roleOrder.includes(left.role) ? roleOrder.indexOf(left.role) : roleOrder.length;
      const rightIndex = roleOrder.includes(right.role) ? roleOrder.indexOf(right.role) : roleOrder.length;
      return leftIndex - rightIndex || left.role.localeCompare(right.role);
    });
}

function moduleRoleGroupCopy(kind: string): string {
  if (kind === "application") return "可运行应用或主入口，重点确认部署边界和启动责任。";
  if (kind === "ui") return "界面与交互入口，重点确认是否混入业务规则或运行时基础设施。";
  if (kind === "runtime") return "运行时服务或命令入口，重点确认执行和外部 worker 协调边界。";
  if (kind === "domain") return "领域模型、契约或核心规则，重点确认它是否应该被其他模块依赖。";
  if (kind === "infrastructure") return "Provider、Adapter、存储或外部系统连接，重点确认依赖方向。";
  if (kind === "storage") return "项目记忆、缓存或持久化边界，重点确认事实来源和写入治理。";
  if (kind === "tooling") return "脚本、构建和开发辅助能力，通常不应成为产品运行时边界。";
  if (kind === "config") return "配置与环境声明，重点确认敏感信息、默认值和部署差异。";
  if (kind === "test") return "测试和验证资产，重点确认它覆盖哪些真实需求。";
  if (kind === "docs") return "文档和知识资产，重点确认是否能支撑规格、决策和项目记忆。";
  return "Praxis 只能识别出目录或工程边界，职责还需要通过记忆或评审进一步确认。";
}

function buildIntakeConcerns(input: {
  hasSummary: boolean;
  moduleCount: number;
  architectureModuleCount: number;
  findingCount: number;
  warningCount: number;
  hasRequirements: boolean;
}): string[] {
  const concerns: string[] = [];
  if (!input.hasSummary) concerns.push("还没有完成仓库扫描，Praxis 不能把任何项目理解写成已确认记忆。");
  if (!input.moduleCount) concerns.push("没有可用模块边界，UML/C4、计划和评审都缺少基础对象。");
  if (input.moduleCount && !input.architectureModuleCount) concerns.push("模块边界主要来自扫描推断，还没有被架构记忆确认。");
  if (!input.hasRequirements) concerns.push("没有发现需求或规格记录，计划与完成度只能提示缺口，不能判断真实完成率。");
  if (input.warningCount) concerns.push(`接入阶段仍有 ${input.warningCount} 条警告需要复核。`);
  if (input.findingCount) concerns.push(`架构建模阶段已经发现 ${input.findingCount} 个候选问题，应进入工程评审继续确认。`);
  if (!concerns.length) concerns.push("没有发现接入阻断项，但这不等于已经完成工程质量评审。");
  return concerns;
}

function formatList(values: string[] | undefined, fallback: string): string {
  return values?.length ? values.join(", ") : fallback;
}

function projectKindCopy(value: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (value === t("intake.unknown")) return t("intake.projectKindUnknownCopy");
  return t("intake.projectKindCopy");
}

function frameworkCopy(value: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (value === t("intake.unknown")) return t("intake.frameworkUnknownCopy");
  return t("intake.frameworkCopy");
}

function moduleRoleLabel(kind: string): string {
  if (kind === "application") return "应用入口";
  if (kind === "ui") return "界面模块";
  if (kind === "runtime") return "运行时模块";
  if (kind === "domain") return "领域/契约模块";
  if (kind === "infrastructure") return "基础设施模块";
  if (kind === "storage") return "存储/记忆模块";
  if (kind === "tooling") return "工具模块";
  if (kind === "docs") return "文档模块";
  if (kind === "config") return "配置模块";
  if (kind === "test") return "测试模块";
  return kind || "未分类模块";
}

function moduleRoleCopy(kind: string): string {
  if (kind === "application") return "可能是可运行应用或主入口，需要确认部署边界和启动职责。";
  if (kind === "ui") return "主要承载用户界面、页面或交互入口。";
  if (kind === "runtime") return "主要承载运行时服务、命令入口或基础执行能力。";
  if (kind === "domain") return "可能承载业务对象、契约、规则或核心领域概念。";
  if (kind === "infrastructure") return "可能承载 Provider、Adapter、外部系统连接或技术基础设施。";
  if (kind === "storage") return "可能承载缓存、项目记忆、持久化或索引能力。";
  if (kind === "tooling") return "主要承载脚本、构建、检查或开发辅助能力。";
  if (kind === "docs") return "承载项目文档和知识说明，不应被误当成运行时代码。";
  if (kind === "config") return "承载配置或环境声明，需要后续确认归属和敏感信息边界。";
  if (kind === "test") return "承载测试或验证资产，用来支撑完成度判断。";
  return "Praxis 只识别出目录边界，职责还需要通过记忆或评审进一步确认。";
}

function humanizeReviewItem(item: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (/No package-level dependencies/i.test(item)) return t("intake.noPackageDependenciesReview");
  return item;
}

function intakeStatusText(
  state: IntakeState,
  hasCandidate: boolean,
  hasFoundationIntake: boolean,
  summary: RuntimeIntakeResult["summary"] | undefined,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (state === "scanning") return t("intake.statusScanning");
  if (state === "saving") return t("intake.statusSaving");
  if (state === "done") return t("intake.statusDone");
  if (state === "error") return t("intake.statusError");
  if (hasCandidate) return t("intake.statusLegacyReady");
  if (hasFoundationIntake && summary) return t("intake.statusFoundationReady", { files: summary.files, patches: summary.memoryPatches });
  return t("intake.statusIdle");
}
