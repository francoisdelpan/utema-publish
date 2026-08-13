import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import type { PushMode } from "./settings";

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  command: string;
  stdout: string;
  stderr: string;
}

export interface GitPublishOptions {
  workingDirectory: string;
  commitMessage: string;
  pushMode: PushMode;
  dryRun: boolean;
}

export interface GitRemoteSyncOptions {
  workingDirectory: string;
  remoteName: string;
  branchName: string;
  repoUrl: string;
  sshKeyPath: string;
  pushMode: PushMode;
  dryRun: boolean;
  shouldPushLocalChanges: boolean;
}

export interface GitPublishSummary {
  dryRun: boolean;
  hadChanges: boolean;
  committedLocalChanges: boolean;
  commands: string[];
}

export interface GitRemoteSyncSummary {
  dryRun: boolean;
  remoteName: string;
  branchName: string;
  hadChanges: boolean;
  pulledRemoteChanges: boolean;
  pushedLocalChanges: boolean;
  remoteBranchExists: boolean;
  commands: string[];
}

interface GitExecutionOptions {
  workingDirectory: string;
  sshKeyPath?: string;
}

export class GitServiceError extends Error {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    message: string,
    command: string,
    stdout = "",
    stderr = "",
  ) {
    super(message);
    this.name = "GitServiceError";
    this.command = command;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export async function ensureGitRepository(workingDirectory: string): Promise<void> {
  const result = await runGitCommand(["rev-parse", "--is-inside-work-tree"], {
    workingDirectory,
  });

  if (result.stdout.trim() !== "true") {
    throw new GitServiceError(
      "Le dossier cible n'est pas reconnu comme un dépôt Git.",
      "git rev-parse --is-inside-work-tree",
      result.stdout,
      result.stderr,
    );
  }
}

export async function publishWithGit(
  options: GitPublishOptions,
): Promise<GitPublishSummary> {
  const commands: string[] = [];
  const executionOptions: GitExecutionOptions = {
    workingDirectory: options.workingDirectory,
  };

  const statusBefore = await getStatusSummary(executionOptions);
  const hasLocalChanges = Boolean(statusBefore);

  if (!hasLocalChanges) {
    return {
      dryRun: options.dryRun,
      hadChanges: false,
      committedLocalChanges: false,
      commands,
    };
  }

  commands.push("git add .");
  commands.push(`git commit -m "${options.commitMessage}"`);

  if (options.dryRun) {
    return {
      dryRun: true,
      hadChanges: true,
      committedLocalChanges: false,
      commands,
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

  return {
    dryRun: false,
    hadChanges: true,
    committedLocalChanges: true,
    commands,
  };
}

export async function syncGitRemote(
  options: GitRemoteSyncOptions,
): Promise<GitRemoteSyncSummary> {
  const commands: string[] = [];
  const executionOptions: GitExecutionOptions = {
    workingDirectory: options.workingDirectory,
    sshKeyPath: normalizeOptionalValue(options.sshKeyPath),
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

  const remoteLookupTarget = options.dryRun && normalizedRepoUrl
    ? normalizedRepoUrl
    : options.remoteName;
  const remoteBranchExists = await doesRemoteBranchExist(
    remoteLookupTarget,
    options.branchName,
    executionOptions,
  );
  const pullCommand = buildPullCommandLabel(options.remoteName, options.branchName);
  let pulledRemoteChanges = false;
  const shouldPush = options.shouldPushLocalChanges || !remoteBranchExists;

  if (remoteBranchExists) {
    commands.push(pullCommand);
  } else {
    commands.push(
      `# branche distante absente: ${options.remoteName}/${options.branchName}, pull ignore`,
    );
  }

  if (shouldPush) {
    commands.push(
      buildPushCommandLabel(
        options.pushMode,
        options.remoteName,
        options.branchName,
        !remoteBranchExists,
      ),
    );
  }

  if (options.dryRun) {
    return {
      dryRun: true,
      remoteName: options.remoteName,
      branchName: options.branchName,
      hadChanges: shouldPush,
      pulledRemoteChanges: false,
      pushedLocalChanges: shouldPush,
      remoteBranchExists,
      commands,
    };
  }

  if (remoteBranchExists) {
    pulledRemoteChanges = await pullLatestChanges(
      options.remoteName,
      options.branchName,
      executionOptions,
    );
  }

  if (shouldPush) {
    const pushArgs = buildPushCommandArgs(
      options.pushMode,
      options.remoteName,
      options.branchName,
      !remoteBranchExists,
    );
    await runGitCommand(pushArgs, executionOptions);
  }

  return {
    dryRun: false,
    remoteName: options.remoteName,
    branchName: options.branchName,
    hadChanges: pulledRemoteChanges || shouldPush,
    pulledRemoteChanges,
    pushedLocalChanges: shouldPush,
    remoteBranchExists,
    commands,
  };
}

async function ensureReadableSshKey(sshKeyPath: string): Promise<void> {
  try {
    const stats = await fs.stat(sshKeyPath);
    if (!stats.isFile()) {
      throw new Error("not-a-file");
    }
  } catch {
    throw new Error(`Clé SSH introuvable ou illisible: ${sshKeyPath}`);
  }
}

async function ensureRemoteConfigured(
  remoteName: string,
  repoUrl: string,
  executionOptions: GitExecutionOptions,
): Promise<void> {
  const currentRemoteUrl = await getRemoteUrl(remoteName, executionOptions);

  if (!currentRemoteUrl) {
    await runGitCommand(["remote", "add", remoteName, repoUrl], executionOptions);
    return;
  }

  if (currentRemoteUrl !== repoUrl) {
    await runGitCommand(["remote", "set-url", remoteName, repoUrl], executionOptions);
  }
}

async function getRemoteUrl(
  remoteName: string,
  executionOptions: GitExecutionOptions,
): Promise<string | null> {
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

async function doesRemoteBranchExist(
  remoteName: string,
  branchName: string,
  executionOptions: GitExecutionOptions,
): Promise<boolean> {
  const result = await runGitCommand(
    ["ls-remote", "--heads", remoteName, branchName],
    executionOptions,
  );

  return result.stdout.trim().length > 0;
}

async function pullLatestChanges(
  remoteName: string,
  branchName: string,
  executionOptions: GitExecutionOptions,
): Promise<boolean> {
  const result = await runGitCommand(
    ["pull", "--rebase", remoteName, branchName],
    executionOptions,
  );

  const combinedOutput = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return !combinedOutput.includes("already up to date");
}

async function getStatusSummary(executionOptions: GitExecutionOptions): Promise<string> {
  const result = await runGitCommand(["status", "--porcelain"], executionOptions);
  return result.stdout.trim();
}

function isNothingToCommitError(error: unknown): boolean {
  if (!(error instanceof GitServiceError)) {
    return false;
  }

  const combinedOutput = `${error.stdout}\n${error.stderr}`.toLowerCase();
  return (
    combinedOutput.includes("nothing to commit") ||
    combinedOutput.includes("no changes added to commit")
  );
}

function isMissingRemoteError(error: unknown): boolean {
  if (!(error instanceof GitServiceError)) {
    return false;
  }

  const combinedOutput = `${error.stdout}\n${error.stderr}`.toLowerCase();
  return combinedOutput.includes("no such remote");
}

async function runGitCommand(
  args: string[],
  executionOptions: GitExecutionOptions,
): Promise<GitCommandResult> {
  const commandLabel = `git ${args.join(" ")}`;

  try {
    const result = await execFileAsync("git", args, {
      cwd: executionOptions.workingDirectory,
      env: buildGitEnvironment(executionOptions.sshKeyPath),
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    return {
      command: commandLabel,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (error) {
    const stdout =
      typeof error === "object" && error && "stdout" in error
        ? String((error as { stdout?: string }).stdout ?? "")
        : "";
    const stderr =
      typeof error === "object" && error && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? "")
        : "";

    throw new GitServiceError(
      `La commande a échoué: ${commandLabel}`,
      commandLabel,
      stdout,
      stderr,
    );
  }
}

function buildGitEnvironment(sshKeyPath?: string): NodeJS.ProcessEnv {
  if (!sshKeyPath) {
    return { ...process.env };
  }

  const escapedPath = sshKeyPath.replace(/"/g, '\\"');
  return {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i "${escapedPath}" -o IdentitiesOnly=yes`,
  };
}

function buildPullCommandLabel(remoteName: string, branchName: string): string {
  return `git pull --rebase ${remoteName} ${branchName}`;
}

function buildPushCommandLabel(
  pushMode: PushMode,
  remoteName: string,
  branchName: string,
  setUpstream = false,
): string {
  if (setUpstream) {
    return `git push -u ${remoteName} ${branchName}`;
  }

  return pushMode === "simple"
    ? "git push"
    : `git push ${remoteName} ${branchName}`;
}

function buildPushCommandArgs(
  pushMode: PushMode,
  remoteName: string,
  branchName: string,
  setUpstream: boolean,
): string[] {
  if (setUpstream) {
    return ["push", "-u", remoteName, branchName];
  }

  return pushMode === "simple"
    ? ["push"]
    : ["push", remoteName, branchName];
}

function normalizeOptionalValue(value: string): string {
  return value.trim();
}
