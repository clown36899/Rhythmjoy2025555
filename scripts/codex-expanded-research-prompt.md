Use the "Web Search Ingestion V2" skill.

Task:
Run expanded dance-scene research only for salsa, bachata, tango, and street. This is not a daily ingestion run.

Hard constraints:
- Read and follow `.agents/skills/web-search-ingestion/SKILL.md`.
- Treat `scripts/ingestion/collection-registry.mjs` as the machine-readable source registry.
- Use `getAutomationSourceList('expanded-research')`.
- Do not insert, update, or delete Supabase rows.
- Do not upload images to Supabase Storage.
- Do not call `https://swingenjoy.com/api/scraped-events`.
- Do not commit or push.
- Do not edit application source code, git history, or configuration.
- You may update only `docs/INGESTION_STATUS.md` if you need to preserve a concise research log.
- Use actual source pages only. Do not invent scenes, venues, classes, or recurring schedules from assumptions.

Research goals:
- For each scope (`salsa`, `bachata`, `tango`, `street`), identify reliable official sources, event hubs, recurring social/class patterns, and image availability.
- Treat event discovery as evidence for a broader scene map, not as the final result. The research should explain how each dance scene operates: activity mix, population/activity level, beginner entry path, organizer structure, revenue routes, venue ecosystem, class/social/event/recruit balance, and whether the scene is academy-led, venue-led, crew-led, or amateur-community-led.
- Classify each source as one of:
  - `verified-source`: official source with dates, venue, source URL, and poster/image access.
  - `candidate-source`: source likely useful but needs login, manual validation, or source-route refinement.
  - `discovery-only`: useful for finding official posts but not acceptable as the saved source.
  - `reject`: off-scope, art/commercial performance, news/public-office source, no real event detail, or unstable page.
- For street sources, distinguish battles/recruitment from academy evergreen class pages. Save none; just report whether a real dated 모집/워크샵 route exists.
- For partner-dance sources, distinguish classes, socials, milongas/practicas, parties, and recruitment.
- Note whether poster extraction can produce a non-cropped image.

Scene-map evidence to report per genre:
- `activity_mix`: rough balance of class/social/event/recruit based on observed official sources.
- `activity_level`: evidence of current population or activity level such as weekly socials, class cohorts, capacity notes, sold-out posts, comments, recurring schedules, or inactive channels.
- `entry_path`: how beginners or new participants appear to join.
- `organizer_model`: academy, venue/bar, instructor duo, club, crew, event promoter, or loose community.
- `revenue_model`: class fee, social entry fee, party ticket, workshop fee, rental/venue business, audition/recruitment, or unclear.
- `venue_map`: repeated venues and whether map/location data is reliable.
- `source_reliability`: which sources should be promoted, watched, rejected, or used only for discovery.
- `open_questions`: unknowns that require another research pass.

Output format:
Print the summary block at the end even if nothing useful is found.

==TELEGRAM_SUMMARY_START==
신규: 0건
스킵: N건
과거데이터삭제: 0건
접근불가: source(reason), source(reason)
이슈: expanded research only; concise findings
==TELEGRAM_SUMMARY_END==
