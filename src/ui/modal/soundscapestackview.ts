// ui/SoundscapeStackView.ts
import { setIcon } from "obsidian";
import type { SoundscapeItem } from "src/api/types";
import { RandomGroupItem } from "./randomgroupitem";

export class SoundscapeStackView {
    private container: HTMLElement;
    private getStack: () => SoundscapeItem[];
    private onSelect: (index: number | null) => void;
    private onChange: () => void;
    private onSoftUpdate: () => void;
    private expandedGroups: Set<number>;
    private soundMap: Map<string, string>;

    private selectedIndex: number | null = null;

    constructor(
        container: HTMLElement,
        getStack: () => SoundscapeItem[],
        onSelect: (index: number | null) => void,
        onChange: () => void,
        onSoftUpdate: () => void,
        expandedGroups: Set<number>,
        soundMap: Map<string, string>
    ) {
        this.container = container;
        this.getStack = getStack;
        this.onSelect = onSelect;
        this.onChange = onChange;
        this.onSoftUpdate = onSoftUpdate;
        this.expandedGroups = expandedGroups;
        this.soundMap = soundMap;

        document.addEventListener("mousedown", this.handleOutsideClick);
    }

    private handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const safeSelectors = [
            ".stack-item",
            ".obsidianfm-search-input",
            ".obsidianfm-suggest-popup"
        ];

        for (const sel of safeSelectors) {
            if (target.closest(sel)) return;
        }

        if (this.selectedIndex === null) return;

        this.selectedIndex = null;
        this.onSelect(null);
        this.update();
    };

    destroy() {
        document.removeEventListener("mousedown", this.handleOutsideClick);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }

    // -----------------------------
    // VALIDATION
    // -----------------------------
    private validateItem(item: SoundscapeItem): boolean {
        if (item.type === "loop") {
            return this.soundMap.has(item.id);
        }

        if (item.type === "random-group") {
            // Allow empty groups during editing
            if (item.ids.length === 0) return true;

            if (item.min > item.max) return false;
            if (item.ids.some(id => !this.soundMap.has(id))) return false;
            return true;
        }

        return true;
    }

    // -----------------------------
    // RENDER
    // -----------------------------
    update() {
        const stack = this.getStack();
        this.container.empty();

        this.container.createEl("h4", { text: "Stack Items" });

        stack.forEach((item, index) => {
            const wrapper = this.container.createDiv({ cls: "stack-item" });

            const header = wrapper.createDiv({ cls: "stack-header" });
            header.classList.toggle("stack-row-selected", this.selectedIndex === index);

            const left = header.createDiv({ cls: "stack-header-left" });

            // -----------------------------
            // VALIDATION + WARNING ICON
            // -----------------------------
            const isValid = this.validateItem(item);

            if (!isValid) {
                header.classList.add("stack-error");

                const warn = left.createSpan({ cls: "stack-warning-icon" });
                setIcon(warn, "alert-triangle");
                warn.setAttr("aria-label", "This item has errors");
            }

            // -----------------------------
            // SELECTION HANDLER
            // -----------------------------
            header.addEventListener("click", (e) => {
                const target = e.target as HTMLElement;
                if (target instanceof HTMLInputElement) return;
                if (target.closest("button")) return;

                if (this.selectedIndex === index) {
                    this.selectedIndex = null;
                    this.onSelect(null);
                } else {
                    this.selectedIndex = index;
                    this.onSelect(index);
                }
                this.update();
            });

            let body: HTMLElement | null = null;

            // -----------------------------
            // RANDOM GROUP ITEM
            // -----------------------------
            if (item.type === "random-group") {
                const isExpanded = this.expandedGroups.has(index);
                const displayName = item.label?.trim() || "Flavour Group";

                const expandIcon = left.createSpan({ cls: "stack-fold-icon" });
                setIcon(expandIcon, isExpanded ? "chevron-down" : "chevron-right");

                expandIcon.onclick = (e) => {
                    e.stopPropagation();
                    if (isExpanded) this.expandedGroups.delete(index);
                    else this.expandedGroups.add(index);
                    this.update();
                };

                // -----------------------------
                // HEADER CONTENT
                // -----------------------------
                if (isExpanded) {
                    const titleInput = left.createEl("input", {
                        type: "text",
                        value: displayName,
                        cls: "rg-title-input"
                    });

                    titleInput.onclick = (e) => e.stopPropagation();
                    titleInput.oninput = () => {
                        item.label = titleInput.value;
                        this.onSoftUpdate();
                    };
                } else {
                    const titleSpan = left.createSpan({
                        text: `${index + 1}. ${displayName}`
                    });

                    const timing = left.createSpan({ cls: "rg-timing" });
                    timing.setText(` (${item.min}–${item.max}s)`);

                    const previewItems = item.ids
                        .map(id => this.soundMap.get(id) ?? id)
                        .slice(0, 4);

                    let tooltip = previewItems.join("\n");
                    if (item.ids.length > 4) {
                        tooltip += `\n(+${item.ids.length - 4} more…)`;
                    }

                    titleSpan.setAttr("aria-label", tooltip);
                    timing.setAttr("aria-label", tooltip);
                }

                // -----------------------------
                // BODY
                // -----------------------------
                body = wrapper.createDiv({ cls: "stack-body" });
                body.style.display = isExpanded ? "block" : "none";

                if (isExpanded) {
                    const help = body.createDiv({ cls: "rg-help" });
                    help.setText(
                        `Random sounds will play every ${item.min}–${item.max} seconds.`
                    );
                }

                // -----------------------------
                // MIN / MAX INPUTS (keep current behaviour)
                // -----------------------------
                if (isExpanded) {
                    const minInput = left.createEl("input", {
                        type: "number",
                        value: String(item.min),
                        cls: "rg-number"
                    });
                    minInput.setAttr("aria-label", "Minimum seconds between random sounds");
                    minInput.onclick = (e) => e.stopPropagation();

                    const maxInput = left.createEl("input", {
                        type: "number",
                        value: String(item.max),
                        cls: "rg-number"
                    });
                    maxInput.setAttr("aria-label", "Maximum seconds between random sounds");
                    maxInput.onclick = (e) => e.stopPropagation();

                    const help = body.createDiv({ cls: "rg-help" });
                    help.setText(`Random sounds will play every ${item.min}–${item.max} seconds.`);

                    minInput.oninput = () => {
                        help.setText(`Random sounds will play every ${minInput.value}–${maxInput.value} seconds.`);
                        this.onSoftUpdate();
                    };

                    maxInput.oninput = () => {
                        help.setText(`Random sounds will play every ${minInput.value}–${maxInput.value} seconds.`);
                        this.onSoftUpdate();
                    };

                    minInput.onblur = () => {
                        let v = Number(minInput.value);
                        v = this.clamp(v, 1, 3600);

                        if (v > item.max) {
                            item.max = v;
                            maxInput.value = String(v);
                        }

                        item.min = v;
                        minInput.value = String(v);

                        help.setText(`Random sounds will play every ${item.min}–${item.max} seconds.`);
                        this.onSoftUpdate();
                    };

                    maxInput.onblur = () => {
                        let v = Number(maxInput.value);
                        v = this.clamp(v, 1, 3600);

                        if (v < item.min) {
                            item.min = v;
                            minInput.value = String(v);
                        }

                        item.max = v;
                        maxInput.value = String(v);

                        help.setText(`Random sounds will play every ${item.min}–${item.max} seconds.`);
                        this.onSoftUpdate();
                    };
                }

                // -----------------------------
                // REMOVE BUTTON
                // -----------------------------
                const removeBtn = header.createEl("button", { cls: "stack-remove-btn" });
                setIcon(removeBtn, "trash");

                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    const stack = this.getStack();
                    stack.splice(index, 1);

                    if (this.selectedIndex === index) {
                        this.selectedIndex = null;
                        this.onSelect(null);
                    } else if (this.selectedIndex !== null && this.selectedIndex > index) {
                        this.selectedIndex--;
                        this.onSelect(this.selectedIndex);
                    }

                    this.onChange();
                    this.update();
                };

                // -----------------------------
                // RANDOM GROUP EDITOR
                // -----------------------------
                const editor = new RandomGroupItem(
                    body,
                    item,
                    () => {
                        this.onChange();
                        this.update();
                    },
                    () => this.onSoftUpdate(),
                    this.soundMap
                );

                editor.render();
            }

            // -----------------------------
            // LOOP ITEM
            // -----------------------------
            if (item.type === "loop") {
                left.createSpan({ text: `${index + 1}. ${item.label}` });

                const removeBtn = header.createEl("button", { cls: "stack-remove-btn" });
                setIcon(removeBtn, "trash");

                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    const stack = this.getStack();
                    stack.splice(index, 1);

                    if (this.selectedIndex === index) {
                        this.selectedIndex = null;
                        this.onSelect(null);
                    } else if (this.selectedIndex !== null && this.selectedIndex > index) {
                        this.selectedIndex--;
                        this.onSelect(this.selectedIndex);
                    }

                    this.onChange();
                    this.update();
                };
            }
        });
    }
}