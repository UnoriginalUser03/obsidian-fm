import { App, Modal, Setting, Notice } from "obsidian";
import type KenkuFmSoundboardsPlugin from "../main";
import { KenkuSuggest, SuggestItem } from "./autocomplete";
import { previewItem, stopPreview } from "src/kenku";

export class KenkuInsertModal extends Modal {
  plugin: KenkuFmSoundboardsPlugin;
  onSubmit: (result: { title: string; trackId: string, trackType: "track" | "sound" | "playlist"  | null }) => void;

  constructor(
    app: App,
    plugin: KenkuFmSoundboardsPlugin,
    onSubmit: (result: { title: string; trackId: string, trackType: "track" | "sound" | "playlist" | null }) => void
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

    contentEl.createEl("h2", { text: "Insert KenkuFM Player" });
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
            icon: "volume-2",
            subtitle: s.soundboardName,
            type: "sound" as const,
          })),
        ];

        new KenkuSuggest(
          this.app,
          text.inputEl,
          items,
          (item) => {
            title = item.label;
            selectedTrack = item.id;
            selectedTrackType = item.type;
          },
          (id, type) => {
            previewItem(this.plugin.settings.baseUrl, id, type);
          },
          (type, id) => {
            stopPreview(
              this.plugin.settings.baseUrl,
              type,
              id
            );
          }
        );
      });

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
            this.onSubmit({ title, trackId: selectedTrack, trackType: selectedTrackType });
          });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}