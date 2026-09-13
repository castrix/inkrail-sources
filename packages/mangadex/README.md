# MangaDex

MangaDex API v5 adapter for Inkrail protocol v1. No account or API key is required for public hosted manga.

## Features

- Search and browse with pagination; latest-uploaded, popular, rating, or alphabetical order; publication-status filtering.
- Localized titles/descriptions, author relationships, covers, and tags.
- Complete chapter-feed pagination for the selected language, flattened into Inkrail's ordered manga page list. Non-hosted/external chapters and empty uploads are skipped. Numbered duplicate scanlations are reduced to the oldest available release for the same volume/chapter/language. Unnumbered chapters retain distinct IDs.
- Original and data-saver images. Stable chapter UUID/page locators resolve through MangaDex@Home when read, so stored downloads do not rely on expiring CDN URLs. Failed image nodes are refreshed once. Volunteer image-node load outcomes are reported to MangaDex as required by its API documentation; reports contain image URL, outcome, byte count, timing, and cache status, never credentials.
- Per-process API pacing, MangaDex@Home pacing, cancellation, bounded image responses, and rate-limit cooldown errors.

## Settings

Language defaults to `en`; enter a MangaDex language code such as `id`, `ja`, or `pt-br` for another edition. Library identities include the language, so changing this setting does not mix chapters into books already saved in another language.

MangaDex is classified as a non-adult source (`SAFE`) and appears in the normal source list and global search. Maximum content rating defaults to `suggestive` (safe + suggestive); choose safe, erotica, or pornographic to change it. This source classification controls visibility in Inkrail; individual titles can have different MangaDex content ratings.

Image quality defaults to `original`; choose `data-saver` for smaller images. Existing downloaded pages are retained; quality changes affect newly resolved page manifests/downloads.

Use a `https://mangadex.org/title/<uuid>/...` URL when importing. A chapter URL is not a title identity. Version 1.1.0 adds an optional `mangaChapters` directory with chapter titles and stable page IDs. Updated Inkrail clients show a chapter list with reading and download controls. Older clients can still use the continuous page list; existing page IDs and ordering are unchanged. The adapter refuses incomplete or over-limit feeds instead of importing a partial book silently.

## Network access

The adapter inherits Inkrail's DNS override settings. Cloudflare DNS-over-HTTPS is enabled by default; use the launcher's Advanced settings to disable it or choose compatible resolvers. Standalone runners can set `SCRAPER_DNS_ENABLED` and `SCRAPER_DNS_SERVERS` before startup. DNS override does not resolve every network access failure. Source-local test utilities under ignored `work/` are not part of the package.

## References

- [MangaDex API documentation](https://api.mangadex.org/docs/)
- [Retrieving chapter images and image-node reports](https://api.mangadex.org/docs/04-chapter/retrieving-chapter)
- [Chapter feed](https://api.mangadex.org/docs/04-chapter/feed/)
