import { execFile } from "node:child_process";
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
  pushMode: PushMode;
  dryRun: boolean;
}

export interface GitPublishSummary {
  dryRun: boolean;
  hadChanges: boolean;
  commands: string[];
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
  const result = await runGitCommand(["rev-parse", "--is-inside-work-tree"], workingDirectory);

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
  const statusBefore = await getStatusSummary(options.workingDirectory);

  if (!statusBefore) {
    return {
      dryRun: options.dryRun,
      hadChanges: false,
      commands,
    };
  }

  commands.push("git add .");

  if (options.dryRun) {
    commands.push(`git commit -m "${options.commitMessage}"`);
    commands.push(buildPushCommandLabel(options.pushMode, options.remoteName, options.branchName));
    return {
      dryRun: true,
      hadChanges: true,
      commands,
    };
  }

  await runGitCommand(["add", "."], options.workingDirectory);

  commands.push(`git commit -m "${options.commitMessage}"`);
  try {
    await runGitCommand(["commit", "-m", options.commitMessage], options.workingDirectory);
  } catch (error) {
    if (isNothingToCommitError(error)) {
      return {
        dryRun: false,
        hadChanges: false,
        commands,
      };
    }

    throw error;
  }

  const pushArgs =
    options.pushMode === "simple"
      ? ["push"]
      : ["push", options.remoteName, options.branchName];

  commands.push(buildPushCommandLabel(options.pushMode, options.remoteName, options.branchName));
  await runGitCommand(pushArgs, options.workingDirectory);

  return {
    dryRun: false,
    hadChanges: true,
    commands,
  };
}

async function getStatusSummary(workingDirectory: string): Promise<string> {
  const result = await runGitCommand(["status", "--porcelain"], workingDirectory);
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

async function runGitCommand(
  args: string[],
  workingDirectory: string,
): Promise<GitCommandResult> {
  const commandLabel = `git ${args.join(" ")}`;

  try {
    const result = await execFileAsync("git", args, {
      cwd: workingDirectory,
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

function buildPushCommandLabel(
  pushMode: PushMode,
  remoteName: string,
  branchName: string,
): string {
  return pushMode === "simple"
    ? "git push"
    : `git push ${remoteName} ${branchName}`;
}
