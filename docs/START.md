# Praxis Studio Start Guide

这份文档说明如何在当前仓库中启动和使用 Praxis Studio。

它不是产品理念文档，也不是完整规格。它只回答三个问题：

```text
1. 怎么把项目跑起来？
2. 当前最稳定的使用路径是什么？
3. 下一步应该做什么？
```

如果你只是想先把 Praxis Studio 的界面打开，直接看下一节。

当前推荐入口顺序是：

```text
Desktop shell
  先打开 Praxis Studio 软件界面

Foundation CLI pipeline
  用来准备 .distinction 数据、验证项目智能主链路

MCP Server
  让外部 IDE / Agent 读取 Praxis 项目智能，并走受治理的任务 / 结果闭环
```

---

## 0. 最短路径：启动 Praxis Studio 界面

在仓库根目录执行：

```powershell
npm install
rustup default stable-x86_64-pc-windows-msvc
cargo --version
rustc --version
npm run doctor:desktop
npm run tauri:dev
```

这会启动完整的 Tauri Desktop 窗口，也就是 Praxis Studio 的软件界面。

你应该看到一个标题为 `Praxis Studio` 的桌面窗口。第一次启动可能会比较慢，因为它会先构建 workspace packages、构建 `runtime-cli`，再启动 Tauri。

如果 `rustup`、`cargo` 或 `rustc` 任意一个命令不存在，说明还没有安装 Rust / Cargo。先按下面的 Windows Rust 安装步骤处理，再回到这组完整指令。

注意：`npm run tauri:dev` 是开发启动，主要用于打开本地开发窗口；它不是“打包生成安装程序”的命令。如果你要找 `.exe`、`.msi` 或安装包，请看下面的“Desktop 构建产物在哪里”。

`npm run doctor:desktop` 是 Desktop 启动预检。它会检查：

```text
Node.js
npm
cargo
rustc
Rust MSVC toolchain
runtime-cli build
Tauri Rust project
```

如果预检失败，先按它输出的 `fix:` 修复，再重新打开一个终端运行：

```powershell
npm run doctor:desktop
npm run tauri:dev
```

启动后可以这样使用：

```text
1. 点击首页的 Open Existing Project / 打开已有项目。
2. 选择一个真实仓库目录，例如当前 Praxis-Studio 仓库。
3. 进入 Project Intake / 项目接入，运行扫描和接入评审。
4. 顶部导航可以切换到 Review Queue / 评审队列。
5. 顶部导航可以切换到 Projection Inspector / 投影检查器。
6. Projection Inspector 中可以点击图谱节点、边或 annotation，再构建 ContextPacket。
```

如果只是想看前端页面，不启动 Tauri 壳，可以运行：

```powershell
npm run dev:desktop
```

然后打开：

```text
http://localhost:1420
```

但这个浏览器模式只是前端预览。很多真实功能依赖 Tauri bridge，例如选择目录、调用 `runtime-cli`、读取 `.distinction` 文件，所以正式使用请优先运行：

```powershell
npm run tauri:dev
```

常见启动问题：

```text
如果提示找不到 Rust / cargo：
  说明当前终端找不到 cargo。安装 Rust toolchain，然后关闭并重新打开终端。

如果 Windows 提示 WebView2 相关错误：
  安装或修复 Microsoft Edge WebView2 Runtime。

如果 Windows 提示 linker / cl.exe / MSVC 相关错误：
  安装 Microsoft C++ Build Tools，并选择 Desktop development with C++。

如果提示 index.crates.io / config.json / schannel / SSL connect error：
  说明 Cargo 已经能运行，但无法连接 crates.io 下载 Rust 依赖。
  配置网络代理、VPN，或配置 Cargo registry mirror 后重试。

如果提示 runtime-cli is not built：
  先运行 npm run build -w @praxis/runtime-cli，或直接运行 npm run tauri:dev。

如果 1420 端口被占用：
  关闭占用该端口的进程后重新运行 npm run tauri:dev。
```

### 0.1 Windows 上安装 Rust / Cargo

如果你看到这个错误：

```text
failed to run 'cargo metadata' command
program not found
```

意思是：Tauri 已经开始启动 Rust 后端，但系统里没有 `cargo`，或者 `cargo` 没有进入当前终端的 `PATH`。

在 Windows 上推荐用 `winget` 安装 Rustup：

```powershell
winget install --id Rustlang.Rustup -e
```

安装完成后，关闭当前 PowerShell / Terminal，重新打开一个新的终端，然后执行：

```powershell
npm install
rustup default stable-x86_64-pc-windows-msvc
cargo --version
rustc --version
npm run doctor:desktop
npm run tauri:dev
```

如果 `cargo --version` 仍然提示找不到命令，检查这个目录是否存在：

```powershell
$env:USERPROFILE\.cargo\bin
```

并确认它在用户 `PATH` 中。Rustup 默认会把这个目录加入 `PATH`，但已经打开的旧终端不会自动刷新环境变量。

### 0.2 Windows 上安装 Tauri 所需系统依赖

完整 Tauri Desktop 还需要 Windows 原生编译和 WebView 依赖：

```text
Microsoft C++ Build Tools
Microsoft Edge WebView2 Runtime
```

通常最稳的做法是安装 Visual Studio Build Tools，并选择：

```text
Desktop development with C++
MSVC compiler
Windows SDK
```

然后安装或修复 WebView2 Runtime。

安装这些系统依赖后，也要关闭当前终端并重新打开，再运行：

```powershell
npm run doctor:desktop
npm run tauri:dev
```

官方参考：

```text
Tauri v2 prerequisites:
https://v2.tauri.app/start/prerequisites/

Rust install:
https://www.rust-lang.org/tools/install
```

### 0.3 Cargo 无法访问 crates.io 时怎么办

如果 `npm run tauri:dev` 卡在这里：

```text
Updating crates.io index
failed to download from `https://index.crates.io/config.json`
[35] SSL connect error (schannel: failed to receive handshake, SSL/TLS connection failed)
```

说明现在已经过了 Node / Vite / TypeScript 构建，失败点是 Cargo 下载 Rust 依赖。Tauri 的 Rust 端依赖 `serde`、`tauri`、`tauri-build` 等 crate，第一次构建必须能访问 Cargo registry。

先单独验证 Cargo 拉依赖：

```powershell
cargo fetch --manifest-path apps/studio-desktop/src-tauri/Cargo.toml --locked
```

如果这里仍然报 `index.crates.io` 或 `schannel`，选择下面任一方案。

方案 A：使用你的代理 / VPN。

如果你有本地 HTTP 代理，例如 `127.0.0.1:7890`，可以在当前 PowerShell 里临时设置：

```powershell
$env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:HTTP_PROXY="http://127.0.0.1:7890"
cargo fetch --manifest-path apps/studio-desktop/src-tauri/Cargo.toml --locked
npm run tauri:dev
```

方案 B：配置 Cargo registry mirror。

例如使用 USTC sparse mirror：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.cargo" | Out-Null
@'
[source.crates-io]
replace-with = "ustc"

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"
'@ | Set-Content -Encoding utf8 "$env:USERPROFILE\.cargo\config.toml"

cargo fetch --manifest-path apps/studio-desktop/src-tauri/Cargo.toml --locked
npm run tauri:dev
```

如果你更适合使用公司内网 mirror，也可以把上面的 `source.ustc.registry` 换成公司提供的 Cargo sparse registry 地址。

注意：不要把个人代理或 mirror 配置提交到仓库。这里建议写入的是用户目录：

```text
%USERPROFILE%\.cargo\config.toml
```

不是项目目录。

---

## 1. 前置要求

最低要求：

```text
Node.js >= 20
npm
```

如果要启动 Tauri 桌面应用，还需要：

```text
Rust toolchain
Tauri v2 所需的系统依赖
Windows 上通常还需要 WebView2 Runtime
```

如果只跑 CLI、schema、smoke、MCP Foundation server，不需要先启动桌面应用。

如果要打开真正的软件界面，需要 Tauri 桌面环境；单独的 Vite Web UI 只能作为前端预览。

---

## 2. 安装依赖

在仓库根目录执行：

```powershell
npm install
```

然后构建所有 package 和 app：

```powershell
npm run build
```

如果只想检查类型：

```powershell
npm run typecheck
```

如果想跑当前 Foundation backbone 的完整 smoke：

```powershell
npm run smoke
```

这个 smoke 会覆盖：

```text
self intake
native projection
CodeGraphProvider
CodeGraph multilanguage fixture
ProjectedGraphView
ContextPacket
MCP Foundation server
Foundation Release smoke
```

---

## 3. 当前最稳定路径：Foundation CLI Pipeline

当前最可靠的 Praxis 使用方式，是从真实项目或当前仓库跑一条完整的 repository intelligence pipeline。

在开发环境中，最稳定的 CLI 调用方式是：

```powershell
node apps/runtime-cli/dist/index.js <command>
```

打包或安装成 bin 之后，等价入口是：

```powershell
praxis-runtime <command>
```

### 3.1 跑当前仓库的 intake

```powershell
node apps/runtime-cli/dist/index.js intake --root . --provider native
```

这会写入 review cache：

```text
.distinction/cache/repository-snapshot.json
.distinction/cache/code-fact-graph.json
.distinction/cache/project-profile.json
.distinction/cache/repository-understanding-patch.json
.distinction/cache/architecture-model-patch.json
.distinction/cache/architecture-findings.json
```

注意：`intake` 默认是 review-only。它不会直接把观察写成 durable memory。

### 3.2 接受仓库 FACT memory

```powershell
node apps/runtime-cli/dist/index.js accept-understanding --root .
```

这会把 `RepositoryUnderstandingPatch` 中被接受的 FACT 写入：

```text
.distinction/memory/facts.jsonl
```

### 3.3 构建架构模型 patch

```powershell
node apps/runtime-cli/dist/index.js model-architecture --root .
```

输出：

```text
.distinction/cache/architecture-model-patch.json
```

### 3.4 检测 architecture findings

```powershell
node apps/runtime-cli/dist/index.js detect-findings --root .
```

输出：

```text
.distinction/cache/architecture-findings.json
```

### 3.5 生成投影视图

生成架构依赖视图：

```powershell
node apps/runtime-cli/dist/index.js project:view architecture --root .
```

这会同时写入旧兼容视图和统一图谱视图：

```text
.distinction/views/architecture/dependency-view.json
.distinction/views/architecture/architecture-graph-view.json
```

生成统一 CodeFact graph view：

```powershell
node apps/runtime-cli/dist/index.js project:view code-facts --root .
```

生成统一 Finding graph view：

```powershell
node apps/runtime-cli/dist/index.js project:view findings --root .
```

生成 memory / trace / task graph view：

```powershell
node apps/runtime-cli/dist/index.js project:view memory --root .
node apps/runtime-cli/dist/index.js project:view trace --root .
node apps/runtime-cli/dist/index.js project:view tasks --root .
```

主要输出：

```text
.distinction/views/architecture/dependency-view.json
.distinction/views/architecture/architecture-graph-view.json
.distinction/views/code/code-fact-view.json
.distinction/views/findings/finding-view.json
.distinction/views/memory/memory-view.json
.distinction/views/trace/trace-view.json
.distinction/views/project-plan/task-view.json
.distinction/cache/projection-manifest.json
```

### 3.6 构建 ContextPacket

先从 finding cache 中取一个 finding id。

PowerShell 示例：

```powershell
$findingId = (Get-Content .distinction/cache/architecture-findings.json -Raw | ConvertFrom-Json).findings[0].id
node apps/runtime-cli/dist/index.js context-packet --root . --anchor $findingId --purpose explain --write-cache
```

输出：

```text
.distinction/cache/context-packet.json
```

如果要把最近的 `ContextPacket` 也投影成统一 graph view：

```powershell
node apps/runtime-cli/dist/index.js project:view context --root .
```

输出：

```text
.distinction/views/context/context-view.json
```

`ContextPacket` 是 Praxis 给 Desktop、MCP、Agent Runtime 和外部 Agent 共用的上下文单位。不要让各入口自己拼上下文。

---

## 4. 使用 CodeGraphProvider

默认 provider 是 `native`，它适合稳定验证基础链路：

```powershell
node apps/runtime-cli/dist/index.js code-facts --root . --provider native --write-cache
```

如果要使用 CodeGraphProvider：

```powershell
node apps/runtime-cli/dist/index.js code-facts --root . --provider codegraph --write-cache
```

也可以直接在 intake 中使用：

```powershell
node apps/runtime-cli/dist/index.js intake --root . --provider codegraph
```

当前 CodeGraphProvider 的定位：

```text
正式 code fact provider
输出 CodeFactGraphSnapshot
只写 .distinction/cache/code-fact-graph.json
不直接写 memory / models / views
```

---

## 5. 启动 MCP Server

MCP Server 是 Praxis 的外部 Agent / IDE 入口。它不是 Desktop UI 的附属功能，也不是 Agent Runtime 的替代品。

启动命令：

```powershell
node apps/runtime-cli/dist/index.js serve --mcp --path .
```

等价产品命令：

```powershell
praxis-runtime serve --mcp --path .
```

当前 MCP Server 是 Foundation MVP。它默认不编辑源码、不确认 memory、不改 confirmed model；写入类工具只生成受治理的 Praxis artifacts，例如 `PlanPatch`、`CodingAgentTask`、`ExternalAgentResult` 和 trace。

开放工具：

```text
praxis_status
praxis_project_profile
praxis_code_facts
praxis_callers
praxis_callees
praxis_impact
praxis_findings
praxis_finding_audit
praxis_projection_views
praxis_context_packet
praxis_explain_anchor
praxis_plan_from_finding
praxis_generate_task
praxis_record_external_result
```

这些工具会读取 `.distinction` 中的 cache / views / memory，并通过 `@praxis/schema` 校验输入和输出。治理类工具会写入 `.distinction/cache`、`.distinction/tasks`、`.distinction/reports` 或 `.distinction/memory/traces.jsonl`，但不会直接修改用户源码。

### 5.1 接受外部 Agent 结果

外部 Agent 通过 MCP 写入 `ExternalAgentResult` 后，Praxis 仍然不会自动确认 memory 或 finding 状态。需要显式接受结果进入治理 review 边界：

```powershell
node apps/runtime-cli/dist/index.js accept-external-result --root . --result <external-result-id-or-path>
```

这个命令会：

```text
读取 ExternalAgentResult
校验 ExternalAgentResultSchema
把 MemorySuggestionPatch 写入 .distinction/cache/memory-suggestions/
把 FindingStatusPatch 写入 .distinction/cache/finding-status-patches/
追加 TraceRecord 到 .distinction/memory/traces.jsonl
不直接写 confirmed memory
不直接修改源码
```

随后用户可以显式接受某个 memory 建议：

```powershell
node apps/runtime-cli/dist/index.js accept-memory-suggestion --root . --suggestion <memory-suggestion-patch-id-or-path>
```

这个命令会：

```text
校验 MemorySuggestionPatchSchema
把其中的 proposed MemoryPatch 转成 CONFIRMED + active MemoryRecord
写入 .distinction/memory/confirmations.jsonl
追加 TraceRecord 到 .distinction/memory/traces.jsonl
保留 user_confirmation evidence
不直接修改源码
不直接修改 confirmed model
```

随后用户可以显式接受某个 finding 状态建议：

```powershell
node apps/runtime-cli/dist/index.js accept-finding-status --root . --patch <finding-status-patch-id-or-path>
```

这个命令会：

```text
校验 FindingStatusPatchSchema
更新 .distinction/cache/architecture-findings.json 中对应 finding 的状态
写入 .distinction/memory/findings.jsonl 作为 CONFIRMED finding status memory
追加 TraceRecord
重跑 detector
用新的 detector 结果和已接受状态做 reconciliation
```

### 5.2 MCP 客户端配置示例

不同 MCP 客户端的配置文件格式不同，但核心都是 command + args。

示例：

```json
{
  "command": "node",
  "args": [
    "C:/Users/vicliu/Projects/Praxis-Studio/apps/runtime-cli/dist/index.js",
    "serve",
    "--mcp",
    "--path",
    "C:/Users/vicliu/Projects/Praxis-Studio"
  ]
}
```

使用前建议先跑：

```powershell
npm run build
node apps/runtime-cli/dist/index.js intake --root . --provider native
node apps/runtime-cli/dist/index.js accept-understanding --root .
node apps/runtime-cli/dist/index.js model-architecture --root .
node apps/runtime-cli/dist/index.js detect-findings --root .
node apps/runtime-cli/dist/index.js project:view architecture --root .
node apps/runtime-cli/dist/index.js project:view code-facts --root .
node apps/runtime-cli/dist/index.js project:view findings --root .
node apps/runtime-cli/dist/index.js project:view memory --root .
```

否则 MCP Server 可以启动，但部分工具会提示缺少 cache 或 projection。

---

## 6. 启动 Desktop 界面

当前 Desktop 是 Praxis 的桌面壳和工作区入口。要打开软件界面，推荐使用 Tauri Desktop，而不是只启动浏览器预览。

### 6.1 先做 Desktop 预检

完整启动指令是：

```powershell
rustup default stable-x86_64-pc-windows-msvc
cargo --version
rustc --version
npm run doctor:desktop
npm run tauri:dev
```

其中：

```text
rustup default stable-x86_64-pc-windows-msvc
  选择 Windows Tauri 推荐的 MSVC Rust toolchain。

cargo --version / rustc --version
  确认 Cargo 和 Rust compiler 已经进入当前终端 PATH。

npm run doctor:desktop
  检查 Desktop 所需前置条件。

npm run tauri:dev
  构建 packages、构建 runtime-cli，并打开 Tauri Desktop 窗口。
```

如果看到 `[missing] Cargo` 或 `[missing] rustc`，不要继续跑 `tauri:dev`，先安装 Rust / Cargo。

### 6.2 打开完整桌面软件

```powershell
npm run tauri:dev
```

这条命令会：

```text
1. 构建 packages。
2. 构建 runtime-cli。
3. 启动 Vite dev server。
4. 打开 Tauri 桌面窗口。
```

打开窗口后，首页最重要的入口是：

```text
Open Existing Project / 打开已有项目
Create New Project / 创建新项目
Review Queue / 评审队列
Projection Inspector / 投影检查器
Model Settings / 模型设置
```

### 6.2.1 配置 DeepSeek Key

进入顶部导航的 `Model Settings / 模型设置`，填写：

```text
DeepSeek Base URL
DeepSeek API Key
各类任务使用的模型名
```

点击 `Save Model Settings / 保存模型设置` 后，Desktop 会把配置写入统一配置文件：

```text
C:\Users\<你的用户名>\.praxis-studio\model-settings.json
```

在当前机器上通常就是：

```text
C:\Users\vicliu\.praxis-studio\model-settings.json
```

这个文件是 IDE 级配置，不会写入项目的 `.distinction`，也不要提交到 Git。

如果你想确认配置是否存在，可以运行：

```powershell
Test-Path "$env:USERPROFILE\.praxis-studio\model-settings.json"
```

如果要在命令行直接跑 `runtime-cli`，现在 runtime 会按这个顺序读取模型配置：

```text
1. PRAXIS_MODEL_SETTINGS_JSON 环境变量
2. PRAXIS_MODEL_SETTINGS_PATH 指向的 JSON 文件
3. %USERPROFILE%\.praxis-studio\model-settings.json
4. DEEPSEEK_API_KEY 环境变量
```

也就是说，Desktop、Agent 会话、外部 Agent 和直接运行的 CLI 都应该共享同一份模型配置。

如果你不想把 key 写进配置文件，也可以只在当前 PowerShell 会话临时设置：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
npm run tauri:dev
```

### 6.3 只启动浏览器预览

如果只是改前端样式或检查 React 页面，可以运行：

```powershell
npm run dev:desktop
```

然后在浏览器打开：

```text
http://localhost:1420
```

注意：浏览器预览没有完整 Tauri bridge。`Open Existing Project`、runtime 命令、`.distinction` 文件读取等真实功能可能不可用。

### 6.4 Desktop 读取哪些 Foundation 数据

Desktop 顶部导航中的 `评审队列 / Review Queue` 会读取当前项目的治理 artifacts：

```text
.distinction/cache/memory-suggestions/*.json
.distinction/cache/finding-status-patches/*.json
.distinction/memory/traces.jsonl
```

它内部调用的是同一组 Runtime CLI 边界：

```powershell
node apps/runtime-cli/dist/index.js review-queue --root .
node apps/runtime-cli/dist/index.js finding-audit --root .
node apps/runtime-cli/dist/index.js accept-memory-suggestion --root . --suggestion <id>
node apps/runtime-cli/dist/index.js accept-finding-status --root . --patch <id>
```

所以 Desktop 只是治理 adapter，不会绕过 `MemorySuggestionPatchSchema`、`FindingStatusPatchSchema` 或 trace。
其中 `finding-audit` 会把 `.distinction/cache/architecture-findings.json`、`.distinction/cache/finding-status-patches/`、`.distinction/memory/findings.jsonl` 和 `.distinction/memory/traces.jsonl` 合并成状态历史，用来解释 finding 是仍然被 detector 检测到、已经消失，还是处于历史确认状态。
同一份 audit 也通过 MCP 只读工具 `praxis_finding_audit` 暴露给外部 IDE / Agent；它只读取审计链，不接受、不修改、不重跑 detector。

Desktop 顶部导航中的 `投影检查器 / Projection Inspector` 会读取 Foundation Projection System：

```text
.distinction/cache/projection-manifest.json
.distinction/views/**/*.json
.distinction/cache/context-packet.json
```

它会：

```text
读取 schema-valid ProjectedGraphView
显示 architecture / code-fact / finding / memory / trace / task graph
点击 node / edge / annotation 后显示 GraphAnchor
按 GraphAnchor 调用 context-packet
展示 ContextPacket 的 code facts / findings / memory / projection refs
对 finding anchor 额外展示 finding-audit 摘要
```

这个页面仍然只是 Desktop adapter。它不重新生成项目理解、不写 confirmed memory、不直接改源码；它把 Projection + ContextPacket 作为交互入口。

### 6.5 构建桌面安装包 / 可执行文件

如果你要生成真正的桌面可执行文件或安装包，在 Windows 上推荐运行：

```powershell
npm run package:desktop:windows
```

这个命令会自动加载 Visual Studio x64 C++ 编译环境，再调用 Tauri release build。

如果你已经在 `Developer PowerShell for VS 2022` 或 `x64 Native Tools Command Prompt for VS 2022` 里，也可以运行通用命令：

```powershell
npm run package:desktop
```

等价命令：

```powershell
npm run tauri:build
```

注意几个命令的区别：

```text
npm run build
  构建 packages、runtime-cli 和 Web 前端 dist。
  这不会生成桌面 .exe / .msi 安装包。

npm run tauri:dev
  启动 Tauri 开发窗口。
  用于本地开发和调试，不是发布产物命令。

npm run package:desktop
  构建 Tauri release，并生成桌面可执行文件 / 安装包。

npm run package:desktop:windows
  Windows 专用打包入口。会先加载 vcvars64.bat，避免 link.exe 不在 PATH 导致打包失败。
```

### 6.6 Desktop 构建产物在哪里

Web 前端产物在：

```text
apps/studio-desktop/dist/
```

这里会有：

```text
index.html
assets/*.js
assets/*.css
```

这只是浏览器前端产物，不是桌面可执行文件。

Tauri Desktop 的 Rust 构建产物在：

```text
apps/studio-desktop/src-tauri/target/
```

开发构建可能在：

```text
apps/studio-desktop/src-tauri/target/debug/praxis-studio.exe
```

release 可执行文件通常在：

```text
apps/studio-desktop/src-tauri/target/release/praxis-studio.exe
```

安装包 / bundle 通常在：

```text
apps/studio-desktop/src-tauri/target/release/bundle/
```

Windows 上常见子目录包括：

```text
apps/studio-desktop/src-tauri/target/release/bundle/msi/
apps/studio-desktop/src-tauri/target/release/bundle/nsis/
```

文件名一般会包含产品名和版本，例如：

```text
Praxis Studio_0.1.0_x64_en-US.msi
Praxis Studio_0.1.0_x64-setup.exe
```

如果你没有看到 `apps/studio-desktop/src-tauri/target/`，说明 Tauri Rust 部分还没有成功构建。先运行：

```powershell
npm run doctor:desktop
npm run package:desktop:windows
```

然后用 PowerShell 查找产物：

```powershell
Get-ChildItem apps/studio-desktop/src-tauri/target -Recurse -File -Include *.exe,*.msi
```

如果 Tauri 启动失败，优先确认：

```text
Rust toolchain 是否安装
Tauri 系统依赖是否安装
Windows WebView2 Runtime 是否可用
```

---

## 7. 常用验证命令

只验证 schema fixtures：

```powershell
npm run test:schemas
```

只验证 native intake -> projection：

```powershell
npm run smoke:native-projection
```

只验证 CodeGraphProvider：

```powershell
npm run smoke:codegraph-provider
npm run smoke:codegraph-multilanguage
```

只验证 ContextPacket：

```powershell
npm run smoke:context-packet
```

只验证 MCP Foundation server：

```powershell
npm run smoke:mcp-readonly
npm run smoke:mcp-foundation
```

只验证 Foundation Release 主链路：

```powershell
npm run smoke:foundation
```

完整验证：

```powershell
npm run smoke
```

---

## 8. 当前能力边界

已经可以稳定使用：

```text
Repository scan
CodeFactGraph native provider
CodeGraphProvider
RepositoryUnderstandingPatch
accepted FACT memory
ArchitectureModelPatch
ArchitectureFindingReport
ProjectedGraphView: code-facts / findings
ProjectedGraphView: architecture / memory / trace / task_plan / context
ArchitectureDependencyView legacy-compatible output
ContextPacket
MCP Foundation tools
MCP read-only finding audit
governed PlanPatch / CodingAgentTask / ExternalAgentResult artifacts
Desktop Review Queue for MemorySuggestionPatch / FindingStatusPatch
Desktop Projection Inspector for ProjectedGraphView anchors
schema + Zod + fixture + round-trip
smoke suite
```

仍然不要误用：

```text
不要把 Desktop 当成当前唯一真相入口。
不要让 MCP 直接写 confirmed memory。
不要让外部 Agent 直接修改 source code 并绕过 Praxis trace。
不要把 legacy DevelopmentGraph 和 v0.1 ProjectionEngine 混成同一个 graph。
不要把 .distinction/cache 当成 durable authority。
```

---

## 9. 下一步评估

### 9.1 当前阶段判断

Praxis 现在已经从“能跑的 pipeline”进入了“Foundation backbone”：

```text
CodeGraphProvider
  -> CodeFactGraphSnapshot
  -> RepositoryUnderstandingPatch
  -> FACT memory
  -> ArchitectureModelPatch
  -> FindingReport
  -> ProjectedGraphView
  -> ContextPacket
  -> MCP Foundation tools
  -> governed task/result artifacts
```

这条链路已经具备 schema、Zod、fixture、round-trip 和 smoke 保护。

### 9.2 最应该优先做

第一优先级是把 governed review / accept 边界接到 Desktop 和更细的状态机。

建议顺序：

```text
1. detector rerun 后更明确展示 reopened / still mitigated / disappeared 三类状态
2. ProjectionManifest invalidation policy
3. Desktop Projection Inspector 接入更细的 source diff / projection stale explanation
4. Desktop Review Queue 与 Projection Inspector 互相跳转 finding anchor
5. MCP finding-audit 与 Desktop audit 共享更多筛选 / 导出能力
```

原因：

```text
外部 Agent 已经能通过 MCP 读 ContextPacket、生成受控任务、回写 external result。
Praxis 现在也能显式接受 external result、memory suggestion 和 finding status patch。
下一步不是让它直接改 source 或 confirmed model。
下一步是把 detector reconciliation 的状态解释进一步细化，并让 review queue、projection inspector 和 ContextPacket 在 finding anchor 上形成可跳转闭环。
```

### 9.3 第二优先级

Desktop 已经开始接到 Foundation backbone：

```text
读取 .distinction/cache/projection-manifest.json
显示 ProjectedGraphView
点击 graph anchor
调用 context-packet
展示 findings 和 ContextPacket
```

原因：

```text
Desktop 不应该重新发明项目理解。
Desktop 应该继续成为 Projection + ContextPacket 的交互界面，并逐步补齐 anchor 跳转、source diff 和 stale explanation。
```

### 9.4 第三优先级

继续补 Unified Projection System 的工程细节：

```text
ProjectionManifest invalidation policy
projection stale / fresh / failed 状态更细化
projection source diff / explain
architecture legacy dependency-view 逐步降级为兼容输出
```

原因：

```text
现在 architecture / code-facts / findings / memory / trace / task / context 都已经进入 ProjectedGraphView。
下一步要补的是失效策略、解释能力和 UI 使用方式。
```

### 9.5 暂时不要优先做

```text
不要先做复杂 AI 自动修复。
不要先扩高级 detector。
不要先做完整 Agent Runtime polish。
不要先做新项目 Wizard 的深水区。
不要把 MCP 写入工具做成 source editing bypass。
```

Foundation Release 的下一步主题应该是：

```text
从 governed external-agent artifacts
推进到 reviewable governance state transition
```

也就是：

```text
ContextPacket
  -> CodingAgentTask
  -> ExternalAgentResult
  -> Trace / Patch / Finding status suggestion
  -> User review
  -> Memory / Model / Projection update
```
