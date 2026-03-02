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
  private buttons = new Map<string, Set<InlineButton>>();

  constructor(
    private plugin: ObsidianFMPlugin,
    private state: PlaybackState
  ) { }

  createFromConfig(config: Record<string, string>): InlineButton | null {
    const id = config.id;
    const type = config.type;
    const title = config.title ?? "Play";

    if (!id || !type) return null;

    const kenkuId = config.kenkuId;
    const kenkuTitle = config.kenkuTitle;
    const shuffle = config.shuffle ? Helpers.parseBool(config.shuffle) : undefined;
    const repeat = config.repeat ? (config.repeat as "track" | "playlist" | "off") : undefined;
    const volume = config.volume ? Number(config.volume) : undefined;

    let btn: InlineButton | null = null;

    switch (type) {
      case "track":
        btn = new TrackButton(this.plugin, id, title, kenkuId, kenkuTitle, shuffle, repeat, volume);
        break;

      case "playlist":
        btn = new PlaylistButton(this.plugin, id, title, kenkuId, kenkuTitle, shuffle, repeat, volume);
        break;

      case "sound":
        btn = new SoundButton(this.plugin, id, title, kenkuId, kenkuTitle);
        break;

      case "soundboard":
        const random = config.random ? Helpers.parseBool(config.random) : undefined;
        const overlapping = config.overlapping ? Helpers.parseBool(config.overlapping) : undefined;
        btn = new SoundboardButton(this.plugin, id, title, kenkuId, kenkuTitle, overlapping, random);
        break;

      case "soundscape":
        const items = Helpers.parseSoundscapeInline(this.plugin, config.soundscape);
        btn = new SoundscapeButton(this.plugin, id, title, items);
        break;

      default:
        console.warn("Unknown inline type:", type);
        return null;
    }

    btn.isValid = this.validateButton(btn);
    btn.attachDomObserver(this);
    if (!this.buttons.has(btn.id)) {
      this.buttons.set(btn.id, new Set());
    }
    this.buttons.get(btn.id)!.add(btn);
    return btn;
  }

  getPlaybackButton(id: string): InlineButton | null {
    const group = this.buttons.get(id);
    if (!group) return null;

    for (const btn of group) {
      if (!btn.isEditor) return btn; // the real one
    }

    return null;
  }

  refreshValidity() {
    for (const group of this.buttons.values()) {
      for (const btn of group) {
        btn.isValid = this.validateButton(btn);
      }
    }
    this.updateAll(performance.now());
  }

  private validateButton(btn: InlineButton): boolean {
    switch (btn.type) {
      case "track":
        const track = btn as TrackButton;
        return this.plugin.music.some(t => t.id === track.kenkuId);

      case "playlist":
        const playlist = btn as PlaylistButton;
        return this.plugin.playlists.some(p => p.id === playlist.kenkuId);

      case "sound":
        const sound = btn as SoundButton;
        return this.plugin.soundMap.has(sound.kenkuId);

      case "soundboard":
        const sb = btn as SoundboardButton;
        return this.plugin.soundboardMap.has(sb.kenkuId);

      case "soundscape":
        const sc = btn as SoundscapeButton;
        return sc.items.every(item => {
          if (item.type === "loop") return this.plugin.soundMap.has(item.id);
          if (item.type === "flavour-group") return item.ids.every(id => this.plugin.soundMap.has(id));
          return false;
        });

      default:
        return false;

    }
  }

  updateAll(now: number) {
    for (const group of this.buttons.values()) {
      for (const btn of group) {
        btn.updateState();
        if (btn.isEditor) continue; // skip editor clones
        btn.updateProgress(now);
      }
    }
  }

  updateProgress(now: number) {
    for (const group of this.buttons.values()) {
      for (const btn of group) {
        if (btn.isEditor) continue;
        btn.updateProgress(now);
      }
    }
  }

  unregister(btn: InlineButton) {
    const group = this.buttons.get(btn.id);
    if (!group) return;

    group.delete(btn);
    btn.destroy();

    if (group.size === 0) {
      this.buttons.delete(btn.id);
    }
  }
}