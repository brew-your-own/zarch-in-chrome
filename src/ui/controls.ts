import type { ControlSettings } from '../input';

/** A control as the title screen names it: the key or button, and what it does. */
export interface ControlLabel {
  id: 'tilt' | 'thrust' | 'fire' | 'missile' | 'bomb' | 'refuel' | 'level' | 'pause';
  key: string;
  label: string;
}

const MOUSE: ControlLabel[] = [
  { id: 'tilt', key: 'MOUSE', label: 'tilt' },
  { id: 'thrust', key: 'LEFT', label: 'thrust' },
  { id: 'fire', key: 'RIGHT', label: 'cannon' },
  { id: 'missile', key: 'E', label: 'missile' },
  { id: 'bomb', key: 'SPACE', label: 'smart bomb' },
  { id: 'refuel', key: 'R', label: 'auto-refuel' },
  { id: 'pause', key: 'ESC', label: 'pause' },
];

const TRACKPAD: ControlLabel[] = [
  { id: 'tilt', key: 'SWIPE', label: 'tilt' },
  { id: 'thrust', key: 'SPACE', label: 'thrust' },
  { id: 'fire', key: 'F', label: 'cannon' },
  { id: 'level', key: 'C', label: 'level' },
  { id: 'missile', key: 'E', label: 'missile' },
  { id: 'bomb', key: 'Q', label: 'smart bomb' },
  { id: 'refuel', key: 'R', label: 'auto-refuel' },
  { id: 'pause', key: 'ESC', label: 'pause' },
];

/** The controls of the scheme picked in `controls`, in the order the title screen shows them. */
export function controlLabels(controls: ControlSettings): ControlLabel[] {
  return controls.trackpad ? TRACKPAD : MOUSE;
}

/** One line listing every control, for the settings panel's footer. */
export function controlsHelp(controls: ControlSettings): string {
  return controls.trackpad
    ? 'Swipe the trackpad: tilt craft · Space or left Shift: thrust · F: fire · C: level out · E: missile · Q: smart bomb · R: auto-refuel · Esc: pause / close'
    : 'Move mouse: tilt craft (or A/D turn, W lean, S brake) · Left button, J or Shift: thrust · Right button or K: fire · Middle button / E: missile · Space: smart bomb · R: auto-refuel · Esc: pause / close';
}

/** Says the game is made for a mouse, as the title screen and how to play show it. */
export const MOUSE_NOTE = 'Made for a mouse, like the original.';
