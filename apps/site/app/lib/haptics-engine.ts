/**
 * Designesy haptics engine — thin owner over web-haptics.
 *
 * Preference and role mapping live here; the library only vibrates.
 * Desktop / unsupported browsers: no-ops. Toggle UI stays hidden.
 * Dynamic import keeps SSR free of Vibration / window access.
 */

export const HAPTICS_STORAGE_KEY = 'designesy:haptics';

/** Acoustic cue → restrained haptic preset (press / tap only, never hover spam). */
export type HapticRole =
  | 'press'
  | 'release'
  | 'success'
  | 'error'
  | 'brand'
  | 'nav'
  | 'invite'
  | 'toggle'
  | 'contact'
  | 'reveal'
  | 'list';

type PresetName =
  | 'success'
  | 'warning'
  | 'error'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'soft'
  | 'rigid'
  | 'selection'
  | 'nudge'
  | 'buzz';

const ROLE_PRESET: Record<HapticRole, PresetName> = {
  press: 'light',
  release: 'soft',
  success: 'success',
  error: 'error',
  brand: 'selection',
  nav: 'selection',
  invite: 'soft',
  toggle: 'rigid',
  contact: 'soft',
  reveal: 'medium',
  list: 'selection',
};

/** Map Cuelume cue names (and bare press/release) to haptic roles. */
export function cueToHapticRole(cue: string | null | undefined): HapticRole {
  switch (cue) {
    case 'sparkle':
      return 'brand';
    case 'tick':
      return 'nav';
    case 'chime':
      return 'invite';
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'toggle':
      return 'toggle';
    case 'droplet':
      return 'contact';
    case 'bloom':
      return 'reveal';
    case 'whisper':
      return 'list';
    case 'release':
      return 'release';
    case 'press':
    default:
      return 'press';
  }
}

type WebHapticsInstance = {
  trigger: (input?: string) => Promise<void>;
  cancel: () => void;
  destroy: () => void;
};

type WebHapticsCtor = {
  new (options?: { debug?: boolean; showSwitch?: boolean }): WebHapticsInstance;
  isSupported: boolean;
};

let Ctor: WebHapticsCtor | null = null;
let instance: WebHapticsInstance | null = null;
let enabled = true;
let supportKnown = false;
let supported = false;
let loadPromise: Promise<void> | null = null;

function detectNativeSupport(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return typeof navigator.vibrate === 'function';
}

async function ensureLib(): Promise<void> {
  if (Ctor || typeof window === 'undefined') return;
  if (!loadPromise) {
    loadPromise = import('web-haptics')
      .then((mod) => {
        Ctor = mod.WebHaptics as unknown as WebHapticsCtor;
      })
      .catch(() => {
        Ctor = null;
        supported = false;
        supportKnown = true;
      });
  }
  await loadPromise;
}

export function isHapticsSupported(): boolean {
  if (!supportKnown) {
    supported = detectNativeSupport();
    supportKnown = true;
  }
  return supported;
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
  if (!value && instance) {
    try {
      instance.cancel();
    } catch {
      // ignore
    }
  }
}

export function getHapticsEnabled(): boolean {
  return enabled;
}

function getEngineSync(): WebHapticsInstance | null {
  if (!isHapticsSupported() || !Ctor) return null;
  if (!instance) {
    try {
      instance = new Ctor({ debug: false, showSwitch: false });
    } catch {
      supported = false;
      return null;
    }
  }
  return instance;
}

export function triggerHaptic(role: HapticRole = 'press'): void {
  if (!enabled || !isHapticsSupported()) return;

  const preset = ROLE_PRESET[role] ?? 'light';

  // Prefer sync path once library is warm; otherwise fire after dynamic import.
  const engine = getEngineSync();
  if (engine) {
    try {
      void engine.trigger(preset);
    } catch {
      // best-effort
    }
    return;
  }

  void ensureLib().then(() => {
    if (!enabled) return;
    const late = getEngineSync();
    if (!late) return;
    try {
      void late.trigger(preset);
    } catch {
      // best-effort
    }
  });
}

export function triggerHapticForCue(cue: string | null | undefined): void {
  triggerHaptic(cueToHapticRole(cue));
}

export function destroyHaptics(): void {
  if (instance) {
    try {
      instance.destroy();
    } catch {
      // ignore
    }
    instance = null;
  }
}

/** Warm the library on first client gesture opportunity (optional). */
export function warmHaptics(): void {
  if (!isHapticsSupported()) return;
  void ensureLib();
}
