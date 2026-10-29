# PRticket — MVP Integration Audit

Audit date: October 29, 2026

## Catalog coverage

Three official catalog pages were compared:

- /events/es/eventList
- /events/es/listaEventos
- /events/es/frontpage

All three returned the same 35 unique event URLs.
No differences were detected between their extracted catalogs.

This validates the accessible catalog snapshot, not all
future events or undisclosed provider endpoints.

## Publication results

Catalog snapshot before editorial closure:


- 35 current catalog entries inspected.
- 10 distinct music-event source URLs published.
- 11 upcoming published and visible performances.
- 0 duplicate groups by title and start time.
- 1 registered but unpublished comedy event.
- 13 pending-review candidates in the current listing.
- 11 current entries without candidates.
- 2 historical candidates outside the current listing.

## Non-published events

Sports and sports subscriptions:
- cangrejeros26
- changos26
- fiba-2026
- cangrejerasbsnf2026
- abono-cangrejeros-2026

Theater, comedy, dance, magic, or other performances
without a verified music-first program:
- dragacadabra
- mataron-a-pedro
- 2034
- reuniondeclase
- hiphopnutcracker
- montaplatos
- supernatural
- quien-mato-a-rene
- blancotemblor
- santurcia
- nochesdeimpro
- losmasbuscados
- ndi-morovis

Other attractions, facilities, conventions, or activities
without verified music-first evidence:
- makethishappen
- convencionholistica
- entrada
- la-marquesa2
- la-marquesa3
- fincaembrujada
- puertoricosekaijucon

These are audit findings, not database rejections.
Reevaluate any entry if reliable new musical evidence emerges.

## Historical candidates

- batallaenlamontana2: boxing event, not music-first.
- prsalsaweekend: musical event, but October 23-24,
  2026 dates have passed.

## MVP safeguards

- No non-musical candidate is automatically published.
- Unverified venues remain blocked.
- Expired events are excluded from the upcoming feed.
- Multi-performance events retain distinct start times.
- New catalog entries require continued discovery,
  validation, and publication checks.

## Editorial closure — October 29, 2026

Final Supabase review statuses:

- 11 approved candidates.
- 15 rejected candidates with recorded editorial reasons.
- 0 pending-review candidates.

Rejected candidates retain their original evidence and
editorial review history.

The 11 published musical performances were not modified.

## Future source updates

Changed evidence from previously rejected sources can create
a new pending-review candidate.

Unchanged sources are not staged again.
Existing approved events are not automatically duplicated.
Human review and publication safeguards remain required.

## Database changes

The initial catalog audits were read-only.

The final editorial closure updated the review status,
review notes, review timestamp, and editorial evidence of
15 candidates. No published event was modified or deleted.
