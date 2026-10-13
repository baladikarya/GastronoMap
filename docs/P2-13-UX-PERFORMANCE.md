# P2 Tahap 13 — UX & Performance

Target branch: `development`.

## Implemented

| Area | Changes |
| --- | --- |
| Home restaurant list | In-memory nearby results are paged 24 at a time with a visible load-more button and an IntersectionObserver enhancement. Radius and search/filter changes reset paging. |
| Restaurant data | All restaurant and enrichment tables are fetched through stable 500-row Supabase `.range()` batches rather than relying on the default 1000-row response cap. A failure leaves the previous snapshot in place and exposes a retry in list view. |
| Community feed | Server-backed 12-post pages use deterministic `created_at DESC, id DESC` ordering. Pagination is independent of displayed cards; post deep links remain available. Latest/Following/Popular/Nearby keep their existing controls. |
| Comments | Server-backed 40-comment batches use deterministic creation-time + ID order and preserve the threaded display when subsequent batches arrive. |
| Loading and errors | Community skeletons, accessible loading labels, empty states, retry for interrupted feed/comment pages, and nearby list count/retry. |
| Social UI | Likes, saves, comment likes and new comments respond immediately and roll back on database failures; duplicate in-flight updates are blocked. |
| Images | Community uploads resize full photos to max 1600px JPEG and create 480px JPEG thumbnails. Random immutable storage objects have long cache-control headers, while images decode asynchronously and load lazily. Existing photos retain their original URLs. |
| Accessibility | Community dialog focus cycling/return, focus rings, descriptive labels, more 44px touch targets, reduced-motion skeleton behavior, and semantic locate button. |

## Database rollout

Apply `supabase/migrations/20261013100000_p2_stage13_media_thumbnails.sql` through the normal migration deployment pipeline before measuring thumbnail adoption. Until it is applied, Community automatically falls back to the old `post_media` select/insert shape. Existing media do not need to be migrated.

The app does not delete or mutate existing images. For a post deletion, remove both its full-size images and thumbnails. Images uploaded before the thumbnail migration continue to use their existing full-size URLs.

## Checks to run on a deployed preview

1. Load Home > List with location enabled; verify nearby radius/search/filter resets the list page. Scroll and confirm the next 24 cards are added without duplicates. Test >1000 rows in a staging dataset.
2. Load Community with >50 posts, scroll past page 5, and switch to Following/Latest. Confirm sorting and profile/resto links. Verify loading and network-failure retry with DevTools offline/online.
3. Open a post with >40 comments including replies; advance through pages and verify replies remain under their parents. Add/delete and like comments after paging; check server counts and rollback after an intentionally failed request.
4. Create a post with up to 5 mixed JPG/PNG/WebP files; verify JPEG compressed uploads, thumbnail URLs on the feed, originals on post detail and correct removal when deleting a post. Test on a database before and after the optional column migration.
5. Keyboard-only: tab through the Community post/composer/detail, open/close dialogs, ensure Tab cannot escape an open dialog, Escape closes it and focus returns. Check mobile touch targets, 320px layout, reduced-motion and visible focus.
6. Verify reloading the application does not break map marker clustering, restaurant detail tabs, legacy photo upload, notification center or PWA navigation.

## Limits and tradeoffs

- Home map markers still represent all matching restaurants, so background enrichment data are currently loaded into memory; this stage fixes API row truncation and paginates the List presentation, not a viewport-only spatial query.
- Popular and Nearby are computed over Community pages fetched so far, not all server posts. A server-side ranking/geospatial feed would need dedicated indexes/RPCs in a later discovery stage.
- Older Community posts do not have thumbnails; the browser loads their original image. Existing visit/menu photos are already compressed on upload but lack a dedicated thumbnail column.
- Automated syntax checks do not replace browser/device or production database E2E testing.
