ALTER TABLE legal_entity_documents
 ADD COLUMN IF NOT EXISTS storage_path TEXT,
 ADD COLUMN IF NOT EXISTS file_size BIGINT,
 ADD COLUMN IF NOT EXISTS mime_type TEXT;

CREATE INDEX IF NOT EXISTS idx_legal_entity_documents_storage_path
 ON legal_entity_documents(storage_path)
 WHERE storage_path IS NOT NULL;

COMMENT ON COLUMN legal_entity_documents.storage_path IS 'Private Supabase Storage object path for download';
COMMENT ON COLUMN legal_entity_documents.file_size IS 'File size in bytes when uploaded to storage';
COMMENT ON COLUMN legal_entity_documents.mime_type IS 'Uploaded document MIME type';
