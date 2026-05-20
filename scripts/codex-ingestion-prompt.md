Use the "Web Search Ingestion V2" skill.

Task:
Run the daily Rhythmjoy dance-event ingestion for future events only.
Swing remains the core collection target, but expanded collection is limited to verified street, salsa, tango, and bachata candidates when a real source post and poster image are available.

Hard constraints:
- Read and follow `.agents/skills/web-search-ingestion/SKILL.md`.
- Do not edit application source code, docs, git history, or configuration during ingestion.
- Do not commit or push.
- Do not ask for approval. Proceed autonomously.
- Keep the whole run within the time budget defined by the skill.
- Use today's date from the local machine.
- Run the mandatory past collected cleanup step before collecting.
- Only insert events that have a verified source URL and a poster image.
- Do not use cropped social preview images as posters. For Instagram, avoid `twitter:image`, `og:image`, `p240x240`, `s640x640`, or URLs with crop parameters such as `stp=c...` unless you have verified that the original post image itself is square and not cut off.
- Before skipping an Instagram candidate for image quality, retry image extraction by opening the individual post URL with a large desktop viewport such as 1600x1200 and deviceScaleFactor 2, then choose the rendered `article img` `currentSrc` with the largest `naturalWidth * naturalHeight`. Small viewport/profile-grid extraction often returns only `p240x240` thumbnails.
- If only a cropped/thumbnail image is still available after that large-viewport retry, skip the candidate and count it as skipped with an image issue. A bad cropped poster is worse than no candidate.
- Preserve already collected data. Do not overwrite `is_collected=true` records.
- Do not insert directly into Supabase `scraped_events` with PostgREST. All candidate inserts must go through `https://swingenjoy.com/.netlify/functions/scraped-events`.
- The Netlify `scraped-events` function is the canonical duplicate gate. It checks both `scraped_events` and the production `events` table and assigns `display_no`.
- Treat a Netlify response with `count: 0` and `skipped` entries as a successful duplicate skip, not as a failed insert.
- Store enough source detail for `/admin/v2/ingestor` to show the candidate, source URL, poster, extracted text, and structured data.
- For every candidate, fill dynamic taxonomy fields when possible:
  - `structured_data.activity_type`: `class`, `social`, `event`, or `recruit`
  - `structured_data.genre_family`: `partner` or `street` for saved candidates. `unknown`, `art`, and `commercial` may be detected only to exclude or re-check them.
  - `structured_data.dance_genre`: e.g. `swing`, `lindyhop`, `wcs`, `salsa`, `tango`, `bachata`, `hiphop`, `waacking`, `popping`, `locking`, `house`, `breaking`, `krump`
  - `structured_data.tags`: only tags actually visible in the source text, such as `audition`, `team_recruit`, `participant`, `choreo`, `workshop`, `battle`, `dj`, `performance`
- Classify auditions, team/crew recruitment, and participant recruitment as `activity_type: "recruit"`, not as a generic event.
- Exclude modern dance, classical/traditional dance, ballet, K-pop, coverdance, heels, and other art/commercial performance candidates from saved ingestion output.

At the end, always print this exact summary block, even on failure:

==TELEGRAM_SUMMARY_START==
신규: N건
스킵: N건
과거데이터삭제: N건
접근불가: source(reason), source(reason)
이슈: none or concise issue text
==TELEGRAM_SUMMARY_END==
