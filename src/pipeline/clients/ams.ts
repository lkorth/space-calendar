/**
 * Meteor shower data from the American Meteor Society.
 * The AMS publishes a consistent annual shower calendar. Rather than scraping
 * their site on every run, this client provides the curated annual shower list
 * which changes rarely and is updated manually when the AMS revises it.
 *
 * Source: https://www.amsmeteors.org/meteor-showers/meteor-shower-calendar/
 */

export interface MeteorShower {
  name: string;
  /** Month (1-12) of peak activity */
  peakMonth: number;
  /** Day of peak activity */
  peakDay: number;
  /** Parent body (comet or asteroid) */
  parentBody: string;
  /** Expected zenithal hourly rate under ideal conditions */
  zhr: number;
  /** Radiant constellation */
  radiant: string;
  /** URL to AMS shower page */
  url: string;
}

export const ANNUAL_SHOWERS: MeteorShower[] = [
  {
    name: 'Quadrantids',
    peakMonth: 1,
    peakDay: 4,
    parentBody: 'Asteroid 2003 EH1',
    zhr: 120,
    radiant: 'Boötes',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/quadrantids/',
  },
  {
    name: 'Lyrids',
    peakMonth: 4,
    peakDay: 22,
    parentBody: 'Comet C/1861 G1 (Thatcher)',
    zhr: 20,
    radiant: 'Lyra',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/lyrids/',
  },
  {
    name: 'Eta Aquariids',
    peakMonth: 5,
    peakDay: 6,
    parentBody: "Comet 1P/Halley",
    zhr: 50,
    radiant: 'Aquarius',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/eta-aquariids/',
  },
  {
    name: 'Delta Aquariids',
    peakMonth: 7,
    peakDay: 30,
    parentBody: 'Comet 96P/Machholz',
    zhr: 25,
    radiant: 'Aquarius',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/delta-aquariids/',
  },
  {
    name: 'Perseids',
    peakMonth: 8,
    peakDay: 13,
    parentBody: 'Comet 109P/Swift-Tuttle',
    zhr: 100,
    radiant: 'Perseus',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/perseids/',
  },
  {
    name: 'Orionids',
    peakMonth: 10,
    peakDay: 21,
    parentBody: "Comet 1P/Halley",
    zhr: 20,
    radiant: 'Orion',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/orionids/',
  },
  {
    name: 'Leonids',
    peakMonth: 11,
    peakDay: 17,
    parentBody: 'Comet 55P/Tempel-Tuttle',
    zhr: 15,
    radiant: 'Leo',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/leonids/',
  },
  {
    name: 'Geminids',
    peakMonth: 12,
    peakDay: 14,
    parentBody: 'Asteroid 3200 Phaethon',
    zhr: 150,
    radiant: 'Gemini',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/geminids/',
  },
  {
    name: 'Ursids',
    peakMonth: 12,
    peakDay: 22,
    parentBody: 'Comet 8P/Tuttle',
    zhr: 10,
    radiant: 'Ursa Minor',
    url: 'https://www.amsmeteors.org/meteor-showers/meteor-shower-database/ursids/',
  },
];
