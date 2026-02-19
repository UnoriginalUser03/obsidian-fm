// core/inline/SoundscapeButton.ts
import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { InlineButton } from "../inlinebutton";

export class SoundscapeButton extends InlineButton {
  constructor(
    plugin: ObsidianFMPlugin,
    id: string,
    title: string,
    public stackIds: string[]
  ) {
    super(plugin, id, "soundscape", title);
    setIcon(this.iconEl, plugin.typeIconMap["soundscape"]);
  }

  // ------------------------------------------------------------
  // STATE UPDATE
  // ------------------------------------------------------------
  updateState() {
    const s = this.plugin.playback;

    const isSelected = s.currentSoundscapeId === this.id;
    const hasPlaying = this.stackIds.some(id => s.currentSounds.has(id));
    const isActive = isSelected && hasPlaying;

    this.el.classList.toggle("is-playing", isActive);
    this.el.disabled = !this.plugin.kenkuOnline;

    const newIcon = isActive ? "square" : "play";

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

    const isSelected = s.currentSoundscapeId === this.id;
    const hasPlaying = this.stackIds.some(id => s.currentSounds.has(id));

    if (!isSelected || !hasPlaying) {
      if (this.el.dataset.progress !== "0%") {
        this.el.dataset.progress = "0%";
        this.el.style.setProperty("--progress", "0%");
      }
      return;
    }

    const active = this.stackIds
      .map(id => {
        const entry = s.currentSounds.get(id);
        return entry ? ([id, entry] as const) : null;
      })
      .filter((x): x is readonly [string, { progress: number; duration: number; frozen?: boolean }] => x !== null);

    if (active.length === 0) {
      if (this.el.dataset.progress !== "0%") {
        this.el.dataset.progress = "0%";
        this.el.style.setProperty("--progress", "0%");
      }
      return;
    }

    const [soundId, entry] = active.sort((a, b) => b[1].progress - a[1].progress)[0];

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

    const isSelected = s.currentSoundscapeId === this.id;
    const hasPlaying = this.stackIds.some(id => s.currentSounds.has(id));
    const isActive = isSelected && hasPlaying;

    try {
      if (isActive) {
        // Stop this soundscape
        await ctrl.stopSoundscape(this.id);
      } else {
        // Start this soundscape
        await ctrl.playSoundscape(this.id, this.stackIds);
      }
    } catch {
      this.plugin.connection.handleDisconnect();
    }
  }
}