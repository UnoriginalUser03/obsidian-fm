// core/inline/SoundboardButton.ts
import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { InlineButton } from "../inlinebutton";

export class SoundboardButton extends InlineButton {
  private seqIndex = 0;

  constructor(
    plugin: ObsidianFMPlugin,
    id: string,
    title: string,
    public kenkuId: string,
    public kenkuTitle: string,
    private overlapping: boolean = false,
    private random: boolean = false,
  ) {
    super(plugin, id, title, "soundboard");
    setIcon(this.iconEl, plugin.typeIconMap["soundboard"]);
  }

  updateState() {
    const s = this.plugin.playback;
    const board = this.plugin.soundboardMap.get(this.kenkuId);

    // Apply disabled state (offline or invalid)
    this.applyDisabledState();

    // Tooltip: offline handled here
    if (this.applyBaseTooltip()) return;

    // Tooltip + icon: invalid handled here
    if (this.applyInvalid()) {
      this.el.setAttr("aria-label", "Soundboard not found in KenkuFM");
      return;
    }

    // Valid tooltip
    this.el.setAttr("aria-label", "Play Soundboard");

    // If board missing (shouldn't happen if valid), bail safely
    if (!board) return;

    const playingCount = board.sounds.filter(id => s.currentSounds.has(id)).length;
    const hasPlaying = playingCount > 0;
    const allPlaying = playingCount === board.sounds.length;

    this.el.classList.toggle("is-playing", hasPlaying);

    // Icon logic
    let newIcon: string;

    if (this.overlapping) {
      if (!hasPlaying) newIcon = "play";
      else if (!allPlaying) newIcon = "list-plus";
      else newIcon = "square";
    } else {
      newIcon = hasPlaying ? "square" : "play";
    }

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
    const board = this.plugin.soundboardMap.get(this.kenkuId);

    if (!board || !this.isValid) {
      this.el.dataset.progress = "0%";
      this.el.style.setProperty("--progress", "0%");
      return;
    }

    const active = board.sounds
      .map(id => {
        const entry = s.currentSounds.get(id);
        return entry ? ([id, entry] as const) : null;
      })
      .filter((x): x is readonly [string, { progress: number; duration: number; frozen?: boolean }] => x !== null);

    if (active.length === 0) {
      this.el.dataset.progress = "0%";
      this.el.style.setProperty("--progress", "0%");
      return;
    }

    const [soundId, entry] = active.sort((a, b) => b[1].progress - a[1].progress)[0];

    if (entry.duration === 0) return;

    if (!entry.frozen && entry.duration < 2 && entry.progress / entry.duration > 0.9) {
      entry.frozen = true;
    }

    if (entry.frozen) {
      this.el.dataset.progress = "100%";
      this.el.style.setProperty("--progress", "100%");
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
    const board = this.plugin.soundboardMap.get(this.kenkuId);
    if (!board) return;

    const playing = board.sounds.filter(id => s.currentSounds.has(id));
    const hasPlaying = playing.length > 0;
    const allPlaying = playing.length === board.sounds.length;

    try {
      // NON-OVERLAPPING MODE
      if (!this.overlapping) {
        if (hasPlaying) {
          await ctrl.stopEntireSoundboard(this.kenkuId);
        } else {
          let soundId: string;

          if (this.random) {
            soundId = board.sounds[Math.floor(Math.random() * board.sounds.length)];
          } else {
            soundId = board.sounds[this.seqIndex];
            this.seqIndex = (this.seqIndex + 1) % board.sounds.length;
          }

          await ctrl.playSoundEffect(soundId);
        }

        return;
      }

      // OVERLAPPING MODE
      if (allPlaying) {
        await ctrl.stopEntireSoundboard(this.kenkuId);
        return;
      }

      let nextSound: string | undefined;

      if (this.random) {
        const available = board.sounds.filter(id => !s.currentSounds.has(id));
        nextSound = available[Math.floor(Math.random() * available.length)];
      } else {
        nextSound = board.sounds.find(id => !s.currentSounds.has(id));
      }

      if (nextSound) {
        await ctrl.playSoundEffect(nextSound);
      }

    } catch {
      this.plugin.connection.handleDisconnect();
    }
  }
}