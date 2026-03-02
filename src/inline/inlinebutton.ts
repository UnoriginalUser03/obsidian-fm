import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { InlineButtonRegistry } from "./inlinebuttonregistry";

// core/inline/InlineButton.ts
export abstract class InlineButton {
  public el: HTMLButtonElement;
  public iconEl: HTMLDivElement;
  public isValid: boolean = true;
  public isEditor: boolean = false;

  private observer: MutationObserver | null = null;

  constructor(
    protected plugin: ObsidianFMPlugin,
    public id: string,
    public title: string,
    public type: string,
  ) {
    this.el = this.createBaseElement();
    this.attachClickHandler();
  }

  // ------------------------------------------------------------
  // SHARED HELPERS
  // ------------------------------------------------------------

  /** Applies disabled state based on online + validity */
  protected applyDisabledState() {
    const disabled = !this.plugin.kenkuOnline || !this.isValid;
    this.el.classList.toggle("is-disabled", disabled);
    return disabled;
  }

  /** Applies tooltip for offline state. Returns true if handled. */
  protected applyBaseTooltip(): boolean {
    if (!this.plugin.kenkuOnline) {
      this.el.setAttr("aria-label", "KenkuFM is Offline");
      return true;
    }
    return false;
  }

  /** Applies warning icon if invalid. Returns true if handled. */
  protected applyInvalid(): boolean {
    if (!this.isValid) {
      this.el.classList.add("error");

      if (this.iconEl.dataset.currentIcon !== "triangle-alert") {
        this.iconEl.dataset.currentIcon = "triangle-alert";
        setIcon(this.iconEl, "triangle-alert");
      }

      return true;
    }
    this.el.classList.remove("error");

    return false;
  }
  protected applyInvalidClass() {
    this.el.classList.toggle("error", !this.isValid);
  }

  public attachDomObserver(registry: InlineButtonRegistry) {
    this.observer = new MutationObserver(() => {
      if (!document.body.contains(this.el)) {
        registry.unregister(this);
        this.observer?.disconnect();
        this.observer = null;
      }
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
  }



  // ------------------------------------------------------------
  // DOM CREATION
  // ------------------------------------------------------------
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