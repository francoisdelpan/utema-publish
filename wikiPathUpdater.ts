import { promises as fs } from "node:fs";
import * as path from "node:path";
import { collectMarkdownFiles } from "./linkConverter";

export interface WikiPathUpdateOptions {
  writeChanges: boolean;
}

export interface WikiPathUpdateSummary {
  scannedFiles: number;
  changedFiles: number;
  changedRelativePaths: string[];
}

export async function updateWikiPathPropertiesInDirectory(
  directoryPath: string,
  options: WikiPathUpdateOptions,
): Promise<WikiPathUpdateSummary> {
  const markdownFiles = await collectMarkdownFiles(directoryPath);
  const changedRelativePaths: string[] = [];

  for (const filePath of markdownFiles) {
    const originalContent = await fs.readFile(filePath, "utf8");
    const wikiPath = toWikiPath(directoryPath, filePath);
    const updatedContent = updateWikiPathProperty(originalContent, wikiPath);

    if (updatedContent === originalContent) {
      continue;
    }

    if (options.writeChanges) {
      await fs.writeFile(filePath, updatedContent, "utf8");
    }

    changedRelativePaths.push(path.relative(directoryPath, filePath));
  }

  return {
    scannedFiles: markdownFiles.length,
    changedFiles: changedRelativePaths.length,
    changedRelativePaths,
  };
}

export function updateWikiPathProperty(content: string, wikiPath: string): string {
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");

  if (lines[0] !== "---") {
    return content;
  }

  const frontmatterEndIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );
  if (frontmatterEndIndex === -1) {
    return content;
  }

  const wikiPathLine = `wiki-path: "${escapeYamlDoubleQuotedString(wikiPath)}"`;
  const wikiPathIndex = lines.findIndex(
    (line, index) =>
      index > 0
      && index < frontmatterEndIndex
      && /^wiki-path\s*:/.test(line),
  );

  if (wikiPathIndex === -1) {
    lines.splice(frontmatterEndIndex, 0, wikiPathLine);
  } else {
    lines[wikiPathIndex] = wikiPathLine;
  }

  return lines.join("\n").replace(/\n/g, lineEnding);
}

function toWikiPath(rootDirectory: string, filePath: string): string {
  const relativePath = path.relative(rootDirectory, filePath);
  const withoutExtension = relativePath.replace(/\.md$/i, "");
  return withoutExtension.split(path.sep).join("/");
}

function escapeYamlDoubleQuotedString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}
