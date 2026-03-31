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
  remoteName: string;
  branchName: string;
  repoUrl: string;
  sshKeyPath: string;
  pushMode: PushMode;
  dryRun: boolean;
}

export interface GitPublishSummary {
  dryRun: boolean;
  hadChanges: boolean;
  pulledRemoteChanges: boolean;
  pushedLocalChanges: boolean;
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

  const statusBefore = await getStatusSummary(executionOptions);
  const pullCommand = buildPullCommandLabel(options.remoteName, options.branchName);
  let pulledRemoteChanges = false;

  if (!statusBefore) {
    commands.push(pullCommand);

    if (!options.dryRun) {
      pulledRemoteChanges = await pullLatestChanges(
        options.remoteName,
        options.branchName,
        executionOptions,
      );
    }

    return {
      dryRun: options.dryRun,
      hadChanges: pulledRemoteChanges,
      pulledRemoteChanges,
      pushedLocalChanges: false,
      commands,
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

  pulledRemoteChanges = await pullLatestChanges(
    options.remoteName,
    options.branchName,
    executionOptions,
  );

  const pushArgs =
    options.pushMode === "simple"
      ? ["push"]
      : ["push", options.remoteName, options.branchName];
  await runGitCommand(pushArgs, executionOptions);

  return {
    dryRun: false,
    hadChanges: true,
    pulledRemoteChanges,
    pushedLocalChanges: true,
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
    throw new Error(
      `Le remote ${remoteName} pointe vers ${currentRemoteUrl}, mais la configuration demande ${repoUrl}.`,
    );
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
): string {
  return pushMode === "simple"
    ? "git push"
    : `git push ${remoteName} ${branchName}`;
}

function normalizeOptionalValue(value: string): string {
  return value.trim();
}
