// ui/InlinePlayerInsertModal.ts
import { App, Notice, Setting } from "obsidian";
import type { SuggestItem, InsertResult, RepeatMode, MediaType } from "src/api/types";
import ObsidianFMPlugin from "src/main";
import { BaseInsertModal } from "./baseinsertmodal";

export class InlinePlayerInsertModal extends BaseInsertModal {
    private selectedId: string | null = null;
    private selectedType: string | null = null;
    private trackTitle = "";

    private repeat: RepeatMode = "off";
    private shuffle = false;
    private overlapping = false;
    private random = false;
    private volume = 1;
    private overrideSettings = false;

    constructor(
        app: App,
        plugin: ObsidianFMPlugin,
        onSubmit: (result: InsertResult) => void,
        onDelete?: () => void,
        initialConfig?: Record<string, string>
    ) {
        super(app, plugin, onSubmit, onDelete);

        this.isEditing = !!initialConfig;

        if (initialConfig) {
            this.applyInitialConfig(initialConfig);
        }
    }

    private applyInitialConfig(config: Record<string, string>) {
        this.selectedId = config.id ?? null;
        this.selectedType = config.type ?? null;
        this.trackTitle = config.trackTitle ?? "";
        this.label = config.title ?? "";

        if (config.repeat) this.repeat = config.repeat as RepeatMode;
        if (config.shuffle) this.shuffle = config.shuffle === "true";
        if (config.volume) this.volume = Number(config.volume);
        if (config.overrideSettings) this.overrideSettings = config.overrideSettings === "true";

        if (config.random) this.random = config.random === "true";
        if (config.overlapping) this.overlapping = config.overlapping === "true";
    }

    protected getTitle(): string {
        return this.selectedId ? "Edit ObsidianFM Player" : "Insert ObsidianFM Player";
    }

    // ------------------------------------------------------------
    // SEARCH FIELD INITIALIZATION
    // ------------------------------------------------------------
    protected onSearchReady(inputEl: HTMLInputElement) {
        if (this.trackTitle) {
            inputEl.value = this.trackTitle;
        }
    }

    // ------------------------------------------------------------
    // BODY RENDERING
    // ------------------------------------------------------------
    protected renderBody(container: HTMLElement): void {
        // Editing an existing item
        if (this.selectedId && this.selectedType) {
            const item: SuggestItem = {
                id: this.selectedId,
                label: this.trackTitle,
                type: this.selectedType as any,
                icon: this.plugin.typeIconMap[this.selectedType as any],
                subtitle: ""
            };

            this.renderProperties(container, item);
            return;
        }

        // No selection → hide body
        container.empty();
        this.updateBodyVisibility(false);
    }
    private renderProperties(container: HTMLElement, item: SuggestItem) {
        container.empty();

        // SOUND → hide body entirely
        if (item.type === "sound") {
            this.updateBodyVisibility(false);
            return;
        }

        // TRACK / PLAYLIST
        if (item.type === "track" || item.type === "playlist") {
            this.updateBodyVisibility(true);

            new Setting(container)
                .setName("Override Playback Settings")
                .setDesc("Enable custom playback settings for this item.")
                .addToggle(t =>
                    t.setValue(this.overrideSettings).onChange(v => {
                        this.overrideSettings = v;
                        innerBlock.classList.toggle("obsidianfm-disabled", !v);
                    })
                );

            const innerBlock = container.createDiv({ cls: "obsidianfm-override-inner" });

            new Setting(innerBlock)
                .setName("Repeat")
                .addDropdown(drop => {
                    drop.addOption("off", "Off");
                    drop.addOption("playlist", "Playlist");
                    drop.addOption("track", "Track");
                    drop.setValue(this.repeat);
                    drop.onChange(v => (this.repeat = v as RepeatMode));
                });

            new Setting(innerBlock)
                .setName("Shuffle")
                .addToggle(t => t.setValue(this.shuffle).onChange(v => (this.shuffle = v)));

            new Setting(innerBlock)
                .setName("Volume")
                .addSlider(s =>
                    s.setLimits(0, 1, 0.01)
                        .setValue(this.volume)
                        .onChange(v => (this.volume = v))
                );

            innerBlock.classList.toggle("obsidianfm-disabled", !this.overrideSettings);
            return;
        }

        // SOUNDBOARD
        if (item.type === "soundboard") {
            this.updateBodyVisibility(true);

            container.createEl("h4", { text: "Soundboard Options" });

            new Setting(container)
                .setName("Play Random")
                .addToggle(t => t.setValue(this.random).onChange(v => (this.random = v)));

            new Setting(container)
                .setName("Allow Overlapping")
                .setDesc("Allow multiple sounds from the soundboard to play at the same time.")
                .addToggle(t => t.setValue(this.overlapping).onChange(v => (this.overlapping = v)));

            return;
        }
    }

    // ------------------------------------------------------------
    // AUTOCOMPLETE
    // ------------------------------------------------------------
    protected buildAutocompleteItems(): SuggestItem[] {
        return [
            ...this.plugin.music.map(t => ({
                id: t.id,
                label: t.title,
                icon: "music",
                subtitle: t.playlistName,
                type: "track" as const
            })),
            ...this.plugin.sounds.map(s => ({
                id: s.id,
                label: s.title,
                icon: "audio-lines",
                subtitle: s.soundboardName,
                type: "sound" as const
            })),
            ...this.plugin.playlists.map(p => ({
                id: p.id,
                label: p.title,
                icon: "list-music",
                subtitle: "Playlist",
                type: "playlist" as const
            })),
            ...this.plugin.soundboards.map(sb => ({
                id: sb.id,
                label: sb.title,
                icon: "square-play",
                subtitle: "Soundboard",
                type: "soundboard" as const
            })),
        ];
    }

    protected handleAutocompleteSelect(item: SuggestItem): void {
        this.selectedId = item.id;
        this.selectedType = item.type;
        this.trackTitle = item.label;

        if (this.bodySection) {
            this.renderProperties(this.bodySection, item);
        }

        // NEW: update preview button visibility
        this.updatePreviewVisibility();
    }

    // ------------------------------------------------------------
    // PREVIEW SUPPORT
    // ------------------------------------------------------------
    protected getPreviewItems(): { id: string; type: MediaType }[] {
        if (!this.selectedId || !this.selectedType) return [];
        return [{ id: this.selectedId, type: this.selectedType as MediaType }];
    }

    // ------------------------------------------------------------
    // INSERT HANDLER
    // ------------------------------------------------------------
    protected handleInsert(): void {
        if (!this.selectedId || !this.selectedType) {
            new Notice("Please select an item first.");
            return;
        }

        this.close();

        const result: InsertResult = {
            title: this.label || this.trackTitle,
            trackTitle: this.trackTitle,
            trackId: this.selectedId,
            type: this.selectedType as any,
            random: this.random,
            overlapping: this.overlapping,
            shuffle: this.shuffle,
            repeat: this.repeat,
            volume: this.volume,
            overrideSettings: this.overrideSettings,
        };

        this.onSubmit(result);
    }

    protected onModalClose(): void { }
}