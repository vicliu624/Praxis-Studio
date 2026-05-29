import { useEffect, useState } from "react";
import {
  defaultModelSettings,
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
              常用值：read,grep,find,ls,codegraph_query,codegraph_context,codegraph_relations,bash,edit,write
            </p>

            <label htmlFor="pi-timeout">Pi Timeout (ms)</label>
            <input id="pi-timeout" className="path-input" type="number" min={1000} value={settings.piTimeoutMs} onChange={(event) => update("piTimeoutMs", Number(event.target.value) || defaultModelSettings.piTimeoutMs)} />

            <label htmlFor="review-pi-timeout">Review Timeout (ms)</label>
            <input id="review-pi-timeout" className="path-input" type="number" min={1000} value={settings.reviewPiTimeoutMs} onChange={(event) => update("reviewPiTimeoutMs", Number(event.target.value) || defaultModelSettings.reviewPiTimeoutMs)} />
          </div>
          <div className="settings-toggle-grid">
            <label>
              <input type="checkbox" checked={settings.piCodeGraph} onChange={(event) => update("piCodeGraph", event.target.checked)} />
              <span>启用 CodeGraph 工具</span>
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
      </section>
    </section>
  );
}

type SavedModelSettings = Partial<ModelSettings> & { apiKeyEnv?: string };

function normalizeSavedSettings(saved: SavedModelSettings): ModelSettings {
  const { apiKeyEnv: legacyApiKeyEnv, ...savedSettings } = saved;
  const apiKey = saved.apiKey || (legacyApiKeyEnv && looksLikeApiKey(legacyApiKeyEnv) ? legacyApiKeyEnv : "");
  return {
    ...defaultModelSettings,
    ...savedSettings,
    apiKey
  };
}

function looksLikeApiKey(value: string): boolean {
  return value.startsWith("sk-") || value.startsWith("sk_");
}
