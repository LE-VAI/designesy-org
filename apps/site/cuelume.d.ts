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

  // 'error' is provided by cuelume-extend.ts, not the base package.
  // Include it here so TS accepts data-cuelume-*="error" attributes.

  export const sounds: SoundName[];

  export function play(name?: SoundName): void;

  export function setEnabled(enabled: boolean): void;

  export function bind(root?: ParentNode): void;
}