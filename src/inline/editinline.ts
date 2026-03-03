// src/inline/edit-inline-extension.ts
import { MarkdownView } from "obsidian";
import ObsidianFMPlugin from "src/main";

import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    DecorationSet,
    WidgetType
} from "@codemirror/view";

import { RangeSetBuilder } from "@codemirror/state";
import { Helpers } from "src/helpers/helpers";
import { EditorInlineButton } from "./button types/editorinlinebutton";

// Matches: \u200B?`obsidianfm:...`\u200B?
const INLINE_REGEX = /\u200B?`obsidianfm:([^`]+)`\u200B?/g;

class ObsidianFMEditWidget extends WidgetType {
    private button: EditorInlineButton;
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

        const config = Helpers.parseInlineKenku(this.raw);

        const editorBtn = new EditorInlineButton(
            this.plugin,
            config.id,
            config.title ?? "Play",
            config,
            this.from,
            this.to
        );

        this.plugin.inlineButtons.register(editorBtn);
        this.button = editorBtn;

        el.appendChild(editorBtn.el);
        return el;
    }

    destroy(dom: HTMLElement) {
        if (this.button) this.plugin.inlineButtons.unregister(this.button);
    }
}

class ObsidianFMEditInlinePlugin {
    decorations: DecorationSet;

    constructor(
        private view: EditorView,
        private plugin: ObsidianFMPlugin
    ) {
        this.decorations = this.buildDecorations();
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
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

                // match[1] is the content inside the backticks
                const raw = match[1].trim();

                const widget = Decoration.replace({
                    widget: new ObsidianFMEditWidget(
                        this.plugin,
                        raw,
                        matchStart,
                        matchEnd
                    ),
                    inclusive: false
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
            decorations: v => v.decorations
        }
    );
}