import { SearchMatches } from "obsidian";

export interface ObsidianFMSettings {
  baseUrl: string;
}

export interface Sound {
  id: string;
  title: string;
  soundboardName: string;
  isPlaying: boolean;
  loop: boolean;
}

export interface Soundboard {
  id: string;
  title: string;
  sounds: string[];
}

export interface Playlist {
  id: string;
  title: string;
  tracks: string[];
}

export interface Track {
  id: string;
  title: string;
  playlistName: string;
}

export interface SoundboardApiResponse {
  soundboards: [
    {
      id: string;
      title: string;
      background: string;
      sounds: string[];
    }
  ];
  sounds: [
    {
      id: string;
      title: string;
      url: string;
      loop: boolean;
      volume: number;
      fadeIn: number;
      fadeOut: number;
    }
  ];
}

export interface SoundboardPlaybackApiResponse {
  sounds: [
    {
      id: string;
      title: string;
      url: string;
      loop: boolean;
      volume: number;
      fadeIn: number;
      fadeOut: number;
      duration: number; // in seconds
      progress: number; // in seconds
    }
  ];
}

export interface SuggestItem {
  id: string;
  label: string;
  icon?: string;
  subtitle?: string;
  type: MediaType;
}

export type FilteredEntry = {
    item: SuggestItem;
    score: number;
    matches: SearchMatches;
};

export type InsertMode = "normal" | "soundscape";

export type RepeatMode = "off" | "playlist" | "track";

export type MediaType = "track" | "sound" | "playlist" | "soundboard" | "soundscape" | null;

export interface PlaybackSnapshot {
  paused: boolean;
  track: string | null;      // track IDs currently playing
  sounds: string[];      // sound IDs currently playing
  playlistID: string | null;   // playlist IDs currently playing
  soundscapeID: string | null; // active soundscape IDs (usually 0 or 1)
}

export interface InsertResult {
  title?: string;
  trackTitle?: string;
  trackId?: string;
  type?: MediaType;
  stack?: { id: string; label: string }[];
  overrideSettings?: boolean;
  repeat?: "off" | "playlist" | "track" | "default";
  shuffle?: boolean;
  random?: boolean;
  overlapping?: boolean;
  playOnce?: boolean;
  volume?: number;
}

export interface PlaylistPlaybackStatus {
  playing: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: "off" | "playlist" | "track";
  track: {
    id: string;
    url: string;
    title: string;
    duration: number;
    progress: number;
  }
  playlist: {
    id: string;
    title: string;
  }
}

export interface PlaylistApiResponse {
  playlists: [
    {
      id: string;
      tracks: string[];
      background: string;
      title: string;
    }
  ];
  tracks: [
    {
      id: string;
      url: string;
      title: string;
    }
  ];
}