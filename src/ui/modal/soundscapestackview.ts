// ui/SoundscapeStackView.ts
import { setIcon } from "obsidian";
import type { SoundscapeItem } from "src/api/types";
import { RandomGroupItem } from "./randomgroupitem";
import { Helpers } from "src/helpers/helpers";

export class SoundscapeStackView {
    private container: HTMLElement;
    private getSoundscape: () => SoundscapeItem[];
    private onSelect: (index: number | null) => void;
    private onChange: () => void;
    private onSoftUpdate: () => void;
    private expandedGroups: Set<number>;
    private soundMap: Map<string, string>;

    private selectedIndex: number | null = null;

    constructor(
        container: HTMLElement,
        getSoundscape: () => SoundscapeItem[],
        onSelect: (index: number | null) => void,
        onChange: () => void,
        onSoftUpdate: () => void,
        expandedGroups: Set<number>,
        soundMap: Map<string, string>
    ) {
        this.container = container;
        this.getSoundscape = getSoundscape;
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

    private validateItem(item: SoundscapeItem): boolean {
        if (item.type === "loop") {
            return this.soundMap.has(item.id);
        }

        if (item.type === "flavour-group") {
            if (item.ids.length === 0) return true;
            if (item.min > item.max) return false;
            if (item.ids.some(id => !this.soundMap.has(id))) return false;
            return true;
        }

        return true;
    }

    // ------------------------------------------------------------
    // RENDER
    // ------------------------------------------------------------
    update() {
        const soundscape = this.getSoundscape();
        this.container.empty();

        this.container.createEl("h4", { text: "Stack Items" });

        soundscape.forEach((item, index) => {
            const wrapper = this.container.createDiv({ cls: "stack-item" });

            const header = wrapper.createDiv({ cls: "stack-header" });
            header.classList.toggle("stack-row-selected", this.selectedIndex === index);

            const left = header.createDiv({ cls: "stack-header-left" });

            // ------------------------------------------------------------
            // VALIDATION + WARNING ICON
            // ------------------------------------------------------------
            const isValid = this.validateItem(item);

            if (!isValid) {
                header.classList.add("stack-error");

                const warn = left.createSpan({ cls: "stack-warning-icon" });
                setIcon(warn, "alert-triangle");
                warn.setAttr("aria-label", "This item has errors");
            }

            // ------------------------------------------------------------
            // SELECTION HANDLER
            // ------------------------------------------------------------
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

            // ------------------------------------------------------------
            // FLAVOUR GROUP ITEM
            // ------------------------------------------------------------
            if (item.type === "flavour-group") {
                const isExpanded = this.expandedGroups.has(index);
                const displayName = item.label?.trim() || "Flavour Group";

                const expandIcon = left.createSpan({ cls: "stack-fold-icon" });
                setIcon(expandIcon, isExpanded ? "chevron-down" : "chevron-right");
                header.classList.toggle("stack-expanded", isExpanded);

                expandIcon.onclick = (e) => {
                    e.stopPropagation();
                    if (isExpanded) this.expandedGroups.delete(index);
                    else this.expandedGroups.add(index);
                    this.update();
                };

                // ------------------------------------------------------------
                // HEADER CONTENT
                // ------------------------------------------------------------
                if (isExpanded) {
                    // Create a vertical column for title + timing
                    const headerColumn = left.createDiv({ cls: "rg-header-column" });

                    // TITLE ROW
                    const titleRow = headerColumn.createDiv({ cls: "rg-title-row" });
                    const titleLabel = titleRow.createSpan({ text: "Name:" });
                    const titleInput = titleRow.createEl("input", {
                        type: "text",
                        value: displayName,
                        cls: "rg-title-input"
                    });

                    titleInput.onclick = (e) => e.stopPropagation();
                    titleInput.oninput = () => {
                        item.label = titleInput.value;
                        this.onSoftUpdate();
                    };
                    titleInput.setAttr("aria-label", "The name of the flavour group.");

                    // TIMING ROW
                    const timingRow = headerColumn.createDiv({ cls: "rg-timing-row" });

                    // MIN
                    const minLabel = timingRow.createSpan({ text: "Min:" });
                    const minWrapper = timingRow.createDiv({ cls: "rg-timing-field" });

                    const minInput = minWrapper.createEl("input", {
                        type: "number",
                        value: String(item.min),
                        cls: "rg-number"
                    });
                    minInput.onclick = (e) => e.stopPropagation();
                    minInput.onmousedown = (e) => e.stopPropagation();
                    minInput.setAttr("aria-label", "The minimum time before playing.");

                    // Disallow decimals
                    minInput.setAttr("step", "1");
                    minInput.setAttr("inputmode", "numeric");
                    minInput.setAttr("pattern", "[0-9]*");
                    minInput.setAttr("min", "1");

                    minInput.oninput = () => {
                        minInput.value = minInput.value.replace(/[^0-9]/g, "");
                        if (minInput.value === "0") minInput.value = "1";
                    };

                    const minUnit = minWrapper.createEl("select", { cls: "rg-unit" });
                    minUnit.createEl("option", { text: "secs", value: "s" });
                    minUnit.createEl("option", { text: "mins", value: "m" });
                    minUnit.onclick = (e) => e.stopPropagation();
                    minUnit.onmousedown = (e) => e.stopPropagation();

                    // Preselect minutes if divisible by 60
                    if (item.min >= 60 && item.min % 60 === 0) {
                        minUnit.value = "m";
                        minInput.value = String(item.min / 60);
                    }

                    // MAX
                    const maxLabel = timingRow.createSpan({ text: "Max:" });
                    const maxWrapper = timingRow.createDiv({ cls: "rg-timing-field" });

                    const maxInput = maxWrapper.createEl("input", {
                        type: "number",
                        value: String(item.max),
                        cls: "rg-number"
                    });
                    maxInput.onclick = (e) => e.stopPropagation();
                    maxInput.onmousedown = (e) => e.stopPropagation();

                    // Disallow decimals
                    maxInput.setAttr("step", "1");
                    maxInput.setAttr("inputmode", "numeric");
                    maxInput.setAttr("pattern", "[0-9]*");
                    maxInput.setAttr("min", "1");
                    maxInput.setAttr("aria-label", "The maximum time before playing.");
                    maxInput.oninput = () => {
                        maxInput.value = maxInput.value.replace(/[^0-9]/g, "");
                        if (maxInput.value === "0") maxInput.value = "1";
                    };

                    const maxUnit = maxWrapper.createEl("select", { cls: "rg-unit" });
                    maxUnit.createEl("option", { text: "secs", value: "s" });
                    maxUnit.createEl("option", { text: "mins", value: "m" });
                    maxUnit.onclick = (e) => e.stopPropagation();
                    maxUnit.onmousedown = (e) => e.stopPropagation();

                    if (item.max >= 60 && item.max % 60 === 0) {
                        maxUnit.value = "m";
                        maxInput.value = String(item.max / 60);
                    }

                    // ------------------------------------------------------------
                    // INPUT HANDLERS (no auto-conversion, only explicit unit change)
                    // ------------------------------------------------------------
                    const applyMin = () => {
                        let v = Math.floor(Number(minInput.value) || 0);

                        // Convert minutes → seconds for internal storage
                        if (minUnit.value === "m") v *= 60;

                        // Clamp
                        v = this.clamp(v, 1, 21600);

                        // Fix invalid range (min > max)
                        if (v > item.max) {
                            item.max = v;
                            maxInput.value = String(maxUnit.value === "m" ? v / 60 : v);
                        }

                        item.min = v;
                        minInput.value = String(minUnit.value === "m" ? v / 60 : v);

                        this.onSoftUpdate();
                    };

                    const applyMax = () => {
                        let v = Math.floor(Number(maxInput.value) || 0);

                        // Convert minutes → seconds for internal storage
                        if (maxUnit.value === "m") v *= 60;

                        // Clamp
                        v = this.clamp(v, 1, 21600);

                        // Fix invalid range (max < min)
                        if (v < item.min) {
                            item.min = v;
                            minInput.value = String(minUnit.value === "m" ? v / 60 : v);
                        }

                        item.max = v;
                        maxInput.value = String(maxUnit.value === "m" ? v / 60 : v);

                        this.onSoftUpdate();
                    };

                    // Unit-change handlers (explicit conversion only, using CURRENT input value)
                    minUnit.onchange = () => {
                        const raw = Math.floor(Number(minInput.value) || 0);

                        if (minUnit.value === "m") {
                            // seconds → minutes (hybrid rounding)
                            minInput.value = String(raw < 60 ? 1 : Math.round(raw / 60));
                        } else {
                            // minutes → seconds (exact)
                            minInput.value = String(raw * 60);
                        }

                        applyMin();
                    };

                    maxUnit.onchange = () => {
                        const raw = Math.floor(Number(maxInput.value) || 0);

                        if (maxUnit.value === "m") {
                            // seconds → minutes (hybrid rounding)
                            maxInput.value = String(raw < 60 ? 1 : Math.round(raw / 60));
                        } else {
                            // minutes → seconds (exact)
                            maxInput.value = String(raw * 60);
                        }

                        applyMax();
                    };

                    // Blur handlers (no auto-conversion)
                    minInput.onblur = applyMin;
                    maxInput.onblur = applyMax;
                } else {
                    // COLLAPSED HEADER
                    const titleSpan = left.createSpan({
                        text: `${index + 1}. ${displayName}`
                    });

                    const timing = left.createSpan({ cls: "rg-timing" });
                    timing.setText(` (approx. ${Helpers.formatTimeSeconds(item.min)}–${Helpers.formatTimeSeconds(item.max)})`);

                    const previewItems = item.ids
                        .map(id => this.soundMap.get(id) ?? id)
                        .slice(0, 4);

                    let titleTooltip = `Sounds:\n${previewItems.join("\n")}`;
                    if (item.ids.length > 4) {
                        titleTooltip += `\n(+${item.ids.length - 4} more…)`;
                    }

                    let timingTooltip = `A sound will play every ${Helpers.formatTimeSeconds(item.min, true)} to ${Helpers.formatTimeSeconds(item.max, true)}`

                    titleSpan.setAttr("aria-label", titleTooltip);
                    timing.setAttr("aria-label", timingTooltip);
                }

                // ------------------------------------------------------------
                // BODY (ONLY RANDOM GROUP LIST)
                // ------------------------------------------------------------
                body = wrapper.createDiv({ cls: "stack-body" });
                body.style.display = isExpanded ? "block" : "none";

                if (isExpanded) {
                    const editorContainer = body.createDiv({ cls: "rg-editor" });

                    const editor = new RandomGroupItem(
                        editorContainer,
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

                // ------------------------------------------------------------
                // REMOVE BUTTON
                // ------------------------------------------------------------
                const removeBtn = header.createEl("button", { cls: "stack-remove-btn" });
                setIcon(removeBtn, "trash");

                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    const soundscape = this.getSoundscape();
                    soundscape.splice(index, 1);

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

            // ------------------------------------------------------------
            // LOOP ITEM
            // ------------------------------------------------------------
            if (item.type === "loop") {
                left.createSpan({ text: `${index + 1}. ${item.label}` });

                const removeBtn = header.createEl("button", { cls: "stack-remove-btn" });
                setIcon(removeBtn, "trash");

                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    const soundscape = this.getSoundscape();
                    soundscape.splice(index, 1);

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