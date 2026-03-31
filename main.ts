import * as path from "node:path";
import { promises as fs } from "node:fs";
import {
  FileSystemAdapter,
  Notice,
  Plugin,
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
      id: "utema-publish",
      name: "UTEMA Publish",
      callback: () => {
        new CommitModal(this.app, (message) => {
          void this.runPublishWorkflow(message);
        }).open();
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

  private async runPublishWorkflow(commitMessage: string): Promise<void> {
    const publishFolder = this.settings.publishFolder.trim();

    if (!publishFolder) {
      new Notice("Le dossier de publication n'est pas configuré.");
      return;
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new Notice("Impossible de déterminer le chemin local du vault.");
      return;
    }

    const publishDirectory = path.join(vaultBasePath, normalizePath(publishFolder));
    console.info("[UTEMA Publish] Starting publish", {
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
        pushMode: this.settings.pushMode,
        dryRun: this.settings.dryRun,
      });

      console.info("[UTEMA Publish] Publish summary", {
        conversionSummary,
        gitSummary,
      });

      if (!gitSummary.hadChanges) {
        new Notice("Aucun changement à publier.");
        return;
      }

      if (this.settings.dryRun) {
        new Notice(
          `Dry run terminé. ${conversionSummary.changedFiles} fichier(s) modifié(s), Git non exécuté.`,
        );
        return;
      }

      new Notice("Publication terminée.");
    } catch (error) {
      const message = this.formatErrorMessage(error);
      console.error("[UTEMA Publish] Publish failed", error);
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

    return "Une erreur inconnue est survenue pendant la publication.";
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
