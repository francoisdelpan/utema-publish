import * as path from "node:path";
import { promises as fs } from "node:fs";
import {
  FileSystemAdapter,
  FuzzySuggestModal,
  FuzzyMatch,
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
import {
  convertMarkdownLinksToObsidianInDirectory,
  convertWikiLinksInDirectory,
} from "./linkConverter";
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

    this.addCommand({
      id: "utema-remap-folder-to-obsidian-links",
      name: "UTEMA Remap Folder To Obsidian Links",
      callback: () => {
        void this.remapFolderToObsidianLinks();
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

    const autoMoveRootFolder = normalizePath(this.settings.autoMoveFolder.trim());
    if (!autoMoveRootFolder) {
      new Notice("Le dossier racine 'Auto moving files folder' n'est pas configuré.");
      return;
    }

    try {
      await ensureVaultFolderExists(this.app, autoMoveRootFolder);
      const availableFolders = collectSubfolders(
        this.app,
        autoMoveRootFolder,
      );

      if (availableFolders.length === 0) {
        new Notice("Aucun dossier disponible dans la racine configurée.");
        return;
      }

      new FolderSelectionModal(
        this.app,
        autoMoveRootFolder,
        availableFolders,
        async (selectedFolder) => {
          const destinationPath = await this.getAvailableDestinationPath(activeFile, selectedFolder);
          if (destinationPath === activeFile.path) {
            new Notice("Le fichier est déjà dans le dossier cible.");
            return;
          }

          await this.app.fileManager.renameFile(activeFile, destinationPath);
          new Notice(`Fichier déplacé vers ${destinationPath}.`);
        },
      ).open();
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

  private async remapFolderToObsidianLinks(): Promise<void> {
    const publishFolder = this.settings.publishFolder.trim();

    if (!publishFolder) {
      new Notice("Le dossier à remapper n'est pas configuré.");
      return;
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new Notice("Impossible de déterminer le chemin local du vault.");
      return;
    }

    const publishDirectory = path.join(vaultBasePath, normalizePath(publishFolder));

    try {
      await ensureExistingDirectory(publishDirectory);

      const conversionSummary = await convertMarkdownLinksToObsidianInDirectory(
        publishDirectory,
        {
          writeChanges: true,
          missingLinkFallbackPath:
            this.settings.missingLinkFallbackPath.trim()
            || DEFAULT_SETTINGS.missingLinkFallbackPath,
        },
      );

      if (conversionSummary.changedFiles === 0) {
        new Notice("Aucun lien Markdown à remapper vers Obsidian.");
        return;
      }

      new Notice(
        `Remap Obsidian terminé. ${conversionSummary.changedFiles} fichier(s) mis à jour.`,
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Impossible de remapper le dossier vers Obsidian.";
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

class FolderSelectionModal extends FuzzySuggestModal<string> {
  private readonly rootFolder: string;
  private readonly folders: string[];
  private readonly onChoose: (folderPath: string) => Promise<void> | void;

  constructor(
    app: Plugin["app"],
    rootFolder: string,
    folders: string[],
    onChoose: (folderPath: string) => Promise<void> | void,
  ) {
    super(app);
    this.rootFolder = rootFolder;
    this.folders = folders;
    this.onChoose = onChoose;
    this.setPlaceholder("Choisir un dossier de destination");
    this.emptyStateText = "Aucun dossier trouvé.";
    this.setInstructions([
      { command: "↑↓", purpose: "Naviguer" },
      { command: "↵", purpose: "Déplacer le fichier" },
      { command: "esc", purpose: "Annuler" },
    ]);
  }

  getItems(): string[] {
    return this.folders;
  }

  getItemText(item: string): string {
    return toRelativeFolderLabel(item, this.rootFolder);
  }

  onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
    void this.onChoose(item);
  }

  renderSuggestion(item: FuzzyMatch<string>, el: HTMLElement): void {
    el.createEl("div", { text: toRelativeFolderLabel(item.item, this.rootFolder) });
    el.createEl("small", { text: item.item });
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

function collectSubfolders(app: Plugin["app"], rootFolderPath: string): string[] {
  const root = app.vault.getAbstractFileByPath(rootFolderPath);
  if (!(root instanceof TFolder)) {
    return [];
  }

  const folders: string[] = [root.path];
  const stack: TFolder[] = [root];

  while (stack.length > 0) {
    const currentFolder = stack.pop();
    if (!currentFolder) {
      continue;
    }

    const childFolders = currentFolder.children
      .filter((child): child is TFolder => child instanceof TFolder)
      .sort((left, right) => left.path.localeCompare(right.path));

    for (const childFolder of childFolders) {
      folders.push(childFolder.path);
      stack.push(childFolder);
    }
  }

  return folders;
}

function toRelativeFolderLabel(folderPath: string, rootFolderPath: string): string {
  if (folderPath === rootFolderPath) {
    return ".";
  }

  const rootPrefix = `${rootFolderPath}/`;
  return folderPath.startsWith(rootPrefix)
    ? folderPath.slice(rootPrefix.length)
    : folderPath;
}
