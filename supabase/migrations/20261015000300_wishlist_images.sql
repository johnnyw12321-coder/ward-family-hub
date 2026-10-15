-- =============================================================================
-- Wishlist pictures and link previews
--
-- An item can have one picture: a photo someone took, or the preview image of
-- its link (fetched and copied server-side, so it survives the shop page
-- changing). Pictures live in the private "wishlist" bucket at
-- {household}/{item}/{file} and follow the item's own visibility, so a
-- surprise's photo is as hidden from its recipient as the surprise itself.
-- =============================================================================

alter table public.wish_items
  add column image_path   text check (char_length(image_path) <= 200),
  add column image_source text check (image_source in ('photo', 'link')),
  add column link_title   text check (char_length(link_title) <= 200),
  add column link_site    text check (char_length(link_site) <= 120),
  add constraint wish_items_image_source check ((image_path is null) = (image_source is null));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wishlist', 'wishlist', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Who may add or remove an item's picture: the same people who may edit it.
-- The subquery runs with the caller's RLS, so an item they can't see never matches.
create or replace function private.can_edit_wish_item(p_household uuid, p_item uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.wish_items i
    where i.id = p_item
      and i.household_id = p_household
      and (i.owner_user_id is null
           or (i.owner_user_id = (select auth.uid()) and not i.is_surprise)
           or (i.owner_user_id <> (select auth.uid()) and i.is_surprise))
  );
$$;
revoke all on function private.can_edit_wish_item(uuid, uuid) from public;
grant execute on function private.can_edit_wish_item(uuid, uuid) to authenticated, service_role;

-- "name" is qualified as objects.name throughout (see the documents bucket).
create policy wishlist_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wishlist'
    and private.storage_path_part(objects.name, 1) in (select private.writer_household_ids())
    and private.can_edit_wish_item(private.storage_path_part(objects.name, 1), private.storage_path_part(objects.name, 2))
  );

-- Read: anyone who can see the item (RLS on wish_items hides surprises from their recipient).
create policy wishlist_bucket_select on storage.objects for select to authenticated
  using (
    bucket_id = 'wishlist'
    and private.storage_path_part(objects.name, 1) in (select private.member_household_ids())
    and exists (
      select 1 from public.wish_items i
      where i.id = private.storage_path_part(objects.name, 2)
        and i.household_id = private.storage_path_part(objects.name, 1)
    )
  );

create policy wishlist_bucket_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'wishlist'
    and private.storage_path_part(objects.name, 1) in (select private.writer_household_ids())
    and private.can_edit_wish_item(private.storage_path_part(objects.name, 1), private.storage_path_part(objects.name, 2))
  );
-- No update policy: pictures are replaced, never modified.
