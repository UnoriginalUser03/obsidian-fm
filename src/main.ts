import { Notice, Plugin, setIcon } from "obsidian";
import SettingsTab from "./Settings";

import {
  getMusic,
  getPlaylistPlaybackStatus,
  getSounds,
  playSound,
  stopSound,
  getSoundboardPlaybackIDs,
  getPlaylists,
  pingKenkuFM,
  setPlaylistPlayback,
} from "./api/kenku";

import { ObsidianFMSettings, Playlist, Sound, Track } from "./types";
import { ObsidianFMInsert } from "./ui/modal";
import { ObsidianFMView, VIEW_TYPE_OBSIDIANFM } from "./ui/player";

const DEFAULT_SETTINGS: ObsidianFMSettings = {
  baseUrl: "http://127.0.0.1:3333",
};

export default class ObsidianFMPlugin extends Plugin {
  settings: ObsidianFMSettings;

  sounds: Sound[] = [];
  music: Track[] = [];
  playlists: Playlist[] = [];

  kenkuOnline: boolean = false;
  reconnecting: boolean = false;

  // Playback state
  currentInlineTrackId: string | null = null;
  currentInlinePlaylistId: string | null = null;
  currentInlineSounds: Set<string> = new Set();
  currentPlaybackPaused: boolean = false;
  currentTrackProgress: number | null = null;
  currentTrackDuration: number | null = null;
  currentShuffle: boolean = false;
  currentRepeat: "off" | "playlist" | "track" = "off";
  currentVolume: number | null = null;
  currentMuted: boolean = false;

  typeIconMap: Record<string, string> = {
    track: "music",
    playlist: "list-music",
    sound: "audio-lines",
  };

  //Playback Pane View
  views: ObsidianFMView[] = [];

  // Interval handles
  private syncIntervalStarted = false;

  // ------------------------------------------------------------
  // LOAD
  // ------------------------------------------------------------
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new SettingsTab(this.app, this));

    // Try connect on startup
    await this.tryInitialConnect();

    // ---------------- COMMANDS ----------------
    this.addCommand({
      id: "kenku-reconnect",
      name: "Reconnect to Kenku Remote",
      callback: async () => {
        new Notice("Trying to reconnect...");
        this.kenkuOnline = false;
        await this.tryInitialConnect();
      },
    });

    this.addCommand({
      id: "reload-sounds",
      name: "Reload sounds",
      callback: async () => {
        if (!this.kenkuOnline) {
          new Notice("Kenku is offline.");
          return;
        }
        this.sounds = await getSounds(this.settings.baseUrl);
        new Notice("✅ Sounds reloaded!");
      },
    });

    this.addCommand({
      id: "insert-obsidianfm-inline-player",
      name: "Insert Kenku Inline Player",
      editorCallback: (editor) => {
        if (!this.kenkuOnline) {
          new Notice("Kenku is offline.");
          return;
        }

        new ObsidianFMInsert(this.app, this, (result) => {
          const inline = `\`obsidianfm: title="${result.title}" trackId="${result.trackId}" type="${result.type}"\``;
          editor.replaceSelection(inline);
        }).open();
      },
    });

    // ---------------- INLINE BUTTONS ----------------
    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll("code").forEach((codeEl) => {
        const raw = codeEl.innerText.trim();
        if (raw.startsWith("obsidianfm:")) {
          this.renderInlineKenku(codeEl as HTMLElement, raw);
        }
      });
    });

    // Register the view type
    this.registerView(
      VIEW_TYPE_OBSIDIANFM,
      (leaf) => new ObsidianFMView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon("audio-lines", "Open Kenku Playback", async () => {
      // Check for existing view
      const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_OBSIDIANFM)[0];
      if (existingLeaf) {
        this.app.workspace.revealLeaf(existingLeaf);
        return;
      }

      // Create new right leaf
      const leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice("Cannot create Kenku playback panel right now.");
        return;
      }

      await leaf.setViewState({
        type: VIEW_TYPE_OBSIDIANFM,
        active: true,
      });

      this.app.workspace.revealLeaf(leaf);
    });

    // Start sync loop ONCE
    this.startPlaybackSync();
  }

  // ------------------------------------------------------------
  // SETTINGS SAVE
  // ------------------------------------------------------------
  async saveSettings() {
    await this.saveData(this.settings);
    new Notice("Settings saved!");
  }

  // ------------------------------------------------------------
  // INLINE BUTTON PARSER
  // ------------------------------------------------------------
  private parseInlineKenku(raw: string): Record<string, string> {
    const text = raw.replace("obsidianfm:", "").trim();
    const result: Record<string, string> = {};

    const regex = /(\w+)=("[^"]*"|\S+)/g;
    let match;

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
  // INLINE BUTTON RENDER
  // ------------------------------------------------------------
  private renderInlineKenku(codeEl: HTMLElement, raw: string) {
    const config = this.parseInlineKenku(raw);

    const button = document.createElement("button");
    button.classList.add("obsidianfm-inline-btn");

    const id = config.trackId;
    const type = config.type as "track" | "sound" | "playlist";
    const title = config.title ?? "Play";

    button.dataset.obsidianfmId = id;
    button.dataset.obsidianfmType = type;
    button.dataset.obsidianfmTitle = title;

    const update = () => {
      const isSound = type === "sound";
      const isTrack = type === "track";
      const isPlaylist = type === "playlist";

      const isPlaying =
        (isTrack && this.currentInlineTrackId === id && !this.currentPlaybackPaused) ||
        (isPlaylist && this.currentInlinePlaylistId === id && !this.currentPlaybackPaused) ||
        (isSound && this.currentInlineSounds.has(id));

      const isPaused =
        (isTrack && this.currentInlineTrackId === id && this.currentPlaybackPaused) ||
        (isPlaylist && this.currentInlinePlaylistId === id && this.currentPlaybackPaused);

      // Update classes
      button.classList.toggle("is-playing", isPlaying);
      button.classList.toggle("is-paused", isPaused);
      button.disabled = !this.kenkuOnline;
      button.classList.toggle("is-disabled", !this.kenkuOnline);

      // Rebuild content
      button.textContent = "";

      // Left icon for play/pause state
      const iconEl = document.createElement("div");
      iconEl.classList.add("obsidianfm-inline-icon");

      if (isPaused) setIcon(iconEl, "play");
      else setIcon(iconEl, isPlaying ? "square" : "play");

      button.appendChild(iconEl);

      // Title
      const titleEl = document.createElement("span");
      titleEl.classList.add("obsidianfm-inline-title");
      titleEl.textContent = title;
      button.appendChild(titleEl);

      // Right icon for type
      const typeIconEl = document.createElement("div");
      typeIconEl.classList.add("obsidianfm-inline-type-icon");

      // Map type → icon
      setIcon(typeIconEl, this.typeIconMap[type]);
      button.appendChild(typeIconEl);
    };


    update();

    button.addEventListener("click", async () => {
      if (!this.kenkuOnline) {
        new Notice("Kenku Remote is offline.");
        return;
      }

      const isSound = type === "sound";
      const isTrack = type === "track";
      const isPlaylist = type === "playlist";

      const isPlaying =
        (isTrack && this.currentInlineTrackId === id && !this.currentPlaybackPaused) ||
        (isPlaylist && this.currentInlinePlaylistId === id && !this.currentPlaybackPaused) ||
        (isSound && this.currentInlineSounds.has(id));

      const isPaused =
        (isTrack && this.currentInlineTrackId === id && this.currentPlaybackPaused) ||
        (isPlaylist && this.currentInlinePlaylistId === id && this.currentPlaybackPaused);

      try {
        // ------------------- SOUNDS -------------------
        if (isSound) {
          if (isPlaying) {
            await stopSound(this.settings.baseUrl, type, id);
            this.currentInlineSounds.delete(id);
          } else {
            await playSound(this.settings.baseUrl, id, type);
            this.currentInlineSounds.add(id);
          }
        }

        // ------------------- TRACK / PLAYLIST -------------------
        if (isTrack || isPlaylist) {
          if (isPlaying) {
            // Pause
            await setPlaylistPlayback(this.settings.baseUrl, false);
            this.currentPlaybackPaused = true;
          } else if (isPaused) {
            // Resume
            await setPlaylistPlayback(this.settings.baseUrl, true);
            this.currentPlaybackPaused = false;
          } else {
            // Start new
            await playSound(this.settings.baseUrl, id, type);
            if (isTrack) this.currentInlineTrackId = id;
            if (isPlaylist) this.currentInlinePlaylistId = id;
            this.currentPlaybackPaused = false;
          }
        }

        this.updateAllInlineButtons();
      } catch {
        this.handleDisconnect();
      }
    });

    codeEl.replaceWith(button);
  }




  // ------------------------------------------------------------
  // UPDATE ALL BUTTONS
  // ------------------------------------------------------------
  public updateAllInlineButtons() {
    document
      .querySelectorAll<HTMLButtonElement>("button.obsidianfm-inline-btn")
      .forEach((btn) => {
        const id = btn.dataset.obsidianfmId!;
        const type = btn.dataset.obsidianfmType as "track" | "playlist" | "sound";

        const isSound = type === "sound";
        const isTrack = type === "track";
        const isPlaylist = type === "playlist";

        const isPlaying =
          (isTrack && this.currentInlineTrackId === id && !this.currentPlaybackPaused) ||
          (isPlaylist && this.currentInlinePlaylistId === id && !this.currentPlaybackPaused) ||
          (isSound && this.currentInlineSounds.has(id));

        const isPaused =
          (isTrack && this.currentInlineTrackId === id && this.currentPlaybackPaused) ||
          (isPlaylist && this.currentInlinePlaylistId === id && this.currentPlaybackPaused);

        // Update classes
        btn.classList.toggle("is-playing", isPlaying);
        btn.classList.toggle("is-paused", isPaused);

        btn.disabled = !this.kenkuOnline;
        btn.classList.toggle("is-disabled", !this.kenkuOnline);

        this.views.forEach(view => view.render());

        // Rebuild content
        btn.textContent = "";

        const iconEl = document.createElement("div");
        iconEl.classList.add("obsidianfm-inline-icon");

        if (isPaused) setIcon(iconEl, "play");      // show pause icon
        else setIcon(iconEl, isPlaying ? "square" : "play"); // playing → stop icon, stopped → play icon

        btn.appendChild(iconEl);
        btn.append(" " + (btn.dataset.obsidianfmTitle ?? "Play"));
        // Right icon for type
        const typeIconEl = document.createElement("div");
        typeIconEl.classList.add("obsidianfm-inline-type-icon");

        // Map type → icon
        setIcon(typeIconEl, this.typeIconMap[type]);
        btn.appendChild(typeIconEl);
      });
  }




  // ------------------------------------------------------------
  // PLAYBACK SYNC LOOP
  // ------------------------------------------------------------
  private startPlaybackSync() {
    if (this.syncIntervalStarted) return;
    this.syncIntervalStarted = true;

    this.registerInterval(window.setInterval(() => this.syncPlaybackState(), 1000));
  }

  private async syncPlaybackState() {
    try {
      const [playback, soundIDs] = await Promise.all([
        getPlaylistPlaybackStatus(this.settings.baseUrl),
        getSoundboardPlaybackIDs(this.settings.baseUrl),
      ]);

      if (!playback) throw new Error("No response from Kenku");

      let changed = false;

      // IDs
      const newTrackId = playback.track?.id ?? null;
      const newPlaylistId = playback.playlist?.id ?? null;

      if (this.currentInlineTrackId !== newTrackId) {
        this.currentInlineTrackId = newTrackId;
        changed = true;
      }
      if (this.currentInlinePlaylistId !== newPlaylistId) {
        this.currentInlinePlaylistId = newPlaylistId;
        changed = true;
      }

      // Paused state: if track/playlist exists but !playing
      const newPaused =
        (playback.track || playback.playlist) && !playback.playing;
      if (this.currentPlaybackPaused !== newPaused) {
        this.currentPlaybackPaused = newPaused;
        changed = true;
      }

      // Soundboard sync
      const newSet = new Set(soundIDs);
      if (!this.setsEqual(newSet, this.currentInlineSounds)) {
        this.currentInlineSounds = newSet;
        changed = true;
      }

      if (playback.track) {
        this.currentTrackProgress = playback.track.progress; // seconds
        this.currentTrackDuration = playback.track.duration; // seconds
      } else {
        this.currentTrackProgress = null;
        this.currentTrackDuration = null;
      }
      this.currentShuffle = playback.shuffle ?? false;
      this.currentRepeat = playback.repeat ?? "off";
      this.currentVolume =
        playback.volume != null
          ? Math.min(100, Math.max(0, Math.round(playback.volume * 100)))
          : 100;
      this.currentMuted = playback.muted ?? false;


      this.views.forEach((v) => v.updateDynamicElements());
      if (changed) this.updateAllInlineButtons();

      // Online flag
      if (!this.kenkuOnline) this.kenkuOnline = true;

    } catch {
      this.handleDisconnect();
    }
  }



  private handleDisconnect() {
    if (!this.kenkuOnline) return;

    this.kenkuOnline = false;
    new Notice("❌ Kenku Remote disconnected");

    this.currentInlineTrackId = null;
    this.currentInlinePlaylistId = null;
    this.currentInlineSounds.clear();

    this.updateAllInlineButtons();

    this.startReconnectLoop();
  }

  // ------------------------------------------------------------
  // CONNECTION MANAGEMENT
  // ------------------------------------------------------------
  private async tryInitialConnect() {
    const alive = await pingKenkuFM(this.settings.baseUrl);

    if (alive) {
      try {
        this.sounds = await getSounds(this.settings.baseUrl);
        this.music = await getMusic(this.settings.baseUrl);
        this.playlists = await getPlaylists(this.settings.baseUrl);

        this.kenkuOnline = true;
        new Notice("✅ Kenku Remote connected!");
        this.updateAllInlineButtons();
      } catch (e) {
        // Something failed in fetching data, treat as disconnected
        console.error(e);
        this.handleDisconnect();
      }
    } else {
      this.kenkuOnline = false;
      new Notice("⚠️ Kenku Remote offline. Retrying...");
      this.startReconnectLoop();
    }
  }


  private startReconnectLoop() {
    if (this.reconnecting) return;
    this.reconnecting = true;

    this.registerInterval(window.setInterval(async () => {
      if (this.kenkuOnline) return; // already online, skip

      try {
        const alive = await pingKenkuFM(this.settings.baseUrl);
        if (!alive) return; // server still offline

        // Attempt to load essential data
        const [sounds, music, playlists] = await Promise.all([
          getSounds(this.settings.baseUrl),
          getMusic(this.settings.baseUrl),
          getPlaylists(this.settings.baseUrl),
        ]);

        // Only now consider it fully online
        this.sounds = sounds;
        this.music = music;
        this.playlists = playlists;
        this.kenkuOnline = true;
        this.reconnecting = false;

        new Notice("✅ Kenku Remote reconnected!");
        this.updateAllInlineButtons();
      } catch (e) {
        // Still offline, will retry silently
        console.warn("Reconnect attempt failed:", e);
      }
    }, 3000));
  }


  private setsEqual(a: Set<string>, b: Set<string>) {
    return a.size === b.size && [...a].every((x) => b.has(x));
  }

  async openPlaybackPane() {
    // Try to get a right leaf (split view)
    let leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) leaf = this.app.workspace.getLeaf('split', 'vertical');

    // Make sure the leaf is ready
    await leaf.setViewState({
      type: VIEW_TYPE_OBSIDIANFM,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
  }
}
