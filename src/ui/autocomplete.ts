import { App, prepareFuzzySearch, SearchMatches, setIcon } from "obsidian";
import { createPopper, Instance as PopperInstance } from "@popperjs/core";
import { FilteredEntry, MediaType, SuggestItem } from "src/api/types";
import ObsidianFMPlugin from "src/main";

export class Autocomplete {
    private app: App;
    private plugin: ObsidianFMPlugin;
    private inputEl: HTMLInputElement;
    private popupEl: HTMLElement;
    private listEl: HTMLElement;
    private items: SuggestItem[];
    private filtered: FilteredEntry[] = [];
    private selectedIndex = 0;
    private onSelect: (item: SuggestItem) => void;
    private popper: PopperInstance | null = null;
    private isOpen = false;

    private currentPreview: string | null = null;

    constructor(
        app: App,
        plugin: ObsidianFMPlugin,
        inputEl: HTMLInputElement,
        items: SuggestItem[],
        onSelect: (item: SuggestItem) => void,
    ) {
        this.app = app;
        this.plugin = plugin;
        this.inputEl = inputEl;
        this.items = items;
        this.onSelect = onSelect;

        this.popupEl = createDiv({ cls: "obsidianfm-suggest-popup" });
        this.listEl = this.popupEl.createDiv({ cls: "obsidianfm-suggest-list" });
        document.body.appendChild(this.popupEl);

        this.registerEvents();
    }

    private registerEvents() {
        this.inputEl.addEventListener("input", () => {
            this.update(this.inputEl.value);
        });

        this.inputEl.addEventListener("keydown", (evt) => {
            if (!this.isOpen) return;

            if (evt.key === "ArrowDown") {
                this.selectedIndex =
                    (this.selectedIndex + 1) % this.filtered.length;
                this.render();
                evt.preventDefault();
            }

            if (evt.key === "ArrowUp") {
                this.selectedIndex =
                    (this.selectedIndex - 1 + this.filtered.length) %
                    this.filtered.length;
                this.render();
                evt.preventDefault();
            }

            if (evt.key === "Enter") {
                const entry = this.filtered[this.selectedIndex];
                if (entry) this.choose(entry.item);
                evt.preventDefault();
            }
        });

        document.addEventListener("mousedown", (evt) => {
            if (
                !this.popupEl.contains(evt.target as Node) &&
                evt.target !== this.inputEl
            ) {
                this.close();
            }
        });

        this.inputEl.addEventListener("blur", () => {
            setTimeout(() => this.close(), 150);
        });
    }

    private update(query: string) {
        if (!query) {
            this.filtered = [];
            this.close();
            return;
        }

        const search = prepareFuzzySearch(query);
        const results: FilteredEntry[] = [];

        for (const item of this.items) {
            const r = search(item.label);
            if (r) {
                results.push({
                    item,
                    score: r.score,
                    matches: r.matches,
                });
            }
        }

        results.sort((a, b) => b.score - a.score);
        this.filtered = results.slice(0, 50);

        if (this.filtered.length === 0) {
            this.close();
            return;
        }

        this.selectedIndex = 0;
        this.render();
        this.open();
    }

    private render() {
        this.listEl.empty();

        this.filtered.forEach((entry, index) => {
            const { item, matches } = entry;

            const row = this.listEl.createDiv({
                cls: "obsidianfm-suggest-row",
            });

            const top = row.createDiv({ cls: "obsidianfm-suggest-top" });

            if (item.icon) {
                const iconEl = top.createDiv({ cls: "obsidianfm-suggest-icon" });
                setIcon(iconEl, item.icon);
            }

            const labelEl = top.createSpan({ cls: "obsidianfm-suggest-label" });
            labelEl.append(this.highlight(item.label, matches));

            const isPreviewing = this.currentPreview === item.id;
            const previewBtn = top.createDiv({
                cls: "obsidianfm-suggest-preview",
            });

            setIcon(previewBtn, isPreviewing ? "square" : "play");

            previewBtn.addEventListener("mousedown", async (evt) => {
                evt.preventDefault();
                evt.stopImmediatePropagation();
                await this.togglePreview(entry);
            });

            if (item.subtitle) {
                row.createDiv({
                    text: item.subtitle,
                    cls: "obsidianfm-suggest-subtitle",
                });
            }

            if (index === this.selectedIndex) {
                row.addClass("is-selected");
                row.scrollIntoView({ block: "nearest" });
            }

            row.addEventListener("mousedown", async (evt) => {
                evt.preventDefault();
                await this.choose(item);
            });

            row.addEventListener("mouseenter", () => {
                const prev = this.listEl.querySelector(".is-selected");
                if (prev) prev.removeClass("is-selected");
                row.addClass("is-selected");
                this.selectedIndex = index;
            });
        });
    }

    private open() {
        if (this.isOpen) {
            this.popper?.update();
            return;
        }

        this.isOpen = true;
        this.popupEl.style.display = "block";

        this.popper = createPopper(this.inputEl, this.popupEl, {
            placement: "bottom-start",
            modifiers: [
                { name: "offset", options: { offset: [0, 6] } },
                { name: "flip", options: { fallbackPlacements: ["top-start"] } },
                { name: "preventOverflow", options: { padding: 8 } },
                {
                    name: "sameWidth",
                    enabled: true,
                    phase: "beforeWrite",
                    requires: ["computeStyles"],
                    fn({ state }) {
                        state.styles.popper.width = `${state.rects.reference.width}px`;
                    },
                },
            ],
        });
    }

    public async close() {
        if (!this.isOpen) return;

        await this.stopPreview();

        this.isOpen = false;
        this.popupEl.style.display = "none";

        if (this.popper) {
            this.popper.destroy();
            this.popper = null;
        }
    }

    private async choose(item: SuggestItem) {
        this.inputEl.value = item.label;
        this.onSelect(item);
        await this.close();
    }
    private async togglePreview(entry: FilteredEntry) {
        const { id, type } = entry.item;
        const ctrl = this.plugin.playbackController;

        // If clicking the same item → stop preview and restore snapshot
        if (this.currentPreview === id) {
            ctrl.suppressRestore = false;
            await ctrl.exitPreviewMode();
            this.currentPreview = null;
            this.render();
            return;
        }

        // Switching from one preview to another → DO NOT restore snapshot
        if (this.currentPreview) {
            ctrl.suppressRestore = true;
            await ctrl.exitPreviewMode();
        }

        // Start new preview
        ctrl.suppressRestore = false;
        this.currentPreview = id;
        await ctrl.enterPreviewMode(id, type);

        this.render();
    }

    private async stopPreview() {
        if (this.currentPreview) {
            const ctrl = this.plugin.playbackController;
            ctrl.suppressRestore = false;
            await ctrl.exitPreviewMode();
        }
        this.currentPreview = null;
    }

    private highlight(label: string, matches: SearchMatches): DocumentFragment {
        const frag = document.createDocumentFragment();
        let lastIndex = 0;

        for (const [start, end] of matches) {
            if (start > lastIndex) {
                frag.append(label.slice(lastIndex, start));
            }

            const span = document.createElement("span");
            span.className = "obsidianfm-suggest-highlight";
            span.textContent = label.slice(start, end);
            frag.append(span);

            lastIndex = end;
        }

        if (lastIndex < label.length) {
            frag.append(label.slice(lastIndex));
        }

        return frag;
    }
}