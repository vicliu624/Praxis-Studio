import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distRoot = join(repoRoot, "apps", "studio-desktop", "dist");
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key.replace(/^--/, ""), rest.join("=") || "true"];
}));
const port = Number(args.get("port") ?? 4180);
const projectRoot = resolve(args.get("project-root") ?? repoRoot);
const projectName = projectRoot.split(/[\\/]/).filter(Boolean).pop() ?? "Project";

if (!existsSync(join(distRoot, "index.html"))) {
  console.error(`Desktop dist was not found at ${distRoot}. Run npm run build -w @praxis/studio-desktop first.`);
  process.exit(1);
}

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/__praxis_file") {
      const relativePath = url.searchParams.get("path") ?? "";
      const fullPath = safeProjectPath(projectRoot, relativePath);
      const text = readFileSync(fullPath, "utf8");
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end(text);
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(renderMockedIndex());
      return;
    }
    const assetPath = safeDistPath(url.pathname.replace(/^\//, ""));
    if (statSync(assetPath).isFile()) {
      response.writeHead(200, { "Content-Type": contentType(assetPath), "Cache-Control": "no-store" });
      response.end(readFileSync(assetPath));
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
      return;
    }
    response.destroy(error instanceof Error ? error : new Error(String(error)));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Praxis UI preview mock server listening on http://127.0.0.1:${port}`);
  console.log(`Project root: ${projectRoot}`);
});

function renderMockedIndex() {
  const indexHtml = readFileSync(join(distRoot, "index.html"), "utf8");
  return indexHtml.replace("<script type=\"module\"", `${mockScript()}\n  <script type="module"`);
}

function mockScript() {
  return `<script>
(() => {
  const projectRoot = ${JSON.stringify(projectRoot)};
  const projectName = ${JSON.stringify(projectName)};
  const recent = [{ root: projectRoot, name: projectName, lastOpenedAt: new Date().toISOString() }];
  const callbacks = new Map();
  let callbackId = 1;
  window.__TAURI_INTERNALS__ = {
    callbacks,
    metadata: { windows: [{ label: "main" }], currentWindow: { label: "main" } },
    transformCallback(callback, once) {
      const id = callbackId++;
      callbacks.set(id, { callback, once: Boolean(once) });
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    runCallback(id, payload) {
      const record = callbacks.get(id);
      if (!record) return;
      record.callback(payload);
      if (record.once) callbacks.delete(id);
    },
    convertFileSrc(filePath) {
      return String(filePath || "");
    },
    async invoke(command, args = {}) {
      if (command === "read_recent_projects" || command === "write_recent_project") return JSON.stringify(recent);
      if (command === "read_app_model_settings") return "{}";
      if (command === "read_app_model_settings_path") return "mock://model-settings.json";
      if (command === "read_project_file") {
        return await fetch("/__praxis_file?path=" + encodeURIComponent(args.relativePath || ""), { cache: "no-store" }).then((res) => {
          if (!res.ok) throw new Error("read_project_file failed: " + res.status);
          return res.text();
        });
      }
      if (command === "read_project_distinction_file") {
        const path = String(args.relativePath || "");
        if (path.endsWith("/nodes.json") || path.endsWith("\\\\nodes.json")) return "[]";
        if (path.endsWith("/edges.json") || path.endsWith("\\\\edges.json")) return "[]";
        return "{}";
      }
      if (command === "run_runtime_command") {
        return JSON.stringify({ ok: true, mocked: true });
      }
      if (command === "run_runtime_command_async") {
        return JSON.stringify({ ok: true, pid: 0, mocked: true });
      }
      if (command === "open_project_dialog") return projectRoot;
      if (command === "open_project_file_with") return null;
      throw new Error("Unmocked Tauri command: " + command);
    }
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function visibleText(element) {
    return (element.textContent || "").replace(/\\s+/g, " ").trim();
  }
  function clickButtonByText(text) {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) => visibleText(candidate).includes(text));
    if (button) button.click();
    return Boolean(button);
  }
  function clickTreeToggles() {
    const toggles = Array.from(document.querySelectorAll("button.engineering-tree-toggle, .engineering-tree-toggle"));
    let clicked = 0;
    for (const toggle of toggles) {
      if (visibleText(toggle) === "+" && !toggle.disabled) {
        toggle.click();
        clicked += 1;
      }
    }
    return clicked;
  }
  async function expandAllTreeLevels() {
    for (let index = 0; index < 8; index += 1) {
      const clicked = clickTreeToggles();
      if (!clicked) return;
      await sleep(250);
    }
  }
  async function clickButtonContaining(text) {
    const target = String(text || "").trim();
    if (!target) return false;
    const start = Date.now();
    while (Date.now() - start < 10000) {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => visibleText(candidate).includes(target));
      if (button) {
        button.scrollIntoView({ block: "center", inline: "nearest" });
        await sleep(100);
        button.click();
        return true;
      }
      await sleep(150);
    }
    return false;
  }
  async function waitFor(selector, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await sleep(100);
    }
    return null;
  }
  async function autoNavigate() {
    const params = new URLSearchParams(window.location.search);
    const route = params.get("route");
    if (!route) return;
    await waitFor(".recent-project");
    document.querySelector(".recent-project")?.click();
    await sleep(700);
    const labels = {
      "model-explorer": "Model Explorer",
      "design-explorer": "Design Explorer",
      "engineering-explorer": "Engineering Explorer",
      "architecture-explorer": "Architecture Explorer"
    };
    clickButtonByText(labels[route] || route);
    await sleep(2500);
    if (params.get("expandTree") === "1") {
      await expandAllTreeLevels();
    }
    const openText = params.get("openText");
    if (openText) {
      await clickButtonContaining(openText);
      await sleep(2500);
    }
    if (params.get("scrollToC4") === "1") {
      document.querySelector(".c4-layer-viewer")?.scrollIntoView({ block: "start", inline: "nearest" });
      await sleep(800);
    }
    window.__PRAXIS_PREVIEW_READY__ = true;
  }
  window.addEventListener("load", () => { void autoNavigate(); });
})();
</script>`;
}

function safeProjectPath(root, relativePath) {
  if (!relativePath || relativePath.includes("\0")) throw new Error("Invalid project path.");
  const target = resolve(root, normalize(relativePath));
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (target !== root && !target.startsWith(rootWithSep)) throw new Error("Project path escapes root.");
  return target;
}

function safeDistPath(relativePath) {
  if (!relativePath || relativePath.includes("\0")) throw new Error("Invalid dist path.");
  const target = resolve(distRoot, normalize(relativePath));
  const distWithSep = distRoot.endsWith(sep) ? distRoot : `${distRoot}${sep}`;
  if (target !== distRoot && !target.startsWith(distWithSep)) throw new Error("Dist path escapes root.");
  return target;
}

function contentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".ico") return "image/x-icon";
  return "application/octet-stream";
}
