import type { CalendarEvent } from '../../models.ts';

export interface LayoutInput {
  year: number;
  lat: number;
  lon: number;
  /** IANA zone for every clock time on the page */
  tz: string;
  /** Label such as "OHIO", in capitals */
  place: string;
  /** Calendar events that cover the whole year (data/wall-calendar-events.json) */
  events: readonly CalendarEvent[];
}

export interface WheelInput extends LayoutInput {
  ring: 'day' | 'night';
  /** Link the QR code opens. No code is drawn without it. */
  qrUrl?: string;
}
