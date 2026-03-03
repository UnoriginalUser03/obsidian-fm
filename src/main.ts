import { Events, MarkdownRenderChild, Notice, Plugin } from "obsidian";
import SettingsTab from "./Settings";

import {
  InsertResult,
  ObsidianFMSettings,
  Playlist,
  Sound,
  Soundboard,
  SoundscapeItem,
  Track,
} from "./api/types";

import { createObsidianFMEditInlineExtension } from "./inline/editinline";
import { PlaybackState } from "./playback/playbackstate";
import { PlaybackSync } from "./playback/playbacksync";
import { PlaybackInterpolator } from "./playback/playbackinterpolator";
import { ConnectionHandler } from "./api/connectionhandler";
import { InlineButtonRegistry } from "./inline/inlinebuttonregistry";
import { PlayerView } from "./ui/player/playerview";
import { VIEW_TYPE_OBSIDIANFM } from "./ui/player/playerview";
import { PlaybackController } from "./playback/playbackcontroller";
import { InlinePlayerInsertModal } from "./ui/modal/inlineplayerinsertmodal";
import { SoundscapeInsertModal } from "./ui/modal/soundscapeinsertmodal";
import { Helpers } from "./helpers/helpers";

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

  //Plugin Events
  events: Events = new Events()

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
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));

    this.registerEvent(
      this.events.on("obsidian-fm:online", () => {
        this.app.workspace.trigger("layout-change");
      })
    );

    // Core systems
    this.playback = new PlaybackState();
    this.inlineButtons = new InlineButtonRegistry(this, this.playback);
    this.registerEditorExtension(createObsidianFMEditInlineExtension(this));
    this.connection = new ConnectionHandler(this, this.inlineButtons);
    this.playbackSync = new PlaybackSync(this, this.playback, this.inlineButtons);
    this.playbackInterpolator = new PlaybackInterpolator(
      this,
      this.playback,
      this.inlineButtons
    );
    this.playbackController = new PlaybackController(this);

    // Initial connection
    this.connection.connect();

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

        new InlinePlayerInsertModal(
          this.app,
          this,
          (result) => {
            editor.replaceSelection(Helpers.buildInlineCode(result));
          },
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

        new SoundscapeInsertModal(
          this.app,
          this,
          (result) => {
            editor.replaceSelection(Helpers.buildInlineCode(result));
          },
        ).open();
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {

        menu.addSeparator();
        // Header
        menu.addItem(item => {
          item.setTitle("ObsidianFM");
          item.setDisabled(true);
        });

        // Insert Inline Player
        menu.addItem(item => {
          item
            .setTitle("Insert Inline Player")
            .setIcon("audio-lines")
            .onClick(() => {
              if (!this.kenkuOnline) {
                new Notice("KenkuFM is offline.");
                return;
              }

              const raw = editor.getSelection();
              const trimmed = raw.trim();
              const initialConfig = trimmed.length > 0 ? { title: trimmed } : undefined;

              new InlinePlayerInsertModal(
                this.app,
                this,
                (result) => {
                  editor.replaceSelection(Helpers.buildInlineCode(result));
                },
                () => { },
                initialConfig
              ).open();
            });
        });

        // Insert Soundscape
        menu.addItem(item => {
          item
            .setTitle("Insert Soundscape")
            .setIcon("mountain")
            .onClick(() => {
              if (!this.kenkuOnline) {
                new Notice("KenkuFM is offline.");
                return;
              }

              const raw = editor.getSelection();
              const trimmed = raw.trim();
              const initialConfig = trimmed.length > 0 ? { title: trimmed } : undefined;

              new SoundscapeInsertModal(
                this.app,
                this,
                (result) => {
                  editor.replaceSelection(Helpers.buildInlineCode(result));
                },
                () => { },
                initialConfig
              ).open();
            });
        });

        menu.addSeparator();
      })
    );

    // Inline buttons
    this.registerMarkdownPostProcessor((el, ctx) => {
      el.querySelectorAll("code").forEach((codeEl) => {
        const raw = codeEl.innerText.trim();
        if (!raw.startsWith("obsidianfm:")) return;

        const config = Helpers.parseInlineKenku(raw);
        const btn = this.inlineButtons.createFromConfig(config);
        if (!btn) return;

        codeEl.replaceWith(btn.el);

        const plugin = this;      // capture plugin instance
        const button = btn;       // capture non-null button

        const child = new class extends MarkdownRenderChild {
          constructor() {
            super(button.el);
          }
          onunload() {
            plugin.inlineButtons.unregister(button);
          }
        }();

        ctx.addChild(child);
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

  async onunload() {
    // Stop all audio
    await this.playbackController.stopAll();

    // Kill random-group timers - Stop All should already do this with Stop soundscape
    // But if any are lingering, this will kill them off 
    for (const timers of this.playbackController.randomGroupTimers.values()) {
      for (const t of timers) clearTimeout(t);
    }
    this.playbackController.randomGroupTimers.clear();

    // Kill preview watcher
    if (this.playbackController.watchPreview) {
      clearInterval(this.playbackController.watchPreview);
      this.playbackController.watchPreview = null;
    }

    // Stop interpolation loop
    this.playbackInterpolator.stop();
  }

  async openPlaybackPane() {
    let leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) leaf = this.app.workspace.getLeaf("split", "vertical");

    await leaf.setViewState({
      type: VIEW_TYPE_OBSIDIANFM,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}