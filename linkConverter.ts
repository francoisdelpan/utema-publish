import { promises as fs } from "node:fs";
import * as path from "node:path";

const IGNORED_DIRECTORIES = new Set([".git", ".obsidian", "node_modules"]);

export interface LinkConversionSummary {
  scannedFiles: number;
  changedFiles: number;
  changedRelativePaths: string[];
}

export interface LinkConversionOptions {
  writeChanges: boolean;
}

interface ParsedWikiLink {
  originalTarget: string;
  pageTarget: string;
  alias?: string;
  fragment?: string;
}

export async function convertWikiLinksInDirectory(
  directoryPath: string,
  options: LinkConversionOptions = { writeChanges: true },
): Promise<LinkConversionSummary> {
  const markdownFiles = await collectMarkdownFiles(directoryPath);
  const changedRelativePaths: string[] = [];

  for (const filePath of markdownFiles) {
    const originalContent = await fs.readFile(filePath, "utf8");
    const convertedContent = convertWikiLinks(originalContent);

    if (convertedContent === originalContent) {
      continue;
    }

    if (options.writeChanges) {
      await writeFileAtomically(filePath, convertedContent);
    }

    changedRelativePaths.push(path.relative(directoryPath, filePath));
  }

  return {
    scannedFiles: markdownFiles.length,
    changedFiles: changedRelativePaths.length,
    changedRelativePaths,
  };
}

export async function collectMarkdownFiles(
  directoryPath: string,
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }

    if (isMarkdownFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

export function isMarkdownFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".md");
}

export function convertWikiLinks(content: string): string {
  return content.replace(/(!)?\[\[([^[\]]+?)\]\]/g, (match, embedPrefix, inner) => {
    if (embedPrefix === "!") {
      return match;
    }

    const parsed = parseWikiLink(inner);
    if (!parsed) {
      return match;
    }

    const href = buildMarkdownHref(parsed);
    const label = parsed.alias ?? parsed.originalTarget;
    return `[${label}](${href})`;
  });
}

export function parseWikiLink(rawValue: string): ParsedWikiLink | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const [targetPart, aliasPart] = trimmed.split("|", 2);
  const pageTarget = extractPageTarget(targetPart);

  if (!pageTarget) {
    return null;
  }

  const fragment = extractFragment(targetPart);

  return {
    originalTarget: targetPart.trim(),
    pageTarget,
    alias: aliasPart?.trim() || undefined,
    fragment,
  };
}

function extractPageTarget(targetPart: string): string {
  const trimmed = targetPart.trim();
  const hashIndex = trimmed.indexOf("#");
  const blockIndex = trimmed.indexOf("^");

  const indexes = [hashIndex, blockIndex].filter((index) => index >= 0);
  const stopIndex = indexes.length > 0 ? Math.min(...indexes) : -1;
  const baseTarget = stopIndex >= 0 ? trimmed.slice(0, stopIndex) : trimmed;

  return baseTarget.trim();
}

function extractFragment(targetPart: string): string | undefined {
  const trimmed = targetPart.trim();

  const hashIndex = trimmed.indexOf("#");
  if (hashIndex >= 0) {
    return `#${trimmed.slice(hashIndex + 1).trim()}`;
  }

  const blockIndex = trimmed.indexOf("^");
  if (blockIndex >= 0) {
    return `#^${trimmed.slice(blockIndex + 1).trim()}`;
  }

  return undefined;
}

function buildMarkdownHref(parsed: ParsedWikiLink): string {
  const encodedPath = encodeVaultPath(ensureMarkdownExtension(parsed.pageTarget));
  const encodedFragment = parsed.fragment
    ? `#${encodeURIComponent(parsed.fragment.slice(1))}`
    : "";

  return `${encodedPath}${encodedFragment}`;
}

function ensureMarkdownExtension(target: string): string {
  return target.toLowerCase().endsWith(".md") ? target : `${target}.md`;
}

function encodeVaultPath(target: string): string {
  return target
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function writeFileAtomically(
  filePath: string,
  content: string,
): Promise<void> {
  const tempPath = `${filePath}.tmp-utema-publish`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}
