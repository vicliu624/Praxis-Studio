import { useEffect, useState } from "react";
import {
  defaultModelSettings,
  renderModelsYaml,
  saveProjectModelSettings,
  type ModelSettings
} from "../runtimeClient";

interface ModelSettingsPageProps {
  projectRoot: string;
}

const storageKey = "praxis-studio:model-settings";

export function ModelSettingsPage({ projectRoot }: ModelSettingsPageProps) {
  const [settings, setSettings] = useState<ModelSettings>(defaultModelSettings);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      setSettings({ ...defaultModelSettings, ...(JSON.parse(saved) as Partial<ModelSettings>) });
    } catch {
      setSettings(defaultModelSettings);
    }
  }, []);

  function update<K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setStatus("");
    setError("");
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    if (!projectRoot) {
      setStatus("Saved in this app session. Open or accept a project to write .distinction/models.yaml.");
      return;
    }
    try {
      await saveProjectModelSettings(projectRoot, settings);
      setStatus("Saved to .distinction/models.yaml.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Saved locally, but could not write project models.yaml outside Tauri.");
    }
  }

  const yaml = renderModelsYaml(settings);

  return (
    <section className="settings-layout" aria-labelledby="model-settings-title">
      <section className="panel settings-form">
        <p className="eyebrow">Model Settings</p>
        <h1 id="model-settings-title">DeepSeek Route</h1>
        <p className="muted-copy">
          Praxis stores the environment variable name, not the API key itself. Set the key before launching the app.
        </p>

        <div className="form-grid">
          <label htmlFor="default-provider">Default provider</label>
          <input id="default-provider" className="path-input" value={settings.defaultProvider} onChange={(event) => update("defaultProvider", event.target.value)} />

          <label htmlFor="base-url">DeepSeek base URL</label>
          <input id="base-url" className="path-input" value={settings.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} />

          <label htmlFor="api-key-env">API key environment variable</label>
          <input id="api-key-env" className="path-input" value={settings.apiKeyEnv} onChange={(event) => update("apiKeyEnv", event.target.value)} />

          <label htmlFor="intake-model">Project intake model</label>
          <input id="intake-model" className="path-input" value={settings.intakeModel} onChange={(event) => update("intakeModel", event.target.value)} />

          <label htmlFor="node-explain-model">Node explain model</label>
          <input id="node-explain-model" className="path-input" value={settings.nodeExplainModel} onChange={(event) => update("nodeExplainModel", event.target.value)} />

          <label htmlFor="edge-explain-model">Edge explain model</label>
          <input id="edge-explain-model" className="path-input" value={settings.edgeExplainModel} onChange={(event) => update("edgeExplainModel", event.target.value)} />

          <label htmlFor="edge-plan-model">Edge plan model</label>
          <input id="edge-plan-model" className="path-input" value={settings.edgePlanModel} onChange={(event) => update("edgePlanModel", event.target.value)} />

          <label htmlFor="task-model">Coding task model</label>
          <input id="task-model" className="path-input" value={settings.codingTaskModel} onChange={(event) => update("codingTaskModel", event.target.value)} />
        </div>

        <button className="primary-action full-width" type="button" onClick={save}>
          Save Model Settings
        </button>
        {status ? <p className="status-text">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel settings-preview">
        <div className="panel-heading">
          <h2>models.yaml Preview</h2>
          <span className="pill">{projectRoot ? ".distinction" : "Local only"}</span>
        </div>
        <pre className="agent-output">{yaml}</pre>
      </section>
    </section>
  );
}
