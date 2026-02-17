import { requestUrl, Notice } from "obsidian";
import {
  Sound,
  SoundboardApiResponse,
  PlaylistApiResponse,
  SoundboardPlaybackApiResponse,
  PlaylistPlaybackApiResponse,
  Track,
} from "./types";

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

export const getSounds = async (baseUrl: string): Promise<Sound[]> => {
  try {
    const [
      { json: soundboards },
      { json: playback },
      { json: playlists },
    ]: [
        { json: SoundboardApiResponse },
        { json: SoundboardPlaybackApiResponse },
        { json: PlaylistApiResponse }
      ] = await Promise.all([
        requestUrl({
          url: new URL("/v1/soundboard", baseUrl).href,
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }),
        requestUrl({
          url: new URL("/v1/soundboard/playback", baseUrl).href,
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }),
        requestUrl({
          url: new URL("/v1/playlist", baseUrl).href,
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ]);

    return soundboards.sounds.map((sound) => ({
      id: sound.id,
      title: sound.title,
      soundboardName: soundboards.soundboards.find((soundboard) =>
        soundboard.sounds.includes(sound.id)
      )!.title,
      isPlaying: playback.sounds.some((playing) => playing.id === sound.id),
    }));
  } catch (e) {
    console.error(e);
    new Notice("Could not load soundboards");
    return [];
  }
};

export const getSoundboardPlaybackIDs = async (
  baseUrl: string
): Promise<string[]> => {
  try {
    const { json: playback } = (await requestUrl({
      url: new URL("/v1/soundboard/playback", baseUrl).href,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })) as { json: SoundboardPlaybackApiResponse };

    return playback.sounds.map(sound => sound.id);
  } catch (e) {
    console.log(e);
    return [];
  }
};

export const setPlaylistPlayback = async (
  baseUrl: string,
  isPlaying: boolean
): Promise<void> => {
  try {
    const path = isPlaying
      ? "/v1/playlist/playback/play"
      : "v1/playlist/playback/pause";
    await requestUrl({
      url: new URL(path, baseUrl).href,
      method: "PUT",
    });
  } catch (e) {
    console.error(e);
    new Notice("Could not set sound's playback status");
  }
};

export const getPlaylistPlaybackStatus = async (
  baseUrl: string
): Promise<boolean> => {
  const { json: playback } = (await requestUrl({
    url: new URL("/v1/playlist/playback", baseUrl).href,
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })) as { json: PlaylistPlaybackApiResponse };

  return playback.playing;
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });
  } catch (e) {
    console.error(e);
    new Notice("Could not set sound's playback status");
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });
  } catch (e) {
    console.error(e);
    new Notice("Could not set playlist/track");
  }
};

export const previewItem = async (
  baseUrl: string,
  id: string,
  type: "track" | "sound" | "playlist"
) => {
  if (type === "track") {
    await setPlaylist(baseUrl, id);
  } else {
    await setSoundboardPlaybackStatus(baseUrl, id, true);
  }
};

export const stopPreview = async (
  baseUrl: string,
  type?: "track" | "sound" | "playlist",
  id?: string,
) => {
  // Stop track preview
  if (type === "track") {
    await setPlaylistPlayback(baseUrl, false);
    return;
  }

  // Stop a specific sound preview
  if (type === "sound" && id) {
    await setSoundboardPlaybackStatus(baseUrl, id, false);
    return;
  }

  // Fallback: stop everything
  await setPlaylistPlayback(baseUrl, false);
  let sounds = await getSoundboardPlaybackIDs(baseUrl);
  // Stop all playing sounds using isPlaying
  if (sounds) {
    for (const s of sounds) {
      await setSoundboardPlaybackStatus(baseUrl, s, false);
    }
  }
};