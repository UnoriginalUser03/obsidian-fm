// ui/player/PlayerControls.ts
import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { PlaybackState } from "src/playback/playbackstate";

export class PlayerControls {
  private container: HTMLElement;
  private playPauseIcon: HTMLElement;
  private repeatIcon: HTMLElement;

  private repeatIconMap = {
    off: "repeat",
    playlist: "repeat",
    track: "repeat-1",
  };

  constructor(
    private plugin: ObsidianFMPlugin,
    parent: HTMLElement
  ) {
    this.container = parent.createDiv({ cls: "obsidianfm-controls-container" });

    const ctrl = this.plugin.playbackController;

    // Shuffle
    const shuffleBtn = this.container.createEl("button", {
      cls: "obsidianfm-shuffle-btn",
    });
    setIcon(shuffleBtn, "shuffle");
    shuffleBtn.addEventListener("click", () => ctrl.toggleShuffle());

    // Previous
    const prevBtn = this.container.createEl("button", {
      cls: "obsidianfm-prev-btn",
    });
    setIcon(prevBtn, "skip-back");
    prevBtn.addEventListener("click", () => ctrl.previousTrack());

    // Play/Pause
    const playBtn = this.container.createEl("button", {
      cls: "obsidianfm-play-pause-btn",
    });
    this.playPauseIcon = playBtn.createDiv({
      cls: "obsidianfm-play-pause-icon",
    });
    playBtn.addEventListener("click", () => this.plugin.playback.paused ? ctrl.Resume() : ctrl.Pause());

    // Next
    const nextBtn = this.container.createEl("button", {
      cls: "obsidianfm-next-btn",
    });
    setIcon(nextBtn, "skip-forward");
    nextBtn.addEventListener("click", () => ctrl.nextTrack());

    // Repeat
    const repeatBtn = this.container.createEl("button", {
      cls: "obsidianfm-repeat-btn",
    });
    this.repeatIcon = repeatBtn.createDiv({
      cls: "obsidianfm-repeat-icon",
    });
    repeatBtn.addEventListener("click", () => ctrl.cycleRepeat());
  }

  // ------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------
  update(s: PlaybackState) {
    // Play/Pause
    setIcon(this.playPauseIcon, s.paused ? "play" : "pause");

    // Shuffle
    const shuffleBtn = this.container.querySelector(".obsidianfm-shuffle-btn");
    if (shuffleBtn) shuffleBtn.classList.toggle("is-active", s.shuffle);

    // Repeat
    const repeatBtn = this.container.querySelector(".obsidianfm-repeat-btn");
    if (repeatBtn) repeatBtn.classList.toggle("is-active", s.repeat !== "off");

    setIcon(this.repeatIcon, this.repeatIconMap[s.repeat ?? "off"]);
  }
}