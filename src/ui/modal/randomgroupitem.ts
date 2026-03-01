// ui/RandomGroupItem.ts
import { setIcon } from "obsidian";
import type { SoundscapeItem } from "src/api/types";

export class RandomGroupItem {
  private container: HTMLElement;
  private group: Extract<SoundscapeItem, { type: "random-group" }>;
  private onChange: () => void;
  private onSoftUpdate: () => void;
  private soundMap: Map<string, string>;

  constructor(
    container: HTMLElement,
    group: Extract<SoundscapeItem, { type: "random-group" }>,
    onChange: () => void,
    onSoftUpdate: () => void,
    soundMap: Map<string, string>   // ⭐ NEW
  ) {
    this.container = container;
    this.group = group;
    this.onChange = onChange;
    this.onSoftUpdate = onSoftUpdate;
    this.soundMap = soundMap;
  }

  render() {
    this.container.empty();

    if (this.group.ids.length === 0) {
      const empty = this.container.createDiv({ cls: "rg-empty" });
      empty.setText("No items added yet.");
      return;
    }

    this.group.ids.forEach((id, idx) => {
      const row = this.container.createDiv({ cls: "rg-row" });

      const label = row.createDiv({ cls: "rg-row-label" });

      // ⭐ Lookup title from map, fallback to ID
      const title = this.soundMap.get(id) ?? id;
      label.setText(title);

      const removeBtn = row.createEl("button", { cls: "rg-remove" });
      setIcon(removeBtn, "trash");

      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.group.ids.splice(idx, 1);
        this.onChange();
      };
    });
  }
}