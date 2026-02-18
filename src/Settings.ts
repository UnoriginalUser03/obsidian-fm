import { PluginSettingTab, App, Setting } from 'obsidian';
import ObsidianFMPlugin from './main';

export default class ObsidianFMSettings extends PluginSettingTab {
  plugin: ObsidianFMPlugin;

  constructor(app: App, plugin: ObsidianFMPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName('Base URL').addText(text =>
      text.setValue(this.plugin.settings.baseUrl).onChange(async value => {
        this.plugin.settings.baseUrl = value;
        await this.plugin.saveSettings();
      })
    );
  }
}
