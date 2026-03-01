// src/inline/edit-inline-extension.ts
import { App, MarkdownView, setIcon } from "obsidian";
import ObsidianFMPlugin from "src/main";

import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { SoundscapeInsertModal } from "src/ui/modal/soundscapeinsertmodal";
import { InlinePlayerInsertModal } from "src/ui/modal/inlineplayerinsertmodal";

const INLINE_REGEX = /\u200B?`obsidianfm:([^`]+)`\u200B?/g;

class ObsidianFMEditWidget extends WidgetType {
    constructor(
        private plugin: ObsidianFMPlugin,
        private raw: string,
        private from: number,
        private to: number
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const el = document.createElement("span");
        el.classList.add("obsidianfm-inline-edit");

        const config = this.plugin["parseInlineKenku"](this.raw);

        // Create the real button
        const realBtn = this.plugin.inlineButtons.createFromConfig(config);
        if (!realBtn) {
            el.textContent = "ObsidianFM (invalid)";
            return el;
        }

        // Clone it to strip playback listeners
        // Clone the real button to strip playback listeners
        const cleanBtn = realBtn.el.cloneNode(true) as HTMLElement;

        if (cleanBtn.hasClass("obsidianfm-error")) {
            cleanBtn.classList.remove("obsidianfm-error");
        }

        // Add tooltip
        cleanBtn.setAttribute("aria-label", "Edit ObsidianFM Player");
        cleanBtn.setAttribute("data-tooltip-position", "top");

        if (!this.plugin.kenkuOnline) {
            cleanBtn.classList.add("obsidianfm-disabled");
        }

        // Replace ONLY the left icon with a Lucide pencil
        const iconEl = cleanBtn.querySelector(".obsidianfm-inline-icon") as HTMLElement;
        if (iconEl) {
            iconEl.empty();
            setIcon(iconEl, "pencil");
        }

        // Replace click handler with edit modal
        cleanBtn.onclick = (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            if (!this.plugin.kenkuOnline) return;

            const mdView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (!mdView) return;

            const editor = mdView.editor;
            const mode = config["stack"] ? "soundscape" : "normal";

            const modal = mode == "normal" ? new InlinePlayerInsertModal(
                this.plugin.app,
                this.plugin,
                (result) => {
                    const newCode = this.plugin["buildInlineCode"](result);
                    editor.replaceRange(
                        newCode,
                        editor.offsetToPos(this.from),
                        editor.offsetToPos(this.to)
                    );
                },
                () => {
                    editor.replaceRange(
                        "",
                        editor.offsetToPos(this.from),
                        editor.offsetToPos(this.to)
                    )
                },
                config
            ) : new SoundscapeInsertModal(
                this.plugin.app,
                this.plugin,
                (result) => {
                    const newCode = this.plugin["buildInlineCode"](result);
                    editor.replaceRange(
                        newCode,
                        editor.offsetToPos(this.from),
                        editor.offsetToPos(this.to)
                    );
                },
                () => {
                    editor.replaceRange(
                        "",
                        editor.offsetToPos(this.from),
                        editor.offsetToPos(this.to)
                    )
                },
                config
            );

            modal.open();
        };

        el.appendChild(cleanBtn);
        return el;
    }

    ignoreEvent() {
        // Let clicks go through to our handler
        return true;
    }
}

class ObsidianFMEditInlinePlugin {
    decorations: DecorationSet;

    constructor(private view: EditorView, private plugin: ObsidianFMPlugin) {
        this.decorations = this.buildDecorations();
        this.plugin.events.on("obsidian-fm:online", () => {
            this.decorations = this.buildDecorations();
            this.view.update([]);
        });

        this.plugin.events.on("obsidian-fm:offline", () => {
            this.decorations = this.buildDecorations();
            this.view.update([]);
        });
    }

    update(update: ViewUpdate) {
        if (
            update.docChanged ||
            update.viewportChanged ||
            update.selectionSet
        ) {
            this.decorations = this.buildDecorations();
        }
    }

    buildDecorations(): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = this.view.state.doc;

        for (const { from, to } of this.view.visibleRanges) {
            const text = doc.sliceString(from, to);
            let match: RegExpExecArray | null;

            INLINE_REGEX.lastIndex = 0;
            while ((match = INLINE_REGEX.exec(text)) !== null) {
                const matchStart = from + match.index;
                const matchEnd = matchStart + match[0].length;
                const raw = match[0].slice(1, -1).trim(); // remove backticks

                const widget = Decoration.replace({
                    widget: new ObsidianFMEditWidget(this.plugin, raw, matchStart, matchEnd),
                    inclusive: false,
                    key: this.plugin.kenkuOnline ? "online" : "offline"
                });

                builder.add(matchStart, matchEnd, widget);
            }
        }

        return builder.finish();
    }
}

export function createObsidianFMEditInlineExtension(plugin: ObsidianFMPlugin) {
    return ViewPlugin.fromClass(
        class extends ObsidianFMEditInlinePlugin {
            constructor(view: EditorView) {
                super(view, plugin);
            }
        },
        {
            decorations: v => v.decorations,
        }
    );
}