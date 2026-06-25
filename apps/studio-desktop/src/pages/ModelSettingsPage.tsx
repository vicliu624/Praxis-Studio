import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import {
  defaultModelSettings,
  defaultPiTools,
  legacyDefaultPiTools,
  readAppModelSettings,
  readAppModelSettingsPath,
  renderRuntimeRoutePreview,
  saveAppModelSettings,
  type ModelSettings
} from "../runtimeClient";
import { useI18n } from "../i18n";

interface ModelSettingsPageProps {
  projectRoot: string;
}

const thinkingLevels: ModelSettings["piThinking"][] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function ModelSettingsPage({ projectRoot }: ModelSettingsPageProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ModelSettings>(defaultModelSettings);
  const [settingsPath, setSettingsPath] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void readAppModelSettings()
      .then((saved) => {
        if (active && saved) setSettings(normalizeSavedSettings(saved));
      })
      .catch(() => {
        if (active) setSettings(defaultModelSettings);
      });
    void readAppModelSettingsPath()
      .then((path) => {
        if (active) setSettingsPath(path);
      })
      .catch(() => {
        if (active) setSettingsPath(null);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setStatus("");
    setError("");
    try {
      await saveAppModelSettings(settings);
      setStatus(settingsPath ? t("settings.savedToPath", { path: settingsPath }) : t("settings.savedSession"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus(t("settings.savedLocalOnly"));
    }
  }

  const runtimePreview = renderRuntimeRoutePreview(settings);

  return (
    <section className="settings-layout" aria-labelledby="model-settings-title">
      <section className="panel settings-form">
        <p className="eyebrow">{t("settings.eyebrow")}</p>
        <h1 id="model-settings-title">{t("settings.title")}</h1>
        <p className="muted-copy">
          {t("settings.copy")}
        </p>
        <div className="settings-path-note">
          <span>{t("settings.configPath")}</span>
          <code>{settingsPath ?? t("settings.browserOnly")}</code>
        </div>

        <div className="form-grid">
          <label htmlFor="default-provider">{t("settings.defaultProvider")}</label>
          <input id="default-provider" className="path-input" value={settings.defaultProvider} onChange={(event) => update("defaultProvider", event.target.value)} />

          <label htmlFor="base-url">{t("settings.baseUrl")}</label>
          <input id="base-url" className="path-input" value={settings.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} />

          <label htmlFor="api-key">{t("settings.apiKey")}</label>
          <input id="api-key" className="path-input" type="text" value={settings.apiKey} onChange={(event) => update("apiKey", event.target.value)} />
          <div />
          <p className="settings-inline-note">{t("settings.apiKeyPlaintext")}</p>

          <label htmlFor="intake-model">{t("settings.intakeModel")}</label>
          <input id="intake-model" className="path-input" value={settings.intakeModel} onChange={(event) => update("intakeModel", event.target.value)} />

          <label htmlFor="design-discovery-model">{t("settings.designDiscoveryModel")}</label>
          <input id="design-discovery-model" className="path-input" value={settings.designDiscoveryModel} onChange={(event) => update("designDiscoveryModel", event.target.value)} />

          <label htmlFor="design-discovery-timeout">{t("settings.designDiscoveryTimeout")}</label>
          <input
            id="design-discovery-timeout"
            className="path-input"
            type="number"
            min={0}
            value={settings.designDiscoveryTimeoutMs}
            onChange={(event) => {
              const value = Number(event.target.value);
              update("designDiscoveryTimeoutMs", Number.isFinite(value) && value >= 0 ? value : defaultModelSettings.designDiscoveryTimeoutMs);
            }}
          />
          <div />
          <p className="settings-inline-note">{t("settings.designDiscoveryTimeoutCopy")}</p>

          <label htmlFor="node-explain-model">{t("settings.nodeExplainModel")}</label>
          <input id="node-explain-model" className="path-input" value={settings.nodeExplainModel} onChange={(event) => update("nodeExplainModel", event.target.value)} />

          <label htmlFor="edge-explain-model">{t("settings.edgeExplainModel")}</label>
          <input id="edge-explain-model" className="path-input" value={settings.edgeExplainModel} onChange={(event) => update("edgeExplainModel", event.target.value)} />

          <label htmlFor="edge-plan-model">{t("settings.edgePlanModel")}</label>
          <input id="edge-plan-model" className="path-input" value={settings.edgePlanModel} onChange={(event) => update("edgePlanModel", event.target.value)} />

          <label htmlFor="task-model">{t("settings.taskModel")}</label>
          <input id="task-model" className="path-input" value={settings.codingTaskModel} onChange={(event) => update("codingTaskModel", event.target.value)} />
        </div>

        <section className="settings-section">
          <div className="panel-heading tight">
            <h2>Pi Agent Engine / Coding Worker</h2>
            <span className="pill">tools + permissions</span>
          </div>
          <p className="settings-inline-note">
            Pi 是 Praxis 的外部执行 worker。这里控制 Pi 可以使用的模型、thinking 级别、工具白名单和读/命令/写权限。
          </p>
          <div className="form-grid">
            <label htmlFor="pi-provider">Pi Provider</label>
            <input id="pi-provider" className="path-input" value={settings.piProvider} onChange={(event) => update("piProvider", event.target.value)} />

            <label htmlFor="pi-model">Pi Model</label>
            <input id="pi-model" className="path-input" value={settings.piModel} onChange={(event) => update("piModel", event.target.value)} />

            <label htmlFor="pi-thinking">Pi Thinking</label>
            <select id="pi-thinking" className="path-input" value={settings.piThinking} onChange={(event) => update("piThinking", event.target.value as ModelSettings["piThinking"])}>
              {thinkingLevels.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>

            <label htmlFor="review-pi-thinking">Review Thinking</label>
            <select id="review-pi-thinking" className="path-input" value={settings.reviewPiThinking} onChange={(event) => update("reviewPiThinking", event.target.value as ModelSettings["reviewPiThinking"])}>
              {thinkingLevels.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>

            <label htmlFor="pi-tools">Pi Tools</label>
            <input id="pi-tools" className="path-input" value={settings.piTools} onChange={(event) => update("piTools", event.target.value)} />
            <div />
            <p className="settings-inline-note">
              常用值：praxis_status,praxis_context_packet,praxis_projection_views,praxis_code_facts,praxis_findings,read,grep,find,ls,bash,edit,write
            </p>

            <label htmlFor="pi-timeout">Pi Timeout (ms)</label>
            <input id="pi-timeout" className="path-input" type="number" min={0} value={settings.piTimeoutMs} onChange={(event) => {
              const value = Number(event.target.value);
              update("piTimeoutMs", Number.isFinite(value) && value >= 0 ? value : defaultModelSettings.piTimeoutMs);
            }} />

            <label htmlFor="review-pi-timeout">Review Timeout (ms)</label>
            <input id="review-pi-timeout" className="path-input" type="number" min={0} value={settings.reviewPiTimeoutMs} onChange={(event) => {
              const value = Number(event.target.value);
              update("reviewPiTimeoutMs", Number.isFinite(value) && value >= 0 ? value : defaultModelSettings.reviewPiTimeoutMs);
            }} />
          </div>
          <div className="settings-toggle-grid">
            <label>
              <input type="checkbox" checked={settings.piCodeGraph} onChange={(event) => update("piCodeGraph", event.target.checked)} />
              <span>启用仓库分析工具</span>
            </label>
            <label>
              <input type="checkbox" checked={settings.piAllowRead} onChange={(event) => update("piAllowRead", event.target.checked)} />
              <span>允许读取仓库</span>
            </label>
            <label>
              <input type="checkbox" checked={settings.piAllowShell} onChange={(event) => update("piAllowShell", event.target.checked)} />
              <span>允许 shell 命令</span>
            </label>
            <label>
              <input type="checkbox" checked={settings.piAllowWrite} onChange={(event) => update("piAllowWrite", event.target.checked)} />
              <span>允许 edit/write 写入</span>
            </label>
          </div>
        </section>

        <button className="primary-action full-width" type="button" onClick={save}>
          {t("settings.save")}
        </button>
        {status ? <p className="status-text">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel settings-preview">
        <div className="panel-heading">
          <h2>{t("settings.preview")}</h2>
          <span className="pill">{t("settings.localOnly")}</span>
        </div>
        <pre className="agent-output">{runtimePreview}</pre>
        <div className="settings-log-locations">
          <h3>{t("settings.agentLogs")}</h3>
          <p>{t("settings.agentLogsCopy")}</p>
          <code>{projectRoot ? `${projectRoot}\\.distinction\\chat\\sessions\\*.jsonl` : t("settings.noProjectRoot")}</code>
          <code>{projectRoot ? `${projectRoot}\\.distinction\\runs\\*.json` : t("settings.noProjectRoot")}</code>
          <code>{projectRoot ? `${projectRoot}\\.distinction\\runs\\runs.jsonl` : t("settings.noProjectRoot")}</code>
          <code>{projectRoot ? `${projectRoot}\\.distinction\\memory\\traces.jsonl` : t("settings.noProjectRoot")}</code>
        </div>
        <AppUpdatePanel />
      </section>
    </section>
  );
}

type AppUpdateState =
  | { kind: "idle"; currentVersion?: string; message: string }
  | { kind: "checking"; currentVersion?: string; message: string }
  | { kind: "latest"; currentVersion: string; message: string }
  | { kind: "available"; currentVersion: string; updateVersion: string; date?: string; notes?: string; message: string }
  | { kind: "installing"; currentVersion?: string; updateVersion: string; downloadedBytes: number; totalBytes?: number; message: string }
  | { kind: "installed"; currentVersion?: string; updateVersion: string; message: string }
  | { kind: "unavailable"; currentVersion?: string; message: string }
  | { kind: "error"; currentVersion?: string; message: string };

function AppUpdatePanel() {
  const { t } = useI18n();
  const [state, setState] = useState<AppUpdateState>({ kind: "idle", message: "" });
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  useEffect(() => {
    let active = true;
    if (!hasTauriRuntime()) {
      setState({ kind: "unavailable", message: t("settings.updateUnavailable") });
      return () => {
        active = false;
      };
    }

    void readDesktopAppVersion()
      .then((currentVersion) => {
        if (active) setState({ kind: "idle", currentVersion, message: "" });
      })
      .catch((caught) => {
        if (active) setState({ kind: "error", message: errorMessage(caught) });
      });

    return () => {
      active = false;
    };
  }, [t]);

  async function checkForUpdates() {
    if (!hasTauriRuntime()) {
      setState({ kind: "unavailable", message: t("settings.updateUnavailable") });
      return;
    }

    setPendingUpdate(null);
    setState((current) => ({
      kind: "checking",
      currentVersion: "currentVersion" in current ? current.currentVersion : undefined,
      message: t("settings.updateChecking")
    }));

    try {
      const currentVersion = await readDesktopAppVersion();
      const update = await check({ timeout: 30000 });
      if (!update) {
        setState({ kind: "latest", currentVersion, message: t("settings.updateLatest") });
        return;
      }

      setPendingUpdate(update);
      setState({
        kind: "available",
        currentVersion: update.currentVersion || currentVersion,
        updateVersion: update.version,
        date: update.date,
        notes: update.body,
        message: t("settings.updateAvailable", { version: update.version })
      });
    } catch (caught) {
      setState((current) => ({
        kind: "error",
        currentVersion: "currentVersion" in current ? current.currentVersion : undefined,
        message: errorMessage(caught)
      }));
    }
  }

  async function installUpdate() {
    if (!pendingUpdate || state.kind !== "available") return;
    const agreed = await confirm(t("settings.updateConfirmCopy", { version: pendingUpdate.version }), {
      title: t("settings.updateConfirmTitle"),
      kind: "info",
      okLabel: t("settings.updateConfirmOk"),
      cancelLabel: t("settings.updateConfirmCancel")
    });
    if (!agreed) return;

    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    setState({
      kind: "installing",
      currentVersion: pendingUpdate.currentVersion,
      updateVersion: pendingUpdate.version,
      downloadedBytes,
      totalBytes,
      message: t("settings.updateInstalling", { version: pendingUpdate.version })
    });

    try {
      await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          downloadedBytes = 0;
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
        }

        setState({
          kind: "installing",
          currentVersion: pendingUpdate.currentVersion,
          updateVersion: pendingUpdate.version,
          downloadedBytes,
          totalBytes,
          message: event.event === "Finished" ? t("settings.updateInstallFinalizing") : t("settings.updateInstalling", { version: pendingUpdate.version })
        });
      });

      setState({
        kind: "installed",
        currentVersion: pendingUpdate.currentVersion,
        updateVersion: pendingUpdate.version,
        message: t("settings.updateInstalled")
      });
      await relaunch();
    } catch (caught) {
      setState({
        kind: "error",
        currentVersion: pendingUpdate.currentVersion,
        message: errorMessage(caught)
      });
    }
  }

  const isChecking = state.kind === "checking";
  const isInstalling = state.kind === "installing";
  const currentVersion = "currentVersion" in state ? state.currentVersion : undefined;
  const updateVersion = "updateVersion" in state ? state.updateVersion : undefined;
  const releaseNotes = "notes" in state ? state.notes : undefined;
  const releaseDate = "date" in state ? state.date : undefined;
  const progress = state.kind === "installing" && state.totalBytes ? Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100)) : 0;

  return (
    <section className="settings-update-panel" aria-labelledby="app-update-title">
      <div className="panel-heading">
        <div>
          <h3 id="app-update-title">{t("settings.updateTitle")}</h3>
          <p>{t("settings.updateCopy")}</p>
        </div>
        <span className={state.kind === "latest" ? "pill success" : "pill"}>{updateVersion ?? currentVersion ?? "v0.1"}</span>
      </div>
      <dl className="settings-update-meta">
        <div>
          <dt>{t("settings.updateCurrentVersion")}</dt>
          <dd>{currentVersion ?? t("settings.updateUnknownVersion")}</dd>
        </div>
        <div>
          <dt>{t("settings.updateReleaseSource")}</dt>
          <dd>{t("settings.updateReleaseSourceValue")}</dd>
        </div>
      </dl>
      {state.message ? <p className={state.kind === "error" ? "error-text" : "status-text"}>{state.message}</p> : null}
      {state.kind === "installing" ? (
        <div className="settings-update-progress" aria-label={t("settings.updateProgress")}>
          <span style={{ width: `${progress}%` }} />
          <strong>{state.totalBytes ? `${progress}%` : formatBytes(state.downloadedBytes)}</strong>
        </div>
      ) : null}
      {state.kind === "available" ? (
        <div className="settings-update-release">
          <strong>{t("settings.updateReleaseNotes")}</strong>
          {releaseDate ? <span>{releaseDate}</span> : null}
          <p>{releaseNotes?.trim() || t("settings.updateNoReleaseNotes")}</p>
        </div>
      ) : null}
      <div className="action-row">
        <button className="secondary-action" type="button" onClick={checkForUpdates} disabled={isChecking || isInstalling}>
          {isChecking ? t("settings.updateChecking") : t("settings.updateCheck")}
        </button>
        <button className="primary-action" type="button" onClick={installUpdate} disabled={!pendingUpdate || state.kind !== "available" || isInstalling}>
          {isInstalling ? t("settings.updateInstallingShort") : t("settings.updateInstall")}
        </button>
      </div>
      <p className="settings-inline-note">{t("settings.updateEndpointHelp")}</p>
    </section>
  );
}

type SavedModelSettings = Partial<ModelSettings> & { apiKeyEnv?: string };

function normalizeSavedSettings(saved: SavedModelSettings): ModelSettings {
  const { apiKeyEnv: legacyApiKeyEnv, ...savedSettings } = saved;
  const apiKey = saved.apiKey || (legacyApiKeyEnv && looksLikeApiKey(legacyApiKeyEnv) ? legacyApiKeyEnv : "");
  const piTools = saved.piTools === legacyDefaultPiTools ? defaultPiTools : sanitizeVisiblePiTools(saved.piTools);
  return {
    ...defaultModelSettings,
    ...savedSettings,
    piTools: piTools ?? defaultModelSettings.piTools,
    apiKey
  };
}

function sanitizeVisiblePiTools(value: string | undefined): string | undefined {
  if (!value) return value;
  const tools = value
    .split(",")
    .map((tool) => tool.trim())
    .filter((tool) => tool && !tool.startsWith("codegraph_"));
  return tools.length ? tools.join(",") : defaultPiTools;
}

function looksLikeApiKey(value: string): boolean {
  return value.startsWith("sk-") || value.startsWith("sk_");
}

async function readDesktopAppVersion(): Promise<string> {
  return await invoke<string>("app_version");
}

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
