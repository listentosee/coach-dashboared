-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to upload team images
CREATE POLICY "Allow authenticated uploads to team-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'team-images'
);

-- Policy to allow authenticated users to view team images
CREATE POLICY "Allow authenticated access to team-images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'team-images'
);

-- Policy to allow authenticated users to update team images
CREATE POLICY "Allow authenticated updates to team-images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'team-images'
);

-- Policy to allow authenticated users to delete team images
CREATE POLICY "Allow authenticated deletes to team-images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'team-images'
);
