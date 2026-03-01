// core/playback/PlaybackInterpolator.ts

import ObsidianFMPlugin from "src/main";
import { PlaybackState } from "./playbackstate";
import { InlineButtonRegistry } from "src/inline/inlinebuttonregistry";

export class PlaybackInterpolator {
  private frameId: number | null = null;

  constructor(
    private plugin: ObsidianFMPlugin,
    private state: PlaybackState,
    private registry: InlineButtonRegistry
  ) { }

  // ------------------------------------------------------------
  // START LOOP
  // ------------------------------------------------------------
  start() {
    const tick = () => {
      const now = performance.now();
      // Only update main playback UI when NOT previewing
      if (!this.state.previewing) {
        this.plugin.views.forEach((v) => v.updateInterpolated());
        this.registry.updateAll(now);
      }
      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------
  // STOP LOOP
  // ------------------------------------------------------------
  stop() {
    if (this.frameId != null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}