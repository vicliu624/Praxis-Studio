import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appDir = join(repoRoot, "apps", "studio-desktop");
const targetDir = join(appDir, "src-tauri", "target");
const platformName = platformArtifactName(process.platform);
const artifactRoot = join(repoRoot, "artifacts", "desktop", platformName);
const rawArgs = process.argv.slice(2);
const isDebug = rawArgs.includes("--debug");
const profile = isDebug ? "debug" : "release";
const profileDir = join(targetDir, profile);

const tauriArgs = ["build", ...rawArgs];
if (shouldDisableUpdaterArtifacts(rawArgs)) {
  tauriArgs.push("--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
}

console.log(`[praxis] Desktop Cargo target: ${targetDir}`);
console.log(`[praxis] Desktop artifacts: ${artifactRoot}`);

cleanStaleBundleArtifacts();

if (process.platform === "win32" && !hasWindowsMsvcToolchain()) {
  console.error("[praxis] Windows desktop packaging requires the Visual Studio C++ toolchain in PATH.");
  console.error("[praxis] Run `npm run package:desktop:windows` from the repository root so Praxis can load vcvars64.bat first.");
  process.exit(1);
}

const result = spawnTauri(tauriArgs);
const exitCode = result.status ?? 1;

if (exitCode === 0) {
  const copied = copyDesktopArtifacts();
  if (copied.length) {
    console.log(`[praxis] Copied ${copied.length} desktop artifact(s) into ${artifactRoot}`);
    for (const file of copied) console.log(`[praxis] artifact: ${file}`);
  }
} else {
  console.error(`[praxis] Tauri build failed with exit code ${exitCode}; skipping desktop artifact copy.`);
}

process.exit(exitCode);

function resolveTauriCommand() {
  const extension = process.platform === "win32" ? ".cmd" : "";
  const local = join(repoRoot, "node_modules", ".bin", `tauri${extension}`);
  if (existsSync(local)) return local;
  return `tauri${extension}`;
}

function spawnTauri(args) {
  const command = resolveTauriCommand();
  const spawnCommand = process.platform === "win32" ? "cmd.exe" : command;
  const spawnArgs = process.platform === "win32" ? ["/d", "/c", command, ...args] : args;
  return spawnSync(spawnCommand, spawnArgs, {
    cwd: appDir,
    env: {
      ...process.env,
      CARGO_TARGET_DIR: targetDir
    },
    stdio: "inherit",
    shell: false
  });
}

function shouldDisableUpdaterArtifacts(args) {
  if (args.includes("--config")) return false;
  if (process.env.CI) return false;
  return !process.env.TAURI_SIGNING_PRIVATE_KEY && !process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
}

function cleanStaleBundleArtifacts() {
  rmSync(join(profileDir, "bundle"), { recursive: true, force: true });
  rmSync(join(profileDir, "wix"), { recursive: true, force: true });
}

function copyDesktopArtifacts() {
  const copied = [];
  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(artifactRoot, { recursive: true });

  const executableName = process.platform === "win32" ? "praxis-studio.exe" : "praxis-studio";
  copyIfExists(join(profileDir, executableName), join(artifactRoot, executableName), copied);
  copyIfExists(join(profileDir, "bundle"), join(artifactRoot, "bundle"), copied);

  writeFileSync(
    join(artifactRoot, "manifest.json"),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      profile,
      platform: process.platform,
      cargoTargetDir: relative(repoRoot, targetDir).replace(/\\/g, "/"),
      sourceProfileDir: relative(repoRoot, profileDir).replace(/\\/g, "/"),
      artifacts: copied
    }, null, 2)}\n`,
    "utf8"
  );
  return copied;
}

function copyIfExists(source, destination, copied) {
  if (!existsSync(source)) return;
  const stats = statSync(source);
  cpSync(source, destination, { recursive: stats.isDirectory() });
  if (stats.isDirectory()) {
    for (const file of listFiles(destination)) copied.push(relative(artifactRoot, file).replace(/\\/g, "/"));
  } else {
    copied.push(relative(artifactRoot, destination).replace(/\\/g, "/"));
  }
}

function listFiles(root) {
  const entries = [];
  for (const name of readdirSync(root)) {
    const fullPath = join(root, name);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) entries.push(...listFiles(fullPath));
    else entries.push(fullPath);
  }
  return entries;
}

function platformArtifactName(platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  return "linux";
}

function hasWindowsMsvcToolchain() {
  const cl = spawnSync("where.exe", ["cl.exe"], { stdio: "ignore", shell: false });
  const link = spawnSync("where.exe", ["link.exe"], { stdio: "ignore", shell: false });
  return cl.status === 0 && link.status === 0;
}
