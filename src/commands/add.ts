import { execSync } from "child_process";
import { mkdtempSync, rmSync, readdirSync, copyFileSync, mkdirSync, existsSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, relative, dirname } from "path";

const OWNER_REPO_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

const SKILLS_DIRS = [
  ".claude/commands",
  "claude/commands",
  "skills",
  "commands",
];

function findSkillFiles(dir: string): string[] {
  const files: string[] = [];

  // First, check well-known skill directories
  for (const skillDir of SKILLS_DIRS) {
    const fullPath = join(dir, skillDir);
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath, fullPath));
    }
  }

  // If no files found in well-known dirs, look for .md files at root level
  if (files.length === 0) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md" && entry.name !== "LICENSE.md" && entry.name !== "CHANGELOG.md" && entry.name !== "CONTRIBUTING.md") {
        files.push(entry.name);
      }
    }
  }

  return files;
}

function collectMarkdownFiles(baseDir: string, currentDir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(baseDir, fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relative(baseDir, fullPath));
    }
  }

  return files;
}

function resolveSourceDir(repoDir: string): { sourceDir: string; relativeTo: string } {
  for (const skillDir of SKILLS_DIRS) {
    const fullPath = join(repoDir, skillDir);
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      return { sourceDir: fullPath, relativeTo: skillDir };
    }
  }
  return { sourceDir: repoDir, relativeTo: "" };
}

export async function add(target: string): Promise<void> {
  if (!OWNER_REPO_RE.test(target)) {
    throw new Error(
      `Invalid format '${target}'. Expected <owner/repo> (e.g. anthropics/claude-skills).`
    );
  }

  const [owner, repo] = target.split("/");
  const repoUrl = `https://github.com/${owner}/${repo}.git`;
  const destDir = join(process.cwd(), ".claude", "commands");

  console.log(`Fetching skills from ${owner}/${repo}...`);

  // Clone to temp directory
  const tmpDir = mkdtempSync(join(tmpdir(), "skills-"));

  try {
    try {
      execSync(`git clone --depth 1 ${repoUrl} ${tmpDir}/repo`, {
        stdio: "pipe",
      });
    } catch {
      throw new Error(
        `Failed to clone repository '${target}'. Make sure the repository exists and is accessible.`
      );
    }

    const repoDir = join(tmpDir, "repo");
    const skillFiles = findSkillFiles(repoDir);

    if (skillFiles.length === 0) {
      throw new Error(
        `No skill files (.md) found in '${target}'. ` +
        `Expected markdown files in one of: ${SKILLS_DIRS.join(", ")} or at the repository root.`
      );
    }

    // Determine the source directory
    const { sourceDir } = resolveSourceDir(repoDir);

    // Ensure destination exists
    mkdirSync(destDir, { recursive: true });

    // Copy skill files
    let installed = 0;
    for (const file of skillFiles) {
      const srcPath = join(sourceDir, file);
      const destPath = join(destDir, file);

      // Ensure subdirectory exists for nested skill files
      mkdirSync(dirname(destPath), { recursive: true });

      copyFileSync(srcPath, destPath);
      installed++;
      console.log(`  + ${file}`);
    }

    console.log(`\nInstalled ${installed} skill(s) from ${owner}/${repo} into .claude/commands/`);
  } finally {
    // Clean up temp directory
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
