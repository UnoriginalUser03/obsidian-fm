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
import { SoundscapeItem } from "src/api/types";
import { Notice } from "obsidian";

export class InlineButtonRegistry {
  private buttons = new Set<InlineButton>();

  constructor(
    private plugin: ObsidianFMPlugin,
    private state: PlaybackState
  ) { }

  // ------------------------------------------------------------
  // PARSER FOR SOUNDSCAPE ITEMS
  // ------------------------------------------------------------
  private parseSoundscapeItems(rawItems: string[]): SoundscapeItem[] {
    const items: SoundscapeItem[] = [];

    for (const raw of rawItems) {
      const trimmed = raw.trim();

      // random group: random(label:id1|id2|id3)[min-max]
      const match = trimmed.match(/^random\(([^)]+)\)\[(\d+)-(\d+)\]$/);
      if (match) {
        const inside = match[1]; // label:id1|id2|id3  OR  id1|id2|id3

        let label = "Random Group";
        let idPart = inside;

        // If there's a label, split it off
        const colonIndex = inside.indexOf(":");
        if (colonIndex !== -1) {
          label = inside.slice(0, colonIndex).trim();
          idPart = inside.slice(colonIndex + 1).trim();
        }

        const ids = idPart.split("|").map(s => s.trim());
        const min = Number(match[2]);
        const max = Number(match[3]);

        items.push({
          type: "random-group",
          ids,
          min,
          max,
          label
        });
        continue;
      }

      // fallback: loop item
      items.push({
        type: "loop",
        id: trimmed,
        label: trimmed
      });
    }

    return items;
  }

  // ------------------------------------------------------------
  // FACTORY: Create button from parsed inline config
  // ------------------------------------------------------------
  createFromConfig(config: Record<string, string>): InlineButton | null {
    const id = config.id;
    const type = config.type;
    const title = config.title ?? "Play";

    if (!id || !type) return null;

    const shuffle = config.shuffle ? Helpers.parseBool(config.shuffle) : undefined;
    const repeat = config.repeat ? (config.repeat as "track" | "playlist" | "off") : undefined;
    const volume = config.volume ? Number(config.volume) : undefined;

    let btn: InlineButton | null = null;

    switch (type) {
      case "track":
        btn = new TrackButton(this.plugin, id, title, shuffle, repeat, volume);
        break;

      case "playlist":
        btn = new PlaylistButton(this.plugin, id, title, shuffle, repeat, volume);
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
        const rawItems = config.stack?.split(",") ?? [];
        const items = this.parseSoundscapeItems(rawItems);
        btn = new SoundscapeButton(this.plugin, id, title, items);
        break;

      default:
        console.warn("Unknown inline type:", type);
        return null;
    }

    this.validateButton(btn);
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

  refreshValidity() {
    for (const btn of this.buttons) {
      switch (btn.type) {
        case "track":
          btn.isValid = this.plugin.music.some(t => t.id === btn.id);
          break;

        case "playlist":
          btn.isValid = this.plugin.playlists.some(p => p.id === btn.id);
          break;

        case "sound":
          btn.isValid = this.plugin.soundMap.has(btn.id);
          break;

        case "soundboard":
          btn.isValid = this.plugin.soundboardMap.has(btn.id);
          break;

        case "soundscape":
          const sc = btn as SoundscapeButton;
          btn.isValid = sc.items.every(item => {
            if (item.type === "loop") return this.plugin.soundMap.has(item.id);
            if (item.type === "random-group") return item.ids.every(id => this.plugin.soundMap.has(id));
            return false;
          });
          break;
      }
    }

    this.updateAll(performance.now());
  }

  private validateButton(btn: InlineButton) {
    switch (btn.type) {
      case "track":
        btn.isValid = this.plugin.music.some(t => t.id === btn.id);
        break;

      case "playlist":
        btn.isValid = this.plugin.playlists.some(p => p.id === btn.id);
        break;

      case "sound":
        btn.isValid = this.plugin.soundMap.has(btn.id);
        break;

      case "soundboard":
        btn.isValid = this.plugin.soundboardMap.has(btn.id);
        break;

      case "soundscape":
        const sc = btn as SoundscapeButton;
        btn.isValid = sc.items.every(item => {
          if (item.type === "loop") return this.plugin.soundMap.has(item.id);
          if (item.type === "random-group") return item.ids.every(id => this.plugin.soundMap.has(id));
          return false;
        });
        break;
    }
  }

  updateAll(now: number) {
    for (const btn of this.buttons) {
      btn.updateState();
      btn.updateProgress(now);
    }
  }

  updateProgress(now: number) {
    for (const btn of this.buttons) {
      btn.updateProgress(now);
    }
  }

  remove(btn: InlineButton) {
    this.buttons.delete(btn);
    btn.destroy();
  }
}