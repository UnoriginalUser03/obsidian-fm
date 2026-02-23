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

  root: HTMLElement;

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

    this.plugin.events.on("obsidian-fm:offline", () => {
      this.setOfflineState(true);
    });

    this.plugin.events.on("obsidian-fm:online", () => {
      this.setOfflineState(false);
    });
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

    this.root = container.createDiv({
      cls: "obsidianfm-player-inner obsidianfm-player-container",
    });

    // Instantiate components
    this.header = new PlayerHeader(this.plugin, this.root);
    this.controls = new PlayerControls(this.plugin, this.root);
    this.progress = new PlayerProgress(this.plugin, this.root);
    this.search = new PlayerSearch(this.plugin, this.root);
    this.sfx = new PlayerSFXPanel(this.plugin, this.root);

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

  setOfflineState(isOffline: boolean) {
    if (!this.root) return;
    this.root.classList.toggle("is-offline", isOffline);
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