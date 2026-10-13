# GastronoMap — P2 Tahap 11: Social Profile

Status: implemented on `development`; Supabase migration applied.

## Scope

- Public Profile from Community post/comment authors and Leaderboard; the signed-in user's Profile tab now embeds the same social identity directly as its main page.
- Public fields: username, avatar, bio, kota, Verified Contributor, approved-resto/full-review counts. No email, gender, age or role is exposed through the Social Profile API.
- Paginated public Community Posts on Public Profile (24 per load).
- Follow / Unfollow; public follower/following counts and browsable lists (up to 100 newest per list).
- Community → Following displays up to 50 most recent posts from accounts followed by the signed-in user; loads posts via server query, not filtering the global 50-post list.
- New-follower notifications use the existing Notification Center and interaction preference.
- Reuses existing Account/Profile, Community card, and Leaderboard designs. Bottom navigation and restaurant details are unchanged.

## Database migration

`supabase/migrations/20261012222307_p2_11_social_profile.sql`

Applied to the connected GastronoMap Supabase project. The SQL adds `public.user_follows`, three RLS policies, a strictly whitelisted `public_social_profiles` projection, `follow` notification kind, and a trigger to create follow notifications. Changes are additive and existing public contributor/Leaderboard views are not replaced.

The public profile view uses a restricted list of columns rather than direct public read grants on the private `profiles` table. This deliberately remains a definer-owned projection: using `security_invoker` with the current private `profiles` RLS would deny anonymous public profile reads. The Supabase security advisor therefore flags this view; review the explicit column whitelist when extending its schema.

## Rollout and verification

- JS syntax checked for `services.js`, `community.js`, `profile.js`, `social-profile.js` and `events.js`.
- New CSS and JS were linked from `index.html` and the PWA shell cache; cache version is `gastronomap-v149`.
- Database SQL passed a rollback-only migration test including anonymous SELECT access.
- Applied migration was verified: follow table, public view, three policies, notification trigger, and `follow` notification kind exist.
- A rollback-only database test verified follow → notification, self-follow prevention, and authenticated follow insertion/deletion.
- No actual persistent follow relationship or notification was created by the tests.

### Manual UI acceptance checks

1. Open Community as a guest and verify author avatar/name opens Public Profile.
2. Log in as two accounts; Follow and Unfollow between them; verify count changes and new-follower notification.
3. Test Followers and Following lists, including navigation into another Public Profile.
4. Verify Community Following shows only followed authors' newest posts, and switching between Terbaru, Populer, and Di Sekitar still works.
5. Tap a comment author and a Leaderboard contributor; verify that both open Public Profile.
6. Open Profile (self); verify social identity, posts/followers/following, and owned post Edit/Hapus options are displayed directly without a separate Profil Publik overlay.
7. Open Menu Saya; verify Saved, Visited, My Contributions, Riwayat Poin, Reports, Settings, Help & Support, Logout, and Admin tools (admin only).
8. Verify Notifications via the top-right bell, Followers/Following lists, and Back navigation from nested Profile pages.
9. Verify old My Posts is absent, but caption editing and deletion still work from the own-post grid.
10. Test back/Escape, loading/empty/error states, focus, and narrow mobile screens.

## Boundaries

Community feed pagination, unlimited follower lists, block/mute/report user, abuse protection, and recommendations remain future work under P2 Tahap 12/13 and P3. The Following feed currently resolves at most 1,000 followed account IDs. Real-browser interaction and visual checks require manual testing after deployment.

## Profile landing consolidation (13 October 2026)

- The fifth bottom-navigation tab opens the signed-in user's social profile inline, with an Edit Profile action and the public-facing Postingan / Followers / Following counters.
- Private activity pages live under the top-right **Menu Saya** button: Saved (resto/post), Visited, My Contributions, Riwayat Poin, Reports, Settings, Help & Support, and Logout. Notifications are accessible from the top-right bell. Admin moderation tools are restricted to the Admin menu group.
- The former My Posts page and redundant self Profil Publik entry were removed. Owned Community posts have an independent three-dot menu with Edit caption and Hapus actions; other users' public profiles retain Follow and Report Account, without edit/delete controls.
- Profile subpages use browser history entries and preserve scroll/filter state. Restaurant/contribution/reward details and Community post deep links return to their originating Profile subpage.
- No new Supabase tables or policies were required. Private account activity is not added to the public profile projection.
- PWA shell cache updated to `p3-16-20261013-2`.
