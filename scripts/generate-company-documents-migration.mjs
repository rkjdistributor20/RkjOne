import fs from 'node:fs';
import path from 'node:path';

const root = 'C:/Users/ashik/OneDrive/Desktop/RKJ ONE';
const out = 'C:/Users/ashik/OneDrive/Desktop/RKJ_ONE_Production_Pack/supabase/migrations/00089_legal_entity_documents_from_company_folder.sql';

const companyMap = new Map([
 ['RKJ DISTRIBUTOR SDN BHD', 'RKJ_DIST'],
 ['ROTI KAYA JUNUS', 'RKJ'],
 ['ROTI KAYA JUNUS MANUFACTURING SDN', 'RKJ_MFG'],
]);

function walk(dir, acc = []) {
 for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
 const full = path.join(dir, entry.name);
 if (entry.isDirectory()) walk(full, acc);
 else if (!entry.name.toLowerCase().endsWith('.lnk')) acc.push(full);
 }
 return acc;
}

function sql(value) {
 if (value == null) return 'NULL';
 return `'${String(value).replace(/'/g, "''")}'`;
}

function documentType(relativePath, fileName) {
 const text = `${relativePath} ${fileName}`.toUpperCase();
 if (text.includes('HALAL')) return 'HALAL';
 if (text.includes('KKM') || text.includes('PENDAFTARAN KKM')) return 'KKM';
 if (text.includes('CAWANGAN')) return 'BRANCH';
 if (text.includes('SSM') || text.includes('SECTION') || text.includes('SEC ') || text.includes('MYPT') || text.includes('IP0459147')) return 'SSM';
 if (text.includes('LESEN') || text.includes('PERMIT') || text.includes('LOO') || text.includes('RECEIPT')) return 'LICENSE';
 if (text.includes('SENARAI DOKUMEN')) return 'EQUIPMENT';
 return 'OTHER';
}

function titleFromFile(fileName) {
 return path
 .basename(fileName, path.extname(fileName))
 .replace(/[_]+/g, ' ')
 .replace(/\s+/g, ' ')
 .trim();
}

const rows = [];
for (const [folder, code] of companyMap) {
 const dir = path.join(root, folder);
 for (const file of walk(dir)) {
 const relativePath = path.relative(root, file).replace(/\\/g, '/');
 const parts = relativePath.split('/');
 const branch = parts[1] === 'Cawangan' ? parts[2] ?? null : null;
 const fileName = path.basename(file);
 rows.push({
 code,
 branch,
 type: documentType(relativePath, fileName),
 title: titleFromFile(fileName),
 fileName,
 folderPath: path.dirname(relativePath).replace(/\\/g, '/'),
 });
 }
}

rows.sort(
 (a, b) =>
 a.code.localeCompare(b.code) ||
 String(a.branch ?? '').localeCompare(String(b.branch ?? '')) ||
 a.type.localeCompare(b.type) ||
 a.title.localeCompare(b.title)
);

let body = `-- Daftar dokumen syarikat daripada folder RKJ ONE

CREATE TABLE IF NOT EXISTS legal_entity_documents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 legal_entity_id UUID NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
 branch_name TEXT,
 document_type TEXT NOT NULL DEFAULT 'OTHER',
 title TEXT NOT NULL,
 file_name TEXT NOT NULL,
 source_path TEXT,
 folder_path TEXT,
 issue_date DATE,
 expiry_date DATE,
 status TEXT NOT NULL DEFAULT 'ACTIVE',
 notes TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, legal_entity_id, branch_name, file_name)
);

CREATE INDEX IF NOT EXISTS idx_legal_entity_documents_org ON legal_entity_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_legal_entity_documents_entity ON legal_entity_documents(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_legal_entity_documents_type ON legal_entity_documents(document_type);

ALTER TABLE legal_entity_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_entity_documents_read ON legal_entity_documents;
CREATE POLICY legal_entity_documents_read ON legal_entity_documents
 FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS legal_entity_documents_admin ON legal_entity_documents;
CREATE POLICY legal_entity_documents_admin ON legal_entity_documents
 FOR ALL USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN','ADMIN','HR')))
 WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('SUPER_ADMIN','ADMIN','HR')));

WITH doc_rows(entity_code, branch_name, document_type, title, file_name, folder_path, notes) AS (
 VALUES
`;

body += rows
 .map(
 (row) =>
 ` (${sql(row.code)}, ${sql(row.branch)}, ${sql(row.type)}, ${sql(row.title)}, ${sql(row.fileName)}, ${sql(row.folderPath)}, ${sql('Diindeks daripada folder RKJ ONE pada 2026-06-28')})`
 )
 .join(',\n');

body += `
)
INSERT INTO legal_entity_documents (organization_id, legal_entity_id, branch_name, document_type, title, file_name, folder_path, notes, status)
SELECT o.id, le.id, d.branch_name, d.document_type, d.title, d.file_name, d.folder_path, d.notes, 'ACTIVE'
FROM doc_rows d
JOIN organizations o ON o.code = 'RKJ'
JOIN legal_entities le ON le.organization_id = o.id AND le.code = d.entity_code
ON CONFLICT (organization_id, legal_entity_id, branch_name, file_name) DO UPDATE SET
 document_type = EXCLUDED.document_type,
 title = EXCLUDED.title,
 folder_path = EXCLUDED.folder_path,
 notes = EXCLUDED.notes,
 status = 'ACTIVE',
 updated_at = now();
`;

fs.writeFileSync(out, body);
console.log(
 JSON.stringify(
 {
 out,
 count: rows.length,
 byCompany: rows.reduce((acc, row) => {
 acc[row.code] = (acc[row.code] ?? 0) + 1;
 return acc;
 }, {}),
 },
 null,
 2
 )
);
