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
    super(plugin, id, title, "soundscape");
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

  private getNextTimer(): { remaining: number } | null {
    const s = this.plugin.playback;
    const timers = s.pendingTimers.filter(t => t.soundscapeId === this.id);
    if (timers.length === 0) return null;

    const soonest = timers.sort((a, b) => {
      const ra = a.duration - (performance.now() - a.startedAt) / 1000;
      const rb = b.duration - (performance.now() - b.startedAt) / 1000;
      return ra - rb;
    })[0];

    const remaining = Math.max(
      0,
      soonest.duration - (performance.now() - soonest.startedAt) / 1000
    );

    return { remaining };
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

    this.applyDisabledState();
    if (this.applyBaseTooltip()) return;

    if (this.applyInvalid()) {
      this.el.setAttr("aria-label", "Some sounds were not found in KenkuFM");
      return;
    }

    this.el.setAttr("aria-label", "Play Soundscape");
    this.el.classList.toggle("is-playing", isActive);

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

    if (!isSelected || (!hasLoopPlaying && !hasRandomPlaying) || !this.isValid) {
      this.setProgress("0%");
      return;
    }

    // ------------------------------------------------------------
    // CASE 1: LOOPS EXIST → TRACK THE LONGEST LOOP
    // ------------------------------------------------------------
    if (hasLoopPlaying) {
      const active = loopIds
        .map(id => {
          const entry = s.currentSounds.get(id);
          return entry ? ([id, entry] as const) : null;
        })
        .filter((x): x is readonly [string, { progress: number; duration: number; frozen?: boolean }] => x !== null);

      if (active.length === 0) {
        this.setProgress("0%");
        return;
      }

      // Pick the loop with the longest duration (stable)
      const [soundId, entry] = active.sort((a, b) => b[1].duration - a[1].duration)[0];

      if (entry.duration === 0) {
        this.setProgress("2%");
        return;
      }

      if (!entry.frozen && entry.duration < 2 && entry.progress / entry.duration > 0.9) {
        entry.frozen = true;
      }

      if (entry.frozen) {
        this.setProgress("100%");
        return;
      }

      if (!s.lastSoundSyncTime) s.lastSoundSyncTime = now;

      const elapsed = (now - s.lastSoundSyncTime) / 1000;
      const interpolated = entry.progress + elapsed;

      const percent = Math.min(100, (interpolated / entry.duration) * 100);
      this.setProgress(`${percent}%`);
      return;
    }

    // ------------------------------------------------------------
    // CASE 2: NO LOOPS → TRACK NEXT FLAVOUR-GROUP TIMER
    // ------------------------------------------------------------
    const nextTimer = this.getNextTimer();
    if (nextTimer) {
      const max = 60; // treat 60s as full bar for visual clarity
      const pct = Math.min(100, (1 - nextTimer.remaining / max) * 100);
      this.setProgress(`${pct}%`);
      return;
    }

    // Fallback
    this.setProgress("0%");
  }

  private setProgress(pct: string) {
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

  isPlaying(): boolean {
    const s = this.plugin.playback;

    const loopIds = this.getLoopIds();
    const isSelected = s.currentSoundscapeId === this.id;

    const hasLoopPlaying = loopIds.some(id => s.currentSounds.has(id));
    const hasRandomPlaying = this.hasRandomActivity();

    return isSelected && (hasLoopPlaying || hasRandomPlaying);
  }
}