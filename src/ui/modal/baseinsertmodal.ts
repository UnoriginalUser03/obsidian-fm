import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import type { MediaType, SuggestItem } from "src/api/types";
import ObsidianFMPlugin from "src/main";
import { Autocomplete } from "../search/autocomplete";

export abstract class BaseInsertModal extends Modal {
    protected plugin: ObsidianFMPlugin;
    protected onSubmit: (result: any) => void;
    protected onDelete?: () => void;

    protected label = "";
    protected autocomplete: Autocomplete | null = null;

    protected isEditing: boolean = false;

    protected bodySection: HTMLElement | null = null;
    private previewSection: HTMLElement | null = null;
    private previewButton: HTMLButtonElement | null = null;

    constructor(
        app: App,
        plugin: ObsidianFMPlugin,
        onSubmit: (result: any) => void,
        onDelete?: () => void
    ) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.onDelete = onDelete;

        // Sync preview button with global preview state
        this.plugin.playbackController.onPreviewUpdate(() => {
            this.updatePreviewIcon();
        });
    }

    // ------------------------------------------------------------
    // ABSTRACT METHODS
    // ------------------------------------------------------------
    protected abstract renderBody(container: HTMLElement): void;
    protected abstract buildAutocompleteItems(): SuggestItem[];
    protected abstract handleAutocompleteSelect(item: SuggestItem): void;
    protected abstract handleInsert(): void;
    protected abstract onModalClose(): void;

    protected getPreviewItems(): { id: string; type: MediaType }[] {
        return [];
    }

    protected onSearchReady?(inputEl: HTMLInputElement): void;

    // ------------------------------------------------------------
    // LIFECYCLE
    // ------------------------------------------------------------
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // TITLE
        contentEl.createEl("h2", { text: this.getTitle() });

        // NAME FIELD
        const nameSection = contentEl.createDiv({ cls: "obsidianfm-section" });
        new Setting(nameSection)
            .setName("Name")
            .addText(t => {
                t.setValue(this.label);
                t.onChange(v => (this.label = v));
            });

        // SEARCH FIELD
        const searchSection = contentEl.createDiv({ cls: "obsidianfm-section" });
        const searchSetting = new Setting(searchSection)
            .setName("Search")
            .setDesc("Search for items to add or edit.");

        const searchInput = searchSetting.controlEl.createEl("input", {
            type: "text",
            placeholder: "Search…",
            cls: "obsidianfm-search-input",
        });

        this.onSearchReady?.(searchInput);

        this.autocomplete = new Autocomplete(
            this.app,
            this.plugin,
            searchInput,
            this.buildAutocompleteItems(),
            (item) => this.handleAutocompleteSelect(item)
        );

        // BODY
        this.bodySection = contentEl.createDiv({ cls: "obsidianfm-section" });
        this.renderBody(this.bodySection);

        // PREVIEW SECTION
        this.previewSection = contentEl.createDiv({
            cls: "obsidianfm-section preview-section",
        });

        const previewSetting = new Setting(this.previewSection)
            .setName("Preview")
            .addButton(btn => {
                this.previewButton = btn.buttonEl;
                btn.setCta();

                // Initial icon
                this.updatePreviewIcon();

                btn.onClick(async () => {
                    const items = this.getPreviewItems();
                    if (items.length === 0) {
                        new Notice("Nothing to preview.");
                        return;
                    }

                    const ctrl = this.plugin.playbackController;
                    const isPreviewing = this.plugin.playback.previewing;

                    if (!isPreviewing) {
                        // Start preview (additive)
                        for (const p of items) {
                            await ctrl.enterPreviewMode(p.id, p.type, { additive: true });
                        }
                    } else {
                        // Stop preview
                        await ctrl.exitPreviewMode();
                    }

                    this.updatePreviewIcon();
                });
            });

        this.updatePreviewVisibility();

        // SAVE / DELETE
        const row = new Setting(contentEl);

        if (this.isEditing && this.onDelete) {
            row.addButton(btn => {
                btn.setButtonText("Delete")
                    .setWarning()
                    .onClick(() => {
                        this.close();
                        this.onDelete?.();
                    });
            });
        }

        row.addButton(btn => {
            btn.setButtonText(this.isEditing ? "Save" : "Insert")
                .setCta()
                .onClick(() => this.handleInsert());
        });
    }

    onClose = async () => {
        // Stop preview if modal closes
        if (this.plugin.playback.previewing) {
            await this.plugin.playbackController.exitPreviewMode();
        }

        this.autocomplete?.destroy();
        this.autocomplete = null;

        this.onModalClose();
        this.contentEl.empty();
    };

    // ------------------------------------------------------------
    // PREVIEW ICON SYNC
    // ------------------------------------------------------------
    private updatePreviewIcon() {
        if (!this.previewButton) return;

        const isPreviewing = this.plugin.playback.previewing;

        const icon = isPreviewing ? "square" : "play";
        const tooltip = isPreviewing ? "Stop Preview" : "Play Preview";

        // Obsidian native icon setter
        setIcon(this.previewButton, icon);

        this.previewButton.setAttribute("aria-label", tooltip);
        this.previewButton.setAttribute("data-tooltip", tooltip);
    }

    // ------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------
    protected getTitle(): string {
        return "Edit Item";
    }

    protected updateBodyVisibility(visible: boolean) {
        if (this.bodySection) {
            this.bodySection.toggleClass("hidden", !visible);
        }
    }

    protected refreshAutocomplete() {
        this.autocomplete?.setItems(this.buildAutocompleteItems());
    }

    protected updatePreviewVisibility() {
        if (!this.previewSection) return;

        const items = this.getPreviewItems();
        const shouldShow = items.length > 0;

        this.previewSection.toggleClass("hidden", !shouldShow);
    }
}