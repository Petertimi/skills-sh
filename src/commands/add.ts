import { execSync } from "child_process";
import { mkdtempSync, rmSync, readdirSync, copyFileSync, mkdirSync, existsSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, relative, dirname, basename } from "path";

const OWNER_REPO_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const GITHUB_URL_RE = /^https?:\/\/github\.com\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+?)(?:\.git)?(?:\/.*)?$/;

const SKILLS_DIRS = [
  ".claude/commands",
  "claude/commands",
  "skills",
  "commands",
];

function parseTarget(target: string): { owner: string; repo: string } {
  // Try GitHub URL first
  const urlMatch = target.match(GITHUB_URL_RE);
  if (urlMatch) {
    const [owner, repo] = urlMatch[1].split("/");
    return { owner, repo };
  }

  // Try owner/repo format
  if (OWNER_REPO_RE.test(target)) {
    const [owner, repo] = target.split("/");
    return { owner, repo };
  }

  throw new Error(
    `Invalid target '${target}'. Expected <owner/repo> or a GitHub URL.`
  );
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

function findSkillFiles(dir: string): { sourceDir: string; files: string[] } {
  // Check well-known skill directories
  for (const skillDir of SKILLS_DIRS) {
    const fullPath = join(dir, skillDir);
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      const files = collectMarkdownFiles(fullPath, fullPath);
      if (files.length > 0) {
        return { sourceDir: fullPath, files };
      }
    }
  }

  // Fall back to root-level markdown files
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      !["README.md", "LICENSE.md", "CHANGELOG.md", "CONTRIBUTING.md"].includes(entry.name)
    ) {
      files.push(entry.name);
    }
  }

  return { sourceDir: dir, files };
}

function filterBySkill(sourceDir: string, files: string[], skillName: string): { filteredSourceDir: string; filteredFiles: string[] } {
  // Strategy 1: Look for a subdirectory matching the skill name inside sourceDir
  const skillSubDir = join(sourceDir, skillName);
  if (existsSync(skillSubDir) && statSync(skillSubDir).isDirectory()) {
    const subFiles = collectMarkdownFiles(skillSubDir, skillSubDir);
    if (subFiles.length > 0) {
      return { filteredSourceDir: skillSubDir, filteredFiles: subFiles };
    }
  }

  // Strategy 2: Look for files whose path starts with the skill name (e.g. "shadcn-ui/foo.md")
  const prefixMatch = files.filter(f => f.startsWith(skillName + "/") || f.startsWith(skillName + "\\"));
  if (prefixMatch.length > 0) {
    return { filteredSourceDir: sourceDir, filteredFiles: prefixMatch };
  }

  // Strategy 3: Look for a file named <skill>.md
  const exactFile = files.filter(f => {
    const base = basename(f, ".md");
    return base === skillName;
  });
  if (exactFile.length > 0) {
    return { filteredSourceDir: sourceDir, filteredFiles: exactFile };
  }

  // Strategy 4: Look for the skill name as a top-level directory in the repo root
  // (in case sourceDir is a subdirectory like skills/)
  const repoRoot = dirname(sourceDir);
  const rootSkillDir = join(repoRoot, skillName);
  if (existsSync(rootSkillDir) && statSync(rootSkillDir).isDirectory()) {
    const subFiles = collectMarkdownFiles(rootSkillDir, rootSkillDir);
    if (subFiles.length > 0) {
      return { filteredSourceDir: rootSkillDir, filteredFiles: subFiles };
    }
  }

  throw new Error(
    `Skill '${skillName}' not found in repository. Available files: ${files.join(", ") || "(none)"}`
  );
}

export async function add(target: string, skillName?: string): Promise<void> {
  const { owner, repo } = parseTarget(target);
  const repoUrl = `https://github.com/${owner}/${repo}.git`;
  const baseDestDir = join(process.cwd(), ".claude", "commands");

  // Namespace: use skill name if provided, otherwise use repo name
  const namespace = skillName || repo;
  const destDir = join(baseDestDir, namespace);

  const label = skillName ? `skill '${skillName}' from ${owner}/${repo}` : `skills from ${owner}/${repo}`;
  console.log(`Fetching ${label}...`);

  const tmpDir = mkdtempSync(join(tmpdir(), "skills-"));

  try {
    try {
      execSync(`git clone --depth 1 ${repoUrl} ${tmpDir}/repo`, {
        stdio: "pipe",
      });
    } catch {
      throw new Error(
        `Failed to clone repository '${owner}/${repo}'. Make sure the repository exists and is accessible.`
      );
    }

    const repoDir = join(tmpDir, "repo");
    let { sourceDir, files } = findSkillFiles(repoDir);

    if (files.length === 0) {
      throw new Error(
        `No skill files (.md) found in '${owner}/${repo}'. ` +
        `Expected markdown files in one of: ${SKILLS_DIRS.join(", ")} or at the repository root.`
      );
    }

    // If --skill is specified, narrow down to just that skill
    if (skillName) {
      const filtered = filterBySkill(sourceDir, files, skillName);
      sourceDir = filtered.filteredSourceDir;
      files = filtered.filteredFiles;
    }

    // Ensure destination exists
    mkdirSync(destDir, { recursive: true });

    // Copy skill files
    let installed = 0;
    for (const file of files) {
      const srcPath = join(sourceDir, file);
      const destPath = join(destDir, file);

      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
      installed++;
      console.log(`  + ${file}`);
    }

    console.log(`\nInstalled ${installed} skill(s) from ${owner}/${repo} into .claude/commands/${namespace}/`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
