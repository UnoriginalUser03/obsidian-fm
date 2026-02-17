import { App, prepareFuzzySearch, SearchMatches, setIcon } from "obsidian";
import { createPopper, Instance as PopperInstance } from "@popperjs/core";

export interface SuggestItem {
    id: string;
    label: string;
    icon?: string;
    subtitle?: string;
    type: "track" | "sound" | "playlist";
}

type FilteredEntry = {
    item: SuggestItem;
    score: number;
    matches: SearchMatches;
};

export class KenkuSuggest {
    private app: App;
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
    private previewCallback?: (
        id: string,
        type: "track" | "sound" | "playlist"
    ) => void;
    private stopPreviewCallback?: (
        type?: "track" | "sound" | "playlist",
        id?: string
    ) => void;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        items: SuggestItem[],
        onSelect: (item: SuggestItem) => void,
        onPreview?: (
            id: string,
            type: "track" | "sound" | "playlist"
        ) => void,
        onStopPreview?: (
            type?: "track" | "sound" | "playlist",
            id?: string
        ) => void
    ) {
        this.app = app;
        this.inputEl = inputEl;
        this.items = items;
        this.onSelect = onSelect;
        this.previewCallback = onPreview;
        this.stopPreviewCallback = onStopPreview;

        this.popupEl = createDiv({ cls: "kenku-suggest-popup" });
        this.listEl = this.popupEl.createDiv({ cls: "kenku-suggest-list" });
        document.body.appendChild(this.popupEl);

        this.registerEvents();
    }

    // -----------------------------------------------------
    // EVENT HANDLING
    // -----------------------------------------------------
    private registerEvents() {
        this.inputEl.addEventListener("input", () => {
            this.update(this.inputEl.value);
        });

        this.inputEl.addEventListener("keydown", (evt) => {
            if (!this.isOpen) return;

            if (evt.key === "ArrowDown") {
                if (this.selectedIndex < this.filtered.length - 1) {
                    this.selectedIndex++;
                } else {
                    this.selectedIndex = 0; // wrap
                }
                this.render();
                evt.preventDefault();
            }

            if (evt.key === "ArrowUp") {
                if (this.selectedIndex > 0) {
                    this.selectedIndex--;
                } else {
                    this.selectedIndex = this.filtered.length - 1; // wrap
                }
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

    // -----------------------------------------------------
    // UPDATE + FUZZY SEARCH
    // -----------------------------------------------------
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

    // -----------------------------------------------------
    // RENDER POPUP
    // -----------------------------------------------------
    private render() {
        this.listEl.empty();

        this.filtered.forEach((entry, index) => {
            const { item, matches } = entry;

            const row = this.listEl.createDiv({
                cls: "kenku-suggest-row",
            });

            const top = row.createDiv({ cls: "kenku-suggest-top" });

            if (item.icon) {
                const iconEl = top.createDiv({ cls: "kenku-suggest-icon" });
                setIcon(iconEl, item.icon);
            }

            const labelEl = top.createSpan({ cls: "kenku-suggest-label" });
            labelEl.append(this.highlight(item.label, matches));

            const isPreviewing = this.currentPreview === item.id;
            const previewBtn = top.createDiv({
                cls: "kenku-suggest-preview",
            });

            setIcon(previewBtn, isPreviewing ? "square" : "play");

            previewBtn.addEventListener("mousedown", (evt) => {
                evt.preventDefault();
                evt.stopImmediatePropagation();
                this.togglePreview(entry, previewBtn);
            });

            if (item.subtitle) {
                row.createDiv({
                    text: item.subtitle,
                    cls: "kenku-suggest-subtitle",
                });
            }

            if (index === this.selectedIndex) {
                row.addClass("is-selected");
                row.scrollIntoView({ block: "nearest" });
            }

            row.addEventListener("mousedown", (evt) => {
                evt.preventDefault();
                this.choose(item);
            });

            row.addEventListener("mouseenter", () => {
                const prev = this.listEl.querySelector(".is-selected");
                if (prev) prev.removeClass("is-selected");
                row.addClass("is-selected");
                this.selectedIndex = index;
            });
        });
    }

    // -----------------------------------------------------
    // POPUP CONTROL
    // -----------------------------------------------------
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
            ],
        });
    }

    private close() {
        if (!this.isOpen) return;

        this.stopPreview();

        this.isOpen = false;
        this.popupEl.style.display = "none";

        if (this.popper) {
            this.popper.destroy();
            this.popper = null;
        }
    }

    private choose(item: SuggestItem) {
        this.inputEl.value = item.label;
        this.onSelect(item);
        this.close();
    }

    // -----------------------------------------------------
    // PREVIEW LOGIC
    // -----------------------------------------------------
    private togglePreview(entry: FilteredEntry, _btn: HTMLElement) {
        const { id, type } = entry.item;

        // If clicking the same item → stop preview
        if (this.currentPreview === id) {
            this.stopPreviewCallback?.(type, id);
            this.currentPreview = null;
            this.render();
            return;
        }

        // Stop any existing preview (fallback: stop everything)
        if (this.currentPreview) {
            this.stopPreviewCallback?.();
        }

        this.currentPreview = id;
        this.previewCallback?.(id, type);

        this.render();
    }

    private stopPreview() {
        if (this.currentPreview && this.stopPreviewCallback) {
            this.stopPreviewCallback();
        }
        this.currentPreview = null;
    }

    // -----------------------------------------------------
    // HIGHLIGHTING
    // -----------------------------------------------------
    private highlight(label: string, matches: SearchMatches): DocumentFragment {
        const frag = document.createDocumentFragment();
        let lastIndex = 0;

        for (const [start, end] of matches) {
            if (start > lastIndex) {
                frag.append(label.slice(lastIndex, start));
            }

            const span = document.createElement("span");
            span.className = "kenku-suggest-highlight";
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