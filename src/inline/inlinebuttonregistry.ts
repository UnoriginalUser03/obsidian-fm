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
import { EditorInlineButton } from "./button types/editorinlinebutton";
import { Notice } from "obsidian";

export class InlineButtonRegistry {
  private playerButtons = new Map<string, Set<InlineButton>>();
  private editorButtons = new Map<string, Set<EditorInlineButton>>();

  constructor(
    private plugin: ObsidianFMPlugin,
    private state: PlaybackState
  ) { }

  // ------------------------------------------------------------
  // PLAYBACK BUTTON CREATION
  // ------------------------------------------------------------
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

    this.register(btn);
    return btn;
  }

  // ------------------------------------------------------------
  // REGISTRATION
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // REGISTRATION
  // ------------------------------------------------------------
  register(btn: InlineButton | EditorInlineButton) {
    if (btn instanceof EditorInlineButton) {
      // Many editor widgets per ID
      if (!this.editorButtons.has(btn.id)) {
        this.editorButtons.set(btn.id, new Set());
      }
      this.editorButtons.get(btn.id)!.add(btn);

      // Mirror validity from playback buttons (if any exist)
      const playbackSet = this.playerButtons.get(btn.id);
      if (playbackSet && playbackSet.size > 0) {
        const first = playbackSet.values().next().value;
        btn.isValid = first.isValid;
      }

      btn.updateState();
    }

    else {
      // Many playback buttons per ID
      if (!this.playerButtons.has(btn.id)) {
        this.playerButtons.set(btn.id, new Set());
      }
      const set = this.playerButtons.get(btn.id)!;
      set.add(btn);

      // Validate this playback button
      btn.isValid = this.validateButton(btn);

      // Push validity to all editor buttons
      const editors = this.editorButtons.get(btn.id);
      if (editors) {
        for (const ed of editors) {
          ed.isValid = btn.isValid;
          ed.updateState();
        }
      }

      btn.updateState();
      btn.updateProgress(performance.now());
    }
  }
  // ------------------------------------------------------------
  // UNREGISTER
  // ------------------------------------------------------------
  unregister(btn: InlineButton | EditorInlineButton) {
    if (btn instanceof EditorInlineButton) {
      const set = this.editorButtons.get(btn.id);
      if (set) {
        set.delete(btn);
        if (set.size === 0) this.editorButtons.delete(btn.id);
      }
    } else {
      const set = this.playerButtons.get(btn.id);
      if (set) {
        set.delete(btn);
        if (set.size === 0) this.playerButtons.delete(btn.id);
      }
    }
    btn.destroy();
  }
  // ------------------------------------------------------------
  // LOOKUP
  // ------------------------------------------------------------
  getPlaybackButton(id: string): InlineButton | null {
    const set = this.playerButtons.get(id);
    if (!set || set.size === 0) return null;
    return set.values().next().value; // first instance
  }

  // ------------------------------------------------------------
  // VALIDATION
  // ------------------------------------------------------------
  refreshValidity() {
    // Validate ALL playback button instances
    for (const set of this.playerButtons.values()) {
      for (const btn of set) {
        btn.isValid = this.validateButton(btn);
      }
    }

    // Editor buttons mirror playback validity
    for (const [id, editors] of this.editorButtons.entries()) {
      const playbackSet = this.playerButtons.get(id);

      // If no playback buttons exist yet, treat as valid (neutral)
      let valid = true;

      if (playbackSet && playbackSet.size > 0) {
        // Use the first playback instance as the source of truth
        const first = playbackSet.values().next().value;
        valid = first.isValid;
      }

      for (const ed of editors) {
        ed.isValid = valid;
        ed.updateState();
      }
    }

    this.updateAll(performance.now());
  }

  private validateButton(btn: InlineButton): boolean {
    // Editor buttons never validate themselves
    if (btn.type === "editor") return true;

    switch (btn.type) {
      case "track":
        return this.plugin.music.some(t => t.id === (btn as TrackButton).kenkuId);

      case "playlist":
        return this.plugin.playlists.some(p => p.id === (btn as PlaylistButton).kenkuId);

      case "sound":
        return this.plugin.soundMap.has((btn as SoundButton).kenkuId);

      case "soundboard":
        return this.plugin.soundboardMap.has((btn as SoundboardButton).kenkuId);

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

  // ------------------------------------------------------------
  // UPDATE LOOPS
  // ------------------------------------------------------------
  updateAll(now: number) {
    for (const set of this.playerButtons.values()) {
      for (const btn of set) {
        btn.updateState();
        btn.updateProgress(now);
      }
    }

    for (const set of this.editorButtons.values()) {
      for (const btn of set) {
        btn.updateState();
      }
    }
  }

  updateProgress(now: number) {
    for (const set of this.playerButtons.values()) {
      for (const btn of set) {
        btn.updateProgress(now);
      }
    }
  }
}