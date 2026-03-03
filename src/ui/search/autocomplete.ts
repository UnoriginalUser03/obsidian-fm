// ui/search/Autocomplete.ts
import { App, prepareFuzzySearch, SearchMatches } from "obsidian";
import { createPopper, Instance as PopperInstance } from "@popperjs/core";
import type { FilteredEntry, SuggestItem } from "src/api/types";
import ObsidianFMPlugin from "src/main";
import { AutocompleteItem } from "./autocompleteitem";

export class Autocomplete {
    private app: App;
    private plugin: ObsidianFMPlugin;
    private inputEl: HTMLInputElement;
    private popupEl: HTMLElement;
    private listEl: HTMLElement;
    private items: SuggestItem[];
    private filtered: FilteredEntry[] = [];
    public selectedIndex = 0;
    private onSelect: (item: SuggestItem) => void;
    private popper: PopperInstance | null = null;
    private isOpen = false;

    // Bound handlers
    private onInput = () => this.update(this.inputEl.value);
    private onKeyDown = (evt: KeyboardEvent) => this.handleKeyDown(evt);
    private onDocMouseDown = (evt: MouseEvent) => this.handleDocMouseDown(evt);
    private onBlur = () => setTimeout(() => this.close(), 150);
    private onFocus = () => setTimeout(() => {
        this.update(this.inputEl.value);   // populate with all items
        this.open();       // show the popup
    }, 150);

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

    // ------------------------------------------------------------
    // EVENT REGISTRATION
    // ------------------------------------------------------------
    private registerEvents() {
        this.inputEl.addEventListener("input", this.onInput);
        this.inputEl.addEventListener("keydown", this.onKeyDown);
        this.inputEl.addEventListener("blur", this.onBlur);
        this.inputEl.addEventListener("focus", this.onFocus);
        document.addEventListener("mousedown", this.onDocMouseDown);
    }

    private handleKeyDown(evt: KeyboardEvent) {
        if (!this.isOpen) return;

        if (evt.key === "ArrowDown") {
            this.selectedIndex = (this.selectedIndex + 1) % this.filtered.length;
            this.updateSelectionHighlight();
            evt.preventDefault();
        }

        if (evt.key === "ArrowUp") {
            this.selectedIndex =
                (this.selectedIndex - 1 + this.filtered.length) %
                this.filtered.length;
            this.updateSelectionHighlight();
            evt.preventDefault();
        }

        if (evt.key === "Enter") {
            const entry = this.filtered[this.selectedIndex];
            if (entry) this.choose(entry.item);
            evt.preventDefault();
        }
    }

    private handleDocMouseDown(evt: MouseEvent) {
        if (
            !this.popupEl.contains(evt.target as Node) &&
            evt.target !== this.inputEl
        ) {
            this.close();
        }
    }

    public clear() {
        this.inputEl.value = "";
    }

    // ------------------------------------------------------------
    // UPDATE + FILTERING
    // ------------------------------------------------------------
    private update(query: string) {
        if (!query) {
            const parents = this.items.filter(i => i.isParent);

            // FLAT MODE: no parents → render all items alphabetically
            if (parents.length === 0) {
                this.filtered = this.items
                    .slice()
                    .sort((a, b) => a.label.localeCompare(b.label))
                    .map(item => ({
                        item,
                        score: 0,
                        matches: []
                    }));

                this.selectedIndex = 0;
                this.render();
                this.open();
                return;
            }

            // HIERARCHICAL MODE (existing behaviour)
            const grouped: FilteredEntry[] = [];

            parents.sort((a, b) => a.label.localeCompare(b.label));

            for (const parent of parents) {
                grouped.push({ item: parent, score: 0, matches: [] });

                const children = this.items
                    .filter(i => i.parentLabel === parent.label)
                    .sort((a, b) => a.label.localeCompare(b.label));

                for (const child of children) {
                    grouped.push({ item: child, score: 0, matches: [] });
                }
            }

            this.filtered = grouped;
            this.selectedIndex = 0;
            this.render();
            this.open();
            return;
        }

        const search = prepareFuzzySearch(query);
        const results: FilteredEntry[] = [];

        for (const item of this.items) {
            const haystack = item.isParent
                ? [item.label, item.subtitle, item.type].filter(Boolean).join(" ")
                : [
                    item.label,
                    item.parentLabel,
                    item.subtitle,
                    item.type
                ].filter(Boolean).join(" ");

            const r = search(haystack);
            if (r) {
                results.push({
                    item,
                    score: r.score,
                    matches: r.matches,
                });
            }
        }

        results.sort((a, b) => {
            // 1. Higher fuzzy score first
            if (a.score !== b.score) return b.score - a.score;

            // 2. If scores equal, prefer parents
            const aParent = a.item.isParent ? 1 : 0;
            const bParent = b.item.isParent ? 1 : 0;
            if (aParent !== bParent) return bParent - aParent;

            // 3. Stable fallback: label
            return a.item.label.localeCompare(b.item.label);
        });
        // After sort:
        const topParent = results.find(r => r.item.isParent);

        if (topParent) {
            const parentLabel = topParent.item.label;

            const children = results.filter(
                r => r.item.parentLabel === parentLabel && !r.item.isParent
            );

            const others = results.filter(
                r => r !== topParent && r.item.parentLabel !== parentLabel
            );

            this.filtered = [topParent, ...children, ...others].slice(0, 50);
        } else {
            this.filtered = results.slice(0, 50);
        }

        if (this.filtered.length === 0) {
            this.close();
            return;
        }

        this.selectedIndex = 0;
        this.render();
        this.open();
    }

    // ------------------------------------------------------------
    // RENDERING
    // ------------------------------------------------------------
    private render() {
        this.listEl.empty();

        this.filtered.forEach((entry, index) => {
            const item = new AutocompleteItem(this, this.plugin, entry, index);
            item.renderInto(this.listEl);
        });
    }

    private updateSelectionHighlight() {
        const rows = this.listEl.querySelectorAll(".obsidianfm-suggest-row");
        rows.forEach((row, i) => {
            if (i === this.selectedIndex) {
                row.addClass("is-selected");
                row.scrollIntoView({ block: "nearest" });
            } else {
                row.removeClass("is-selected");
            }
        });
    }

    // Called by AutocompleteItem
    public setSelectedIndex(index: number) {
        this.selectedIndex = index;
        this.updateSelectionHighlight();
    }

    // ------------------------------------------------------------
    // POPUP CONTROL
    // ------------------------------------------------------------
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

        // Stop preview if active
        const playback = this.plugin.playback;
        if (playback.previewing) {
            const ctrl = this.plugin.playbackController;
            ctrl.suppressRestore = false;
            await ctrl.exitPreviewMode();
        }

        this.isOpen = false;
        this.popupEl.style.display = "none";

        if (this.popper) {
            this.popper.destroy();
            this.popper = null;
        }
    }

    public getInputEl(): HTMLInputElement {
        return this.inputEl;
    }

    // ------------------------------------------------------------
    // SELECTION
    // ------------------------------------------------------------
    public async choose(item: SuggestItem) {
        this.inputEl.value = item.label;
        this.onSelect(item);
        await this.close();
    }

    // ------------------------------------------------------------
    // HIGHLIGHTING
    // ------------------------------------------------------------
    public highlight(label: string, matches: SearchMatches): DocumentFragment {
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

    public setItems(items: SuggestItem[]) {
        this.items = items;
    }

    // ------------------------------------------------------------
    // FULL DESTROY
    // ------------------------------------------------------------
    public destroy() {
        this.close();

        document.removeEventListener("mousedown", this.onDocMouseDown);
        this.inputEl.removeEventListener("input", this.onInput);
        this.inputEl.removeEventListener("keydown", this.onKeyDown);
        this.inputEl.removeEventListener("blur", this.onBlur);
        this.inputEl.removeEventListener("focus", this.onFocus);

        this.popupEl.remove();
    }
}