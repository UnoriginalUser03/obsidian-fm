// core/inline/SoundButton.ts
import type ObsidianFMPlugin from "src/main";
import { setIcon } from "obsidian";
import { InlineButton } from "../inlinebutton";

export class SoundButton extends InlineButton {
  constructor(
    plugin: ObsidianFMPlugin,
    id: string,
    title: string,
    public kenkuId: string,
    public kenkuTitle: string,
  ) {
    super(plugin, id, title, "sound");
    setIcon(this.iconEl, plugin.typeIconMap["sound"]);
  }

  // ------------------------------------------------------------
  // STATE UPDATE
  // ------------------------------------------------------------
  updateState() {
    const s = this.plugin.playback;
    const isPlaying = this.isPlaying();

    // Apply disabled state (offline or invalid)
    this.applyDisabledState();

    // Tooltip: offline handled here
    if (this.applyBaseTooltip()) return;

    // Tooltip + icon: invalid handled here
    if (this.applyInvalid()) {
      this.el.setAttr("aria-label", "Sound not found in KenkuFM");
      return;
    }

    // Valid tooltip
    this.el.setAttr("aria-label", "Play Sound");

    // Playback class
    this.el.classList.toggle("is-playing", isPlaying);
    this.el.classList.toggle("error", !this.isValid);

    // Icon logic
    const newIcon = isPlaying ? "square" : "play";

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
    const entry = s.currentSounds.get(this.kenkuId);

    if (!entry || !this.isValid) {
      if (this.el.dataset.progress !== "0%") {
        this.el.dataset.progress = "0%";
        this.el.style.setProperty("--progress", "0%");
      }
      return;
    }

    if (entry.duration === 0) {
      if (this.el.dataset.progress !== "2%") {
        this.el.dataset.progress = "2%";
        this.el.style.setProperty("--progress", "2%");
      }
      return;
    }

    if (!entry.frozen && entry.duration < 2 && entry.progress / entry.duration > 0.9) {
      entry.frozen = true;
    }

    if (entry.frozen) {
      if (this.el.dataset.progress !== "100%") {
        this.el.dataset.progress = "100%";
        this.el.style.setProperty("--progress", "100%");
      }
      return;
    }

    if (!s.lastSoundSyncTime) s.lastSoundSyncTime = now;

    const elapsed = (now - s.lastSoundSyncTime) / 1000;
    const interpolated = entry.progress + elapsed;

    const percent = Math.min(100, (interpolated / entry.duration) * 100);
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

    const isPlaying = s.currentSounds.has(this.kenkuId);

    try {
      if (isPlaying) {
        await ctrl.stopSoundEffect(this.kenkuId);
      } else {
        await ctrl.playSoundEffect(this.kenkuId);
      }
    } catch {
      this.plugin.connection.handleDisconnect();
    }
  }


  isPlaying(): boolean {
    const s = this.plugin.playback;
    return s.currentSounds.has(this.kenkuId);
  }
}