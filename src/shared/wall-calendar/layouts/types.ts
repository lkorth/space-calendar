import type { CalendarEvent } from '../../models.ts';
import type { PageShape } from '../svg.ts';
import type { TextTurn } from '../text.ts';

export interface LayoutInput {
  year: number;
  lat: number;
  lon: number;
  /** IANA zone for every clock time on the page */
  tz: string;
  /** Label to print, in capitals */
  place: string;
  /** Calendar events that cover the whole year (data/wall-calendar-events.json) */
  events: readonly CalendarEvent[];
}

export interface WheelInput extends LayoutInput {
  ring: 'day' | 'night';
  text?: TextTurn;
  /** A circle has no corners, so it has no title, key or QR code. */
  shape?: PageShape;
  /** Link the QR code opens. No code is drawn without it. */
  qrUrl?: string;
}
