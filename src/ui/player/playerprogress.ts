// ui/player/PlayerProgress.ts
import ObsidianFMPlugin from "src/main";
import { PlaybackState } from "src/playback/playbackstate";

export class PlayerProgress {
  private container: HTMLElement;
  private bar: HTMLElement;
  private timeEl: HTMLElement;

  private lastSyncTime: number | null = null;

  constructor(
    private plugin: ObsidianFMPlugin,
    parent: HTMLElement
  ) {
    this.container = parent.createDiv({ cls: "obsidianfm-progress-container" });

    this.bar = this.container.createDiv({ cls: "obsidianfm-progress-bar" });
    this.timeEl = this.container.createDiv({ cls: "obsidianfm-progress-time" });
  }

  // ------------------------------------------------------------
  // SYNCED UPDATE (called by PlaybackSync)
  // ------------------------------------------------------------
  updateSynced(s: PlaybackState) {
    const progress = s.trackProgress ?? 0;
    const duration = s.trackDuration ?? 0;

    // Reset baseline BEFORE writing synced progress
    this.lastSyncTime = performance.now();

    // Write progress bar
    const percent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
    this.bar.style.width = `${percent}%`;

    // Write time text
    this.timeEl.textContent = this.formatTime(progress, duration);
  }

  // ------------------------------------------------------------
  // INTERPOLATED UPDATE (called by PlaybackInterpolator)
  // ------------------------------------------------------------
  updateInterpolated(s: PlaybackState) {
    const duration = s.trackDuration ?? 0;
    const baseProgress = s.trackProgress ?? 0;

    if (duration <= 0) return;

    const now = performance.now();
    if (!this.lastSyncTime) {
      this.lastSyncTime = now;
    }

    const elapsed = (now - this.lastSyncTime) / 1000;
    const interpolated = s.paused ? baseProgress : baseProgress + elapsed;

    const clamped = Math.min(duration, Math.max(0, interpolated));
    const percent = Math.min(100, (clamped / duration) * 100);

    this.bar.style.width = `${percent}%`;
    this.timeEl.textContent = this.formatTime(clamped, duration);
  }

  // ------------------------------------------------------------
  // RESET BASELINE (called by PlaybackSync)
  // ------------------------------------------------------------
  resetBaseline() {
    this.lastSyncTime = performance.now();
  }

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------
  private formatTime(current: number, duration: number): string {
    const fmt = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60).toString().padStart(2, "0");
      return `${m}:${sec}`;
    };

    return `${fmt(current)} / ${fmt(duration)}`;
  }
}