// core/inline/button types/editorinlinebutton.ts
import { setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";
import { MarkdownView } from "obsidian";
import { Helpers } from "src/helpers/helpers";
import { InlinePlayerInsertModal } from "src/ui/modal/inlineplayerinsertmodal";
import { SoundscapeInsertModal } from "src/ui/modal/soundscapeinsertmodal";
import { InlineButton } from "../inlinebutton";

export class EditorInlineButton extends InlineButton {
    constructor(
        plugin: ObsidianFMPlugin,
        id: string,
        title: string,
        public config: Record<string, string>,
        public from: number,
        public to: number
    ) {
        super(plugin, id, title, "editor");

        this.iconEl.empty();
        setIcon(this.iconEl, "pencil");

        const typeIconEl = this.el.querySelector(".obsidianfm-inline-type-icon") as HTMLElement;
        if (typeIconEl) {
            typeIconEl.empty();
            setIcon(typeIconEl, this.plugin.typeIconMap[this.config.type] ?? "circle-question-mark");
        }
    }
    // ------------------------------------------------------------
    // STATE UPDATE
    // ------------------------------------------------------------
    updateState() {
        const isPlaying = this.isPlaying();

        // Disabled if offline or playback is active
        const disabled = !this.plugin.kenkuOnline || isPlaying;
        this.el.classList.toggle("obsidianfm-disabled", disabled);

        // Tooltip logic
        const tooltip =
            !this.plugin.kenkuOnline ? "KenkuFM Offline" :
                !this.isValid ? "Missing References" :
                    isPlaying ? "Please stop playback before editing" :
                        this.config["soundscape"] ? "Edit ObsidianFM Soundscape" :
                            "Edit ObsidianFM Player";

        this.el.setAttr("aria-label", tooltip);

        // Error class if invalid
        this.el.classList.toggle("error", !this.isValid);
    }

    // ------------------------------------------------------------
    // PROGRESS UPDATE (editor buttons never show progress)
    // ------------------------------------------------------------
    updateProgress() {
        // no-op
    }

    // ------------------------------------------------------------
    // CLICK HANDLER (opens modal)
    // ------------------------------------------------------------
    handleClick() {
        if (!this.plugin.kenkuOnline || this.isPlaying()) return;

        const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!mdView) return;

        const editor = mdView.editor;
        const isSoundscape = !!this.config["soundscape"];

        const modal = isSoundscape
            ? new SoundscapeInsertModal(
                this.plugin.app,
                this.plugin,
                (result) => {
                    const newCode = Helpers.buildInlineCode(result);
                    editor.replaceRange(newCode, editor.offsetToPos(this.from), editor.offsetToPos(this.to));
                },
                () => {
                    editor.replaceRange("", editor.offsetToPos(this.from), editor.offsetToPos(this.to));
                },
                this.config
            )
            : new InlinePlayerInsertModal(
                this.plugin.app,
                this.plugin,
                (result) => {
                    const newCode = Helpers.buildInlineCode(result);
                    editor.replaceRange(newCode, editor.offsetToPos(this.from), editor.offsetToPos(this.to));
                },
                () => {
                    editor.replaceRange("", editor.offsetToPos(this.from), editor.offsetToPos(this.to));
                },
                this.config
            );

        modal.open();
    }

    // ------------------------------------------------------------
    // PLAYBACK MIRRORING
    // ------------------------------------------------------------
    isPlaying(): boolean {
        const playbackBtn = this.plugin.inlineButtons.getPlaybackButton(this.id);
        return playbackBtn ? playbackBtn.isPlaying() : false;
    }
}