// core/inline/TrackButton.ts
import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { InlineButton } from "../inlinebutton";

export class TrackButton extends InlineButton {
  constructor(
    plugin: ObsidianFMPlugin,
    id: string,
    title: string,
    private shuffle?: boolean,
    private repeat?: "track" | "playlist" | "off",
    private volume?: number
  ) {
    super(plugin, id, "track", title);
    setIcon(this.iconEl, plugin.typeIconMap["track"]);
  }

  // ------------------------------------------------------------
  // STATE UPDATE
  // ------------------------------------------------------------
  updateState() {
    const s = this.plugin.playback;

    const isCurrent = s.currentTrackId === this.id;
    const isPaused = isCurrent && s.paused;
    const isPlaying = isCurrent && !s.paused;

    // Apply disabled state (offline or invalid)
    this.applyDisabledState();

    // Tooltip: offline handled here
    if (this.applyBaseTooltip()) return;

    // Tooltip + icon: invalid handled here
    if (this.applyInvalid()) {
      this.el.title = "Track not found in KenkuFM";
      return;
    }

    // Valid tooltip
    this.el.title = "Play track";

    // Playback classes
    this.el.classList.toggle("is-playing", isPlaying);
    this.el.classList.toggle("is-paused", isPaused);

    // Icon logic
    const newIcon =
      isPaused ? "play" :
      isPlaying ? "pause" :
      "play";

    if (this.iconEl.dataset.currentIcon !== newIcon) {
      this.iconEl.dataset.currentIcon = newIcon;
      setIcon(this.iconEl, newIcon);
    }
  }

  // ------------------------------------------------------------
  // PROGRESS UPDATE (unchanged)
  // ------------------------------------------------------------
  updateProgress(now: number) {
    const s = this.plugin.playback;

    if (s.currentTrackId !== this.id) {
      if (this.el.dataset.progress !== "0%") {
        this.el.dataset.progress = "0%";
        this.el.style.setProperty("--progress", "0%");
      }
      return;
    }

    if (s.trackProgress == null || s.trackDuration == null) {
      if (this.el.dataset.progress !== "0%") {
        this.el.dataset.progress = "0%";
        this.el.style.setProperty("--progress", "0%");
      }
      return;
    }

    if (s.trackDuration === 0) {
      if (this.el.dataset.progress !== "2%") {
        this.el.dataset.progress = "2%";
        this.el.style.setProperty("--progress", "2%");
      }
      return;
    }

    if (s.trackProgress / s.trackDuration > 0.99) {
      if (this.el.dataset.progress !== "100%") {
        this.el.dataset.progress = "100%";
        this.el.style.setProperty("--progress", "100%");
      }
      return;
    }

    if (!s.lastTrackSyncTime) s.lastTrackSyncTime = now;

    const elapsed = (now - s.lastTrackSyncTime) / 1000;
    const interpolated = s.paused
      ? s.trackProgress
      : s.trackProgress + elapsed;

    const percent = Math.min(100, (interpolated / s.trackDuration) * 100);
    const pct = `${percent}%`;

    if (this.el.dataset.progress !== pct) {
      this.el.dataset.progress = pct;
      this.el.style.setProperty("--progress", pct);
    }
  }

  // ------------------------------------------------------------
  // CLICK HANDLER
  // ------------------------------------------------------------
  async handleClick() {
    if (!this.plugin.kenkuOnline || !this.isValid) return;

    const ctrl = this.plugin.playbackController;
    const s = this.plugin.playback;

    const isCurrent = s.currentTrackId === this.id;

    try {
      if (isCurrent) {
        if (s.paused) {
          await ctrl.Resume({
            shuffle: this.shuffle,
            repeat: this.repeat,
            volume: this.volume
          });
        } else {
          await ctrl.Pause();
        }
      } else {
        await ctrl.playTrack(this.id, {
          shuffle: this.shuffle,
          repeat: this.repeat,
          volume: this.volume
        });
      }
    } catch {
      this.plugin.connection.handleDisconnect();
    }
  }
}