import { App, PluginSettingTab, Setting } from "obsidian";
import type UtemaPublishPlugin from "./main";

export type PushMode = "explicit" | "simple";
export type SyncTarget = "gitea" | "github" | "both";

export type RepositoryKey = "gitea" | "github";

export interface GitRepositorySettings {
  remoteName: string;
  branchName: string;
  repoUrl: string;
  sshKeyPath: string;
}

export interface UtemaPublishSettings {
  publishFolder: string;
  autoMoveFolder: string;
  syncTarget: SyncTarget;
  repositories: Record<RepositoryKey, GitRepositorySettings>;
  missingLinkFallbackPath: string;
  convertWikiLinksBeforePublish: boolean;
  pushMode: PushMode;
  dryRun: boolean;
}

export const DEFAULT_GITHUB_REPO_URL = "git@github.com:francoisdelpan/univers-utema.git";

export const DEFAULT_SETTINGS: UtemaPublishSettings = {
  publishFolder: "Publish",
  autoMoveFolder: "",
  syncTarget: "gitea",
  repositories: {
    gitea: {
      remoteName: "origin",
      branchName: "main",
      repoUrl: "",
      sshKeyPath: "",
    },
    github: {
      remoteName: "github",
      branchName: "main",
      repoUrl: DEFAULT_GITHUB_REPO_URL,
      sshKeyPath: "",
    },
  },
  missingLinkFallbackPath: "404.md",
  convertWikiLinksBeforePublish: true,
  pushMode: "explicit",
  dryRun: false,
};

interface LegacyUtemaPublishSettings extends Partial<UtemaPublishSettings> {
  remoteName?: string;
  branchName?: string;
  repoUrl?: string;
  sshKeyPath?: string;
}

export function normalizeSettings(
  loaded: LegacyUtemaPublishSettings | null | undefined,
): UtemaPublishSettings {
  const legacy = loaded ?? {};
  const giteaSettings = {
    ...DEFAULT_SETTINGS.repositories.gitea,
    ...(legacy.repositories?.gitea ?? {}),
  };
  const githubSettings = {
    ...DEFAULT_SETTINGS.repositories.github,
    ...(legacy.repositories?.github ?? {}),
  };

  if (typeof legacy.remoteName === "string") {
    giteaSettings.remoteName = legacy.remoteName;
  }
  if (typeof legacy.branchName === "string") {
    giteaSettings.branchName = legacy.branchName;
  }
  if (typeof legacy.repoUrl === "string") {
    giteaSettings.repoUrl = legacy.repoUrl;
  }
  if (typeof legacy.sshKeyPath === "string") {
    giteaSettings.sshKeyPath = legacy.sshKeyPath;
  }

  return {
    publishFolder: typeof legacy.publishFolder === "string"
      ? legacy.publishFolder
      : DEFAULT_SETTINGS.publishFolder,
    autoMoveFolder: typeof legacy.autoMoveFolder === "string"
      ? legacy.autoMoveFolder
      : DEFAULT_SETTINGS.autoMoveFolder,
    syncTarget: isSyncTarget(legacy.syncTarget)
      ? legacy.syncTarget
      : DEFAULT_SETTINGS.syncTarget,
    repositories: {
      gitea: giteaSettings,
      github: githubSettings,
    },
    missingLinkFallbackPath: typeof legacy.missingLinkFallbackPath === "string"
      ? legacy.missingLinkFallbackPath
      : DEFAULT_SETTINGS.missingLinkFallbackPath,
    convertWikiLinksBeforePublish:
      typeof legacy.convertWikiLinksBeforePublish === "boolean"
        ? legacy.convertWikiLinksBeforePublish
        : DEFAULT_SETTINGS.convertWikiLinksBeforePublish,
    pushMode: isPushMode(legacy.pushMode)
      ? legacy.pushMode
      : DEFAULT_SETTINGS.pushMode,
    dryRun: typeof legacy.dryRun === "boolean"
      ? legacy.dryRun
      : DEFAULT_SETTINGS.dryRun,
  };
}

function isSyncTarget(value: unknown): value is SyncTarget {
  return value === "gitea" || value === "github" || value === "both";
}

function isPushMode(value: unknown): value is PushMode {
  return value === "explicit" || value === "simple";
}

export class UtemaPublishSettingTab extends PluginSettingTab {
  private readonly plugin: UtemaPublishPlugin;

  constructor(app: App, plugin: UtemaPublishPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "UTEMA Sync" });

    new Setting(containerEl)
      .setName("Folder to sync")
      .setDesc("Chemin relatif dans le vault vers le dossier suivi par Git.")
      .addText((text) =>
        text
          .setPlaceholder("Publish")
          .setValue(this.plugin.settings.publishFolder)
          .onChange(async (value) => {
            this.plugin.settings.publishFolder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auto moving files folder")
      .setDesc("Dossier racine utilisé par la commande de déplacement rapide. La commande proposera ses sous-dossiers dans une mini-modale.")
      .addText((text) =>
        text
          .setPlaceholder("Inbox/Reviewed")
          .setValue(this.plugin.settings.autoMoveFolder)
          .onChange(async (value) => {
            this.plugin.settings.autoMoveFolder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Sync target")
      .setDesc("Destination Git à synchroniser.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("gitea", "Repo Gitea")
          .addOption("github", "Repo GitHub")
          .addOption("both", "Les deux")
          .setValue(this.plugin.settings.syncTarget)
          .onChange(async (value: SyncTarget) => {
            this.plugin.settings.syncTarget = value;
            await this.plugin.saveSettings();
          }),
      );

    this.displayRepositorySettings("Repo Gitea", "gitea");
    this.displayRepositorySettings("Repo GitHub", "github");

    this.displayGeneralSettings();
  }

  private displayGeneralSettings(): void {
    const generalSection = this.createSettingsSection("Paramétrage général");

    new Setting(generalSection)
      .setName("Missing link fallback")
      .setDesc("Chemin Markdown à utiliser si une note ciblée n'existe pas dans le dossier synchronisé.")
      .addText((text) =>
        text
          .setPlaceholder("404.md")
          .setValue(this.plugin.settings.missingLinkFallbackPath)
          .onChange(async (value) => {
            this.plugin.settings.missingLinkFallbackPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(generalSection)
      .setName("Convert wiki links before sync")
      .setDesc("Résout les liens [[...]] en vrais liens Markdown `.md` avant Git.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertWikiLinksBeforePublish)
          .onChange(async (value) => {
            this.plugin.settings.convertWikiLinksBeforePublish = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(generalSection)
      .setName("Push mode")
      .setDesc("Simple = git push. Explicite = git push <remote> <branch>. En mode Les deux, le push explicite est forcé.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("explicit", "Explicite")
          .addOption("simple", "Simple")
          .setValue(this.plugin.settings.pushMode)
          .onChange(async (value: PushMode) => {
            this.plugin.settings.pushMode = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(generalSection)
      .setName("Dry run")
      .setDesc("Prépare la sync sans modifier Git ni écrire les conversions.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.dryRun).onChange(async (value) => {
          this.plugin.settings.dryRun = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private displayRepositorySettings(title: string, repositoryKey: RepositoryKey): void {
    const repositorySection = this.createAccordionSection(title);
    const repositorySettings = this.plugin.settings.repositories[repositoryKey];

    new Setting(repositorySection)
      .setName(`${title} remote name`)
      .setDesc("Nom du remote Git utilisé en mode de push explicite.")
      .addText((text) =>
        text
          .setPlaceholder(repositoryKey === "github" ? "github" : "origin")
          .setValue(repositorySettings.remoteName)
          .onChange(async (value) => {
            repositorySettings.remoteName = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(repositorySection)
      .setName(`${title} branch name`)
      .setDesc("Nom de la branche cible en mode de push explicite.")
      .addText((text) =>
        text
          .setPlaceholder("main")
          .setValue(repositorySettings.branchName)
          .onChange(async (value) => {
            repositorySettings.branchName = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(repositorySection)
      .setName(`${title} repository URL`)
      .setDesc("URL Git attendue pour le remote. Si le remote existe deja, son URL sera mise a jour automatiquement.")
      .addText((text) =>
        text
          .setPlaceholder(
            repositoryKey === "github"
              ? DEFAULT_GITHUB_REPO_URL
              : "git@forge.example.com:org/repo.git",
          )
          .setValue(repositorySettings.repoUrl)
          .onChange(async (value) => {
            repositorySettings.repoUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(repositorySection)
      .setName(`${title} SSH key path`)
      .setDesc("Chemin local vers la clé SSH privée à utiliser pour Git. Optionnel.")
      .addText((text) =>
        text
          .setPlaceholder("/Users/vous/.ssh/id_ed25519")
          .setValue(repositorySettings.sshKeyPath)
          .onChange(async (value) => {
            repositorySettings.sshKeyPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }

  private createSettingsSection(title: string): HTMLElement {
    const section = this.containerEl.createDiv({ cls: "utema-publish-settings-section" });
    section.createEl("h3", { text: title });
    return section;
  }

  private createAccordionSection(title: string): HTMLElement {
    const details = this.containerEl.createEl("details", {
      cls: "utema-publish-settings-accordion",
    });
    details.createEl("summary", {
      text: title,
      cls: "utema-publish-settings-accordion-summary",
    });
    return details.createDiv({ cls: "utema-publish-settings-accordion-content" });
  }
}
