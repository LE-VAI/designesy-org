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

  // From cuelume 0.2.6: resumes the shared AudioContext from a user gesture
  // and plays nothing. Resolves true once cues can sound; false while the
  // browser reports no gesture yet, has no Web Audio, or refuses the resume;
  // never rejects. Where the browser cannot report a gesture, the resume may
  // wait for a later one.
  export function unlock(): Promise<boolean>;

  // From cuelume 0.2.6, bind() returns a function that unbinds.
  export function bind(root?: ParentNode): () => void;
}