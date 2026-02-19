import { Notice, Plugin } from "obsidian";
import SettingsTab from "./Settings";

import {
  InsertResult,
  ObsidianFMSettings,
  Playlist,
  Sound,
  Soundboard,
  Track,
} from "./api/types";

import { ObsidianFMInsert } from "./ui/modal";
import { PlaybackState } from "./playback/playbackstate";
import { PlaybackSync } from "./playback/playbacksync";
import { PlaybackInterpolator } from "./playback/playbackinterpolator";
import { ConnectionHandler } from "./api/connectionhandler";
import { InlineButtonRegistry } from "./inline/inlinebuttonregistry";
import { PlayerView } from "./ui/player/playerview";
import { VIEW_TYPE_OBSIDIANFM } from "./ui/player/playerview";
import { PlaybackController } from "./playback/playbackcontroller";

const DEFAULT_SETTINGS: ObsidianFMSettings = {
  baseUrl: "http://127.0.0.1:3333",
};

export default class ObsidianFMPlugin extends Plugin {
  settings: ObsidianFMSettings;

  // Data from KenkuFM
  sounds: Sound[] = [];
  music: Track[] = [];
  playlists: Playlist[] = [];
  soundboards: Soundboard[] = [];

  // Cached maps
  soundMap: Map<string, Sound> = new Map();
  soundboardMap: Map<string, Soundboard> = new Map();

  // Connection state
  kenkuOnline = false;

  // Core systems
  playback: PlaybackState;
  playbackController: PlaybackController;
  playbackSync: PlaybackSync;
  playbackInterpolator: PlaybackInterpolator;
  connection: ConnectionHandler;
  inlineButtons: InlineButtonRegistry;

  // Views
  views: PlayerView[] = [];

  typeIconMap: Record<string, string> = {
    track: "music",
    playlist: "list-music",
    sound: "audio-lines",
    soundboard: "square-play",
    soundscape: "mountain",
  };

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new SettingsTab(this.app, this));

    // Core systems
    this.playback = new PlaybackState();
    this.inlineButtons = new InlineButtonRegistry(this, this.playback);
    this.connection = new ConnectionHandler(this, this.inlineButtons);
    this.playbackSync = new PlaybackSync(this, this.playback, this.inlineButtons);
    this.playbackInterpolator = new PlaybackInterpolator(
      this,
      this.playback,
      this.inlineButtons
    );
    this.playbackController = new PlaybackController(this);

    // Initial connection
    await this.connection.connect();

    // Commands
    this.addCommand({
      id: "kenku-reconnect",
      name: "Reconnect to KenkuFM Remote",
      callback: async () => {
        new Notice("Trying to reconnect...");
        this.kenkuOnline = false;
        await this.connection.connect();
      },
    });

    this.addCommand({
      id: "insert-obsidianfm-inline-player",
      name: "Insert ObsidianFM Inline Player",
      editorCallback: (editor) => {
        if (!this.kenkuOnline) {
          new Notice("KenkuFM is offline.");
          return;
        }

        new ObsidianFMInsert(
          this.app,
          this,
          (result) => {
            editor.replaceSelection(this.buildInlineCode(result));
          },
          "normal"
        ).open();
      },
    });

    this.addCommand({
      id: "insert-obsidianfm-soundscape",
      name: "Insert ObsidianFM Soundscape",
      editorCallback: (editor) => {
        if (!this.kenkuOnline) {
          new Notice("KenkuFM is offline.");
          return;
        }

        new ObsidianFMInsert(
          this.app,
          this,
          (result) => {
            editor.replaceSelection(this.buildInlineCode(result));
          },
          "soundscape"
        ).open();
      },
    });

    // Inline buttons
    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll("code").forEach((codeEl) => {
        const raw = codeEl.innerText.trim();
        if (!raw.startsWith("obsidianfm:")) return;

        const config = this.parseInlineKenku(raw);
        const btn = this.inlineButtons.createFromConfig(config);
        if (btn) codeEl.replaceWith(btn.el);
      });
    });

    // Register view
    this.registerView(
      VIEW_TYPE_OBSIDIANFM,
      (leaf) => new PlayerView(leaf, this)
    );

    // Ribbon
    this.addRibbonIcon("audio-lines", "Open ObsidianFM Playback", async () => {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_OBSIDIANFM)[0];
      if (existing) {
        this.app.workspace.revealLeaf(existing);
        return;
      }

      const leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice("Cannot create ObsidianFM playback panel right now.");
        return;
      }

      await leaf.setViewState({
        type: VIEW_TYPE_OBSIDIANFM,
        active: true,
      });

      this.app.workspace.revealLeaf(leaf);
    });

    // Start sync + interpolation
    this.playbackSync.start();
    this.playbackInterpolator.start();
  }

  // ------------------------------------------------------------
  // INLINE BUILDER
  // ------------------------------------------------------------
  private buildInlineCode(result: InsertResult): string {
    const params: string[] = [];

    if (result.title) params.push(`title="${result.title}"`);
    if (result.trackId) params.push(`id="${result.trackId}"`);
    if (result.type) params.push(`type="${result.type}"`);

    if (result.overrideSettings) {
      if (result.repeat) {
        params.push(`repeat="${result.repeat}"`);
      }

      if (result.type === "playlist") {
        params.push(`shuffle="${result.shuffle ? "true" : "false"}"`);
      }
    }

    if (result.type === "soundscape" && !result.trackId) {
      params.push(`id="${crypto.randomUUID()}"`);
    }

    if (result.type === "soundboard") {
      params.push(`random="${result.random ? "true" : "false"}"`);
      params.push(`overlapping="${result.overlapping ? "true" : "false"}"`);
    }

    if (result.stack?.length) {
      params.push(`stack="${result.stack.map((s) => s.id).join(",")}"`);
    }

    return `\`obsidianfm: ${params.join(" ")}\``;
  }

  // ------------------------------------------------------------
  // INLINE PARSER
  // ------------------------------------------------------------
  private parseInlineKenku(raw: string): Record<string, string> {
    const text = raw.replace("obsidianfm:", "").trim();
    const result: Record<string, string> = {};

    const regex = /(\w+)=("[^"]*"|\S+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const key = match[1];
      let value = match[2];

      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }

    return result;
  }

  // ------------------------------------------------------------
  // OPEN PLAYBACK PANE
  // ------------------------------------------------------------
  async openPlaybackPane() {
    let leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) leaf = this.app.workspace.getLeaf("split", "vertical");

    await leaf.setViewState({
      type: VIEW_TYPE_OBSIDIANFM,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
  }
}