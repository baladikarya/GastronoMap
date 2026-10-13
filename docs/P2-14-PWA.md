# P2 Tahap 14 — Progressive Web App (PWA)

Target: `development`. No database migrations.

## Delivered

| Area | Change |
| --- | --- |
| Service worker | Scoped versioned shell, cache-first HTML/CSS/JS, strict same-origin exact path checking, navigation fallback for `/GastronoMap/` and `index.html`, whitelisted runtime CDN shell dependencies. |
| Cache hygiene | Only `gastronomap-*` caches are removed on activation. Supabase calls, user records, map tiles and uploaded images are not placed in service worker caches. |
| Update | New worker waits. An accessible update notice appears when a waiting worker is available, with `Nanti saja` and `Perbarui` controls. Controller change reloads **only** after explicit user choice. Open Add Resto, Community composer or profile form require confirmation. |
| Manifest | Stable PWA ID / start URL, consistent `#16382A` theme/splash colors and Indonesian language; PNG icon sizes reflect the actual files (the legacy `icon-512.png` is physically 1024×1024). |
| Icon | Existing raster branding is preserved. New 512×512 SVG maskable icon places the existing logo in the central safe circle. |
| Install | Native Chromium `beforeinstallprompt` is offered only when available; install UI hides in standalone mode or when installed. Existing manual Android and iOS guide retained. |
| Connectivity | Small accessible offline notice and retry action, with manual reload protection for open forms. Live restaurant/map information still needs internet. |
| Tests | `node --test tests/*.test.cjs` includes `tests/p2-stage14.test.cjs` and is used in the development preview workflow. |

## Deployment / update behavior

1. GitHub Pages serves static files on HTTPS; the app SW has scope relative to its registration, including a project subpath.
2. Bump `VERSION` in `service-worker.js` on every future *shell asset* release. Commit all changed shell files and version together; do **not** use unversioned network-first shell responses, which can mix deployed releases.
3. On update, the newly installed worker enters `waiting`. Continue working or select **Perbarui**; consent sends `SKIP_WAITING` and reloads on `controllerchange`.
4. The old worker with `skipWaiting()` may activate once during initial migration to the new lifecycle. After this migration, updates are opt-in.
5. The CDN precache is best-effort because third-party networks may be unavailable. App shell can render offline after a successful online install but Supabase data and map tile layers are not offline.
6. Cache Storage cleanup only touches cache names beginning with `gastronomap-`. Installed browser fonts are optional and can fall back to system fonts.

## Required hands-on QA

- Android Chrome: fresh visit, Add to Home Screen/Install; reopen from icon in standalone mode; check correct logo, splash and safe areas.
- iOS Safari: Add to Home Screen, open in standalone, check Apple touch icon and status bar.
- Update while entering a restaurant and composing Community content; check waiting banner, cancel and eventual successful manual update. Verify no involuntary reload.
- Test direct navigation at the GitHub Pages project root both online and offline after SW install. Check app shell loads; use the offline banner when live data fails.
- Enable Disable cache / Offline in DevTools and test CDN-down installation; verify failed optional dependencies do not block SW install but UI appropriately reports connectivity.
- Test two origins/apps sharing Cache Storage (same origin, different scope): ensure `activate` never deletes unrelated cache names.
- Check 320px viewport, VoiceOver/TalkBack, focus, and keyboard usability; confirm `node --test tests/*.test.cjs` completes.

## Limitations

The local app shell is cached but backend records, media uploads, user-private data, and map tiles are intentionally online-only. PWA installability and icon rendering require real-device browser checks; source checks do not replace those tests. The maskable asset is SVG with embedded PNG; compatibility needs validation on target Android launchers. Existing raster icon file name is retained for backward compatibility despite its true 1024px dimensions.
