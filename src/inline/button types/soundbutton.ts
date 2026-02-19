// core/inline/SoundButton.ts
import type ObsidianFMPlugin from "src/main";
import { setIcon } from "obsidian";
import { InlineButton } from "../inlinebutton";

export class SoundButton extends InlineButton {
  constructor(
    plugin: ObsidianFMPlugin,
    id: string,
    title: string
  ) {
    super(plugin, id, "sound", title);
    setIcon(this.iconEl, plugin.typeIconMap["sound"]);
  }

  // ------------------------------------------------------------
  // STATE UPDATE
  // ------------------------------------------------------------
  updateState() {
    const s = this.plugin.playback;

    const isPlaying = s.currentSounds.has(this.id);

    this.el.classList.toggle("is-playing", isPlaying);
    this.el.disabled = !this.plugin.kenkuOnline;

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
    const entry = s.currentSounds.get(this.id);

    if (!entry) {
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
  // CLICK HANDLER (now uses PlaybackController)
  // ------------------------------------------------------------
  async handleClick() {
    if (!this.plugin.kenkuOnline) return;

    const ctrl = this.plugin.playbackController;
    const s = this.plugin.playback;

    const isPlaying = s.currentSounds.has(this.id);

    try {
      if (isPlaying) {
        await ctrl.stopSoundEffect(this.id);
      } else {
        await ctrl.playSoundEffect(this.id);
      }
    } catch {
      this.plugin.connection.handleDisconnect();
    }
  }
}