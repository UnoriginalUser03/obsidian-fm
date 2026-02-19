import { App, Modal, Setting, Notice } from "obsidian";
import type ObsidianFMPlugin from "../main";
import { Autocomplete } from "./autocomplete";
import { playSound, stopSound } from "src/api/kenku";
import { InsertMode, InsertResult, MediaType, RepeatMode, SuggestItem } from "src/api/types";

export class ObsidianFMInsert extends Modal {
  plugin: ObsidianFMPlugin;
  onSubmit: (result: InsertResult) => void;
  mode: InsertMode;

  // State
  private selectedId: string | null = null;
  private selectedType: InsertResult["type"] = null;
  private selectedLabel = "";

  private repeat: RepeatMode = "off";
  private shuffle = false;
  private overlapping = false;
  private playOnce = false;
  private random = false;
  private volume = 100;
  private overrideSettings = false;

  private stack: { id: string; label: string }[] = [];

  constructor(
    app: App,
    plugin: ObsidianFMPlugin,
    onSubmit: (result: InsertResult) => void,
    mode: InsertMode = "normal"
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.mode = mode;
  }

  onOpen() {
    const { contentEl } = this;

    // Title
    contentEl.createEl("h2", {
      text: this.mode === "normal"
        ? "Insert ObsidianFM Player"
        : "Create ObsidianFM Soundscape"
    });

    // -------------------------------
    // NAME FIELD (shared)
    // -------------------------------
    const nameSection = contentEl.createDiv({ cls: "obsidianfm-section" });

    new Setting(nameSection)
      .setName(this.mode === "normal" ? "Name (optional)" : "Name (required)")
      .addText(text => {
        text.setPlaceholder(
          this.mode === "normal"
            ? "Enter player name…"
            : "Enter soundscape name…"
        );
        text.onChange(v => this.selectedLabel = v);
      });

    // -------------------------------
    // SEARCH SECTION (shared)
    // -------------------------------
    const searchSection = contentEl.createDiv({ cls: "obsidianfm-section" });

    const searchSetting = new Setting(searchSection)
      .setName("Search")
      .setDesc(
        this.mode === "normal"
          ? "Search tracks, sounds, playlists, or soundboards."
          : "Search looping ambience sounds."
      );

    const searchInput = searchSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: this.mode === "normal"
        ? "Search tracks, sounds, playlists…"
        : "Search looping sounds…",
      cls: "obsidianfm-search-input"
    });

    // -------------------------------
    // DETAILS OR STACK SECTION
    // -------------------------------
    const detailsSection = contentEl.createDiv({ cls: "obsidianfm-section" });
    const stackSection = contentEl.createDiv({ cls: "obsidianfm-section" });

    if (this.mode === "soundscape") {
      stackSection.createEl("h3", { text: "Soundscape Stack" });
      this.renderStack(stackSection);
    }

    // -------------------------------
    // AUTOCOMPLETE (shared)
    // -------------------------------
    const items = this.buildAutocompleteItems();

    new Autocomplete(
      this.app,
      this.plugin,
      searchInput,
      items,
      (item) => {
        if (this.mode === "normal") {
          this.handleNormalSelect(item, detailsSection);
        } else {
          this.handleStackSelect(item, stackSection, searchInput);
        }
      }
    );

    // -------------------------------
    // PREVIEW SECTION (soundscape only)
    // -------------------------------
    if (this.mode === "soundscape") {
      const previewSection = contentEl.createDiv({ cls: "obsidianfm-section" });
      previewSection.createEl("h3", { text: "Preview" });

      new Setting(previewSection)
        .setName("Preview Soundscape")
        .setDesc("Play all sounds in the stack to hear how they blend.")
        .addButton(btn => {
          btn.setIcon("play")
            .setTooltip("Play Preview")
            .onClick(() => {
              for (const s of this.stack) {
                playSound(this.plugin.settings.baseUrl, s.id, "sound");
              }
            });
        })
        .addButton(btn => {
          btn.setIcon("square")
            .setTooltip("Stop Preview")
            .onClick(() => {
              for (const s of this.stack) {
                stopSound(this.plugin.settings.baseUrl, "sound", s.id);
              }
            });
        });
    }

    // -------------------------------
    // INSERT BUTTON (shared)
    // -------------------------------
    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText("Insert")
          .setCta()
          .onClick(() => this.handleInsert(detailsSection));
      });
  }

  // ------------------------------------------------------------
  // AUTOCOMPLETE ITEM BUILDER
  // ------------------------------------------------------------
  private buildAutocompleteItems(): SuggestItem[] {
    if (this.mode === "soundscape") {
      return this.plugin.sounds
        .filter(s => s.loop === true)
        .map(s => this.makeItem({
          id: s.id,
          label: s.title,
          icon: "audio-lines",
          subtitle: s.soundboardName,
          type: "sound",
        }));
    }

    return [
      ...this.plugin.music.map(t => this.makeItem({
        id: t.id,
        label: t.title,
        icon: "music",
        subtitle: t.playlistName,
        type: "track"
      })),
      ...this.plugin.sounds.map(s => this.makeItem({
        id: s.id,
        label: s.title,
        icon: "audio-lines",
        subtitle: s.soundboardName,
        type: "sound"
      })),
      ...this.plugin.playlists.map(p => this.makeItem({
        id: p.id,
        label: p.title,
        icon: "list-music",
        subtitle: "Playlist",
        type: "playlist"
      })),
      ...this.plugin.soundboards.map(sb => this.makeItem({
        id: sb.id,
        label: sb.title,
        icon: "square-play",
        subtitle: "Soundboard",
        type: "soundboard"
      })),
    ];
  }

  private makeItem(item: SuggestItem): SuggestItem {
    return item;
  }

  // ------------------------------------------------------------
  // MODE A — NORMAL INSERT
  // ------------------------------------------------------------
  private handleNormalSelect(item: SuggestItem, detailsContainer: HTMLElement) {
    this.selectedId = item.id;
    this.selectedType = item.type;
    this.selectedLabel = item.label;

    this.renderProperties(detailsContainer, item);
  }

  private renderProperties(container: HTMLElement, item: SuggestItem) {
    container.empty();

    if (item.type === "track" || item.type === "playlist") {
      new Setting(container)
        .setName("Override Playback Settings")
        .setDesc("Override the player's default playback settings for this item.")
        .addToggle(t => t.setValue(this.overrideSettings).onChange(v => this.overrideSettings = v));

      new Setting(container)
        .setName("Repeat")
        .setDesc("Select repeat mode for this item. For playlists, 'playlist' will repeat the whole playlist and 'track' will repeat the individual track.")
        .addDropdown(drop => {
          drop.addOption("off", "Off")
          drop.addOption("playlist", "Playlist");
          drop.addOption("track", "Track");
          drop.setValue(this.repeat);
          drop.onChange(v => this.repeat = v as RepeatMode);
        })
        .setDisabled(!this.overrideSettings);

      new Setting(container)
        .setName("Shuffle")
        .setDesc("Whether to shuffle the playlist. For playlist this shuffles immediately, for tracks this plays the track then shuffles the rest of the playlist.")
        .addToggle(t => t.setValue(this.shuffle).onChange(v => this.shuffle = v))
        .setDisabled(!this.overrideSettings);

      item.type === "track" && new Setting(container)
        .setName("Play Once")
        .setDesc("Play the item only once, then stop.")
        .addToggle(t => t.setValue(this.playOnce).onChange(v => this.playOnce = v))
        .setDisabled(!this.overrideSettings);

      new Setting(container)
        .setName("Volume")
        .addSlider(s => s
          .setLimits(0, 100, 1)
          .setValue(this.volume)
          .onChange(v => this.volume = v));
    }

    if (item.type === "soundboard") {
      container.createEl("h4", { text: "Soundboard Options" });

      new Setting(container)
        .setName("Play Random")
        .addToggle(t => t.setValue(this.random).onChange(v => this.random = v));

      new Setting(container)
        .setName("Allow Overlapping")
        .setDesc("Allow multiple sounds from the soundboard to play at the same time.")
        .addToggle(t => t.setValue(this.overlapping).onChange(v => this.overlapping = v));
    }
  }

  // ------------------------------------------------------------
  // MODE B — STACK BUILDER
  // ------------------------------------------------------------
  private handleStackSelect(item: SuggestItem, stackContainer: HTMLElement, text: HTMLInputElement) {
    this.stack.push({ id: item.id, label: item.label });
    this.renderStack(stackContainer);
    text.value = "";
  }

  private renderStack(container: HTMLElement) {
    container.empty();
    container.createEl("h4", { text: "Stack Items" });

    this.stack.forEach((s, i) => {
      const row = container.createDiv({ cls: "stack-row" });
      row.createSpan({ text: `${i + 1}. ${s.label}` });

      const removeBtn = row.createEl("button", { text: "×" });
      removeBtn.onclick = () => {
        this.stack.splice(i, 1);
        this.renderStack(container);
      };
    });
  }

  // ------------------------------------------------------------
  // INSERT HANDLER
  // ------------------------------------------------------------
  private handleInsert(detailsContainer: HTMLElement) {
    if (this.mode === "soundscape") {
      if (this.stack.length === 0) {
        new Notice("Add at least one sound to the soundscape.");
        return;
      } else if (this.selectedLabel.trim() === "") {
        new Notice("Please enter a name for the soundscape.");
        return;
      }

      this.close();
      this.onSubmit({ stack: this.stack, title: this.selectedLabel, type: "soundscape" });
      return;
    }

    if (!this.selectedId) {
      new Notice("Please select an item first");
      return;
    }

    this.close();
    this.onSubmit({
      title: this.selectedLabel,
      trackId: this.selectedId,
      type: this.selectedType,
      random: this.random,
      overlapping: this.overlapping,
      shuffle: this.shuffle,
      repeat: this.repeat,
      playOnce: this.playOnce,
      volume: this.volume,
      overrideSettings: this.overrideSettings,
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}