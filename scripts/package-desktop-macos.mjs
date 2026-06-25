import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

if (process.platform !== "darwin") {
  console.error("package:desktop:macos is only for macOS. Use npm run package:desktop on this platform.");
  process.exit(1);
}

const repoRoot = process.cwd();
const cargoBin = join(homedir(), ".cargo", "bin");

if (!existsSync(join(cargoBin, "cargo"))) {
  console.error("Could not find cargo under ~/.cargo/bin.");
  console.error("Install Rust with rustup, then retry.");
  process.exit(1);
}

const env = {
  ...process.env,
  PATH: `${cargoBin}:${process.env.PATH ?? ""}`
};

const steps = [
  ["npm", ["run", "build:packages"]],
  ["npm", ["run", "build", "-w", "@praxis/runtime-cli"]],
  ["npm", ["run", "tauri:build", "-w", "@praxis/studio-desktop"]]
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: false
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}
