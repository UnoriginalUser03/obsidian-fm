import { Plugin, setIcon } from 'obsidian';
import SettingsTab from './Settings';
import { getMusic, getPlaylistPlaybackStatus, getSounds, previewItem, stopPreview } from './kenku';
import { KenkuFmSettings, Sound, Track } from './types';
import { KenkuInsertModal } from './ui/modal';


const DEFAULT_SETTINGS: KenkuFmSettings = {
  baseUrl: 'http://127.0.0.1:3333'
};

export default class KenkuFmSoundboardsPlugin extends Plugin {
  settings: KenkuFmSettings;
  sounds: Sound[];
  music: Track[];
  playing: boolean;
  currentInlineTrack: string | null = null;
  currentInlineSounds: Set<string> = new Set();
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new SettingsTab(this.app, this));

    this.sounds = await getSounds(this.settings.baseUrl);
    this.music = await getMusic(this.settings.baseUrl);
    this.playing = await getPlaylistPlaybackStatus(this.settings.baseUrl);

    this.addCommand({
      id: 'reload-sounds',
      name: 'Reload sounds',
      callback: async () => {
        this.sounds = await getSounds(this.settings.baseUrl);
      }
    });

    this.addCommand({
      id: "insert-kenku-inline-player",
      name: "Insert Kenku Inline Player",
      editorCallback: (editor) => {
        new KenkuInsertModal(this.app, this, (result) => {
          const inline = `\`kenku: title="${result.title}" trackId="${result.trackId}" trackType="${result.trackType}"\``;
          editor.replaceSelection(inline);
        }).open();
      }
    });


    this.registerMarkdownPostProcessor((el, ctx) => {
      const codeEls = el.querySelectorAll("code");

      codeEls.forEach(codeEl => {
        const raw = codeEl.innerText.trim();

        if (raw.startsWith("kenku:")) {
          this.renderInlineKenku(codeEl, raw);
        }
      });
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
    await getSounds(this.settings.baseUrl);
  }
  private parseInlineKenku(raw: string): Record<string, string> {
    const text = raw.replace("kenku:", "").trim();
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
  private renderInlineKenku(codeEl: HTMLElement, raw: string) {
    const config = this.parseInlineKenku(raw);

    const button = document.createElement("button");
    button.classList.add("kenku-inline-btn");

    const id = config.trackId;
    const type = config.trackType as "track" | "sound" | "playlist";
    const title = config.title ?? "Play";

    // Store metadata for global updates
    button.dataset.kenkuId = id;
    button.dataset.kenkuType = type;
    button.dataset.kenkuTitle = title;

    const updateIcon = () => {
      button.textContent = "";

      const iconEl = document.createElement("div");
      iconEl.classList.add("kenku-inline-icon");

      const isPlaying =
        type === "track"
          ? this.currentInlineTrack === id
          : this.currentInlineSounds.has(id);
      button.classList.toggle("is-playing", isPlaying);
      setIcon(iconEl, isPlaying ? "square" : "play");

      button.appendChild(iconEl);
      button.append(" " + title);
    };

    updateIcon();

    button.addEventListener("click", async () => {
      const isPlaying =
        type === "track"
          ? this.currentInlineTrack === id
          : this.currentInlineSounds.has(id);

      // --- STOP LOGIC ---
      if (isPlaying) {
        if (type === "track") {
          await stopPreview(this.settings.baseUrl, "track", id);
          this.currentInlineTrack = null;
        } else {
          await stopPreview(this.settings.baseUrl, "sound", id);
          this.currentInlineSounds.delete(id);
        }

        this.updateAllInlineButtons();
        return;
      }

      // --- START LOGIC ---
      if (type === "track") {
        await previewItem(this.settings.baseUrl, id, "track");
        this.currentInlineTrack = id;
      } else {
        // Sounds can overlap
        await previewItem(this.settings.baseUrl, id, "sound");
        this.currentInlineSounds.add(id);
      }

      this.updateAllInlineButtons();
    });

    codeEl.replaceWith(button);
  }
  private updateAllInlineButtons() {
    const buttons =
      document.querySelectorAll<HTMLButtonElement>(
        "button.kenku-inline-btn"
      );

    buttons.forEach(btn => {
      const id = btn.dataset.kenkuId!;
      const type = btn.dataset.kenkuType as "track" | "sound";
      const title = btn.dataset.kenkuTitle ?? "Play";

      const isPlaying =
        type === "track"
          ? this.currentInlineTrack === id
          : this.currentInlineSounds.has(id);

      btn.classList.toggle("is-playing", isPlaying);

      btn.textContent = "";

      const iconEl = document.createElement("div");
      iconEl.classList.add("kenku-inline-icon");

      setIcon(iconEl, isPlaying ? "square" : "play");

      btn.appendChild(iconEl);
      btn.append(" " + title);
    });
  }

}
