import { setIcon } from "obsidian";
import type { FilteredEntry } from "src/api/types";
import ObsidianFMPlugin from "src/main";
import { Autocomplete } from "./autocomplete";

export class AutocompleteItem {
    private parent: Autocomplete;
    private plugin: ObsidianFMPlugin;
    private entry: FilteredEntry;
    private index: number;

    private el: HTMLElement | null = null;

    constructor(
        parent: Autocomplete,
        plugin: ObsidianFMPlugin,
        entry: FilteredEntry,
        index: number
    ) {
        this.parent = parent;
        this.plugin = plugin;
        this.entry = entry;
        this.index = index;

        // Listen for global preview-stop events
        this.plugin.playbackController.onPreviewUpdate(() => {
            this.updatePreviewIcon();
        });
    }

    renderInto(container: HTMLElement) {
        const { item, matches } = this.entry;

        this.el = container.createDiv({ cls: "obsidianfm-suggest-row" });

        const top = this.el.createDiv({ cls: "obsidianfm-suggest-top" });

        if (item.icon) {
            const iconEl = top.createDiv({ cls: "obsidianfm-suggest-icon" });
            setIcon(iconEl, item.icon);
        }

        const labelEl = top.createSpan({ cls: "obsidianfm-suggest-label" });
        labelEl.append(this.parent.highlight(item.label, matches));

        if (item.subtitle) {
            this.el.createDiv({
                text: item.subtitle,
                cls: "obsidianfm-suggest-subtitle",
            });
        }

        // Preview button
        const previewBtn = top.createDiv({
            cls: "obsidianfm-suggest-preview",
        });

        previewBtn.addEventListener("mousedown", async (evt) => {
            evt.preventDefault();
            evt.stopImmediatePropagation();
            await this.togglePreview();
        });

        // Hover selection
        this.el.addEventListener("mouseenter", () => {
            this.parent.setSelectedIndex(this.index);
        });

        // Row click
        this.el.addEventListener("mousedown", async (evt) => {
            evt.preventDefault();
            await this.parent.choose(this.entry.item);
        });

        this.updateSelectionState();
        this.updatePreviewIcon();
    }

    updateSelectionState() {
        if (!this.el) return;

        if (this.parent.selectedIndex === this.index) {
            this.el.addClass("is-selected");
            this.el.scrollIntoView({ block: "nearest" });
        } else {
            this.el.removeClass("is-selected");
        }
    }

    updatePreviewIcon() {
        if (!this.el) return;

        const btn = this.el.querySelector(
            ".obsidianfm-suggest-preview"
        ) as HTMLElement | null;
        if (!btn) return;

        const playback = this.plugin.playback;
        const isPreviewing =
            playback.previewing &&
            playback.previewItems.some(p => p.id === this.entry.item.id);

        setIcon(btn, isPreviewing ? "square" : "play");
    }

    private async togglePreview() {
        const ctrl = this.plugin.playbackController;
        const { id, type } = this.entry.item;
        const playback = this.plugin.playback;

        const isCurrentlyPreviewing =
            playback.previewing &&
            playback.previewItems.some(p => p.id === id);

        // Stop current preview
        if (isCurrentlyPreviewing) {
            ctrl.suppressRestore = false;
            await ctrl.exitPreviewMode();
            return;
        }

        // Switching previews
        if (playback.previewing) {
            ctrl.suppressRestore = true;
            await ctrl.stopPreviewAudioOnly();
        }

        // Start new preview
        ctrl.suppressRestore = false;
        await ctrl.enterPreviewMode(id, type);
    }
}