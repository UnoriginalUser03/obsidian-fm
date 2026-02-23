// ui/player/PlayerProgress.ts
import ObsidianFMPlugin from "src/main";
import { PlaybackState } from "src/playback/playbackstate";

export class PlayerProgress {
  private container: HTMLElement;
  private bar: HTMLElement;
  private thumb: HTMLElement;
  private timeEl: HTMLElement;

  private lastSyncTime: number | null = null;

  // Slider interaction state
  private isDragging = false;
  private dragPercent = 0;

  constructor(
    private plugin: ObsidianFMPlugin,
    parent: HTMLElement
  ) {
    this.container = parent.createDiv({ cls: "obsidianfm-progress-container" });

    this.bar = this.container.createDiv({ cls: "obsidianfm-progress-bar" });

    // --- Thumb element ---
    this.thumb = this.container.createDiv({ cls: "obsidianfm-progress-thumb" });

    this.timeEl = this.container.createDiv({ cls: "obsidianfm-progress-time" });

    // --- Slider interaction ---
    this.container.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", (e) => this.onPointerUp(e));
  }

  // ------------------------------------------------------------
  // SYNCED UPDATE (called by PlaybackSync)
  // ------------------------------------------------------------
  updateSynced(s: PlaybackState) {
    if (this.isDragging) return; // Don't override dragging

    const progress = s.trackProgress ?? 0;
    const duration = s.trackDuration ?? 0;

    this.lastSyncTime = performance.now();

    const percent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

    this.bar.style.width = `${percent}%`;
    this.thumb.style.left = `${percent}%`;

    this.timeEl.textContent = this.formatTime(progress, duration);
  }

  // ------------------------------------------------------------
  // INTERPOLATED UPDATE (called by PlaybackInterpolator)
  // ------------------------------------------------------------
  updateInterpolated(s: PlaybackState) {
    if (this.isDragging) return;

    const duration = s.trackDuration ?? 0;
    const baseProgress = s.trackProgress ?? 0;

    if (duration <= 0) return;

    const now = performance.now();
    if (!this.lastSyncTime) this.lastSyncTime = now;

    const elapsed = (now - this.lastSyncTime) / 1000;
    const interpolated = s.paused ? baseProgress : baseProgress + elapsed;

    const clamped = Math.min(duration, Math.max(0, interpolated));
    const percent = Math.min(100, (clamped / duration) * 100);

    this.bar.style.width = `${percent}%`;
    this.thumb.style.left = `${percent}%`;

    this.timeEl.textContent = this.formatTime(clamped, duration);
  }

  // ------------------------------------------------------------
  // RESET BASELINE
  // ------------------------------------------------------------
  resetBaseline() {
    this.lastSyncTime = performance.now();
  }

  // ------------------------------------------------------------
  // SLIDER INTERACTION
  // ------------------------------------------------------------
  private onPointerDown(e: PointerEvent) {
    if(this.plugin.playback.currentTrackId === null) return;
    this.isDragging = true;
    this.container.classList.add("obsidianfm-progress-dragging");
    this.updateDrag(e);
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.isDragging) return;
    this.updateDrag(e);
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.isDragging) return;
    this.isDragging = false;

    this.container.classList.remove("obsidianfm-progress-dragging");

    const ctrl = this.plugin.playbackController;
    const s = this.plugin.playback;
    const duration = s.trackDuration ?? 0;
    const newProgress = duration * this.dragPercent;

    ctrl.seekPlayback(newProgress);

    this.lastSyncTime = performance.now();
  }

  private updateDrag(e: PointerEvent) {
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.min(1, Math.max(0, x / rect.width));

    this.dragPercent = percent;

    const percent100 = percent * 100;

    // Snappy UI updates
    this.bar.style.width = `${percent100}%`;
    this.thumb.style.left = `${percent100}%`;

    const s = this.plugin.playback;
    const duration = s.trackDuration ?? 0;
    const current = duration * percent;

    this.timeEl.textContent = this.formatTime(current, duration);
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