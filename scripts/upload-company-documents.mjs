import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.join('C:', 'Users', 'ashik', 'OneDrive', 'Desktop', 'RKJ ONE');
const BUCKET = 'company-documents';

function loadEnv() {
 const env = {};
 for (const file of ['.env', '.env.local']) {
 if (!fs.existsSync(file)) continue;
 for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
 const trimmed = line.trim();
 if (!trimmed || trimmed.startsWith('#')) continue;
 const index = trimmed.indexOf('=');
 if (index < 0) continue;
 env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '');
 }
 }
 return { ...env, ...process.env };
}

function safeFileName(name) {
 return name
 .replace(/[^\w.\-() ]+/g, '-')
 .replace(/\s+/g, ' ')
 .trim()
 .slice(0, 160);
}

function mimeType(fileName) {
 const ext = path.extname(fileName).toLowerCase();
 if (ext === '.pdf') return 'application/pdf';
 if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 if (ext === '.xls') return 'application/vnd.ms-excel';
 if (ext === '.png') return 'image/png';
 if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
 return 'application/octet-stream';
}

async function ensureBucket(supabase) {
 const { data } = await supabase.storage.getBucket(BUCKET);
 if (data?.name) return;
 const { error } = await supabase.storage.createBucket(BUCKET, {
 public: false,
 fileSizeLimit: 50 * 1024 * 1024,
 });
 if (error && !error.message.includes('already exists')) throw error;
}

const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
 console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
 process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
 auth: { persistSession: false },
});

await ensureBucket(supabase);

const { data: docs, error } = await supabase
 .from('legal_entity_documents')
 .select('id, file_name, folder_path, storage_path, legal_entity:legal_entities(code)')
 .eq('status', 'ACTIVE');
if (error) throw error;

let uploaded = 0;
let skipped = 0;
let missing = 0;

for (const doc of docs ?? []) {
 const legalEntity = Array.isArray(doc.legal_entity) ? doc.legal_entity[0] : doc.legal_entity;
 const code = legalEntity?.code ?? 'UNKNOWN';
 const localPath = path.join(ROOT, doc.folder_path ?? '', doc.file_name);
 if (!fs.existsSync(localPath)) {
 missing += 1;
 continue;
 }
 if (doc.storage_path) {
 skipped += 1;
 continue;
 }

 const fileBuffer = fs.readFileSync(localPath);
 const objectPath = `${code}/${doc.id}-${safeFileName(doc.file_name)}`;
 const type = mimeType(doc.file_name);
 const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(objectPath, fileBuffer, {
 contentType: type,
 upsert: true,
 });
 if (uploadErr) throw uploadErr;

 const { error: updateErr } = await supabase
 .from('legal_entity_documents')
 .update({
 storage_path: objectPath,
 file_size: fileBuffer.length,
 mime_type: type,
 source_path: null,
 updated_at: new Date().toISOString(),
 })
 .eq('id', doc.id);
 if (updateErr) throw updateErr;
 uploaded += 1;
}

console.log(JSON.stringify({ bucket: BUCKET, uploaded, skipped, missing, total: docs?.length ?? 0 }, null, 2));
