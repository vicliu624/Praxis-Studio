import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "zh-CN";

const storageKey = "praxis-studio:locale";

const en = {
  "route.home": "Home",
  "route.projectIntake": "Project Intake",
  "route.createProject": "Create Project",
  "route.graphWorkspace": "Development Graph",
  "route.modelSettings": "Model Settings",
  "app.primaryNav": "Primary",
  "app.language": "Language",
  "app.english": "English",
  "app.chinese": "中文",

  "home.eyebrow": "Project Intake + Graph Agent + Controlled Coding Task MVP",
  "home.title": "Praxis Studio v0.1",
  "home.openExisting": "Open Existing Project",
  "home.createNew": "Create New Project",
  "home.recentProjects": "Recent Projects",
  "home.refreshRecent": "Refresh recent projects",
  "home.noRecentTitle": "No recent projects yet",
  "home.noRecentDescription": "Open a repository to create the first recent entry.",
  "home.noRecentStorage": "Recent projects are stored in ~/.praxis-studio/recent-projects.json.",
  "home.gates": "v0.1 Gates",
  "home.gateHome": "HomePage",
  "home.gateRuntime": "Runtime CLI",
  "home.gateScanner": "Repository Scanner",
  "home.gateWorkspace": "Graph Workspace",
  "home.modelRoute": "Model Route",
  "home.settings": "Settings",
  "home.defaultProvider": "Default provider",
  "home.fallback": "Fallback",
  "home.policy": "Policy",

  "intake.eyebrow": "Open Existing Project",
  "intake.title": "Project Intake Review",
  "intake.projectRoot": "Project root",
  "intake.projectRootPlaceholder": "C:/path/to/repository",
  "intake.scan": "Scan / Profile / Generate Graph",
  "intake.scanning": "Scanning...",
  "intake.projectKind": "Project kind",
  "intake.languages": "Languages",
  "intake.frameworks": "Frameworks",
  "intake.graph": "Graph",
  "intake.pendingScan": "Pending scan",
  "intake.graphCount": "{{nodes}} nodes / {{edges}} edges",
  "intake.moduleCandidates": "Module Candidates",
  "intake.moduleCount": "{{count}} modules",
  "intake.snapshotRequired": "RepositorySnapshot required",
  "intake.noRepository": "No repository selected",
  "intake.waitingSnapshot": "Waiting for RepositorySnapshot",
  "intake.graphCandidate": "Graph Candidate",
  "intake.candidateOnly": "Candidate only",
  "intake.review": "Review",
  "intake.runForWarnings": "Run intake to see warnings and questions.",
  "intake.writing": "Writing .distinction...",
  "intake.acceptGraph": "Accept Graph",

  "create.eyebrow": "Create New Project",
  "create.title": "Project Wizard",
  "create.stepIntent": "Product Intent",
  "create.stepGenerate": "Generate Plan",
  "create.stepReview": "Review",
  "create.stepApply": "Apply",
  "create.stepWorkspace": "Workspace",
  "create.projectName": "Project name",
  "create.targetDirectory": "Target directory",
  "create.targetPlaceholder": "C:/path/to/new-project",
  "create.productIntent": "Product Intent",
  "create.intentPlaceholder": "Describe the product intent...",
  "create.projectType": "Project type",
  "create.documentationFirst": "Documentation-first",
  "create.tauriDesktop": "Tauri Desktop",
  "create.generating": "Generating plan...",
  "create.applying": "Applying project files...",
  "create.generatePlan": "Generate Plan",
  "create.applyFiles": "Apply Files",
  "create.reviewPlan": "Review Plan",
  "create.fileCount": "{{count}} files",
  "create.noPlan": "No plan",
  "create.requirements": "Requirements",
  "create.architecture": "Architecture",
  "create.files": "Files",
  "create.planOutput": "Generated plan result will appear here.",

  "workspace.eyebrow": "Development Graph",
  "workspace.title": "Workspace",
  "workspace.loadGraph": "Load .distinction Graph",
  "workspace.showCodeUnits": "Show code units",
  "workspace.showRisks": "Show risks",
  "workspace.showTasks": "Show tasks",
  "workspace.noGraph": "No confirmed graph",
  "workspace.openProjectFirst": "Open a project or create one first.",
  "workspace.project": "Project",
  "workspace.node": "Node",
  "workspace.edgeProgress": "edge progress",
  "workspace.inspector": "Inspector",
  "workspace.targetBound": "Target-bound",
  "workspace.noTarget": "No target selected",
  "workspace.selectTarget": "Select a node or edge",
  "workspace.agentMode": "Agent mode",
  "workspace.explain": "Explain",
  "workspace.plan": "Plan",
  "workspace.task": "Task",
  "workspace.send": "Send",
  "workspace.loadingGraph": "Loading graph...",
  "workspace.planning": "Planning...",
  "workspace.explaining": "Explaining...",
  "workspace.applyingActions": "Applying selected actions...",
  "workspace.generatingTask": "Generating TASK.md...",
  "workspace.importingResult": "Importing task result...",
  "workspace.planActions": "Plan Actions",
  "workspace.selectedCount": "{{count}} selected",
  "workspace.applySelected": "Apply selected",
  "workspace.importTaskResult": "Import Task Result",
  "workspace.taskResultHelp": "Paste JSON, Markdown, or a short external agent summary. Progress suggestions still require preview before apply.",
  "workspace.importResult": "Import result",
  "workspace.agentOutput": "Agent output will appear here.",
  "workspace.timeline": "Trace / Memory Timeline",
  "workspace.timelineCopy": "Runtime calls, plan apply events, task imports, and memory records are persisted to traces.jsonl and changes.md.",
  "workspace.defaultInstruction": "Explain the selected target.",
  "workspace.defaultTaskSummary": "External coding agent returned a patch summary and progress suggestion.",
  "workspace.testNotRun": "Not run",
  "workspace.importedTextSummary": "External coding agent result imported from text.",

  "settings.eyebrow": "Model Settings",
  "settings.title": "DeepSeek Route",
  "settings.copy": "Enter one DeepSeek API key for this Praxis Studio install. It is saved in IDE settings, not in the project .distinction directory.",
  "settings.defaultProvider": "Default provider",
  "settings.baseUrl": "DeepSeek base URL",
  "settings.apiKey": "DeepSeek API key",
  "settings.intakeModel": "Project intake model",
  "settings.nodeExplainModel": "Node explain model",
  "settings.edgeExplainModel": "Edge explain model",
  "settings.edgePlanModel": "Edge plan model",
  "settings.taskModel": "Coding task model",
  "settings.save": "Save Model Settings",
  "settings.savedSession": "Saved to Praxis Studio IDE settings.",
  "settings.savedProject": "Saved model routes.",
  "settings.savedLocalOnly": "Could not save IDE model settings.",
  "settings.preview": "Runtime route preview",
  "settings.localOnly": "IDE settings"
} as const;

export type TranslationKey = keyof typeof en;

const zhCN: Record<TranslationKey, string> = {
  "route.home": "首页",
  "route.projectIntake": "项目接入",
  "route.createProject": "创建项目",
  "route.graphWorkspace": "开发图谱",
  "route.modelSettings": "模型设置",
  "app.primaryNav": "主导航",
  "app.language": "语言",
  "app.english": "English",
  "app.chinese": "中文",

  "home.eyebrow": "项目接入 + 图谱 Agent + 受控代码任务 MVP",
  "home.title": "Praxis Studio v0.1",
  "home.openExisting": "打开已有项目",
  "home.createNew": "创建新项目",
  "home.recentProjects": "最近项目",
  "home.refreshRecent": "刷新最近项目",
  "home.noRecentTitle": "还没有最近项目",
  "home.noRecentDescription": "打开一个仓库后会生成第一条最近记录。",
  "home.noRecentStorage": "最近项目保存在 ~/.praxis-studio/recent-projects.json。",
  "home.gates": "v0.1 关卡",
  "home.gateHome": "首页",
  "home.gateRuntime": "Runtime CLI",
  "home.gateScanner": "仓库扫描器",
  "home.gateWorkspace": "图谱工作台",
  "home.modelRoute": "模型路由",
  "home.settings": "设置",
  "home.defaultProvider": "默认供应商",
  "home.fallback": "回退",
  "home.policy": "策略",

  "intake.eyebrow": "打开已有项目",
  "intake.title": "项目接入评审",
  "intake.projectRoot": "项目根目录",
  "intake.projectRootPlaceholder": "C:/path/to/repository",
  "intake.scan": "扫描 / 画像 / 生成图谱",
  "intake.scanning": "扫描中...",
  "intake.projectKind": "项目类型",
  "intake.languages": "语言",
  "intake.frameworks": "框架",
  "intake.graph": "图谱",
  "intake.pendingScan": "等待扫描",
  "intake.graphCount": "{{nodes}} 个节点 / {{edges}} 条边",
  "intake.moduleCandidates": "模块候选",
  "intake.moduleCount": "{{count}} 个模块",
  "intake.snapshotRequired": "需要 RepositorySnapshot",
  "intake.noRepository": "未选择仓库",
  "intake.waitingSnapshot": "等待 RepositorySnapshot",
  "intake.graphCandidate": "图谱候选",
  "intake.candidateOnly": "仅候选",
  "intake.review": "评审",
  "intake.runForWarnings": "运行接入流程后查看警告和问题。",
  "intake.writing": "正在写入 .distinction...",
  "intake.acceptGraph": "接受图谱",

  "create.eyebrow": "创建新项目",
  "create.title": "项目向导",
  "create.stepIntent": "产品构想",
  "create.stepGenerate": "生成计划",
  "create.stepReview": "评审",
  "create.stepApply": "应用",
  "create.stepWorkspace": "工作台",
  "create.projectName": "项目名称",
  "create.targetDirectory": "目标目录",
  "create.targetPlaceholder": "C:/path/to/new-project",
  "create.productIntent": "产品构想",
  "create.intentPlaceholder": "描述产品构想...",
  "create.projectType": "项目类型",
  "create.documentationFirst": "文档优先",
  "create.tauriDesktop": "Tauri 桌面端",
  "create.generating": "正在生成计划...",
  "create.applying": "正在写入项目文件...",
  "create.generatePlan": "生成计划",
  "create.applyFiles": "应用文件",
  "create.reviewPlan": "评审计划",
  "create.fileCount": "{{count}} 个文件",
  "create.noPlan": "暂无计划",
  "create.requirements": "需求",
  "create.architecture": "架构",
  "create.files": "文件",
  "create.planOutput": "生成计划结果会显示在这里。",

  "workspace.eyebrow": "开发图谱",
  "workspace.title": "工作台",
  "workspace.loadGraph": "加载 .distinction 图谱",
  "workspace.showCodeUnits": "显示代码单元",
  "workspace.showRisks": "显示风险",
  "workspace.showTasks": "显示任务",
  "workspace.noGraph": "没有已确认图谱",
  "workspace.openProjectFirst": "请先打开项目或创建项目。",
  "workspace.project": "项目",
  "workspace.node": "节点",
  "workspace.edgeProgress": "边进度",
  "workspace.inspector": "检查器",
  "workspace.targetBound": "绑定当前对象",
  "workspace.noTarget": "未选择对象",
  "workspace.selectTarget": "选择一个节点或边",
  "workspace.agentMode": "Agent 模式",
  "workspace.explain": "解释",
  "workspace.plan": "计划",
  "workspace.task": "任务",
  "workspace.send": "发送",
  "workspace.loadingGraph": "正在加载图谱...",
  "workspace.planning": "正在生成计划...",
  "workspace.explaining": "正在解释...",
  "workspace.applyingActions": "正在应用选中动作...",
  "workspace.generatingTask": "正在生成 TASK.md...",
  "workspace.importingResult": "正在导入任务结果...",
  "workspace.planActions": "计划动作",
  "workspace.selectedCount": "已选 {{count}} 个",
  "workspace.applySelected": "应用选中项",
  "workspace.importTaskResult": "导入任务结果",
  "workspace.taskResultHelp": "可粘贴 JSON、Markdown 或外部 agent 的简短结果摘要。进度建议仍需预览后再应用。",
  "workspace.importResult": "导入结果",
  "workspace.agentOutput": "Agent 输出会显示在这里。",
  "workspace.timeline": "Trace / Memory 时间线",
  "workspace.timelineCopy": "Runtime 调用、计划应用、任务导入和记忆记录会持久化到 traces.jsonl 与 changes.md。",
  "workspace.defaultInstruction": "解释当前选中的对象。",
  "workspace.defaultTaskSummary": "外部 coding agent 返回了补丁摘要和进度建议。",
  "workspace.testNotRun": "未运行",
  "workspace.importedTextSummary": "已从文本导入外部 coding agent 结果。",

  "settings.eyebrow": "模型设置",
  "settings.title": "DeepSeek 路由",
  "settings.copy": "DeepSeek API Key 属于这个 Praxis Studio IDE，不会写入项目的 .distinction 目录。",
  "settings.defaultProvider": "默认供应商",
  "settings.baseUrl": "DeepSeek Base URL",
  "settings.apiKey": "DeepSeek API Key",
  "settings.intakeModel": "项目接入模型",
  "settings.nodeExplainModel": "节点解释模型",
  "settings.edgeExplainModel": "边解释模型",
  "settings.edgePlanModel": "边计划模型",
  "settings.taskModel": "代码任务模型",
  "settings.save": "保存模型设置",
  "settings.savedSession": "已保存到 Praxis Studio 的 IDE 设置。",
  "settings.savedProject": "已保存模型路由。",
  "settings.savedLocalOnly": "无法保存 IDE 模型设置。",
  "settings.preview": "Runtime 路由预览",
  "settings.localOnly": "IDE 设置"
};

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  "zh-CN": zhCN
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    window.localStorage.setItem(storageKey, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key, values) => interpolate(dictionaries[locale][key] ?? en[key], values)
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider.");
  return value;
}

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(storageKey);
  return stored === "zh-CN" || stored === "en" ? stored : "en";
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)), template);
}
