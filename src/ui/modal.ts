import { App, Modal, Setting, Notice, setIcon } from "obsidian";
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
  private trackTitle = "";
  private label = "";

  private repeat: RepeatMode = "off";
  private shuffle = false;
  private overlapping = false;
  private playOnce = false;
  private random = false;
  private volume = 1;
  private overrideSettings = false;
  private previewing = false;

  private stack: { id: string; label: string }[] = [];

  constructor(
    app: App,
    plugin: ObsidianFMPlugin,
    onSubmit: (result: InsertResult) => void,
    mode: InsertMode = "normal",
    initialConfig?: Record<string, string>
  ) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
    this.mode = mode;

    if (initialConfig) {
      this.applyInitialConfig(initialConfig);
    }
  }

  private applyInitialConfig(config: Record<string, string>) {
    this.selectedId = config.id ?? null;
    this.selectedType = config.type as any ?? null;
    this.trackTitle = config.trackTitle ?? "";
    this.label = config.title ?? "";

    // Playback settings
    if (config.repeat) this.repeat = config.repeat as RepeatMode;
    if (config.shuffle) this.shuffle = config.shuffle === "true";
    if (config.playOnce) this.playOnce = config.playOnce === "true";
    if (config.volume) this.volume = Number(config.volume);
    if (config.overrideSettings) this.overrideSettings = config.overrideSettings === "true";

    // Soundboard
    if (config.random) this.random = config.random === "true";
    if (config.overlapping) this.overlapping = config.overlapping === "true";

    // Soundscape stack
    if (config.stack) {
      this.stack = config.stack.split(",").map(id => {
        const sound = this.plugin.sounds.find(s => s.id === id);
        return { id, label: sound?.title ?? id };
      });
    }
  }

  onOpen() {
    const { contentEl } = this;

    /* ------------------------------------------------------------
       TITLE
    ------------------------------------------------------------ */
    contentEl.createEl("h2", {
      text: this.mode === "normal"
        ? (this.selectedId ? "Edit ObsidianFM Player" : "Insert ObsidianFM Player")
        : (this.stack.length > 0 ? "Edit ObsidianFM Soundscape" : "Create ObsidianFM Soundscape")
    });

    /* ------------------------------------------------------------
       CREATE SECTIONS (do NOT append yet)
    ------------------------------------------------------------ */

    // NAME FIELD
    const nameSection = createDiv({ cls: "obsidianfm-section" });
    new Setting(nameSection)
      .setName(this.mode === "normal" ? "Name (optional)" : "Name (required)")
      .addText(text => {
        text.setPlaceholder(
          this.mode === "normal"
            ? "Enter player name…"
            : "Enter soundscape name…"
        );
        text.setValue(this.label); // PREFILL
        text.onChange(v => this.label = v);
      });

    // SEARCH FIELD
    const searchSection = createDiv({ cls: "obsidianfm-section" });
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
      cls: "obsidianfm-search-input",
    });
    if (this.selectedId && this.trackTitle) {
      searchInput.value = this.trackTitle;
    }


    // DETAILS OR STACK SECTION
    const detailsSection = createDiv({
      cls: "obsidianfm-section obsidianfm-dynamic-section"
    });

    const stackSection = createDiv({
      cls: "obsidianfm-section obsidianfm-dynamic-section"
    });

    detailsSection.style.display = this.mode === "normal" ? "block" : "none";
    stackSection.style.display = this.mode === "soundscape" ? "block" : "none";

    /* ------------------------------------------------------------
       PREFILL: If editing a soundscape, render stack immediately
    ------------------------------------------------------------ */
    if (this.mode === "soundscape") {
      stackSection.createEl("h3", { text: "Soundscape Stack" });
      this.renderStack(stackSection);
    }

    /* ------------------------------------------------------------
       AUTOCOMPLETE
    ------------------------------------------------------------ */
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

    /* ------------------------------------------------------------
       PREFILL: If editing a normal player, render its properties
    ------------------------------------------------------------ */
    if (this.mode === "normal" && this.selectedId && this.selectedType) {
      const item: SuggestItem = {
        id: this.selectedId,
        label: this.trackTitle,
        type: this.selectedType,
        icon: this.plugin.typeIconMap[this.selectedType],
        subtitle: ""
      };
      this.renderProperties(detailsSection, item);
    }

    /* ------------------------------------------------------------
       PREVIEW (soundscape only)
    ------------------------------------------------------------ */
    let previewSection: HTMLElement | null = null;

    if (this.mode === "soundscape") {
      previewSection = createDiv({ cls: "obsidianfm-section" });
      previewSection.createEl("h3", { text: "Preview" });

      new Setting(previewSection)
        .setName("Preview Soundscape")
        .setDesc("Play all sounds in the stack to hear how they blend.")
        .addButton(btn => {
          const updateIcon = () => {
            btn.setIcon(this.previewing ? "square" : "play");
            btn.setTooltip(this.previewing ? "Stop Preview" : "Play Preview");
          };

          updateIcon();

          btn.onClick(async () => {
            const ctrl = this.plugin.playbackController;

            if (!this.previewing) {
              for (const s of this.stack) {
                await ctrl.enterPreviewMode(s.id, "sound", { additive: true });
              }
              this.previewing = true;
              updateIcon();
            } else {
              await ctrl.exitPreviewMode();
              this.previewing = false;
              updateIcon();
            }
          });
        });
    }

    /* ------------------------------------------------------------
       APPEND SECTIONS IN DIFFERENT ORDERS
    ------------------------------------------------------------ */

    if (this.mode === "normal") {
      contentEl.appendChild(searchSection);
      contentEl.appendChild(nameSection);
      contentEl.appendChild(detailsSection);
    } else {
      contentEl.appendChild(nameSection);
      contentEl.appendChild(searchSection);
      contentEl.appendChild(stackSection);
      if (previewSection) contentEl.appendChild(previewSection);
    }

    /* ------------------------------------------------------------
       INSERT / SAVE BUTTON
    ------------------------------------------------------------ */
    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText(this.selectedId ? "Save" : "Insert")
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
    this.trackTitle = item.label;

    this.renderProperties(detailsContainer, item);
  }

  private renderProperties(container: HTMLElement, item: SuggestItem) {
    container.empty();

    /* ------------------------------------------------------------
       TRACK / PLAYLIST SETTINGS
    ------------------------------------------------------------ */
    if (item.type === "track" || item.type === "playlist") {



      // Always-active override toggle (OUTSIDE disabled block)
      new Setting(container)
        .setName("Override Playback Settings")
        .setDesc("Enable custom playback settings for this item.")
        .addToggle(t =>
          t.setValue(this.overrideSettings).onChange(v => {
            this.overrideSettings = v;
            innerBlock.classList.toggle("obsidianfm-disabled", !v);
          })
        );

      // Inner block that gets disabled visually
      const innerBlock = container.createDiv({
        cls: "obsidianfm-override-inner"
      });

      // Repeat
      new Setting(innerBlock)
        .setName("Repeat")
        .setDesc("For playlists: 'playlist' repeats the whole list, 'track' repeats the current track.")
        .addDropdown(drop => {
          drop.addOption("off", "Off");
          drop.addOption("playlist", "Playlist");
          drop.addOption("track", "Track");
          drop.setValue(this.repeat);
          drop.onChange(v => this.repeat = v as RepeatMode);
        });

      // Shuffle
      new Setting(innerBlock)
        .setName("Shuffle")
        .setDesc("Shuffle playback order.")
        .addToggle(t => t.setValue(this.shuffle).onChange(v => this.shuffle = v));

      // Play Once (track only) need to implement
      // if (item.type === "track") {
      //   new Setting(innerBlock)
      //     .setName("Play Once")
      //     .setDesc("Play the track once, then stop.")
      //     .addToggle(t => t.setValue(this.playOnce).onChange(v => this.playOnce = v));
      // }

      // Volume
      new Setting(innerBlock)
        .setName("Volume")
        .addSlider(s =>
          s.setLimits(0, 1, 0.01)
            .setValue(this.volume)
            .onChange(v => this.volume = v)
        );

      // Apply disabled state on load
      innerBlock.classList.toggle("obsidianfm-disabled", !this.overrideSettings);
    }

    /* ------------------------------------------------------------
       SOUNDBOARD SETTINGS
    ------------------------------------------------------------ */
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
    // Prevent duplicates
    if (this.stack.some(s => s.id === item.id)) {
      new Notice("This sound is already in the stack.");
      text.value = "";
      return;
    }

    this.stack.push({ id: item.id, label: item.label });
    this.renderStack(stackContainer);
    text.value = "";
  }

  private renderStack(container: HTMLElement) {
    container.empty();
    container.createEl("h4", { text: "Stack Items" });

    this.stack.forEach((s, i) => {
      const row = container.createDiv({ cls: "stack-row" });

      const label = row.createDiv({ cls: "stack-label" });
      label.setText(`${i + 1}. ${s.label}`);

      const removeBtn = row.createEl("button", {
        cls: "stack-remove-btn",
      });
      setIcon(removeBtn, "trash");

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
      } else if (this.label.trim() === "") {
        new Notice("Please enter a name for the soundscape.");
        return;
      }

      this.close();
      this.onSubmit({ stack: this.stack, title: this.label, type: "soundscape" });
      return;
    }

    if (!this.selectedId) {
      new Notice("Please select an item first");
      return;
    }

    this.close();
    this.onSubmit({
      title: this.label ? this.label : this.trackTitle,
      trackTitle: this.trackTitle,
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

  onClose = async () => {
    const ctrl = this.plugin.playbackController;

    if (this.previewing) {
      await ctrl.exitPreviewMode();
      this.previewing = false;
    }

    this.contentEl.empty();
  };
}