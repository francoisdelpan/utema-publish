import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { collectMarkdownFiles } from "./linkConverter";

const execFileAsync = promisify(execFile);
const MANAGED_EXCLUDE_START = "# BEGIN UTEMA Sync is-publish=false";
const MANAGED_EXCLUDE_END = "# END UTEMA Sync is-publish=false";

export interface PublishFilterOptions {
  writeChanges: boolean;
}

export interface PublishFilterSummary {
  scannedFiles: number;
  excludedFiles: number;
  excludedRelativePaths: string[];
  removedFromGitIndex: number;
  updatedGitExclude: boolean;
  commands: string[];
}

export async function applyPublishFilter(
  directoryPath: string,
  options: PublishFilterOptions,
): Promise<PublishFilterSummary> {
  const markdownFiles = await collectMarkdownFiles(directoryPath);
  const excludedRelativePaths: string[] = [];

  for (const filePath of markdownFiles) {
    const content = await fs.readFile(filePath, "utf8");
    if (!hasIsPublishFalse(content)) {
      continue;
    }

    excludedRelativePaths.push(toGitRelativePath(directoryPath, filePath));
  }

  excludedRelativePaths.sort((left, right) => left.localeCompare(right));

  const updatedGitExclude = await updateGitInfoExclude(
    directoryPath,
    excludedRelativePaths,
    options.writeChanges,
  );
  const trackedExcludedPaths = await getTrackedFiles(directoryPath, excludedRelativePaths);
  const commands: string[] = [];

  if (updatedGitExclude) {
    commands.push(
      `# update .git/info/exclude (${excludedRelativePaths.length} is-publish=false file(s))`,
    );
  }

  if (trackedExcludedPaths.length > 0) {
    commands.push(
      `git rm --cached -- ${trackedExcludedPaths
        .map((relativePath) => `"${relativePath.replace(/"/g, '\\"')}"`)
        .join(" ")}`,
    );

    if (options.writeChanges) {
      await removeTrackedFilesFromIndex(directoryPath, trackedExcludedPaths);
    }
  }

  return {
    scannedFiles: markdownFiles.length,
    excludedFiles: excludedRelativePaths.length,
    excludedRelativePaths,
    removedFromGitIndex: trackedExcludedPaths.length,
    updatedGitExclude,
    commands,
  };
}

export function hasIsPublishFalse(content: string): boolean {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");

  if (lines[0] !== "---") {
    return false;
  }

  const frontmatterEndIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );
  if (frontmatterEndIndex === -1) {
    return false;
  }

  for (let index = 1; index < frontmatterEndIndex; index += 1) {
    const match = /^is-publish\s*:\s*(.*)$/.exec(lines[index]);
    if (!match) {
      continue;
    }

    return isFalseYamlValue(match[1]);
  }

  return false;
}

async function updateGitInfoExclude(
  directoryPath: string,
  excludedRelativePaths: string[],
  writeChanges: boolean,
): Promise<boolean> {
  const excludePath = path.join(directoryPath, ".git", "info", "exclude");
  const currentContent = await readOptionalFile(excludePath);
  const nextContent = buildGitInfoExcludeContent(currentContent, excludedRelativePaths);

  if (nextContent === currentContent) {
    return false;
  }

  if (writeChanges) {
    await fs.writeFile(excludePath, nextContent, "utf8");
  }

  return true;
}

function buildGitInfoExcludeContent(
  currentContent: string,
  excludedRelativePaths: string[],
): string {
  const contentWithoutManagedBlock = removeManagedExcludeBlock(currentContent);

  if (excludedRelativePaths.length === 0) {
    return contentWithoutManagedBlock;
  }

  const managedBlock = [
    MANAGED_EXCLUDE_START,
    "# Generated from Markdown frontmatter property: is-publish: false",
    ...excludedRelativePaths.map((relativePath) => `/${escapeGitIgnorePattern(relativePath)}`),
    MANAGED_EXCLUDE_END,
    "",
  ].join("\n");

  return `${contentWithoutManagedBlock}${contentWithoutManagedBlock ? "\n" : ""}${managedBlock}`;
}

function removeManagedExcludeBlock(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const keptLines: string[] = [];
  let insideManagedBlock = false;

  for (const line of lines) {
    if (line === MANAGED_EXCLUDE_START) {
      insideManagedBlock = true;
      continue;
    }

    if (line === MANAGED_EXCLUDE_END) {
      insideManagedBlock = false;
      continue;
    }

    if (!insideManagedBlock) {
      keptLines.push(line);
    }
  }

  return keptLines.join("\n").trimEnd();
}

async function getTrackedFiles(
  directoryPath: string,
  relativePaths: string[],
): Promise<string[]> {
  if (relativePaths.length === 0) {
    return [];
  }

  const result = await execFileAsync(
    "git",
    ["ls-files", "-z", "--", ...relativePaths],
    {
      cwd: directoryPath,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );

  return result.stdout
    .split("\0")
    .filter(Boolean);
}

async function removeTrackedFilesFromIndex(
  directoryPath: string,
  relativePaths: string[],
): Promise<void> {
  const chunkSize = 50;

  for (let index = 0; index < relativePaths.length; index += chunkSize) {
    const chunk = relativePaths.slice(index, index + chunkSize);
    await execFileAsync(
      "git",
      ["rm", "--cached", "--ignore-unmatch", "--", ...chunk],
      {
        cwd: directoryPath,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
  }
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (
      typeof error === "object"
      && error
      && "code" in error
      && (error as { code?: string }).code === "ENOENT"
    ) {
      return "";
    }

    throw error;
  }
}

function isFalseYamlValue(rawValue: string): boolean {
  const normalizedValue = rawValue
    .replace(/\s+#.*$/, "")
    .trim()
    .toLowerCase();

  return normalizedValue === "false"
    || normalizedValue === "\"false\""
    || normalizedValue === "'false'";
}

function toGitRelativePath(rootDirectory: string, filePath: string): string {
  return path.relative(rootDirectory, filePath).split(path.sep).join("/");
}

function escapeGitIgnorePattern(value: string): string {
  return value.replace(/([*?[\\])/g, "\\$1");
}
