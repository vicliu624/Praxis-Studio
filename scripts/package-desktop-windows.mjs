import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

if (process.platform !== "win32") {
  console.error("package:desktop:windows is only for Windows. Use npm run package:desktop on this platform.");
  process.exit(1);
}

const repoRoot = process.cwd();
const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
const userProfile = process.env.USERPROFILE;
const fixedArtifactExe = join(repoRoot, "artifacts", "desktop", "windows", "praxis-studio.exe");

const vcvarsCandidates = [
  join(programFiles, "Microsoft Visual Studio", "2022", "Community", "VC", "Auxiliary", "Build", "vcvars64.bat"),
  join(programFiles, "Microsoft Visual Studio", "2022", "BuildTools", "VC", "Auxiliary", "Build", "vcvars64.bat"),
  join(programFiles, "Microsoft Visual Studio", "2022", "Professional", "VC", "Auxiliary", "Build", "vcvars64.bat"),
  join(programFiles, "Microsoft Visual Studio", "2022", "Enterprise", "VC", "Auxiliary", "Build", "vcvars64.bat")
];

const vcvars = vcvarsCandidates.find((candidate) => existsSync(candidate));
if (!vcvars) {
  console.error("Could not find Visual Studio vcvars64.bat.");
  console.error("Install Visual Studio Build Tools with Desktop development with C++, then retry.");
  process.exit(1);
}

const cargoBin = userProfile ? join(userProfile, ".cargo", "bin") : "";
if (!cargoBin || !existsSync(join(cargoBin, "cargo.exe"))) {
  console.error("Could not find cargo.exe under %USERPROFILE%\\.cargo\\bin.");
  console.error("Install Rust with rustup, then retry.");
  process.exit(1);
}

stopFixedArtifactProcess();

const commandDir = mkdtempSync(join(tmpdir(), "praxis-package-desktop-"));
const commandFile = join(commandDir, "package-desktop.cmd");
const commandLines = [
  "@echo off",
  `call "${vcvars}"`,
  "if errorlevel 1 exit /b %errorlevel%",
  `set "PATH=${cargoBin};%PATH%"`,
  "where cargo",
  "if errorlevel 1 exit /b %errorlevel%",
  "where link",
  "if errorlevel 1 exit /b %errorlevel%",
  "call npm run build:packages",
  "if errorlevel 1 exit /b %errorlevel%",
  "call npm run build -w @praxis/runtime-cli",
  "if errorlevel 1 exit /b %errorlevel%",
  "call npm run tauri:build -w @praxis/studio-desktop",
  "exit /b %errorlevel%"
];

writeFileSync(commandFile, commandLines.join("\r\n"), "utf8");

try {
  const result = spawnSync("cmd.exe", ["/d", "/c", commandFile], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false
  });
  process.exit(result.status ?? 1);
} finally {
  rmSync(commandDir, { recursive: true, force: true });
}

function stopFixedArtifactProcess() {
  if (!existsSync(fixedArtifactExe)) return;
  const escapedPath = fixedArtifactExe.replace(/'/g, "''");
  const script = [
    `$target='${escapedPath}'`,
    "Get-CimInstance Win32_Process -Filter \"name='praxis-studio.exe'\" |",
    "  Where-Object { $_.ExecutablePath -eq $target } |",
    "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
  ].join(" ");
  spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd: repoRoot,
    stdio: "ignore",
    shell: false
  });
}
