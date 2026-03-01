// ui/InlinePlayerInsertModal.ts
import { App, Notice, setIcon, Setting } from "obsidian";
import type { SuggestItem, InsertResult, RepeatMode, MediaType } from "src/api/types";
import ObsidianFMPlugin from "src/main";
import { BaseInsertModal } from "./baseinsertmodal";

export class InlinePlayerInsertModal extends BaseInsertModal {
    private selectedId: string | null = null;
    private selectedType: MediaType | null = null;
    private trackTitle = "";

    private repeat: RepeatMode = "off";
    private shuffle = false;
    private overlapping = false;
    private random = false;
    private volume = 1;
    private overrideSettings = false;
    private searchInputEl: HTMLInputElement | null = null;

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
        this.selectedType = config.type as MediaType ?? null;
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
    // BODY RENDERING
    // ------------------------------------------------------------
    protected renderBody(container: HTMLElement): void {
        container.empty();

        const isInvalid = this.isEditing && !this.isInitialSelectionValid();
        if (isInvalid && this.searchInputEl) {
            const parent = this.searchInputEl.parentElement; // Setting.controlEl
            if (parent) {
                const icon = createSpan({ cls: "inline-error-icon-search" });
                setIcon(icon, "alert-triangle");
                icon.setAttribute("data-tooltip-position", "top");
                icon.setAttr("aria-label", "This item no longer exists");

                parent.insertBefore(icon, this.searchInputEl);
            }

            this.searchInputEl.classList.add("inline-error-input");
        }

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

    protected onSearchReady(inputEl: HTMLInputElement) {
        this.searchInputEl = inputEl;

        if (this.trackTitle) {
            inputEl.value = this.trackTitle;
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

        // Update tooltip but keep the icon visible
        const parent = this.searchInputEl?.parentElement;
        const icon = parent?.querySelector(".inline-error-icon-search") as HTMLElement | null;
        if (icon) {
            icon.setAttr("aria-label", "This will be fixed after saving.");
            icon.style.opacity = "0.7"; // correct way to dim it
        }

        this.updatePreviewVisibility();
    }

    private isInitialSelectionValid(): boolean {
        if (!this.selectedId || !this.selectedType) return true;

        switch (this.selectedType) {
            case "track":
                return this.plugin.music.some(t => t.id === this.selectedId);
            case "sound":
                return this.plugin.sounds.some(s => s.id === this.selectedId);
            case "playlist":
                return this.plugin.playlists.some(p => p.id === this.selectedId);
            case "soundboard":
                return this.plugin.soundboards.some(sb => sb.id === this.selectedId);
            default:
                return false;
        }
    }

    protected getPreviewOverrides() {
        if (!this.overrideSettings) return undefined;
        if (this.selectedType !== "track" && this.selectedType !== "playlist") {
            return undefined;
        }

        return {
            shuffle: this.shuffle,
            repeat: this.repeat,
            volume: this.volume,
            muted: false, // or your modal’s muted state
        };
    }

    protected async startPreview(): Promise<void> {
        const ctrl = this.plugin.playbackController;
        if (!this.selectedId || !this.selectedType) {
            new Notice("Nothing to preview.");
            return;
        }
        await ctrl.enterPreviewMode(this.selectedId, this.selectedType, {
            additive: true,
            override: this.getPreviewOverrides()
        });
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

    protected updatePreviewVisibility(): void {
        if (!this.previewSection) return;

        const shouldShow = this.selectedId !== null;

        this.previewSection.toggleClass("hidden", !shouldShow);
    }

    protected onModalClose(): void { }
}