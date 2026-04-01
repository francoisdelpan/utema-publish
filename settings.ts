import { App, PluginSettingTab, Setting } from "obsidian";
import type UtemaPublishPlugin from "./main";

export type PushMode = "explicit" | "simple";

export interface UtemaPublishSettings {
  publishFolder: string;
  autoMoveFolder: string;
  remoteName: string;
  branchName: string;
  repoUrl: string;
  sshKeyPath: string;
  missingLinkFallbackPath: string;
  convertWikiLinksBeforePublish: boolean;
  pushMode: PushMode;
  dryRun: boolean;
}

export const DEFAULT_SETTINGS: UtemaPublishSettings = {
  publishFolder: "Publish",
  autoMoveFolder: "",
  remoteName: "origin",
  branchName: "main",
  repoUrl: "",
  sshKeyPath: "",
  missingLinkFallbackPath: "404.md",
  convertWikiLinksBeforePublish: true,
  pushMode: "explicit",
  dryRun: false,
};

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
      .setName("Remote name")
      .setDesc("Nom du remote Git utilisé en mode de push explicite.")
      .addText((text) =>
        text
          .setPlaceholder("origin")
          .setValue(this.plugin.settings.remoteName)
          .onChange(async (value) => {
            this.plugin.settings.remoteName = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Branch name")
      .setDesc("Nom de la branche cible en mode de push explicite.")
      .addText((text) =>
        text
          .setPlaceholder("main")
          .setValue(this.plugin.settings.branchName)
          .onChange(async (value) => {
            this.plugin.settings.branchName = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Repository URL")
      .setDesc("URL Git attendue pour le remote. Exemple : git@github.com:org/repo.git")
      .addText((text) =>
        text
          .setPlaceholder("git@github.com:org/repo.git")
          .setValue(this.plugin.settings.repoUrl)
          .onChange(async (value) => {
            this.plugin.settings.repoUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("SSH key path")
      .setDesc("Chemin local vers la clé SSH privée à utiliser pour Git. Optionnel.")
      .addText((text) =>
        text
          .setPlaceholder("/Users/vous/.ssh/id_ed25519")
          .setValue(this.plugin.settings.sshKeyPath)
          .onChange(async (value) => {
            this.plugin.settings.sshKeyPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName("Push mode")
      .setDesc("Simple = git push. Explicite = git push <remote> <branch>.")
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

    new Setting(containerEl)
      .setName("Dry run")
      .setDesc("Prépare la sync sans modifier Git ni écrire les conversions.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.dryRun).onChange(async (value) => {
          this.plugin.settings.dryRun = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
