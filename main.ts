import * as path from "node:path";
import { promises as fs } from "node:fs";
import {
  FileSystemAdapter,
  Notice,
  Plugin,
  TFolder,
  TFile,
  normalizePath,
} from "obsidian";
import { CommitModal } from "./commitModal";
import {
  ensureGitRepository,
  GitServiceError,
  publishWithGit,
} from "./gitService";
import { convertWikiLinksInDirectory } from "./linkConverter";
import {
  DEFAULT_SETTINGS,
  UtemaPublishSettingTab,
  type UtemaPublishSettings,
} from "./settings";

export default class UtemaPublishPlugin extends Plugin {
  settings: UtemaPublishSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "utema-sync-folder-to-git",
      name: "UTEMA Sync Folder To Git",
      callback: () => {
        new CommitModal(this.app, (message) => {
          void this.runSyncWorkflow(message);
        }).open();
      },
    });

    this.addCommand({
      id: "utema-move-active-file-to-auto-folder",
      name: "UTEMA Move Active File To Auto Folder",
      callback: () => {
        void this.moveActiveFileToAutoFolder();
      },
    });

    this.addSettingTab(new UtemaPublishSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async moveActiveFileToAutoFolder(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("Aucun fichier actif à déplacer.");
      return;
    }

    const autoMoveFolder = normalizePath(this.settings.autoMoveFolder.trim());
    if (!autoMoveFolder) {
      new Notice("Le dossier 'Auto moving files folder' n'est pas configuré.");
      return;
    }

    try {
      await ensureVaultFolderExists(this.app, autoMoveFolder);

      const destinationPath = await this.getAvailableDestinationPath(activeFile, autoMoveFolder);
      if (destinationPath === activeFile.path) {
        new Notice("Le fichier est déjà dans le dossier cible.");
        return;
      }

      await this.app.fileManager.renameFile(activeFile, destinationPath);
      new Notice(`Fichier déplacé vers ${destinationPath}.`);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Impossible de déplacer le fichier actif.";
      new Notice(message, 10000);
    }
  }

  private async runSyncWorkflow(commitMessage: string): Promise<void> {
    const publishFolder = this.settings.publishFolder.trim();

    if (!publishFolder) {
      new Notice("Le dossier à synchroniser n'est pas configuré.");
      return;
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new Notice("Impossible de déterminer le chemin local du vault.");
      return;
    }

    const publishDirectory = path.join(vaultBasePath, normalizePath(publishFolder));
    console.info("[UTEMA Sync] Starting sync", {
      publishDirectory,
      pushMode: this.settings.pushMode,
      dryRun: this.settings.dryRun,
    });

    try {
      await ensureExistingDirectory(publishDirectory);
      await ensureGitRepository(publishDirectory);

      const conversionSummary = this.settings.convertWikiLinksBeforePublish
        ? await convertWikiLinksInDirectory(publishDirectory, {
            writeChanges: !this.settings.dryRun,
            missingLinkFallbackPath:
              this.settings.missingLinkFallbackPath.trim()
              || DEFAULT_SETTINGS.missingLinkFallbackPath,
          })
        : {
            scannedFiles: 0,
            changedFiles: 0,
            changedRelativePaths: [],
          };

      const gitSummary = await publishWithGit({
        workingDirectory: publishDirectory,
        commitMessage,
        remoteName: this.settings.remoteName.trim() || DEFAULT_SETTINGS.remoteName,
        branchName: this.settings.branchName.trim() || DEFAULT_SETTINGS.branchName,
        repoUrl: this.settings.repoUrl.trim(),
        sshKeyPath: this.settings.sshKeyPath.trim(),
        pushMode: this.settings.pushMode,
        dryRun: this.settings.dryRun,
      });

      console.info("[UTEMA Sync] Sync summary", {
        conversionSummary,
        gitSummary,
      });

      if (!gitSummary.hadChanges) {
        new Notice("Aucun changement à synchroniser.");
        return;
      }

      if (this.settings.dryRun) {
        new Notice(
          `Dry run terminé. ${conversionSummary.changedFiles} fichier(s) converti(s), synchronisation Git non exécutée.`,
        );
        return;
      }

      new Notice("Synchronisation Git terminée.");
    } catch (error) {
      const message = this.formatErrorMessage(error);
      console.error("[UTEMA Sync] Sync failed", error);
      new Notice(message, 10000);
    }
  }

  private getVaultBasePath(): string | null {
    if (this.app.vault.adapter instanceof FileSystemAdapter) {
      return this.app.vault.adapter.getBasePath();
    }

    return null;
  }

  private formatErrorMessage(error: unknown): string {
    if (error instanceof GitServiceError) {
      const details = [error.stderr.trim(), error.stdout.trim()]
        .filter(Boolean)
        .join(" | ");

      return details
        ? `Erreur Git: ${error.command} - ${details}`
        : `Erreur Git: ${error.command}`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "Une erreur inconnue est survenue pendant la synchronisation.";
  }

  private async getAvailableDestinationPath(
    file: TFile,
    targetFolder: string,
  ): Promise<string> {
    const extensionSuffix = file.extension ? `.${file.extension}` : "";
    const baseName = extensionSuffix
      ? file.name.slice(0, -extensionSuffix.length)
      : file.name;

    let candidatePath = normalizePath(`${targetFolder}/${file.name}`);
    let counter = 1;

    while (this.app.vault.getAbstractFileByPath(candidatePath)) {
      if (candidatePath === file.path) {
        return candidatePath;
      }

      candidatePath = normalizePath(
        `${targetFolder}/${baseName} ${counter}${extensionSuffix}`,
      );
      counter += 1;
    }

    return candidatePath;
  }
}

async function ensureExistingDirectory(directoryPath: string): Promise<void> {
  let stats;

  try {
    stats = await fs.stat(directoryPath);
  } catch {
    throw new Error(`Le dossier cible est introuvable: ${directoryPath}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Le chemin configuré n'est pas un dossier: ${directoryPath}`);
  }
}

async function ensureVaultFolderExists(
  app: Plugin["app"],
  folderPath: string,
): Promise<void> {
  const normalizedFolderPath = normalizePath(folderPath);
  if (!normalizedFolderPath) {
    throw new Error("Le dossier cible est vide.");
  }

  const existing = app.vault.getAbstractFileByPath(normalizedFolderPath);
  if (existing instanceof TFolder) {
    return;
  }

  if (existing) {
    throw new Error(`Le chemin cible existe déjà et n'est pas un dossier: ${normalizedFolderPath}`);
  }

  const segments = normalizedFolderPath.split("/");
  let currentPath = "";

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const current = app.vault.getAbstractFileByPath(currentPath);

    if (current instanceof TFolder) {
      continue;
    }

    if (current) {
      throw new Error(`Impossible de créer le dossier ${currentPath}: un fichier existe déjà.`);
    }

    await app.vault.createFolder(currentPath);
  }
}
