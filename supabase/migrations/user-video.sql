-- 1. Create Private Bucket for User Videos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-videos',
  'user-videos',
  false, -- MUST be false to prevent unauthorized access
  125829120, -- 120MB limit in bytes
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 125829120,
  allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm'];

-- 2. Storage RLS Policies (Users can only access files in their own folder: user_id/*)
create policy "Users can upload videos to their own directory"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-videos' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view videos in their own directory"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'user-videos' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete videos in their own directory"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-videos' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );