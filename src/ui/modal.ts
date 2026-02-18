import { App, Modal, Setting, Notice } from "obsidian";
import type ObsidianFMPlugin from "../main";
import { Autocomplete, SuggestItem } from "./autocomplete";
import { playSound, stopSound } from "src/api/kenku";

export class ObsidianFMInsert extends Modal {
  plugin: ObsidianFMPlugin;
  onSubmit: (result: { title: string; trackId: string, type: "track" | "sound" | "playlist" | null }) => void;

  constructor(
    app: App,
    plugin: ObsidianFMPlugin,
    onSubmit: (result: { title: string; trackId: string, type: "track" | "sound" | "playlist" | null }) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    let title = "";
    let selectedTrack: string | null = null;
    let selectedTrackType: "track" | "sound" | "playlist" | null = null;

    contentEl.createEl("h2", { text: "Insert ObsidianFM Player" });
    // Search field
    const searchSetting = new Setting(contentEl)
      .setName("Search")
      .addText(text => {
        text.setPlaceholder("Search tracks or sounds…");

        const items: SuggestItem[] = [
          ...this.plugin.music.map(t => ({
            id: t.id,
            label: t.title,
            icon: "music",
            subtitle: t.playlistName,
            type: "track" as const,
          })),
          ...this.plugin.sounds.map(s => ({
            id: s.id,
            label: s.title,
            icon: "audio-lines",
            subtitle: s.soundboardName,
            type: "sound" as const,
          })),
          ...this.plugin.playlists.map(p => ({
            id: p.id,
            label: p.title,
            icon: "list-music",
            subtitle: "Playlist",
            type: "playlist" as const,
          }))
        ];

        new Autocomplete(
          this.app,
          text.inputEl,
          items,
          (item) => {
            title = item.label;
            selectedTrack = item.id;
            selectedTrackType = item.type;
          },
          (id, type) => {
            playSound(this.plugin.settings.baseUrl, id, type);
          },
          (type, id) => {
            stopSound(
              this.plugin.settings.baseUrl,
              type,
              id
            );
          }
        );
      });

    contentEl.createEl("h3", { text: "Playback Settings" });

    // Insert button — moved OUTSIDE the search field callback
    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText("Insert")
          .setCta()
          .onClick(() => {
            if (!selectedTrack) {
              new Notice("Please select a track or sound");
              return;
            }

            this.close();
            this.onSubmit({ title, trackId: selectedTrack, type: selectedTrackType });
          });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}