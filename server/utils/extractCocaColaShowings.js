function extractCocaColaShowings(html) {
  const text = String(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ');

  const section = text.split(/\bShowings\b/i)[1];
  if (!section) return [];

  const body = section.split(/\bEvent Details\b/i)[0];
  const pattern = /\b([A-Za-z]{3,9})\s+(\d{1,2})\s*,\s*(\d{4})\s*\|\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+((?:0?[1-9]|1[0-2]):[0-5]\d\s*[AP]M)\b/gi;
  const months = ['jan','feb','mar','apr','may','jun',
    'jul','aug','sep','oct','nov','dec'];
  const days = ['sunday','monday','tuesday','wednesday',
    'thursday','friday','saturday'];
  const results = new Map();

  for (const match of body.matchAll(pattern)) {
    const [, month, day, year, weekday, time] = match;
    const monthIndex = months.indexOf(month.slice(0, 3).toLowerCase());
    const date = new Date(Date.UTC(+year, monthIndex, +day));

    if (
      monthIndex < 0 ||
      date.getUTCFullYear() !== +year ||
      date.getUTCMonth() !== monthIndex ||
      date.getUTCDate() !== +day ||
      days[date.getUTCDay()] !== weekday.toLowerCase()
    ) {
      throw new Error('Fecha de función contradictoria.');
    }

    const record = {
      date: `${month} ${day}, ${year}`,
      time: time.replace(/\s+/g, ' ').toUpperCase()
    };
    results.set(JSON.stringify(record), record);
  }
  return [...results.values()];
}

module.exports = { extractCocaColaShowings };
