/* eslint-disable */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === 'object' || typeof from === 'function') {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, 'default', { value: mod, enumerable: true }) : target,
  mod
));

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => UtemaPublishPlugin
});
module.exports = __toCommonJS(main_exports);
var path2 = __toESM(require("node:path"));
var import_node_fs3 = require("node:fs");
var import_obsidian3 = require("obsidian");

// commitModal.ts
var import_obsidian = require("obsidian");
var CommitModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText("UTEMA Sync");
    contentEl.addClass("utema-publish-modal");
    let commitMessage = "";
    new import_obsidian.Setting(contentEl).setName("Commit message").setDesc("Message obligatoire avant synchronisation Git.").addText((text) => {
      this.input = text;
      text.inputEl.placeholder = "Ex. Publish notes";
      text.inputEl.focus();
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.submit(commitMessage);
        }
      });
      text.onChange((value) => {
        commitMessage = value.trim();
        this.publishButton?.setDisabled(commitMessage.length === 0);
      });
    });
    new import_obsidian.Setting(contentEl).addButton((button) => {
      button.setButtonText("Synchroniser");
      button.setCta();
      button.setDisabled(true);
      button.onClick(() => this.submit(commitMessage));
      this.publishButton = button;
    }).addButton((button) => {
      button.setButtonText("Annuler");
      button.onClick(() => this.close());
    });
  }
  onClose() {
    this.contentEl.empty();
  }
  submit(message) {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      this.input?.inputEl.focus();
      return;
    }
    this.close();
    this.onSubmit(normalizedMessage);
  }
};

// gitService.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_util = require("node:util");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var GitServiceError = class extends Error {
  constructor(message, command, stdout = "", stderr = "") {
    super(message);
    this.name = "GitServiceError";
    this.command = command;
    this.stdout = stdout;
    this.stderr = stderr;
  }
};
async function ensureGitRepository(workingDirectory) {
  const result = await runGitCommand(["rev-parse", "--is-inside-work-tree"], {
    workingDirectory
  });
  if (result.stdout.trim() !== "true") {
    throw new GitServiceError(
      "Le dossier cible n'est pas reconnu comme un d\xE9p\xF4t Git.",
      "git rev-parse --is-inside-work-tree",
      result.stdout,
      result.stderr
    );
  }
}
async function publishWithGit(options) {
  const commands = [];
  const executionOptions = {
    workingDirectory: options.workingDirectory,
    sshKeyPath: normalizeOptionalValue(options.sshKeyPath)
  };
  if (executionOptions.sshKeyPath) {
    await ensureReadableSshKey(executionOptions.sshKeyPath);
  }
  const normalizedRepoUrl = normalizeOptionalValue(options.repoUrl);
  if (normalizedRepoUrl && !options.dryRun) {
    await ensureRemoteConfigured(options.remoteName, normalizedRepoUrl, executionOptions);
  } else if (normalizedRepoUrl) {
    commands.push(`# remote attendu: ${options.remoteName} -> ${normalizedRepoUrl}`);
  }
  const statusBefore = await getStatusSummary(executionOptions);
  const pullCommand = buildPullCommandLabel(options.remoteName, options.branchName);
  let pulledRemoteChanges = false;
  if (!statusBefore) {
    commands.push(pullCommand);
    if (!options.dryRun) {
      pulledRemoteChanges = await pullLatestChanges(
        options.remoteName,
        options.branchName,
        executionOptions
      );
    }
    return {
      dryRun: options.dryRun,
      hadChanges: pulledRemoteChanges,
      pulledRemoteChanges,
      pushedLocalChanges: false,
      commands
    };
  }
  commands.push("git add .");
  commands.push(`git commit -m "${options.commitMessage}"`);
  commands.push(pullCommand);
  commands.push(buildPushCommandLabel(options.pushMode, options.remoteName, options.branchName));
  if (options.dryRun) {
    return {
      dryRun: true,
      hadChanges: true,
      pulledRemoteChanges: false,
      pushedLocalChanges: true,
      commands
    };
  }
  await runGitCommand(["add", "."], executionOptions);
  try {
    await runGitCommand(["commit", "-m", options.commitMessage], executionOptions);
  } catch (error) {
    if (!isNothingToCommitError(error)) {
      throw error;
    }
  }
  pulledRemoteChanges = await pullLatestChanges(
    options.remoteName,
    options.branchName,
    executionOptions
  );
  const pushArgs = options.pushMode === "simple" ? ["push"] : ["push", options.remoteName, options.branchName];
  await runGitCommand(pushArgs, executionOptions);
  return {
    dryRun: false,
    hadChanges: true,
    pulledRemoteChanges,
    pushedLocalChanges: true,
    commands
  };
}
async function ensureReadableSshKey(sshKeyPath) {
  try {
    const stats = await import_node_fs.promises.stat(sshKeyPath);
    if (!stats.isFile()) {
      throw new Error("not-a-file");
    }
  } catch {
    throw new Error(`Cl\xE9 SSH introuvable ou illisible: ${sshKeyPath}`);
  }
}
async function ensureRemoteConfigured(remoteName, repoUrl, executionOptions) {
  const currentRemoteUrl = await getRemoteUrl(remoteName, executionOptions);
  if (!currentRemoteUrl) {
    await runGitCommand(["remote", "add", remoteName, repoUrl], executionOptions);
    return;
  }
  if (currentRemoteUrl !== repoUrl) {
    throw new Error(
      `Le remote ${remoteName} pointe vers ${currentRemoteUrl}, mais la configuration demande ${repoUrl}.`
    );
  }
}
async function getRemoteUrl(remoteName, executionOptions) {
  try {
    const result = await runGitCommand(["remote", "get-url", remoteName], executionOptions);
    return result.stdout.trim() || null;
  } catch (error) {
    if (isMissingRemoteError(error)) {
      return null;
    }
    throw error;
  }
}
async function pullLatestChanges(remoteName, branchName, executionOptions) {
  const result = await runGitCommand(
    ["pull", "--rebase", remoteName, branchName],
    executionOptions
  );
  const combinedOutput = `${result.stdout}
${result.stderr}`.toLowerCase();
  return !combinedOutput.includes("already up to date");
}
async function getStatusSummary(executionOptions) {
  const result = await runGitCommand(["status", "--porcelain"], executionOptions);
  return result.stdout.trim();
}
function isNothingToCommitError(error) {
  if (!(error instanceof GitServiceError)) {
    return false;
  }
  const combinedOutput = `${error.stdout}
${error.stderr}`.toLowerCase();
  return combinedOutput.includes("nothing to commit") || combinedOutput.includes("no changes added to commit");
}
function isMissingRemoteError(error) {
  if (!(error instanceof GitServiceError)) {
    return false;
  }
  const combinedOutput = `${error.stdout}
${error.stderr}`.toLowerCase();
  return combinedOutput.includes("no such remote");
}
async function runGitCommand(args, executionOptions) {
  const commandLabel = `git ${args.join(" ")}`;
  try {
    const result = await execFileAsync("git", args, {
      cwd: executionOptions.workingDirectory,
      env: buildGitEnvironment(executionOptions.sshKeyPath),
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return {
      command: commandLabel,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  } catch (error) {
    const stdout = typeof error === "object" && error && "stdout" in error ? String(error.stdout ?? "") : "";
    const stderr = typeof error === "object" && error && "stderr" in error ? String(error.stderr ?? "") : "";
    throw new GitServiceError(
      `La commande a \xE9chou\xE9: ${commandLabel}`,
      commandLabel,
      stdout,
      stderr
    );
  }
}
function buildGitEnvironment(sshKeyPath) {
  if (!sshKeyPath) {
    return { ...process.env };
  }
  const escapedPath = sshKeyPath.replace(/"/g, '\\"');
  return {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i "${escapedPath}" -o IdentitiesOnly=yes`
  };
}
function buildPullCommandLabel(remoteName, branchName) {
  return `git pull --rebase ${remoteName} ${branchName}`;
}
function buildPushCommandLabel(pushMode, remoteName, branchName) {
  return pushMode === "simple" ? "git push" : `git push ${remoteName} ${branchName}`;
}
function normalizeOptionalValue(value) {
  return value.trim();
}

// linkConverter.ts
var import_node_fs2 = require("node:fs");
var path = __toESM(require("node:path"));
var IGNORED_DIRECTORIES = /* @__PURE__ */ new Set([".git", ".obsidian", "node_modules"]);
var TEMP_FILE_SUFFIX = ".tmp-utema-sync";
async function convertWikiLinksInDirectory(directoryPath, options = { writeChanges: true, missingLinkFallbackPath: "404.md" }) {
  const markdownFiles = await collectMarkdownFiles(directoryPath);
  const allFiles = await collectFiles(directoryPath);
  const context = {
    rootDirectory: directoryPath,
    markdownFiles,
    allFiles,
    markdownResolver: createLinkResolver(directoryPath, markdownFiles),
    fileResolver: createLinkResolver(directoryPath, allFiles),
    missingLinkFallbackPath: normalizeFallbackPath(options.missingLinkFallbackPath)
  };
  const changedRelativePaths = [];
  for (const filePath of markdownFiles) {
    const originalContent = await import_node_fs2.promises.readFile(filePath, "utf8");
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
    changedRelativePaths
  };
}
async function collectMarkdownFiles(directoryPath) {
  const files = [];
  const entries = await import_node_fs2.promises.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      files.push(...await collectMarkdownFiles(entryPath));
      continue;
    }
    if (isMarkdownFile(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}
async function collectFiles(directoryPath) {
  const files = [];
  const entries = await import_node_fs2.promises.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      files.push(...await collectFiles(entryPath));
      continue;
    }
    files.push(entryPath);
  }
  return files;
}
function isMarkdownFile(fileName) {
  return fileName.toLowerCase().endsWith(".md");
}
function convertWikiLinks(content, currentFilePath, context) {
  const effectiveContext = context ?? {
    rootDirectory: "",
    markdownFiles: [],
    allFiles: [],
    markdownResolver: {
      resolve(target) {
        return ensureMarkdownExtension(normalizeLinkTarget(target));
      }
    },
    fileResolver: {
      resolve(target) {
        return normalizeLinkTarget(target) || null;
      }
    },
    missingLinkFallbackPath: "404.md"
  };
  const convertedLinks = content.replace(/(!)?\[\[([^[\]]+?)\]\]/g, (match, embedPrefix, inner) => {
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
  return convertCalloutsToGitHubAlerts(convertedLinks);
}
function parseWikiLink(rawValue) {
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
    alias: aliasPart?.trim() || void 0,
    fragment
  };
}
function extractPageTarget(targetPart) {
  const trimmed = normalizeLinkTarget(targetPart);
  const targetWithoutSize = stripEmbedSize(trimmed);
  const hashIndex = targetWithoutSize.indexOf("#");
  const blockIndex = targetWithoutSize.indexOf("^");
  const indexes = [hashIndex, blockIndex].filter((index) => index >= 0);
  const stopIndex = indexes.length > 0 ? Math.min(...indexes) : -1;
  const baseTarget = stopIndex >= 0 ? targetWithoutSize.slice(0, stopIndex) : targetWithoutSize;
  return baseTarget.trim();
}
function extractFragment(targetPart) {
  const trimmed = stripEmbedSize(targetPart.trim());
  const hashIndex = trimmed.indexOf("#");
  if (hashIndex >= 0) {
    return `#${trimmed.slice(hashIndex + 1).trim()}`;
  }
  const blockIndex = trimmed.indexOf("^");
  if (blockIndex >= 0) {
    return `#^${trimmed.slice(blockIndex + 1).trim()}`;
  }
  return void 0;
}
function buildMarkdownHref(parsed, currentFilePath, context) {
  const encodedPath = encodeVaultPath(
    buildRelativeMarkdownPath(parsed.pageTarget, currentFilePath, context)
  );
  const encodedFragment = parsed.fragment ? `#${encodeURIComponent(parsed.fragment.slice(1))}` : "";
  return `${encodedPath}${encodedFragment}`;
}
function ensureMarkdownExtension(target) {
  return target.toLowerCase().endsWith(".md") ? target : `${target}.md`;
}
function buildRelativeMarkdownPath(rawTarget, currentFilePath, context) {
  const resolvedTarget = context.markdownResolver.resolve(rawTarget) ?? context.missingLinkFallbackPath;
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
function convertEmbedLink(originalMatch, parsed, currentFilePath, context) {
  const resolvedTarget = context.fileResolver.resolve(parsed.pageTarget);
  if (!resolvedTarget || resolvedTarget.toLowerCase().endsWith(".md")) {
    return originalMatch;
  }
  const relativeTarget = buildRelativePath(resolvedTarget, currentFilePath, context);
  const encodedPath = encodeVaultPath(relativeTarget);
  const encodedFragment = parsed.fragment ? `#${encodeURIComponent(parsed.fragment.slice(1))}` : "";
  const altText = buildEmbedAltText(parsed);
  const sizeSuffix = buildEmbedSizeSuffix(parsed.originalTarget);
  return `![${altText}](${encodedPath}${encodedFragment}${sizeSuffix})`;
}
function buildRelativePath(resolvedTarget, currentFilePath, context) {
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
function createLinkResolver(rootDirectory, markdownFiles) {
  const exactMatches = /* @__PURE__ */ new Map();
  const basenameMatches = /* @__PURE__ */ new Map();
  for (const filePath of markdownFiles) {
    const relativePath = toPosixPath(path.relative(rootDirectory, filePath));
    const relativeWithoutExtension = stripMarkdownExtension(relativePath);
    const basename2 = path.posix.basename(relativeWithoutExtension);
    for (const key of buildLookupKeys(relativePath)) {
      exactMatches.set(key, relativePath);
    }
    const entries = basenameMatches.get(basename2) ?? [];
    entries.push(relativePath);
    basenameMatches.set(basename2, entries);
  }
  return {
    resolve(target) {
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
      const basename2 = path.posix.basename(stripMarkdownExtension(normalizedTarget));
      const basenameCandidates = basenameMatches.get(basename2) ?? [];
      if (basenameCandidates.length === 1) {
        return basenameCandidates[0];
      }
      return null;
    }
  };
}
function buildLookupKeys(value) {
  const normalizedValue = normalizeLinkTarget(value);
  if (!normalizedValue) {
    return [];
  }
  const withoutExtension = stripMarkdownExtension(normalizedValue);
  return Array.from(
    /* @__PURE__ */ new Set([
      normalizedValue,
      normalizedValue.toLowerCase(),
      withoutExtension,
      withoutExtension.toLowerCase(),
      ensureMarkdownExtension(withoutExtension),
      ensureMarkdownExtension(withoutExtension).toLowerCase()
    ])
  );
}
function stripMarkdownExtension(value) {
  return value.toLowerCase().endsWith(".md") ? value.slice(0, -3) : value;
}
function normalizeLinkTarget(value) {
  return toPosixPath(value.trim()).replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}
function normalizeFallbackPath(value) {
  const normalized = normalizeLinkTarget(value ?? "");
  if (!normalized) {
    return "404.md";
  }
  return normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
}
function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}
function stripEmbedSize(value) {
  return value.replace(/\|(?:\d+)?x?(?:\d+)?$/, "");
}
function buildEmbedSizeSuffix(rawTarget) {
  const parsedSize = parseEmbedSize(rawTarget);
  if (!parsedSize) {
    return "";
  }
  if (parsedSize.width && parsedSize.height) {
    return ` =${parsedSize.width}x${parsedSize.height}`;
  }
  if (parsedSize.width) {
    return ` =${parsedSize.width}x`;
  }
  if (parsedSize.height) {
    return ` =x${parsedSize.height}`;
  }
  return "";
}
function parseEmbedSize(rawTarget) {
  const match = rawTarget.match(/\|(?:(\d+)?x?(\d+)?)$/);
  if (!match) {
    return null;
  }
  const [, width, height] = match;
  if (!width && !height) {
    return null;
  }
  return {
    width: width || void 0,
    height: height || void 0
  };
}
function buildEmbedAltText(parsed) {
  if (parsed.alias) {
    return parsed.alias;
  }
  return path.posix.basename(parsed.pageTarget);
}
function convertCalloutsToGitHubAlerts(content) {
  const lines = content.split("\n");
  const convertedLines = [];
  for (const line of lines) {
    const converted = convertCalloutLine(line);
    if (Array.isArray(converted)) {
      convertedLines.push(...converted);
      continue;
    }
    convertedLines.push(converted);
  }
  return convertedLines.join("\n");
}
function convertCalloutLine(line) {
  const match = line.match(/^(\s*(?:>\s*)+)\[!([A-Za-z0-9_-]+)\]([+-]?)(?:\s+(.*))?$/);
  if (!match) {
    return line;
  }
  const [, prefix, rawType, , rawTitle = ""] = match;
  const type = rawType.toLowerCase();
  const title = rawTitle.trim();
  const mappedType = mapObsidianCalloutToGitHubAlert(type);
  if (mappedType === null) {
    return title ? [`${prefix}**${title}**`] : "";
  }
  const lines = [`${prefix}[!${mappedType}]`];
  if (title) {
    lines.push(`${prefix}**${title}**`);
  }
  return lines;
}
function mapObsidianCalloutToGitHubAlert(type) {
  if (["quote", "cite"].includes(type)) {
    return null;
  }
  if (["tip", "hint"].includes(type)) {
    return "TIP";
  }
  if (["important", "success", "check", "done"].includes(type)) {
    return "IMPORTANT";
  }
  if (["warning", "attention", "bug"].includes(type)) {
    return "WARNING";
  }
  if (["caution"].includes(type)) {
    return "CAUTION";
  }
  if (["danger", "error", "failure", "fail", "missing"].includes(type)) {
    return "WARNING";
  }
  return "NOTE";
}
function encodeVaultPath(target) {
  return target.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
async function writeFileAtomically(filePath, content) {
  const tempPath = `${filePath}${TEMP_FILE_SUFFIX}`;
  await import_node_fs2.promises.writeFile(tempPath, content, "utf8");
  await import_node_fs2.promises.rename(tempPath, filePath);
}

// settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULT_SETTINGS = {
  publishFolder: "Publish",
  remoteName: "origin",
  branchName: "main",
  repoUrl: "",
  sshKeyPath: "",
  missingLinkFallbackPath: "404.md",
  convertWikiLinksBeforePublish: true,
  pushMode: "explicit",
  dryRun: false
};
var UtemaPublishSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "UTEMA Sync" });
    new import_obsidian2.Setting(containerEl).setName("Folder to sync").setDesc("Chemin relatif dans le vault vers le dossier suivi par Git.").addText(
      (text) => text.setPlaceholder("Publish").setValue(this.plugin.settings.publishFolder).onChange(async (value) => {
        this.plugin.settings.publishFolder = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Remote name").setDesc("Nom du remote Git utilis\xE9 en mode de push explicite.").addText(
      (text) => text.setPlaceholder("origin").setValue(this.plugin.settings.remoteName).onChange(async (value) => {
        this.plugin.settings.remoteName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Branch name").setDesc("Nom de la branche cible en mode de push explicite.").addText(
      (text) => text.setPlaceholder("main").setValue(this.plugin.settings.branchName).onChange(async (value) => {
        this.plugin.settings.branchName = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Repository URL").setDesc("URL Git attendue pour le remote. Exemple : git@github.com:org/repo.git").addText(
      (text) => text.setPlaceholder("git@github.com:org/repo.git").setValue(this.plugin.settings.repoUrl).onChange(async (value) => {
        this.plugin.settings.repoUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("SSH key path").setDesc("Chemin local vers la cl\xE9 SSH priv\xE9e \xE0 utiliser pour Git. Optionnel.").addText(
      (text) => text.setPlaceholder("/Users/vous/.ssh/id_ed25519").setValue(this.plugin.settings.sshKeyPath).onChange(async (value) => {
        this.plugin.settings.sshKeyPath = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Missing link fallback").setDesc("Chemin Markdown \xE0 utiliser si une note cibl\xE9e n'existe pas dans le dossier synchronis\xE9.").addText(
      (text) => text.setPlaceholder("404.md").setValue(this.plugin.settings.missingLinkFallbackPath).onChange(async (value) => {
        this.plugin.settings.missingLinkFallbackPath = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Convert wiki links before sync").setDesc("R\xE9sout les liens [[...]] en vrais liens Markdown `.md` avant Git.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.convertWikiLinksBeforePublish).onChange(async (value) => {
        this.plugin.settings.convertWikiLinksBeforePublish = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Push mode").setDesc("Simple = git push. Explicite = git push <remote> <branch>.").addDropdown(
      (dropdown) => dropdown.addOption("explicit", "Explicite").addOption("simple", "Simple").setValue(this.plugin.settings.pushMode).onChange(async (value) => {
        this.plugin.settings.pushMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Dry run").setDesc("Pr\xE9pare la sync sans modifier Git ni \xE9crire les conversions.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.dryRun).onChange(async (value) => {
        this.plugin.settings.dryRun = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// main.ts
var UtemaPublishPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "utema-sync-folder-to-git",
      name: "UTEMA Sync Folder To Git",
      callback: () => {
        new CommitModal(this.app, (message) => {
          void this.runSyncWorkflow(message);
        }).open();
      }
    });
    this.addSettingTab(new UtemaPublishSettingTab(this.app, this));
  }
  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async runSyncWorkflow(commitMessage) {
    const publishFolder = this.settings.publishFolder.trim();
    if (!publishFolder) {
      new import_obsidian3.Notice("Le dossier \xE0 synchroniser n'est pas configur\xE9.");
      return;
    }
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new import_obsidian3.Notice("Impossible de d\xE9terminer le chemin local du vault.");
      return;
    }
    const publishDirectory = path2.join(vaultBasePath, (0, import_obsidian3.normalizePath)(publishFolder));
    console.info("[UTEMA Sync] Starting sync", {
      publishDirectory,
      pushMode: this.settings.pushMode,
      dryRun: this.settings.dryRun
    });
    try {
      await ensureExistingDirectory(publishDirectory);
      await ensureGitRepository(publishDirectory);
      const conversionSummary = this.settings.convertWikiLinksBeforePublish ? await convertWikiLinksInDirectory(publishDirectory, {
        writeChanges: !this.settings.dryRun,
        missingLinkFallbackPath: this.settings.missingLinkFallbackPath.trim() || DEFAULT_SETTINGS.missingLinkFallbackPath
      }) : {
        scannedFiles: 0,
        changedFiles: 0,
        changedRelativePaths: []
      };
      const gitSummary = await publishWithGit({
        workingDirectory: publishDirectory,
        commitMessage,
        remoteName: this.settings.remoteName.trim() || DEFAULT_SETTINGS.remoteName,
        branchName: this.settings.branchName.trim() || DEFAULT_SETTINGS.branchName,
        repoUrl: this.settings.repoUrl.trim(),
        sshKeyPath: this.settings.sshKeyPath.trim(),
        pushMode: this.settings.pushMode,
        dryRun: this.settings.dryRun
      });
      console.info("[UTEMA Sync] Sync summary", {
        conversionSummary,
        gitSummary
      });
      if (!gitSummary.hadChanges) {
        new import_obsidian3.Notice("Aucun changement \xE0 synchroniser.");
        return;
      }
      if (this.settings.dryRun) {
        new import_obsidian3.Notice(
          `Dry run termin\xE9. ${conversionSummary.changedFiles} fichier(s) converti(s), synchronisation Git non ex\xE9cut\xE9e.`
        );
        return;
      }
      new import_obsidian3.Notice("Synchronisation Git termin\xE9e.");
    } catch (error) {
      const message = this.formatErrorMessage(error);
      console.error("[UTEMA Sync] Sync failed", error);
      new import_obsidian3.Notice(message, 1e4);
    }
  }
  getVaultBasePath() {
    if (this.app.vault.adapter instanceof import_obsidian3.FileSystemAdapter) {
      return this.app.vault.adapter.getBasePath();
    }
    return null;
  }
  formatErrorMessage(error) {
    if (error instanceof GitServiceError) {
      const details = [error.stderr.trim(), error.stdout.trim()].filter(Boolean).join(" | ");
      return details ? `Erreur Git: ${error.command} - ${details}` : `Erreur Git: ${error.command}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Une erreur inconnue est survenue pendant la synchronisation.";
  }
};
async function ensureExistingDirectory(directoryPath) {
  let stats;
  try {
    stats = await import_node_fs3.promises.stat(directoryPath);
  } catch {
    throw new Error(`Le dossier cible est introuvable: ${directoryPath}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Le chemin configur\xE9 n'est pas un dossier: ${directoryPath}`);
  }
}
