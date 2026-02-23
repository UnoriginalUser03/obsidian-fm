import { requestUrl, Notice } from "obsidian";
import {
  Sound,
  SoundboardApiResponse,
  PlaylistApiResponse,
  SoundboardPlaybackApiResponse,
  PlaylistPlaybackStatus,
  Track,
  Playlist,
  Soundboard,
  MediaType,
} from "./types";

// ---------------- SAFE PLAYLIST FETCH ----------------
export const getPlaylists = async (baseUrl: string): Promise<Playlist[]> => {
  try {
    const { json: playlists } = (await requestUrl({
      url: new URL("/v1/playlist", baseUrl).href,
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })) as { json: PlaylistApiResponse };

    return playlists.playlists.map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      tracks: playlist.tracks,
    }));
  } catch (e) {
    console.warn("Could not load playlists:", e);
    return [];
  }
};

export const getSoundboards = async (baseUrl: string): Promise<Soundboard[]> => {
  try {
    const { json: soundboards } = (await requestUrl({
      url: new URL("/v1/soundboard", baseUrl).href,
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })) as { json: SoundboardApiResponse };

    return soundboards.soundboards.map((sb) => ({
      id: sb.id,
      title: sb.title,
      sounds: sb.sounds,
    }));
  } catch (e) {
    console.warn("Could not load soundboards:", e);
    return [];
  }
};

// ---------------- SAFE PLAYBACK CONTROLS ---------------- 

export const setVolume = async (baseUrl: string, volume: number): Promise<void> => {
  try {
    await requestUrl({
      url: new URL("/v1/playlist/playback/volume", baseUrl).href,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volume }),
    });
  } catch (e) {
    console.warn("Could not change volume:", e);
  }
};


export const setMute = async (baseUrl: string, mute: boolean): Promise<void> => {
  try {
    await requestUrl({
      url: new URL("/v1/playlist/playback/mute", baseUrl).href,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mute }),
    });
  } catch (e) {
    console.warn("Could not toggle mute:", e);
  }
};


// ---------------- SAFE MUSIC FETCH ----------------
export const getMusic = async (baseUrl: string): Promise<Track[]> => {
  try {
    const { json: playlists } = (await requestUrl({
      url: new URL("/v1/playlist", baseUrl).href,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })) as { json: PlaylistApiResponse };

    return playlists.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      playlistName: playlists.playlists.find((playlist) =>
        playlist.tracks.includes(track.id)
      )!.title,
    }));
  } catch (e) {
    console.error(e);
    new Notice("Could not load tracks");
    return [];
  }
};


// ---------------- SAFE SOUNDS FETCH ----------------
export const getSounds = async (baseUrl: string): Promise<Sound[]> => {
  try {
    const [{ json: soundboards }, { json: playback }] = await Promise.all([
      requestUrl({
        url: new URL("/v1/soundboard", baseUrl).href,
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }),
      requestUrl({
        url: new URL("/v1/soundboard/playback", baseUrl).href,
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }),
    ]) as [{ json: SoundboardApiResponse }, { json: SoundboardPlaybackApiResponse }];

    return soundboards.sounds.map((sound) => {
      const playbackSound = playback?.sounds?.find((s) => s.id === sound.id);
      const sb = soundboards.soundboards.find((sb) => sb.sounds.includes(sound.id));
      return {
        id: sound.id,
        title: sound.title,
        soundboardName: sb?.title ?? "Unknown",
        isPlaying: playbackSound != null,
        loop: sound.loop,
      };

    });
  } catch (e) {
    console.warn("Could not load soundboards:", e);
    return [];
  }
};


// ---------------- SAFE PLAYBACK FETCH ----------------
export const getSoundboardPlaybackIDs = async (
  baseUrl: string
): Promise<string[]> => {
  try {
    const { json: playback } = (await requestUrl({
      url: new URL("/v1/soundboard/playback", baseUrl).href,
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })) as { json: SoundboardPlaybackApiResponse };

    return playback?.sounds?.map((s) => s.id) ?? [];
  } catch (e) {
    console.warn("Could not load soundboard playback:", e);
    return [];
  }
};

export const getSoundboardPlaybackStatus = async (
  baseUrl: string
): Promise<SoundboardPlaybackApiResponse | null> => {
  try {
    const { json: playback } = (await requestUrl({
      url: new URL("/v1/soundboard/playback", baseUrl).href,
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })) as { json: SoundboardPlaybackApiResponse };

    return playback;
  } catch (e) {
    console.warn("Could not load playlist playback:", e);
    return null;
  }
};

// ---------------- SAFE PLAYLIST PLAYBACK ----------------
export const getPlaylistPlaybackStatus = async (
  baseUrl: string
): Promise<PlaylistPlaybackStatus | null> => {
  try {
    const { json: playback } = (await requestUrl({
      url: new URL("/v1/playlist/playback", baseUrl).href,
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })) as { json: PlaylistPlaybackStatus };

    return playback;
  } catch (e) {
    console.warn("Could not load playlist playback:", e);
    return null;
  }
};

export const setNextTrack = async (baseUrl: string): Promise<void> => {
  try {
    await requestUrl({
      url: new URL("/v1/playlist/playback/next", baseUrl).href,
      method: "POST",
    });
  } catch (e) {
    console.warn("Could not skip to next track:", e);
  }
};

export const setShuffle = async (baseUrl: string, shuffle: boolean): Promise<void> => {
  try {
    await requestUrl({
      url: new URL("/v1/playlist/playback/shuffle", baseUrl).href,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shuffle }),
    });
  } catch (e) {
    console.warn("Could not change shuffle status:", e);
  }
};

export const setRepeat = async (baseUrl: string, repeat: "track" | "playlist" | "off"): Promise<void> => {
  try {
    await requestUrl({
      url: new URL("/v1/playlist/playback/repeat", baseUrl).href,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repeat }),
    });
  } catch (e) {
    console.warn("Could not change repeat status:", e);
  }
};

export const setPreviousTrack = async (baseUrl: string): Promise<void> => {
  try {
    await requestUrl({
      url: new URL("/v1/playlist/playback/previous", baseUrl).href,
      method: "POST",
    });
  } catch (e) {
    console.warn("Could not skip to previous track:", e);
  }
};

// ---------------- PLAY / PAUSE ----------------
export const setPlaylistPlayback = async (
  baseUrl: string,
  isPlaying: boolean
): Promise<void> => {
  try {
    const path = isPlaying ? "/v1/playlist/playback/play" : "/v1/playlist/playback/pause";
    await requestUrl({
      url: new URL(path, baseUrl).href,
      method: "PUT",
    });
  } catch (e) {
    console.warn("Could not change playlist playback:", e);
  }
};

export const setSoundboardPlaybackStatus = async (
  baseUrl: string,
  id: string,
  shouldPlay: boolean
): Promise<void> => {
  try {
    const path = shouldPlay ? "/v1/soundboard/play" : "/v1/soundboard/stop";
    await requestUrl({
      url: new URL(path, baseUrl).href,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch (e) {
    console.warn("Could not change sound playback:", e);
  }
};

export const seekTo = async (
  baseUrl: string,
  to: number
): Promise<void> => {
  try {
    await requestUrl({
      url: new URL('/v1/playlist/playback/seek', baseUrl).href,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to })
    })
  } catch (e) {
    console.warn("Could not seek to time:", e);
  }
}

export const setPlayback = async (
  baseUrl: string,
  shuffle?: boolean,
  repeat?: "track" | "playlist" | "off",
  volume?: number,
): Promise<void> => {
  try {
    await Promise.all([
      shuffle !== undefined ? setShuffle(baseUrl, shuffle) : Promise.resolve(),
      repeat !== undefined ? setRepeat(baseUrl, repeat) : Promise.resolve(),
      volume !== undefined ? setVolume(baseUrl, volume) : Promise.resolve(),
    ]);
  } catch (e) {
    console.warn("Could not change playback settings:", e);
  }
};

export const setPlaylist = async (
  baseUrl: string,
  id: string
): Promise<void> => {
  try {
    const path = "/v1/playlist/play";
    await requestUrl({
      url: new URL(path, baseUrl).href,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch (e) {
    console.warn("Could not set playlist/track:", e);
  }
};

// ---------------- HELPER PLAY / STOP ----------------
export const playSound = async (
  baseUrl: string,
  id: string,
  type: MediaType
) => {
  if (type === "track" || type === "playlist") {
    await setPlaylist(baseUrl, id);
  } else {
    await setSoundboardPlaybackStatus(baseUrl, id, true);
  }
};

export const stopSound = async (
  baseUrl: string,
  type?: MediaType,
  id?: string
) => {
  try {
    if (type === "track" || type === "playlist") {
      await setPlaylistPlayback(baseUrl, false);
      return;
    }

    if (type === "sound" && id) {
      await setSoundboardPlaybackStatus(baseUrl, id, false);
      return;
    }
    // Stop all
    await setPlaylistPlayback(baseUrl, false);
    const sounds = await getSoundboardPlaybackIDs(baseUrl);
    for (const s of sounds) {
      await setSoundboardPlaybackStatus(baseUrl, s, false);
    }
  } catch (e) {
    console.warn("Could not stop sounds:", e);
  }
};

// ---------------- PING ----------------
export const pingKenkuFM = async (baseUrl: string): Promise<boolean> => {
  try {
    const playback = await getPlaylistPlaybackStatus(baseUrl);
    return playback !== null;
  } catch {
    return false;
  }
};