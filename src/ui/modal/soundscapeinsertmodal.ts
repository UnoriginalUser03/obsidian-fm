// ui/SoundscapeInsertModal.ts
import { Setting, Notice, App } from "obsidian";
import type { SuggestItem, InsertResult, SoundscapeItem, MediaType } from "src/api/types";
import { BaseInsertModal } from "./baseinsertmodal";
import { SoundscapeStackView } from "./soundscapestackview";
import ObsidianFMPlugin from "src/main";
import { Helpers } from "src/helpers/helpers";

export class SoundscapeInsertModal extends BaseInsertModal {
    private soundscape: SoundscapeItem[] = [];
    private selectedStackIndex: number | null = null;
    private expandedGroups = new Set<number>();

    private soundscapeView: SoundscapeStackView | null = null;

    private soundMap = new Map<string, string>();

    constructor(
        app: App,
        plugin: ObsidianFMPlugin,
        onSubmit: (result: InsertResult) => void,
        onDelete?: () => void,
        initialConfig?: Record<string, string>
    ) {
        super(app, plugin, onSubmit, onDelete);

        this.isEditing = !!initialConfig;

        for (const s of plugin.sounds) {
            this.soundMap.set(s.id, s.title);
        }

        if (initialConfig?.soundscape) {
            this.soundscape = Helpers.parseSoundscapeInline(plugin, initialConfig.soundscape);
        }

        if (initialConfig?.title) {
            this.title = initialConfig.title;
        }

        this.buttonId = initialConfig?.id ?? crypto.randomUUID();
    }

    protected getTitle(): string {
        return this.soundscape.length > 0
            ? "Edit ObsidianFM Soundscape"
            : "Create ObsidianFM Soundscape";
    }

    protected onSearchReady(inputEl: HTMLInputElement) {
        this.updateSearchPlaceholder(inputEl);
    }

    private updateSearchPlaceholder(inputEl: HTMLInputElement) {
        const selected =
            this.selectedStackIndex !== null ? this.soundscape[this.selectedStackIndex] : null;

        inputEl.placeholder =
            selected?.type === "flavour-group"
                ? "Search one‑shot SFX…"
                : "Search looping ambience…";
    }

    protected renderBody(container: HTMLElement): void {
        const listContainer = container.createDiv({ cls: "soundscape-stack-container" });

        this.soundscapeView = new SoundscapeStackView(
            listContainer,
            () => this.soundscape,
            index => this.handleSelectStackItem(index),

            () => {
                this.refreshAutocomplete();
                this.updatePreviewVisibility();
            },

            () => {
                this.updatePreviewVisibility();
            },

            this.expandedGroups,
            this.soundMap
        );

        new Setting(container)
            .setName("Add Soundscape Flavour")
            .setDesc("Occasional ambient accents that play at random intervals.")
            .addButton(btn => {
                btn.setButtonText("Add").onClick(() => {
                    this.addRandomGroup();
                    this.soundscapeView?.update();
                    this.refreshAutocomplete();
                    this.updatePreviewVisibility();

                    const input = this.autocomplete?.getInputEl();
                    if (input) this.updateSearchPlaceholder(input);
                });
            });

        this.soundscapeView.update();
        this.updatePreviewVisibility();
    }

    private handleSelectStackItem(index: number | null) {
        this.selectedStackIndex = index;
        this.refreshAutocomplete();

        const input = this.autocomplete?.getInputEl();
        if (input) this.updateSearchPlaceholder(input);
    }

    protected buildAutocompleteItems(): SuggestItem[] {
        const selected =
            this.selectedStackIndex !== null ? this.soundscape[this.selectedStackIndex] : null;

        if (selected?.type === "flavour-group") {
            return this.plugin.sounds
                .filter(s => !s.loop)
                .map(s => ({
                    id: s.id,
                    label: s.title,
                    icon: "audio-lines",
                    subtitle: s.soundboardName,
                    type: "sound" as const
                }));
        }

        return this.plugin.sounds
            .filter(s => s.loop)
            .map(s => ({
                id: s.id,
                label: s.title,
                icon: "audio-lines",
                subtitle: s.soundboardName,
                type: "sound" as const
            }));
    }

    private closeAutocomplete() {
        this.autocomplete?.clear();
        this.autocomplete?.close();

        const input = this.autocomplete?.getInputEl();
        if (input) this.updateSearchPlaceholder(input);
    }

    protected handleAutocompleteSelect(item: SuggestItem): void {
        const idx = this.selectedStackIndex;

        if (idx !== null) {
            const entry = this.soundscape[idx];

            if (entry.type === "flavour-group") {
                // Now TypeScript knows entry is the flavour-group branch
                if (entry.ids.includes(item.id)) {
                    new Notice("This sound is already in the group.");
                    this.closeAutocomplete();
                    return;
                }

                entry.ids.push(item.id);
                this.soundscapeView?.update();
                this.updatePreviewVisibility();
                this.closeAutocomplete();
                return;
            }
        }

        if (this.soundscape.some(s => s.type === "loop" && s.id === item.id)) {
            new Notice("This sound is already in the stack.");
            this.closeAutocomplete();
            return;
        }

        this.soundscape.push({
            type: "loop",
            id: item.id,
            label: item.label
        });

        this.soundscapeView?.update();
        this.updatePreviewVisibility();
        this.closeAutocomplete();
    }

    protected handleInsert(): void {
        if (this.soundscape.length === 0) {
            new Notice("Add at least one sound to the soundscape.");
            return;
        }

        if (this.title.trim() === "") {
            new Notice("Please enter a name for the soundscape.");
            return;
        }

        for (const item of this.soundscape) {
            if (item.type === "flavour-group" && item.ids.length === 0) {
                new Notice("Each flavour group must contain at least one sound.");
                return;
            }
        }

        this.close();
        this.onSubmit({
            soundscape: this.soundscape,
            title: this.title,
            id: this.buttonId,
            type: "soundscape"
        });
    }

    private addRandomGroup() {
        this.soundscape.push({
            type: "flavour-group",
            label: "Flavour Group",
            ids: [],
            min: 20,
            max: 60
        });

        this.selectedStackIndex = this.soundscape.length - 1;
    }

    protected onModalClose(): void {
        this.soundscapeView?.destroy();
        this.soundscapeView = null;
    }

    protected updatePreviewVisibility(): void {
        if (!this.previewSection) return;

        const shouldShow = this.soundscape.length > 0;

        this.previewSection.toggleClass("hidden", !shouldShow);
    }


    protected async startPreview(): Promise<void> {
        await this.plugin.playbackController.previewSoundscape(this.soundscape);
    }
}