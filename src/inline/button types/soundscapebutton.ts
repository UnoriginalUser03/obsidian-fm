// core/inline/SoundscapeButton.ts
import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { InlineButton } from "../inlinebutton";
import { SoundscapeItem } from "src/api/types";

export class SoundscapeButton extends InlineButton {
  constructor(
    plugin: ObsidianFMPlugin,
    id: string,
    title: string,
    public items: SoundscapeItem[]
  ) {
    super(plugin, id, "soundscape", title);
    setIcon(this.iconEl, plugin.typeIconMap["soundscape"]);
  }

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------
  private getLoopIds(): string[] {
    return this.items
      .filter(item => item.type === "loop")
      .map(item => item.id);
  }

  private hasRandomActivity(): boolean {
    return this.plugin.playbackController.randomGroupTimers.has(this.id);
  }

  // ------------------------------------------------------------
  // STATE UPDATE
  // ------------------------------------------------------------
  updateState() {
    const s = this.plugin.playback;

    const loopIds = this.getLoopIds();
    const isSelected = s.currentSoundscapeId === this.id;

    const hasLoopPlaying = loopIds.some(id => s.currentSounds.has(id));
    const hasRandomPlaying = this.hasRandomActivity();

    const isActive = isSelected && (hasLoopPlaying || hasRandomPlaying);

    // Disabled state (offline or invalid)
    this.applyDisabledState();

    // Tooltip: offline handled here
    if (this.applyBaseTooltip()) return;

    // Tooltip + icon: invalid handled here
    if (this.applyInvalid()) {
      this.el.setAttr("aria-label", "Some sounds were not found in KenkuFM");
      return;
    }

    // Valid tooltip
    this.el.setAttr("aria-label", "Play Soundscape");

    // Playback classes
    this.el.classList.toggle("is-playing", isActive);

    // Icon logic
    const newIcon = isActive ? "square" : "play";

    if (this.iconEl.dataset.currentIcon !== newIcon) {
      this.iconEl.dataset.currentIcon = newIcon;
      setIcon(this.iconEl, newIcon);
    }
  }

  // ------------------------------------------------------------
  // PROGRESS UPDATE
  // ------------------------------------------------------------
  updateProgress(now: number) {
    const s = this.plugin.playback;

    const loopIds = this.getLoopIds();
    const isSelected = s.currentSoundscapeId === this.id;

    const hasLoopPlaying = loopIds.some(id => s.currentSounds.has(id));
    const hasRandomPlaying = this.hasRandomActivity();

    // If only random groups are active → show 0% but keep active state
    if (!isSelected || (!hasLoopPlaying && !hasRandomPlaying) || !this.isValid) {
      if (this.el.dataset.progress !== "0%") {
        this.el.dataset.progress = "0%";
        this.el.style.setProperty("--progress", "0%");
      }
      return;
    }

    // If no loop sounds → progress stays at 0%
    if (!hasLoopPlaying) {
      if (this.el.dataset.progress !== "0%") {
        this.el.dataset.progress = "0%";
        this.el.style.setProperty("--progress", "0%");
      }
      return;
    }

    // Normal loop progress logic
    const active = loopIds
      .map(id => {
        const entry = s.currentSounds.get(id);
        return entry ? ([id, entry] as const) : null;
      })
      .filter(
        (x): x is readonly [
          string,
          { progress: number; duration: number; frozen?: boolean }
        ] => x !== null
      );

    if (active.length === 0) {
      if (this.el.dataset.progress !== "0%") {
        this.el.dataset.progress = "0%";
        this.el.style.setProperty("--progress", "0%");
      }
      return;
    }

    const [soundId, entry] = active.sort(
      (a, b) => b[1].progress - a[1].progress
    )[0];

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

    const loopIds = this.getLoopIds();
    const isSelected = s.currentSoundscapeId === this.id;

    const hasLoopPlaying = loopIds.some(id => s.currentSounds.has(id));
    const hasRandomPlaying = this.hasRandomActivity();

    const isActive = isSelected && (hasLoopPlaying || hasRandomPlaying);

    try {
      if (isActive) {
        await ctrl.stopSoundscape(this.id);
      } else {
        await ctrl.playSoundscape(this.id, this.items);
      }
    } catch {
      this.plugin.connection.handleDisconnect();
    }
  }
}