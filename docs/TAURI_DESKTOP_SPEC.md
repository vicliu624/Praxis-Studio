# Tauri Desktop Spec

Praxis Studio 桌面版采用 Tauri + Web UI + TypeScript Runtime。

Rust Host 负责权限、文件系统、受控命令和进程管理。TypeScript Runtime 负责 Development Graph、Model Router、Context Builder、Tool Registry、Trace Recorder 和 Local Knowledge。

## Online Update

Online Update 是 Desktop shell 的发布能力，不属于 Project Memory、Development Graph、Agent Runtime 或 `.distinction` 运行态。

边界：

```text
App version fact
  来自 Tauri app version / Rust host。

Release source adapter
  使用 GitHub Release 中的 latest.json。

User consent
  Settings 页面显式检查更新；发现新版本后用户确认安装。

Install executor
  Tauri updater plugin 下载、签名校验、安装并重启。

Project Memory
  不记录应用更新状态；应用更新不是项目事实。
```

当前配置：

```text
Endpoint:
  https://github.com/vicliu624/Praxis-Studio/releases/latest/download/latest.json

Tauri plugins:
  tauri-plugin-updater
  tauri-plugin-process
  tauri-plugin-dialog

Capabilities:
  updater:default
  process:default
  dialog:default

Windows install mode:
  passive
```

发布约束：

```text
Tauri updater 必须使用签名更新，不能关闭签名校验。
公钥写入 apps/studio-desktop/src-tauri/tauri.conf.json。
私钥必须只存在于发布者机器或 GitHub Actions secrets。
GitHub Release 必须包含 latest.json 和对应平台的安装包 / updater artifacts / signature。
```

当前 GitHub Actions workflow：

```text
.github/workflows/publish-desktop.yml
```

它在 `app-v*` tag 或手动触发时构建 Windows 桌面 release，并让 `tauri-apps/tauri-action` 上传 updater `latest.json`。

需要配置的 GitHub Secrets：

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

如果本地生成的是无密码私钥，`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 可以留空；生产发布建议使用带密码的私钥并安全备份。
