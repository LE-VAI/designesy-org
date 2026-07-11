declare module 'cuelume' {
  export type SoundName =
    | 'chime'
    | 'sparkle'
    | 'droplet'
    | 'bloom'
    | 'whisper'
    | 'tick'
    | 'press'
    | 'release'
    | 'toggle'
    | 'success';

  export const sounds: SoundName[];

  export function play(name?: SoundName): void;

  export function setEnabled(enabled: boolean): void;

  export function bind(root?: ParentNode): void;
}