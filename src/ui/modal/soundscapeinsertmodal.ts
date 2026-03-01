// ui/SoundscapeInsertModal.ts
import { Setting, Notice, App } from "obsidian";
import type { SuggestItem, InsertResult, SoundscapeItem, MediaType } from "src/api/types";
import { BaseInsertModal } from "./baseinsertmodal";
import { SoundscapeStackView } from "./soundscapestackview";
import ObsidianFMPlugin from "src/main";

export class SoundscapeInsertModal extends BaseInsertModal {
    private stack: SoundscapeItem[] = [];
    private selectedStackIndex: number | null = null;
    private expandedGroups = new Set<number>();

    private stackView: SoundscapeStackView | null = null;

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

        if (initialConfig?.stack) {
            this.stack = this.parseStackInline(initialConfig.stack);
        }

        if (initialConfig?.title) {
            this.label = initialConfig.title;
        }
    }

    protected getTitle(): string {
        return this.stack.length > 0
            ? "Edit ObsidianFM Soundscape"
            : "Create ObsidianFM Soundscape";
    }

    protected onSearchReady(inputEl: HTMLInputElement) {
        this.updateSearchPlaceholder(inputEl);
    }

    private updateSearchPlaceholder(inputEl: HTMLInputElement) {
        const selected =
            this.selectedStackIndex !== null ? this.stack[this.selectedStackIndex] : null;

        inputEl.placeholder =
            selected?.type === "random-group"
                ? "Search one‑shot SFX…"
                : "Search looping ambience…";
    }

    protected renderBody(container: HTMLElement): void {
        const listContainer = container.createDiv({ cls: "soundscape-stack-container" });

        this.stackView = new SoundscapeStackView(
            listContainer,
            () => this.stack,
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
                    this.stackView?.update();
                    this.refreshAutocomplete();
                    this.updatePreviewVisibility();

                    const input = this.autocomplete?.getInputEl();
                    if (input) this.updateSearchPlaceholder(input);
                });
            });

        this.stackView.update();
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
            this.selectedStackIndex !== null ? this.stack[this.selectedStackIndex] : null;

        if (selected?.type === "random-group") {
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

        if (idx !== null && this.stack[idx].type === "random-group") {
            const group = this.stack[idx];

            if (group.ids.includes(item.id)) {
                new Notice("This sound is already in the group.");
                this.closeAutocomplete();
                return;
            }

            group.ids.push(item.id);
            this.stackView?.update();
            this.updatePreviewVisibility();
            this.closeAutocomplete();
            return;
        }

        if (this.stack.some(s => s.type === "loop" && s.id === item.id)) {
            new Notice("This sound is already in the stack.");
            this.closeAutocomplete();
            return;
        }

        this.stack.push({
            type: "loop",
            id: item.id,
            label: item.label
        });

        this.stackView?.update();
        this.updatePreviewVisibility();
        this.closeAutocomplete();
    }

    protected getPreviewItems() {
        const items: { id: string; type: MediaType }[] = [];

        for (const item of this.stack) {
            if (item.type === "loop") {
                items.push({ id: item.id, type: "sound" });
            }

            if (item.type === "random-group" && item.ids.length > 0) {
                const id = item.ids[Math.floor(Math.random() * item.ids.length)];
                items.push({ id, type: "sound" });
            }
        }

        return items;
    }

    protected handleInsert(): void {
        if (this.stack.length === 0) {
            new Notice("Add at least one sound to the soundscape.");
            return;
        }

        if (this.label.trim() === "") {
            new Notice("Please enter a name for the soundscape.");
            return;
        }

        this.close();
        this.onSubmit({
            stack: this.stack,
            title: this.label,
            type: "soundscape"
        });
    }

    private addRandomGroup() {
        this.stack.push({
            type: "random-group",
            label: "Flavour Group",
            ids: [],
            min: 20,
            max: 60
        });

        this.selectedStackIndex = this.stack.length - 1;
    }

    private parseStackInline(raw: string): SoundscapeItem[] {
        const parts = raw.split(",").map(s => s.trim());
        const items: SoundscapeItem[] = [];

        // 1 = optional name (may be undefined)
        // 2 = ids
        // 3 = min
        // 4 = max
        const regex = /^random\((?:([^:]+):)?([^)]+)\)\[(\d+)-(\d+)\]$/;

        for (const p of parts) {
            const match = p.match(regex);

            if (match) {
                const name = match[1] ? match[1].trim() : "Flavour Group";
                const ids = match[2].split("|");
                const min = Number(match[3]);
                const max = Number(match[4]);

                items.push({
                    type: "random-group",
                    label: name,
                    ids,
                    min,
                    max
                });

                continue;
            }

            items.push({
                type: "loop",
                id: p,
                label: this.plugin.sounds.find(s => s.id === p)?.title ?? p
            });
        }

        return items;
    }
    protected onModalClose(): void {
        this.stackView?.destroy();
        this.stackView = null;
    }
}