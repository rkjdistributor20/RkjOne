import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv(file) {
 const out = {};
 for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
 const t = line.trim();
 if (!t || t.startsWith('#')) continue;
 const i = t.indexOf('=');
 if (i > 0) out[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, '');
 }
 return out;
}

const env = { ...loadEnv('.env.local'), ...process.env };
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
 auth: { persistSession: false, autoRefreshToken: false },
});
const DEFAULT_PASSWORD = process.env.RKJ_AGENT_INITIAL_PASSWORD?.trim();
if (!DEFAULT_PASSWORD) throw new Error('RKJ_AGENT_INITIAL_PASSWORD is required');

const agents = [
 { code: 'AG001', full_name: 'Ahmad Bin Hussein', pic: 'Ahmad BSP', company: 'MAD MARIANI ENTERPRISE', registration_no: 'SSM Tamat (2023)', driver: 'Abdul Samad / Nadzir', location: 'Kuala Lumpur', status: 'ACTIVE', notes: 'SSM tamat' },
 { code: 'AG002', full_name: 'Mohd Hizaini Bin Mohd Hariri', pic: 'Iqwan', company: 'Iqwan Agent', registration_no: 'Tiada SSM', driver: 'Abdul Samad / Nadzir', location: 'Kuala Lumpur', status: 'ACTIVE' },
 { code: 'AG003', full_name: 'Azim Bin Mohammed Anol', pic: 'Azim', company: 'SGB EMPIRE', registration_no: '202503172733 (003745469-M)', driver: 'Abdul Samad / Nadzir', location: 'Kuala Lumpur', status: 'ACTIVE' },
 { code: 'AG004', full_name: 'Muhammad Nur Aiman Syafiq Bin Mohd Suhaimi', pic: 'Syafiq', company: 'ETIKA MURNI TRADING', registration_no: '202503278365 (CT0155742-H)', driver: 'Fadzil / Azrul', location: 'Temerloh, Pahang', status: 'ACTIVE' },
 { code: 'AG005', full_name: 'Abdul Rahman Adib Bin Muhammad Zulkarami', pic: 'Adib', company: 'ADZ RETAILS AND SERVICES', registration_no: '202503338755 (TR0333958-K)', driver: 'Abdul Samad / Nadzir', location: 'MSU', status: 'ACTIVE' },
 { code: 'AG006', full_name: 'Wan Muhammad Ikhwan Bin Wan Nasaruddin', pic: 'Wan', company: 'AZIZANOSMAN ENTERPRISE', registration_no: '201103029863 (IP0341523-P)', driver: 'Farid / Anuar', location: 'TF Tambun, Ipoh', status: 'ACTIVE', notes: 'Status asal: Kurang Aktif' },
 { code: 'AG007', full_name: 'Nur Nadiah Ulfah Binti Mohd Tejuddin', pic: 'Nadeeya', company: 'NADEEYA TEEJAY ENTERPRISE', registration_no: '202503167312 (JM1025056-D)', driver: 'Farid / Anuar', location: 'WCE Lekir', status: 'ACTIVE' },
 { code: 'AG008', full_name: 'Noor Azimah Binti Masri', pic: 'Aziey', company: 'AZIEY & NAIM ENTERPRISE', registration_no: '202203226841 (KT0530090-M)', driver: 'Farid / Anuar', location: 'WCE Sg. Nyior', status: 'ACTIVE' },
 { code: 'AG009', full_name: 'Ajit Ali Bin Usinatullah', pic: 'Ajit Ali', company: 'K & L HUMAYRA ENTERPRISE', registration_no: '202303165972 (003507244-V)', driver: 'Farid / Anuar', location: 'TF Batu Gajah', status: 'ACTIVE', notes: 'SSM tamat' },
 { code: 'AG010', full_name: 'Mohmad Rizal Bin Mohamad Saad', pic: 'Rizal', company: 'RYZAL EMPIRE', registration_no: '202603023372 (JR0186903-K)', driver: 'Farid / Anuar', location: 'Manjung', status: 'ACTIVE' },
 { code: 'AG011', full_name: 'Mohamad Shahrul Azril', pic: 'Bapoi', company: 'Bapoi Agent', registration_no: 'Tiada SSM', driver: 'Fadzil / Azrul', location: 'Kuala Lumpur', status: 'ACTIVE' },
 { code: 'AG012', full_name: 'Agent Khas 01 - Muhd', pic: 'Muhd', company: 'Agent Khas 01 Muhd', registration_no: 'Tiada SSM', driver: 'Anuar / Driver Kilang', location: 'WCE Teluk Intan, Hutan Melintang, Van 1, Van 2, Mydin RTC Gopeng', status: 'ACTIVE' },
 { code: 'AG013', full_name: 'Agent Khas 01 - Aisha Ahmad', pic: 'Aisha Ahmad', company: 'Agent Khas 01 Aisha Ahmad', registration_no: 'Tiada SSM', driver: 'Ahmad Niza', location: 'Petron Behrang', status: 'ACTIVE' },
];

const priceGroups = [
 { code: 'EJEN_TIDAK_BERDAFTAR', name: 'Ejen Tidak Berdaftar', description: 'Harga ejen tidak berdaftar', is_default: false, rates: { 'ST-PLANTA': ['ROTI PLANTA / 20 pcs', 27.50], 'ST-BENGGALI': ['ROTI BENGGALI / 2 pcs', 11.00], 'ST-KELAPA': ['ROTI KELAPA / 28 pcs', 41.00], 'ST-KACANG': ['ROTI KACANG / 24 pcs', 41.00], 'ST-KAYA': ['KAYA / 1 kg', 17.00] } },
 { code: 'EJEN_BERDAFTAR', name: 'Ejen Berdaftar', description: 'Harga rasmi ejen berdaftar RKJ Distributor', is_default: true, rates: { 'ST-PLANTA': ['ROTI PLANTA / 20 pcs', 25.50], 'ST-BENGGALI': ['ROTI BENGGALI / 2 pcs', 9.00], 'ST-KELAPA': ['ROTI KELAPA / 28 pcs', 39.00], 'ST-KACANG': ['ROTI KACANG / 24 pcs', 39.00], 'ST-KAYA': ['KAYA / 1 kg', 16.00] } },
 { code: 'EJEN_MAIPK', name: 'Ejen MAIPK', description: 'Harga khas Ejen MAIPK', is_default: false, rates: { 'ST-PLANTA': ['ROTI PLANTA / 20 pcs', 27.00], 'ST-BENGGALI': ['ROTI BENGGALI / 2 pcs', 10.50], 'ST-KELAPA': ['ROTI KELAPA / 28 pcs', 40.50], 'ST-KACANG': ['ROTI KACANG / 24 pcs', 40.50], 'ST-KAYA': ['KAYA / 1 kg', 16.50] } },
];

const routes = [
 { code: 'ROAD-ABDUL-SAMAD', driver: 'Abdul Samad', assistant: 'Nadzir', collect: 'Kilang', locations: ['Sungkai','Hentian sebelah Behrang selatan','RnR Ulu Bernam Selatan','Hentian Sebelah Rawang arah Selatan','Hentian Sebelah Sungai Buloh arah Selatan','OBR Sungai Buloh Arah Utara','OBR Sungai Buloh Arah Selatan','RnR Elmina Utara','Hentian Sebelah Rawang Arah Utara','Tukar tangan Stok kepada Driver Selatan','Agen KL - Ahmad BSP - OBR','Agen KL - Iqwan - OBR','Agen KL - Adib - OBR','Agen KL - Azim - OBR','Agen KL - Bapoi - OBR'] },
 { code: 'ROAD-ANUAR', driver: 'Anuar', collect: 'Kilang', locations: ['Mydin RTC (Gopeng)','WCE Taiping','WCE Sg. Nyior Arah Utara','EXIT Tol Simpang Pulai','Hentian Sebelah Simpang Pulai Arah Utara','Hentian Sebelah Simpang Pulai Arah Selatan','RnR Gunung Semanggol Arah Selatan','RnR Gunung Semanggol Arah Utara','Hentian Sebelah Bkt. Gantang Arah Utara','Hentian Sebelah Bkt. Gantang Arah Selatan','RNR Juru Arah Selatan','RNR Sg Perak Arah Utara','RNR Sg Perak Arah Selatan','Agen Nadeeya - Kiosk WCE Lekir arah Selatan','Agen Aziey - Kiosk WCE Sungai Nyior Arah Selatan','Agen Ajit Ali - Rumah Taman Muhibbah Malim Nawar','Agen Rizal - Rumah Taman Samudera Manjung'] },
 { code: 'ROAD-FARID', driver: 'Farid', collect: 'Kilang', locations: ['Mydin RTC (Gopeng)','WCE Taiping Arah Selatan','WCE Sg. Nyior Arah Utara','EXIT Tol Simpang Pulai','Hentian Sebelah Simpang Pulai Arah Utara','Hentian Sebelah Simpang Pulai Arah Selatan','RnR Gunung Semanggol Arah Selatan','RnR Gunung Semanggol Arah Utara','Hentian Sebelah Bkt. Gantang Arah Utara','Hentian Sebelah Bkt. Gantang Arah Selatan','RNR Juru Arah Selatan','RNR Sg Perak Arah Utara','RNR Sg Perak Arah Selatan','Agen Nadeeya - Kiosk WCE Lekir arah Selatan','Agen Aziey - Kiosk WCE Sungai Nyior Arah Selatan','Agen Ajit Ali - Rumah Taman Muhibbah Malim Nawar','Agen Rizal - Rumah Taman Samudera Manjung'] },
 { code: 'ROAD-AHMAD-NIZA', driver: 'Ahmad Niza', collect: 'Driver En Abdul Samad / Pembantu Driver En Nadzir', locations: ['Hentian Sebelah Behrang Selatan','Hentian Sebelah Behrang Utara','RNR Ulu Bernam Arah Selatan','RNR Tanjung Malim Arah Utara','Plaza Tol Tapah Exit','RNR Tapah Selatan 1','RNR Tapah Selatan 2','RNR Tapah Arah Utara','Hentian Sebelah Ladang Bikam Arah Selatan','Hentian Sebelah Ladang Bikam Arah Utara','Agen Aisha - Petron Behrang'] },
 { code: 'ROAD-FADZIL', driver: 'Fadzil', collect: 'Driver En Abdul Samad / Pembantu Driver En Nadzir', locations: ['Hentian Sebelah Sungai Buloh Arah Selatan','RNR Elmina Arah Utara','RNR Dengkil Arah Utara','RNR Dengkil Arah Selatan','Plaza Tol Sungai Besi Arah Selatan','RNR Seremban Arah Utara','Hentian Sebelah Pedas Linggi Arah Selatan','RNR Ayer Keroh Arah Selatan','RNR Genting Sempah','Hentian Sebelah Gombak Arah Barat','Agen Syafiq - Kiosk Temerloh Barat','Agen Syafiq - Kiosk Temerloh Timur','Agen Bapoi - Rumah area Selayang'] },
 { code: 'ROAD-AZRUL', driver: 'Azrul', collect: 'Driver En Abdul Samad / Pembantu Driver En Nadzir', locations: ['Hentian Sebelah Sungai Buloh Arah Selatan','RNR Elmina Arah Utara','RNR Dengkil Arah Utara','RNR Dengkil Arah Selatan','Plaza Tol Sungai Besi Arah Selatan','RNR Seremban Arah Utara','Hentian Sebelah Pedas Linggi Arah Selatan','RNR Ayer Keroh Arah Selatan','RNR Genting Sempah','Hentian Sebelah Gombak Arah Barat','Agen Syafiq - Kiosk Temerloh Barat','Agen Syafiq - Kiosk Temerloh Timur','Agen Bapoi - Rumah area Selayang'] },
 { code: 'ROAD-KILANG', driver: 'Driver Kilang', collect: 'Khas Kilang', locations: ['WCE Plaza Tol Teluk Intan Arah Utara','WCE Plaza Tol Hutan Melintang Arah Selatan','Van 1 (Berhadapan 7-Eleven Bandar Baru Teluk Intan)','Van 2 (Pekan Teluk Intan bersebelahan MM)'] },
];

function emailFor(code, type='ejen') { return `${type}.${code.toLowerCase()}@rkjdistributor.my`; }
function csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

async function getOrgAndEntity() {
 const { data: org, error: orgErr } = await supabase.from('organizations').select('id').eq('code', 'RKJ').single();
 if (orgErr) throw orgErr;
 const { data: entity, error: entErr } = await supabase.from('legal_entities').select('id').eq('organization_id', org.id).eq('code', 'RKJ_DIST').single();
 if (entErr) throw entErr;
 return { orgId: org.id, entityId: entity.id };
}

async function findUserByEmail(email) {
 const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
 if (error) throw error;
 return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureAuthUser(email, password, fullName, role, code) {
 const existing = await findUserByEmail(email);
 if (existing) {
 await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { full_name: fullName, role, employee_code: code } });
 return existing.id;
 }
 const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, role, employee_code: code } });
 if (error) throw error;
 return data.user.id;
}

async function ensureProfile({ id, orgId, entityId, code, fullName, email, role, metadata }) {
 const { error } = await supabase.from('profiles').upsert({
 id, organization_id: orgId, employee_code: code, full_name: fullName, email, role, legal_entity_id: entityId, status: 'ACTIVE', must_change_password: true, metadata: metadata ?? {}, updated_at: new Date().toISOString(),
 }, { onConflict: 'id' });
 if (error) throw error;
}

async function main() {
 const { orgId, entityId } = await getOrgAndEntity();
 const { data: stockItems, error: stockErr } = await supabase.from('stock_items').select('id,item_code,name,pack_quantity').eq('organization_id', orgId);
 if (stockErr) throw stockErr;
 const stockByCode = new Map(stockItems.map((s) => [s.item_code, s]));

 const groupByCode = new Map();
 for (const group of priceGroups) {
 const { data, error } = await supabase.from('agent_price_groups').upsert({
 organization_id: orgId, legal_entity_id: entityId, code: group.code, name: group.name, description: group.description, is_default: group.is_default, status: 'ACTIVE', updated_at: new Date().toISOString(),
 }, { onConflict: 'organization_id,code' }).select('*').single();
 if (error) throw error;
 groupByCode.set(group.code, data);
 for (const [itemCode, [label, price]] of Object.entries(group.rates)) {
 const stock = stockByCode.get(itemCode);
 if (!stock) throw new Error(`Stock item not found: ${itemCode}`);
 const { error: itemErr } = await supabase.from('agent_price_group_items').upsert({
 organization_id: orgId, price_group_id: data.id, stock_item_id: stock.id, item_label: label, package_description: label.split('/')[1]?.trim() ?? null, unit_price_rm: price, status: 'ACTIVE', updated_at: new Date().toISOString(),
 }, { onConflict: 'price_group_id,stock_item_id' });
 if (itemErr) throw itemErr;
 }
 }
 const defaultGroup = groupByCode.get('EJEN_BERDAFTAR');

 const credentials = [['type','code','name','email','password','role','company_or_driver','notes']];

 for (const a of agents) {
 const email = emailFor(a.code, 'ejen');
 const uid = await ensureAuthUser(email, DEFAULT_PASSWORD, a.full_name, 'SALES_AGENT', a.code);
 await ensureProfile({ id: uid, orgId, entityId, code: a.code, fullName: a.full_name, email, role: 'SALES_AGENT', metadata: { pic: a.pic, source: 'SENARAI_EJEN_RKJ_EDIT_KEMASKINI.pdf' } });
 const { data: account, error: accErr } = await supabase.from('sales_agent_accounts').upsert({
 organization_id: orgId, legal_entity_id: entityId, profile_id: uid, company_name: a.company, registration_no: a.registration_no, contact_person: a.pic, contact_email: email, business_address: a.location, status: 'ACTIVE', approved_at: new Date().toISOString(), notes: a.notes ?? null, assigned_price_group_id: defaultGroup.id, source_reference: 'SENARAI_EJEN_RKJ_EDIT_KEMASKINI.pdf', assigned_driver_name: a.driver, pickup_location: a.location, updated_at: new Date().toISOString(),
 }, { onConflict: 'profile_id' }).select('*').single();
 if (accErr) throw accErr;
 const { error: outletErr } = await supabase.from('agent_outlets').upsert({
 organization_id: orgId, agent_account_id: account.id, outlet_code: `${a.code}-MAIN`, outlet_name: a.location || a.company, address_line: a.location, status: 'ACTIVE', pos_enabled: false, subscription_active: false, updated_at: new Date().toISOString(),
 }, { onConflict: 'agent_account_id,outlet_code' });
 if (outletErr) throw outletErr;
 credentials.push(['agent', a.code, a.full_name, email, DEFAULT_PASSWORD, 'SALES_AGENT', a.company, a.location]);
 }

 const driverNames = [...new Set(routes.map((r) => r.driver).concat(['Nadzir']))];
 for (let i = 0; i < driverNames.length; i++) {
 const name = driverNames[i];
 const code = `ROAD${String(i + 1).padStart(3, '0')}`;
 const email = emailFor(code, 'driver');
 const uid = await ensureAuthUser(email, DEFAULT_PASSWORD, name, 'DRIVER', code);
 await ensureProfile({ id: uid, orgId, entityId, code, fullName: name, email, role: 'DRIVER', metadata: { source: 'Driver Road.pdf' } });
 const existing = await supabase.from('drivers').select('id,driver_code,full_name').eq('organization_id', orgId).ilike('full_name', `%${name.split(' ')[0]}%`).maybeSingle();
 const driverPayload = { organization_id: orgId, driver_code: existing.data?.driver_code ?? code, full_name: name, profile_id: uid, status: 'ACTIVE', route_description: 'Driver Road - laluan ejen/cawangan', remarks: 'Imported from Driver Road.pdf', updated_at: new Date().toISOString() };
 const { error: drvErr } = existing.data?.id
 ? await supabase.from('drivers').update(driverPayload).eq('id', existing.data.id)
 : await supabase.from('drivers').insert(driverPayload);
 if (drvErr) throw drvErr;
 credentials.push(['driver', code, name, email, DEFAULT_PASSWORD, 'DRIVER', name, 'Driver Road.pdf']);
 }

 for (const r of routes) {
 for (let i = 0; i < r.locations.length; i++) {
 const loc = r.locations[i];
 const { error } = await supabase.from('agent_driver_routes').upsert({
 organization_id: orgId, legal_entity_id: entityId, route_code: r.code, driver_name: r.driver, assistant_name: r.assistant ?? null, collect_from: r.collect, sequence_no: i + 1, location_name: loc, location_type: loc.toLowerCase().includes('agen') ? 'AGENT' : 'DELIVERY_POINT', notes: 'Imported from Driver Road.pdf', status: 'ACTIVE', updated_at: new Date().toISOString(),
 }, { onConflict: 'organization_id,route_code,sequence_no,location_name' });
 if (error) throw error;
 }
 }

 fs.mkdirSync('csv_import', { recursive: true });
 const credPath = path.join('csv_import', 'agent_driver_credentials.csv');
 fs.writeFileSync(credPath, credentials.map((r) => r.map(csvEscape).join(',')).join('\n'), 'utf8');
 fs.writeFileSync(path.join('outputs', 'agent_import_summary.json'), JSON.stringify({ agents: agents.length, drivers: driverNames.length, price_groups: priceGroups.length, route_points: routes.reduce((n,r)=>n+r.locations.length,0), credentials_file: credPath }, null, 2), 'utf8');
 console.log(JSON.stringify({ ok: true, agents: agents.length, drivers: driverNames.length, price_groups: priceGroups.length, route_points: routes.reduce((n,r)=>n+r.locations.length,0), credentials_file: credPath }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
