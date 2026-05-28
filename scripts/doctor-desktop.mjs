import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const checks = [];
const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
const vcvarsCandidates = [
  join(programFiles, "Microsoft Visual Studio", "2022", "Community", "VC", "Auxiliary", "Build", "vcvars64.bat"),
  join(programFiles, "Microsoft Visual Studio", "2022", "BuildTools", "VC", "Auxiliary", "Build", "vcvars64.bat"),
  join(programFiles, "Microsoft Visual Studio", "2022", "Professional", "VC", "Auxiliary", "Build", "vcvars64.bat"),
  join(programFiles, "Microsoft Visual Studio", "2022", "Enterprise", "VC", "Auxiliary", "Build", "vcvars64.bat")
];

function commandVersion(name, args = ["--version"]) {
  const result = spawnSync(name, args, { encoding: "utf8", shell: process.platform === "win32" });
  if (result.error || result.status !== 0) {
    return { ok: false, output: result.error?.message || result.stderr?.trim() || `${name} not found` };
  }
  return { ok: true, output: (result.stdout || result.stderr).trim() };
}

function commandCheck(name, args, timeoutMs = 120_000) {
  const result = spawnSync(name, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: timeoutMs
  });
  if (result.error || result.status !== 0) {
    return { ok: false, output: compactOutput(result.error?.message || result.stderr || result.stdout || `${name} failed`) };
  }
  return { ok: true, output: compactOutput(result.stdout || result.stderr || `${name} completed`) };
}

function compactOutput(output) {
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return lines.slice(-8).join("\n     ");
}

function addCheck(name, ok, detail, fix) {
  checks.push({ name, ok, detail, fix });
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
addCheck(
  "Node.js >= 20",
  nodeMajor >= 20,
  `current: ${process.version}`,
  "Install Node.js 20 or newer, then reopen the terminal."
);

const npm = commandVersion("npm");
addCheck("npm", npm.ok, npm.output, "Install npm with Node.js, then reopen the terminal.");

const cargo = commandVersion("cargo");
addCheck(
  "Cargo",
  cargo.ok,
  cargo.output,
  "Install Rust with rustup. On Windows: winget install --id Rustlang.Rustup -e"
);

const rustc = commandVersion("rustc");
addCheck(
  "rustc",
  rustc.ok,
  rustc.output,
  "Install Rust with rustup, then run: rustup default stable"
);

if (process.platform === "win32") {
  const rustupToolchain = commandVersion("rustup", ["show", "active-toolchain"]);
  const usesMsvc = rustupToolchain.ok && rustupToolchain.output.includes("msvc");
  addCheck(
    "Rust MSVC toolchain",
    usesMsvc,
    rustupToolchain.output || "rustup not found",
    "Run: rustup default stable-x86_64-pc-windows-msvc"
  );

  const vcvars = vcvarsCandidates.find((candidate) => existsSync(candidate));
  addCheck(
    "Visual Studio x64 C++ environment",
    Boolean(vcvars),
    vcvars ?? "vcvars64.bat not found",
    "Install Visual Studio Build Tools with Desktop development with C++."
  );
}

const runtimeCli = join(repoRoot, "apps", "runtime-cli", "dist", "index.js");
addCheck(
  "runtime-cli build",
  existsSync(runtimeCli),
  runtimeCli,
  "Run: npm run build -w @praxis/runtime-cli"
);

const tauriCargoToml = join(repoRoot, "apps", "studio-desktop", "src-tauri", "Cargo.toml");
addCheck(
  "Tauri Rust project",
  existsSync(tauriCargoToml),
  tauriCargoToml,
  "Run this command from the Praxis-Studio repository root."
);

if (cargo.ok && rustc.ok && existsSync(tauriCargoToml)) {
  const cargoFetch = commandCheck("cargo", ["fetch", "--manifest-path", tauriCargoToml, "--locked"]);
  addCheck(
    "Cargo registry access",
    cargoFetch.ok,
    cargoFetch.output,
    "Fix crates.io network access. If you see SSL/TLS or index.crates.io errors, configure a proxy/VPN or a Cargo sparse registry mirror."
  );
}

console.log("Praxis Studio Desktop doctor\n");
for (const check of checks) {
  console.log(`${check.ok ? "[ok]" : "[missing]"} ${check.name}`);
  console.log(`     ${check.detail}`);
  if (!check.ok) console.log(`     fix: ${check.fix}`);
}

if (process.platform === "win32") {
  console.log("\nWindows Tauri notes:");
  console.log("- Tauri Desktop also needs Microsoft C++ Build Tools and Microsoft Edge WebView2 Runtime.");
  console.log("- After installing Rust or Build Tools, close this terminal and open a new one before rerunning npm run tauri:dev.");
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.log(`\nDesktop prerequisites are incomplete: ${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log("\nDesktop prerequisites look ready. Next command:");
console.log("npm run tauri:dev");
