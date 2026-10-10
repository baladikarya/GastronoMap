-- Fix Community replies and preserve other users' replies on parent deletion.
-- The previous insert policy resolved an unqualified parent_id against the inner
-- comments alias (c.parent_id), rejecting legitimate replies.
begin;

drop policy if exists "comments self insert" on public.comments;
create policy "comments self insert"
on public.comments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    parent_id is null
    or exists (
      select 1
      from public.comments as parent_comment
      where parent_comment.id = comments.parent_id
        and parent_comment.post_id = comments.post_id
    )
  )
);

-- Delete only the owner's comment. Existing child replies become top-level
-- comments instead of being deleted by a cascading parent foreign key.
alter table public.comments drop constraint if exists comments_parent_id_fkey;
alter table public.comments
  add constraint comments_parent_id_fkey
  foreign key (parent_id) references public.comments(id) on delete set null;

commit;
