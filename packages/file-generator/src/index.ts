import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface GeneratedFile {
  path: string;
  content: string;
  overwrite?: boolean;
}

export interface FileGenerationResult {
  writtenFiles: string[];
  skippedFiles: string[];
}

export async function writeGeneratedFiles(root: string, files: GeneratedFile[]): Promise<FileGenerationResult> {
  const projectRoot = path.resolve(root);
  const writtenFiles: string[] = [];
  const skippedFiles: string[] = [];
  for (const file of files) {
    const absolute = path.resolve(projectRoot, file.path);
    if (!absolute.startsWith(projectRoot)) throw new Error(`Refusing to write outside project root: ${file.path}`);
    if (!file.overwrite && (await exists(absolute))) {
      skippedFiles.push(file.path);
      continue;
    }
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
    writtenFiles.push(file.path);
  }
  return { writtenFiles, skippedFiles };
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}
