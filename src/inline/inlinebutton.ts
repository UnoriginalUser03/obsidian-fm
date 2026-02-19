import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";

// core/inline/InlineButton.ts
export abstract class InlineButton {
  public el: HTMLButtonElement;
  public iconEl: HTMLDivElement;

  constructor(
    protected plugin: ObsidianFMPlugin,
    public id: string,
    public type: string,
    public title: string
  ) {
    this.el = this.createBaseElement();
    this.attachClickHandler();
  }

  // Shared DOM structure
  private createBaseElement(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.classList.add("obsidianfm-inline-btn");

    // Icon
    const iconEl = document.createElement("div");
    iconEl.classList.add("obsidianfm-inline-icon");
    this.iconEl = iconEl; 
    btn.appendChild(iconEl);

    // Title
    const titleEl = document.createElement("span");
    titleEl.classList.add("obsidianfm-inline-title");
    titleEl.textContent = this.title;
    btn.appendChild(titleEl);

    // Type icon
    const typeIconEl = document.createElement("div");
    typeIconEl.classList.add("obsidianfm-inline-type-icon");
    btn.appendChild(typeIconEl);
    setIcon(typeIconEl, this.plugin.typeIconMap[this.type] || "question-mark");

    return btn;
  }

  private attachClickHandler() {
    this.el.addEventListener("click", () => this.handleClick());
  }

  // Subclasses implement these:
  abstract updateState(): void;
  abstract updateProgress(now: number): void;
  abstract handleClick(): Promise<void>;

  destroy() {
    this.el.remove();
  }
}