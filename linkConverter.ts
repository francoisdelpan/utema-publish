import { promises as fs } from "node:fs";
import * as path from "node:path";

const IGNORED_DIRECTORIES = new Set([".git", ".obsidian", "node_modules"]);
const TEMP_FILE_SUFFIX = ".tmp-utema-sync";

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

interface ConversionContext {
  rootDirectory: string;
  markdownFiles: string[];
  allFiles: string[];
  markdownResolver: LinkResolver;
  fileResolver: LinkResolver;
}

interface LinkResolver {
  resolve(target: string): string | null;
}

export async function convertWikiLinksInDirectory(
  directoryPath: string,
  options: LinkConversionOptions = { writeChanges: true },
): Promise<LinkConversionSummary> {
  const markdownFiles = await collectMarkdownFiles(directoryPath);
  const allFiles = await collectFiles(directoryPath);
  const context: ConversionContext = {
    rootDirectory: directoryPath,
    markdownFiles,
    allFiles,
    markdownResolver: createLinkResolver(directoryPath, markdownFiles),
    fileResolver: createLinkResolver(directoryPath, allFiles),
  };
  const changedRelativePaths: string[] = [];

  for (const filePath of markdownFiles) {
    const originalContent = await fs.readFile(filePath, "utf8");
    const convertedContent = convertWikiLinks(originalContent, filePath, context);

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

export async function collectFiles(directoryPath: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await collectFiles(entryPath)));
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

export function isMarkdownFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".md");
}

export function convertWikiLinks(content: string): string;
export function convertWikiLinks(
  content: string,
  currentFilePath?: string,
  context?: ConversionContext,
): string {
  const effectiveContext =
    context ??
    ({
      rootDirectory: "",
      markdownFiles: [],
      allFiles: [],
      markdownResolver: {
        resolve(target: string): string {
          return ensureMarkdownExtension(normalizeLinkTarget(target));
        },
      },
      fileResolver: {
        resolve(target: string): string | null {
          return normalizeLinkTarget(target) || null;
        },
      },
    } satisfies ConversionContext);

  return content.replace(/(!)?\[\[([^[\]]+?)\]\]/g, (match, embedPrefix, inner) => {
    const parsed = parseWikiLink(inner);
    if (!parsed) {
      return match;
    }

    if (embedPrefix === "!") {
      return convertEmbedLink(match, parsed, currentFilePath ?? "", effectiveContext);
    }

    const href = buildMarkdownHref(parsed, currentFilePath ?? "", effectiveContext);
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
  const trimmed = normalizeLinkTarget(targetPart);
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

function buildMarkdownHref(
  parsed: ParsedWikiLink,
  currentFilePath: string,
  context: ConversionContext,
): string {
  const encodedPath = encodeVaultPath(
    buildRelativeMarkdownPath(parsed.pageTarget, currentFilePath, context),
  );
  const encodedFragment = parsed.fragment
    ? `#${encodeURIComponent(parsed.fragment.slice(1))}`
    : "";

  return `${encodedPath}${encodedFragment}`;
}

function ensureMarkdownExtension(target: string): string {
  return target.toLowerCase().endsWith(".md") ? target : `${target}.md`;
}

function buildRelativeMarkdownPath(
  rawTarget: string,
  currentFilePath: string,
  context: ConversionContext,
): string {
  const resolvedTarget =
    context.markdownResolver.resolve(rawTarget) ??
    ensureMarkdownExtension(normalizeLinkTarget(rawTarget));

  if (!currentFilePath || !context.rootDirectory) {
    return resolvedTarget;
  }

  const currentDirectory = path.dirname(currentFilePath);
  const absoluteTargetPath = path.join(context.rootDirectory, resolvedTarget);
  const relativePath = path.relative(currentDirectory, absoluteTargetPath);
  const normalizedRelativePath = toPosixPath(relativePath);

  if (!normalizedRelativePath || normalizedRelativePath === ".") {
    return path.basename(absoluteTargetPath);
  }

  return normalizedRelativePath;
}

function convertEmbedLink(
  originalMatch: string,
  parsed: ParsedWikiLink,
  currentFilePath: string,
  context: ConversionContext,
): string {
  const resolvedTarget = context.fileResolver.resolve(parsed.pageTarget);
  if (!resolvedTarget || resolvedTarget.toLowerCase().endsWith(".md")) {
    return originalMatch;
  }

  const relativeTarget = buildRelativePath(resolvedTarget, currentFilePath, context);
  const encodedPath = encodeVaultPath(relativeTarget);
  const encodedFragment = parsed.fragment
    ? `#${encodeURIComponent(parsed.fragment.slice(1))}`
    : "";
  const altText = parsed.alias ?? "";

  return `![${altText}](${encodedPath}${encodedFragment})`;
}

function buildRelativePath(
  resolvedTarget: string,
  currentFilePath: string,
  context: ConversionContext,
): string {
  if (!currentFilePath || !context.rootDirectory) {
    return resolvedTarget;
  }

  const currentDirectory = path.dirname(currentFilePath);
  const absoluteTargetPath = path.join(context.rootDirectory, resolvedTarget);
  const relativePath = path.relative(currentDirectory, absoluteTargetPath);
  const normalizedRelativePath = toPosixPath(relativePath);

  if (!normalizedRelativePath || normalizedRelativePath === ".") {
    return path.basename(absoluteTargetPath);
  }

  return normalizedRelativePath;
}

function createLinkResolver(rootDirectory: string, markdownFiles: string[]): LinkResolver {
  const exactMatches = new Map<string, string>();
  const basenameMatches = new Map<string, string[]>();

  for (const filePath of markdownFiles) {
    const relativePath = toPosixPath(path.relative(rootDirectory, filePath));
    const relativeWithoutExtension = stripMarkdownExtension(relativePath);
    const basename = path.posix.basename(relativeWithoutExtension);

    for (const key of buildLookupKeys(relativePath)) {
      exactMatches.set(key, relativePath);
    }

    const entries = basenameMatches.get(basename) ?? [];
    entries.push(relativePath);
    basenameMatches.set(basename, entries);
  }

  return {
    resolve(target: string): string | null {
      const normalizedTarget = normalizeLinkTarget(target);
      if (!normalizedTarget) {
        return null;
      }

      for (const key of buildLookupKeys(normalizedTarget)) {
        const exactMatch = exactMatches.get(key);
        if (exactMatch) {
          return exactMatch;
        }
      }

      const basename = path.posix.basename(stripMarkdownExtension(normalizedTarget));
      const basenameCandidates = basenameMatches.get(basename) ?? [];
      if (basenameCandidates.length === 1) {
        return basenameCandidates[0];
      }

      return null;
    },
  };
}

function buildLookupKeys(value: string): string[] {
  const normalizedValue = normalizeLinkTarget(value);
  if (!normalizedValue) {
    return [];
  }

  const withoutExtension = stripMarkdownExtension(normalizedValue);
  return Array.from(
    new Set([
      normalizedValue,
      normalizedValue.toLowerCase(),
      withoutExtension,
      withoutExtension.toLowerCase(),
      ensureMarkdownExtension(withoutExtension),
      ensureMarkdownExtension(withoutExtension).toLowerCase(),
    ]),
  );
}

function stripMarkdownExtension(value: string): string {
  return value.toLowerCase().endsWith(".md") ? value.slice(0, -3) : value;
}

function normalizeLinkTarget(value: string): string {
  return toPosixPath(value.trim()).replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
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
  const tempPath = `${filePath}${TEMP_FILE_SUFFIX}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}
