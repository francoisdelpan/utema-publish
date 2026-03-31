import { App, PluginSettingTab, Setting } from "obsidian";
import type UtemaPublishPlugin from "./main";

export type PushMode = "explicit" | "simple";

export interface UtemaPublishSettings {
  publishFolder: string;
  remoteName: string;
  branchName: string;
  convertWikiLinksBeforePublish: boolean;
  pushMode: PushMode;
  dryRun: boolean;
}

export const DEFAULT_SETTINGS: UtemaPublishSettings = {
  publishFolder: "Publish",
  remoteName: "origin",
  branchName: "main",
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

    containerEl.createEl("h2", { text: "UTEMA Publish" });

    new Setting(containerEl)
      .setName("Publish folder")
      .setDesc("Chemin relatif dans le vault. Exemple : Publish")
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
      .setName("Convert wiki links before publish")
      .setDesc("Convertit les liens [[...]] en liens Markdown avant Git.")
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
      .setDesc("Prépare et journalise l'action sans exécuter Git.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.dryRun).onChange(async (value) => {
          this.plugin.settings.dryRun = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
