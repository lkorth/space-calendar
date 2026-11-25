/** Whether JGAP's registration page should be listing programs. Used by the tests that read
 *  live JGAP data, so that an empty page fails them only when it signals a problem.
 *
 *  The club runs programs on Friday and Saturday nights from early March until the weekend
 *  before Thanksgiving (the fourth Thursday of November), and the page lists only upcoming
 *  ones. The season ends as that last Saturday begins, because the page may drop the final
 *  program at any point that day. */
export function jgapInSeason(now: Date): boolean {
  const year = now.getUTCFullYear();
  const opens = Date.UTC(year, 2, 1);
  const novemberFirstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const thanksgiving = 1 + ((4 - novemberFirstWeekday + 7) % 7) + 21;
  const closes = Date.UTC(year, 10, thanksgiving - 5);
  return now.getTime() >= opens && now.getTime() < closes;
}
