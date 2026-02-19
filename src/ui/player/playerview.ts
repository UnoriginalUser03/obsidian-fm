// ui/player/PlayerView.ts
import { ItemView, WorkspaceLeaf } from "obsidian";
import ObsidianFMPlugin from "src/main";

import { PlayerHeader } from "./playerheader";
import { PlayerControls } from "./playercontrols";
import { PlayerProgress } from "./playerprogress";
import { PlayerSearch } from "./playersearch";
import { PlayerSFXPanel } from "./playersfxpanel";

export const VIEW_TYPE_OBSIDIANFM = "obsidianfm-playback";

export class PlayerView extends ItemView {
  plugin: ObsidianFMPlugin;

  header: PlayerHeader;
  controls: PlayerControls;
  progress: PlayerProgress;
  search: PlayerSearch;
  sfx: PlayerSFXPanel;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianFMPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.icon = "audio-lines";
  }

  getViewType() {
    return VIEW_TYPE_OBSIDIANFM;
  }

  getDisplayText() {
    return "ObsidianFM Playback";
  }

  async onOpen() {
    if (!this.plugin.views.includes(this)) {
      this.plugin.views.push(this);
    }

    this.render();
  }

  async onClose() {
    this.plugin.views.remove(this);
  }

  // ------------------------------------------------------------
  // RENDER ROOT
  // ------------------------------------------------------------
  render() {
    const container = this.contentEl;
    container.empty();

    const root = container.createDiv({
      cls: "obsidianfm-player-inner obsidianfm-player-container",
    });

    // Instantiate components
    this.header = new PlayerHeader(this.plugin, root);
    this.controls = new PlayerControls(this.plugin, root);
    this.progress = new PlayerProgress(this.plugin, root);
    this.search = new PlayerSearch(this.plugin, root);
    this.sfx = new PlayerSFXPanel(this.plugin, root);

    // Initial UI update
    this.updateNonSfxUI();
    this.updateSfxUI();
  }

  // ------------------------------------------------------------
  // UPDATE API (called by PlaybackSync)
  // ------------------------------------------------------------
  updateNonSfxUI() {
    const s = this.plugin.playback;

    this.header.update(s);
    this.controls.update(s);
    this.progress.updateSynced(s);
  }

  updateSfxUI() {
    const s = this.plugin.playback;
    this.sfx.update(s);
  }

  // ------------------------------------------------------------
  // INTERPOLATION API (called by PlaybackInterpolator)
  // ------------------------------------------------------------
  updateInterpolated() {
    const s = this.plugin.playback;

    this.progress.updateInterpolated(s);
    this.sfx.updateInterpolated(s);
  }

  resetInterpolationBaselines() {
    const s = this.plugin.playback;

    this.progress.resetBaseline();
    this.sfx.resetBaseline();
  }
}