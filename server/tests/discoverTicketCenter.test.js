const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractCards, mergeCards, performance, safeUrl } = require('../scripts/discover-ticketcenter');
const fixture = `<div class="dataItem item_background" data-name="CONCIERTO CL&#193;SICO">
<a href="es-PR/shows/concierto/events/2">Info</a>
<div class="description"><div>Concierto <b>en vivo</b></div> con orquesta &amp; solistas</div>
<div class="hall">Sala Sinfónica</div>
<a href="es-PR/events/concierto/2026-11-7_19.00/sala">Comprar</a>
<a href="es-PR/events/concierto/2026-11-7_19.00/sala">Comprar</a>
<a href="es-PR/events/concierto/2026-11-8_16.00/sala">Comprar</a></div>`;
test('extracts nested descriptions, accents and distinct performances in Puerto Rico time', () => {
 const [c] = extractCards(fixture);
 assert.equal(c.title, 'CONCIERTO CLÁSICO');
 assert.equal(c.description, 'Concierto en vivo con orquesta & solistas');
 assert.equal(c.source_url, 'https://tcpr.com/es-PR/shows/concierto/info');
 assert.equal(c.venue, 'Sala Sinfónica');
 assert.equal(c.performances.length, 2);
 assert.equal(c.performances[0].start_at, '2026-11-07T23:00:00.000Z');
 assert.equal(c.safe_to_publish, false);
});
test('merges listings without dropping distinct dates', () => {
 const cards = extractCards(fixture);
 assert.equal(mergeCards([cards,cards]).length, 1);
 assert.equal(mergeCards([cards,cards])[0].performances.length, 2);
});
test('rejects external hosts, credentials and invalid calendar dates', () => {
 for (const url of ['https://evil.test/x','https://tcpr.com.evil.test/','https://u:p@tcpr.com/','http://tcpr.com/']) assert.equal(safeUrl(url),null);
 for (const date of ['2026-2-30_19.00','2026-13-1_19.00','2026-11-7_25.00']) assert.equal(performance(`es-PR/events/test/${date}/sala`), null);
});
test('missing dates remain unresolved and comedy stays unapproved', () => {
 const [c] = extractCards(fixture.replace(/<a href="es-PR\/events[^>]+>Comprar<\/a>/g,'').replace('CONCIERTO CL&#193;SICO','Noche de comedia').replace('Concierto <b>en vivo</b>','Stand-up comedy'));
 assert.equal(c.performances.length,0); assert.equal(c.safe_to_publish,false);
 assert.equal(c.music.non_music_event_detected,true);
});

test('sold-out performances retain official dates from data-clickEvent', () => {
 const sold = fixture.replaceAll('href="es-PR/events/', 'href="javascript:void(0);" data-IsSoldOut="true" data-clickEvent="es-PR/events/');
 const [c] = extractCards(sold);
 assert.equal(c.performances.length,2);
 assert.equal(c.performances[0].start_at,'2026-11-07T23:00:00.000Z');
});
