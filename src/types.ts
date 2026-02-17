export interface KenkuFmSettings {
  baseUrl: string;
}

export interface Sound {
  id: string;
  title: string;
  soundboardName: string;
  isPlaying: boolean;
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
    }
  ];
}

export interface PlaylistPlaybackApiResponse {
  playing: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: string;
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