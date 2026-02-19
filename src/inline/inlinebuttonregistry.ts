// core/inline/InlineButtonRegistry.ts
import ObsidianFMPlugin from "src/main";
import { InlineButton } from "./inlinebutton";
import { PlaybackState } from "src/playback/playbackstate";
import { TrackButton } from "./button types/trackbutton";
import { PlaylistButton } from "./button types/playlistbutton";
import { SoundButton } from "./button types/soundbutton";
import { SoundboardButton } from "./button types/soundboardbutton";
import { SoundscapeButton } from "./button types/soundscapebutton";
import { Helpers } from "src/helpers/helpers";

export class InlineButtonRegistry {
  private buttons = new Set<InlineButton>();

  constructor(
    private plugin: ObsidianFMPlugin,
    private state: PlaybackState
  ) { }

  // ------------------------------------------------------------
  // FACTORY: Create button from parsed inline config
  // ------------------------------------------------------------
  createFromConfig(config: Record<string, string>): InlineButton | null {
    const id = config.id;
    const type = config.type;
    const title = config.title ?? "Play";

    if (!id || !type) return null;

    // ------------------------------------------------------------
    // UNIVERSAL OPTIONAL SETTINGS (parsed once)
    // ------------------------------------------------------------
    const shuffle = config.shuffle ? Helpers.parseBool(config.shuffle) : undefined;
    const repeat = config.repeat ? (config.repeat as "track" | "playlist" | "off") : undefined;
    const volume = config.volume ? Number(config.volume) : undefined;

    let btn: InlineButton | null = null;

    switch (type) {
      case "track":
        btn = new TrackButton(
          this.plugin,
          id,
          title,
          shuffle,
          repeat,
          volume
        );
        break;

      case "playlist":
        btn = new PlaylistButton(
          this.plugin,
          id,
          title,
          shuffle,
          repeat,
          volume
        );
        break;

      case "sound":
        btn = new SoundButton(this.plugin, id, title);
        break;

      case "soundboard":
        const random = config.random ? Helpers.parseBool(config.random) : undefined;
        const overlapping = config.overlapping ? Helpers.parseBool(config.overlapping) : undefined;
        btn = new SoundboardButton(this.plugin, id, title, overlapping, random);
        break;

      case "soundscape":
        const stackIds = config.stack ? config.stack.split(",") : [];
        btn = new SoundscapeButton(this.plugin, id, title, stackIds);
        break;

      default:
        console.warn("Unknown inline type:", type);
        return null;
    }

    this.buttons.add(btn);
    return btn;
  }

  getSoundscapeById(id: string): SoundscapeButton | null {
    for (const btn of this.buttons) {
      if (btn.id === id && btn.type === "soundscape") {
        return btn as SoundscapeButton;
      }
    }
    return null;
  }

  // ------------------------------------------------------------
  // UPDATE STATE (called by PlaybackSync)
  // ------------------------------------------------------------
  updateAll(now: number) {
    for (const btn of this.buttons) {
      btn.updateState();
      btn.updateProgress(now);
    }
  }

  // ------------------------------------------------------------
  // UPDATE PROGRESS ONLY (called by PlaybackInterpolator)
  // ------------------------------------------------------------
  updateProgress(now: number) {
    for (const btn of this.buttons) {
      btn.updateProgress(now);
    }
  }

  // ------------------------------------------------------------
  // Remove button (if needed)
  // ------------------------------------------------------------
  remove(btn: InlineButton) {
    this.buttons.delete(btn);
    btn.destroy();
  }
}