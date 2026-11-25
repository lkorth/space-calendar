/** Entry point of src/site/wall-calendar.js, which `npm run build:site` bundles. Calendars are
 *  drawn in the browser because a Worker on the free plan has 10 ms of CPU time per request,
 *  and drawing one takes more than ten times that. */
export { completeYears, defaultYear, drawWallCalendar, fileName, parseOptions, readLink, writeLink } from './options.ts';
