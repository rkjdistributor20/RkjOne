import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
 const env = {};
 for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
 const trimmed = line.trim();
 if (!trimmed || trimmed.startsWith('#')) continue;
 const index = trimmed.indexOf('=');
 if (index < 0) continue;
 env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '');
 }
 return env;
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
 .from('legal_entity_documents')
 .select('document_type, storage_path, legal_entity:legal_entities(code)');

if (error) throw error;

const summary = { total: data.length, withStorage: 0, byCompany: {}, byType: {} };
for (const row of data) {
 const legalEntity = Array.isArray(row.legal_entity) ? row.legal_entity[0] : row.legal_entity;
 const code = legalEntity?.code ?? 'UNKNOWN';
 summary.byCompany[code] ??= { total: 0, withStorage: 0 };
 summary.byCompany[code].total += 1;
 if (row.storage_path) {
 summary.withStorage += 1;
 summary.byCompany[code].withStorage += 1;
 }
 summary.byType[row.document_type] = (summary.byType[row.document_type] ?? 0) + 1;
}

console.log(JSON.stringify(summary, null, 2));
