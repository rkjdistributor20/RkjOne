import { createClient } from '@supabase/supabase-js';
import { loadProjectEnv } from './lib/load-env.mjs';

const env = loadProjectEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
 auth: { persistSession: false },
});

const SAMAD = 'ABDUL SAMAD BIN RAHMATHULLAH';
const FARID = 'MUHAMMAD FARID BIN YAMAN';
const ANUAR = 'MOHAMAD ANUAR BIN MOHAMAD TAN';
const FAZIL = 'MD FAZIL BIN HUSIN';
const NADZIR = 'MUHAMMAD NADZIR BIN MOHAMED HASHIRAF';
const DRIVER_KILANG = 'DRIVER KILANG - POOL GANTI';

const DRIVER_MASTER = [
 {
 code: 'DIST-DRV-001',
 name: SAMAD,
 employeeCode: 'MFG001',
 route: 'Hub utama RKJ Distributor - Teluk Intan ke Kuala Lumpur/Utara, bersama pembantu driver Nadzir.',
 remarks: 'Staf berdaftar RKJ Distributor | Primary driver kepada Muhammad Nadzir | Rebuilt 2026-06-29',
 },
 {
 code: 'DIST-AST-001',
 name: NADZIR,
 employeeCode: 'MFG006',
 route: 'Pembantu driver kepada Abdul Samad - dashboard, tugas, waktu dan area sama dengan primary driver.',
 remarks: 'Staf berdaftar RKJ Distributor | Assistant driver to DIST-DRV-001 | Rebuilt 2026-06-29',
 },
 {
 code: 'DIST-DRV-002',
 name: FARID,
 employeeCode: 'MFG005',
 route: 'Laluan Utara/Perak - cawangan, ejen dan pickup WCE/Ipoh/Manjung mengikut jadual HQ.',
 remarks: 'Staf berdaftar RKJ Distributor | Driver laluan Utara/Perak | Rebuilt 2026-06-29',
 },
 {
 code: 'DIST-DRV-003',
 name: ANUAR,
 employeeCode: 'MFG009',
 route: 'Laluan Utara/Perak - sokongan Farid untuk cawangan, ejen dan pickup WCE/Ipoh/Manjung.',
 remarks: 'Staf berdaftar RKJ Distributor | Driver laluan Utara/Perak | Rebuilt 2026-06-29',
 },
 {
 code: 'DIST-DRV-004',
 name: FAZIL,
 employeeCode: 'DIST005',
 route: 'Laluan Pantai Timur/KL relay - Temerloh, KL dan tugasan sokongan tengah/selatan.',
 remarks: 'Staf berdaftar RKJ Distributor | Driver relay Pantai Timur/KL | Rebuilt 2026-06-29',
 },
 {
 code: 'MFG-DRV-POOL',
 name: DRIVER_KILANG,
 employeeCode: null,
 route: 'Pool driver kilang - boleh dipautkan kepada mana-mana staf RKJ Manufacturing sebagai driver tambahan/ganti jika diperlukan.',
 remarks: 'Bukan akaun login tetap | Pool tugasan driver kilang/ganti | Rebuilt 2026-06-29',
 },
];

const VEHICLES = [
 {
 code: 'VEH-VFM2224',
 plate: 'VFM 2224',
 type: 'Lori Rigid',
 capacity: '5 Tan',
 model: 'UD Trucks',
 defaultDriverCode: 'DIST-DRV-001',
 route: 'Teluk Intan > Kuala Lumpur',
 driverCodes: ['DIST-DRV-001', 'DIST-AST-001', 'MFG-DRV-POOL'],
 },
 {
 code: 'VEH-ALL2224',
 plate: 'ALL 2224',
 type: 'Lori Rigid',
 capacity: '3 Tan',
 model: 'Mitsubishi Fuso',
 defaultDriverCode: 'DIST-DRV-001',
 route: 'Teluk Intan > Kuala Lumpur / Utara',
 driverCodes: ['DIST-DRV-001', 'DIST-AST-001', 'DIST-DRV-002', 'MFG-DRV-POOL'],
 },
 {
 code: 'VEH-VFL2224',
 plate: 'VFL 2224',
 type: 'Lori Rigid',
 capacity: '1 Tan',
 model: 'Mitsubishi Fuso',
 defaultDriverCode: 'DIST-DRV-004',
 route: 'Kuala Lumpur / Pantai Timur',
 driverCodes: ['DIST-DRV-004', 'MFG-DRV-POOL'],
 },
 {
 code: 'VEH-WB4631T',
 plate: 'WB 4631 T',
 type: 'Lori Rigid',
 capacity: '1 Tan',
 model: 'Isuzu',
 defaultDriverCode: 'DIST-DRV-004',
 route: 'Sungkai / Tengah',
 driverCodes: ['DIST-DRV-004', 'MFG-DRV-POOL'],
 },
 {
 code: 'VEH-WA1202J',
 plate: 'WA 1202 J',
 type: 'Panel Van',
 capacity: null,
 model: 'Toyota Hiace',
 defaultDriverCode: 'DIST-DRV-004',
 route: 'Kuala Lumpur / sokongan ejen',
 driverCodes: ['DIST-DRV-004', 'MFG-DRV-POOL'],
 },
 {
 code: 'VEH-VCH7221',
 plate: 'VCH 7221',
 type: 'Panel Van',
 capacity: null,
 model: 'Toyota Hiace',
 defaultDriverCode: 'DIST-DRV-002',
 route: 'Teluk Intan > Utara / Kuala Lumpur',
 driverCodes: ['DIST-DRV-001', 'DIST-AST-001', 'DIST-DRV-002', 'DIST-DRV-003', 'MFG-DRV-POOL'],
 },
 {
 code: 'VEH-SYP2224',
 plate: 'SYP 2224',
 type: 'Panel Van',
 capacity: null,
 model: 'Nissan NV200',
 defaultDriverCode: 'DIST-DRV-003',
 route: 'Teluk Intan > Utara',
 driverCodes: ['DIST-DRV-002', 'DIST-DRV-003', 'MFG-DRV-POOL'],
 },
];

function assertNoError(label, { error }) {
 if (error) throw new Error(`${label}: ${error.message}`);
}

function normalizeText(value) {
 return String(value ?? '').toLowerCase();
}

function compactName(value) {
 return String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function routeGroupForRegion(regionCode, branchCode = '') {
 const rank = Number(String(branchCode).replace(/\D/g, '') || 1);
 if (regionCode === 'UTARA') return rank % 2 === 0 ? [FARID] : [ANUAR];
 if (regionCode === 'TENGAH') return [SAMAD, NADZIR];
 return [FAZIL];
}

function pickupPoints(raw) {
 const cleaned = String(raw ?? '').trim();
 if (!cleaned) return [];
 const lines = cleaned
 .split(/\n|;/)
 .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
 .filter(Boolean);
 if (lines.length > 1) return lines;
 return cleaned.split(/\s*,\s*/).map((line) => line.trim()).filter(Boolean);
}

function driverGroupForPickup(agent, point) {
 const text = normalizeText(`${agent.company_name} ${agent.assigned_driver_name} ${point}`);
 if (text.includes('van 1') || text.includes('van 2') || text.includes('driver kilang') || text.includes('road007')) {
 return [DRIVER_KILANG, SAMAD, NADZIR];
 }
 if (text.includes('temerloh') || text.includes('termeloh') || text.includes('fazil') || text.includes('fadzil') || text.includes('hazrul')) {
 return [FAZIL];
 }
 if (
 text.includes('farid') ||
 text.includes('anuar') ||
 text.includes('ipoh') ||
 text.includes('tambun') ||
 text.includes('batu gajah') ||
 text.includes('gopeng') ||
 text.includes('manjung') ||
 text.includes('lekir') ||
 text.includes('sg. nyior') ||
 text.includes('sg nyior') ||
 text.includes('wce') ||
 text.includes('hutan melintang')
 ) {
 return [FARID, ANUAR];
 }
 if (text.includes('kuala lumpur') || text.includes('sg buluh') || text.includes('samad') || text.includes('nadzira') || text.includes('nadzir')) {
 return [SAMAD, NADZIR];
 }
 return [SAMAD, NADZIR];
}

function cleanAssignedDrivers(agent) {
 const points = pickupPoints(agent.pickup_location);
 const names = new Set();
 for (const point of points.length ? points : [agent.assigned_driver_name]) {
 for (const name of driverGroupForPickup(agent, point)) names.add(name);
 }
 return [...names].join(' / ');
}

function routeCode(seed, prefix) {
 return `${prefix}-${String(seed ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36)}`;
}

async function updateProfile(profile, patch) {
 if (!profile) return;
 const metadata = { ...(profile.metadata ?? {}), ...(patch.metadata ?? {}) };
 const { error } = await supabase
 .from('profiles')
 .update({
 ...patch,
 metadata,
 updated_at: new Date().toISOString(),
 })
 .eq('id', profile.id);
 assertNoError(`update profile ${profile.full_name}`, { error });
}

async function main() {
 if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
 throw new Error('Supabase env tidak lengkap');
 }

 const now = new Date().toISOString();
 const { data: org, error: orgError } = await supabase.from('organizations').select('id, code').eq('code', 'RKJ').single();
 assertNoError('load organization', { error: orgError });

 const { data: entities, error: entityError } = await supabase
 .from('legal_entities')
 .select('id, code, name')
 .eq('organization_id', org.id);
 assertNoError('load legal entities', { error: entityError });
 const distEntity = entities.find((entity) => entity.code === 'RKJ_DIST');
 const mfgEntity = entities.find((entity) => entity.code === 'RKJ_MFG');
 if (!distEntity || !mfgEntity) throw new Error('Legal entity RKJ_DIST/RKJ_MFG tidak lengkap');

 const { data: profiles, error: profileError } = await supabase
 .from('profiles')
 .select('id, employee_code, full_name, email, role, status, legal_entity_id, metadata')
 .eq('organization_id', org.id);
 assertNoError('load profiles', { error: profileError });

 const profileByEmployee = new Map((profiles ?? []).map((profile) => [profile.employee_code, profile]));
 const profileByName = new Map((profiles ?? []).map((profile) => [compactName(profile.full_name), profile]));

 for (const oldProfile of (profiles ?? []).filter((profile) => /^ROAD\d{3}$|^DR001$/i.test(profile.employee_code ?? ''))) {
 await updateProfile(oldProfile, {
 status: 'INACTIVE',
 metadata: {
 archived_reason: 'Driver Road lama diganti dengan staf rasmi RKJ Distributor',
 archived_at: now,
 dashboard_home: null,
 },
 });
 }

 for (const driver of DRIVER_MASTER) {
 const profile = driver.employeeCode ? profileByEmployee.get(driver.employeeCode) ?? profileByName.get(compactName(driver.name)) : null;
 if (profile) {
 await updateProfile(profile, {
 role: 'DRIVER',
 status: 'ACTIVE',
 legal_entity_id: distEntity.id,
 metadata: {
 ...(profile.metadata ?? {}),
 position: driver.code === 'DIST-AST-001' ? 'DELIVERY ASST / PEMBANTU DRIVER' : 'DRIVER',
 department: 'LOGISTIC',
 legal_entity_code: 'RKJ_DIST',
 dashboard_home: '/fleet',
 dashboard_label: driver.code === 'DIST-AST-001' ? 'Logistik - Pembantu Driver' : 'Logistik - Driver',
 dashboard_profile: driver.code === 'DIST-AST-001' ? 'DISTRIBUTOR_DRIVER_ASSISTANT' : 'DISTRIBUTOR_DRIVER',
 primary_driver_code: driver.code === 'DIST-AST-001' ? 'DIST-DRV-001' : undefined,
 primary_driver_name: driver.code === 'DIST-AST-001' ? SAMAD : undefined,
 dashboard_same_as: driver.code === 'DIST-AST-001' ? 'ABDUL SAMAD BIN RAHMATHULLAH' : undefined,
 driver_code: driver.code,
 },
 });
 }
 }

 const { data: existingDrivers, error: driversError } = await supabase
 .from('drivers')
 .select('id, driver_code, full_name, profile_id, status')
 .eq('organization_id', org.id);
 assertNoError('load drivers', { error: driversError });

 const activeCodes = new Set(DRIVER_MASTER.map((driver) => driver.code));
 const archiveIds = (existingDrivers ?? []).filter((driver) => !activeCodes.has(driver.driver_code)).map((driver) => driver.id);
 if (archiveIds.length) {
 const { error } = await supabase
 .from('drivers')
 .update({
 status: 'INACTIVE',
 remarks: `Archived from active driver master - replaced by registered RKJ Distributor staff drivers ${now}`,
 updated_at: now,
 })
 .in('id', archiveIds);
 assertNoError('archive old drivers', { error });
 }

 const driverRows = DRIVER_MASTER.map((driver) => {
 const profile = driver.employeeCode ? profileByEmployee.get(driver.employeeCode) ?? profileByName.get(compactName(driver.name)) : null;
 return {
 organization_id: org.id,
 driver_code: driver.code,
 full_name: driver.name,
 route_description: driver.route,
 phone: profile?.phone ?? null,
 profile_id: profile?.id ?? null,
 status: 'ACTIVE',
 remarks: driver.remarks,
 updated_at: now,
 };
 });
 const { error: upsertDriverError } = await supabase
 .from('drivers')
 .upsert(driverRows, { onConflict: 'organization_id,driver_code' });
 assertNoError('upsert new staff drivers', { error: upsertDriverError });

 const { data: newDrivers, error: newDriversError } = await supabase
 .from('drivers')
 .select('id, driver_code, full_name')
 .eq('organization_id', org.id);
 assertNoError('reload drivers', { error: newDriversError });
 const newDriverByCode = new Map((newDrivers ?? []).map((driver) => [driver.driver_code, driver]));
 const newDriverByName = new Map((newDrivers ?? []).map((driver) => [compactName(driver.full_name), driver]));

 const oldToNew = new Map();
 for (const oldDriver of existingDrivers ?? []) {
 const text = normalizeText(`${oldDriver.driver_code} ${oldDriver.full_name}`);
 let targetCode = null;
 if (text.includes('samad') || ['DRV001', 'ROAD001', 'DR001'].includes(oldDriver.driver_code)) targetCode = 'DIST-DRV-001';
 else if (text.includes('nadzir') || text.includes('nadzira') || oldDriver.driver_code === 'ROAD008') targetCode = 'DIST-AST-001';
 else if (text.includes('farid') || ['DRV002', 'ROAD003'].includes(oldDriver.driver_code)) targetCode = 'DIST-DRV-002';
 else if (text.includes('anuar') || ['DRV006', 'ROAD002'].includes(oldDriver.driver_code)) targetCode = 'DIST-DRV-003';
 else if (text.includes('fazil') || text.includes('fadzil') || text.includes('hazrul') || text.includes('azrul') || text.includes('ahmad') || ['DRV003', 'DRV004', 'DRV005', 'ROAD004', 'ROAD005', 'ROAD006'].includes(oldDriver.driver_code)) targetCode = 'DIST-DRV-004';
 else if (text.includes('driver kilang') || oldDriver.driver_code === 'ROAD007') targetCode = 'MFG-DRV-POOL';
 const target = targetCode ? newDriverByCode.get(targetCode) : null;
 if (target && target.id !== oldDriver.id) oldToNew.set(oldDriver.id, target.id);
 }

 for (const [oldId, newId] of oldToNew.entries()) {
 const tableUpdates = [
 ['hq_delivery_route_plans', 'driver_id'],
 ['delivery_orders', 'primary_driver_id'],
 ['delivery_legs', 'driver_id'],
 ['fleet_status_log', 'driver_id'],
 ['hq_delivery_route_stops', 'driver_id'],
 ['hq_delivery_route_stops', 'handoff_driver_id'],
 ];
 for (const [table, column] of tableUpdates) {
 const { error } = await supabase.from(table).update({ [column]: newId, updated_at: now }).eq(column, oldId);
 if (error && !/column .* updated_at/i.test(error.message)) {
 const retry = await supabase.from(table).update({ [column]: newId }).eq(column, oldId);
 assertNoError(`reassign ${table}.${column}`, retry);
 }
 }
 }

 const { error: closeAssignmentError } = await supabase
 .from('driver_vehicle_assignments')
 .update({ is_active: false, unassigned_at: now })
 .eq('organization_id', org.id)
 .eq('is_active', true);
 assertNoError('close old driver vehicle assignments', { error: closeAssignmentError });

 for (const vehicle of VEHICLES) {
 const defaultDriver = newDriverByCode.get(vehicle.defaultDriverCode);
 const { data: savedVehicle, error: vehicleError } = await supabase
 .from('vehicles')
 .upsert({
 organization_id: org.id,
 vehicle_code: vehicle.code,
 plate_number: vehicle.plate,
 vehicle_type: vehicle.type,
 capacity: vehicle.capacity,
 default_driver_id: defaultDriver?.id ?? null,
 status: 'ACTIVE',
 remarks: `Model: ${vehicle.model} | Lokasi Perjalanan: ${vehicle.route} | Source: registered RKJ Distributor staff drivers`,
 updated_at: now,
 }, { onConflict: 'organization_id,vehicle_code' })
 .select('id')
 .single();
 assertNoError(`upsert vehicle ${vehicle.code}`, { error: vehicleError });

 const assignments = vehicle.driverCodes
 .map((driverCode) => newDriverByCode.get(driverCode))
 .filter(Boolean)
 .map((driver) => ({
 organization_id: org.id,
 driver_id: driver.id,
 vehicle_id: savedVehicle.id,
 assigned_at: now,
 unassigned_at: null,
 is_active: true,
 }));
 if (assignments.length) {
 const { error } = await supabase.from('driver_vehicle_assignments').insert(assignments);
 assertNoError(`assign vehicle ${vehicle.code}`, { error });
 }
 }

 const { error: inactiveRoutesError } = await supabase
 .from('agent_driver_routes')
 .update({
 status: 'INACTIVE',
 notes: `Archived before staff-driver route rebuild ${now}`,
 updated_at: now,
 })
 .eq('organization_id', org.id)
 .eq('status', 'ACTIVE');
 assertNoError('archive old route rows', { error: inactiveRoutesError });

 const { data: regions, error: regionError } = await supabase.from('regions').select('id, code, name').eq('organization_id', org.id);
 assertNoError('load regions', { error: regionError });
 const regionById = new Map((regions ?? []).map((region) => [region.id, region]));

 const { data: branches, error: branchError } = await supabase
 .from('branches')
 .select('id, branch_code, branch_name, area, region_id, status')
 .eq('organization_id', org.id)
 .eq('status', 'ACTIVE')
 .order('branch_code');
 assertNoError('load branches', { error: branchError });

 const routeRows = [];
 for (const branch of branches ?? []) {
 const regionCode = regionById.get(branch.region_id)?.code ?? branch.area ?? 'TENGAH';
 const driverNames = routeGroupForRegion(regionCode, branch.branch_code);
 routeRows.push({
 organization_id: org.id,
 legal_entity_id: distEntity.id,
 route_code: routeCode(`${regionCode}-${driverNames.join('-')}`, 'BR'),
 driver_name: driverNames.join(' / '),
 assistant_name: driverNames.includes(NADZIR) ? NADZIR : null,
 collect_from: 'RKJ Distributor HQ / Kilang mengikut jadual production',
 sequence_no: Number(String(branch.branch_code).replace(/\D/g, '') || 0),
 location_name: `${branch.branch_code} - ${branch.branch_name}`,
 location_type: 'BRANCH_KIOSK',
 notes: `Cawangan ${regionCode} | Driver ditentukan melalui default_driver_id_for_branch dan boleh dioverride OM/HQ.`,
 status: 'ACTIVE',
 updated_at: now,
 });
 }

 const { data: agents, error: agentError } = await supabase
 .from('sales_agent_accounts')
 .select('*')
 .eq('organization_id', org.id)
 .order('company_name');
 assertNoError('load sales agents', { error: agentError });

 for (const agent of agents ?? []) {
 const assigned = cleanAssignedDrivers(agent);
 const { error } = await supabase
 .from('sales_agent_accounts')
 .update({ assigned_driver_name: assigned, updated_at: now })
 .eq('id', agent.id);
 assertNoError(`normalize agent driver ${agent.company_name}`, { error });

 if (agent.status !== 'ACTIVE') continue;
 const points = pickupPoints(agent.pickup_location);
 points.forEach((point, index) => {
 const driverNames = driverGroupForPickup(agent, point);
 routeRows.push({
 organization_id: org.id,
 legal_entity_id: distEntity.id,
 route_code: routeCode(agent.company_name, 'AG'),
 driver_name: driverNames.join(' / '),
 assistant_name: driverNames.includes(NADZIR) ? NADZIR : null,
 collect_from: 'Agent drop point / pickup point yang didaftarkan',
 sequence_no: index + 1,
 location_name: point,
 location_type: 'AGENT_DROP_POINT',
 notes: `Ejen: ${agent.company_name} | PIC: ${agent.contact_person ?? '-'} | Status: ${agent.status} | POS: ${agent.pos_subscription_status ?? '-'}`,
 status: 'ACTIVE',
 updated_at: now,
 });
 });
 }

 if (routeRows.length) {
 const { error } = await supabase
 .from('agent_driver_routes')
 .upsert(routeRows, { onConflict: 'organization_id,route_code,sequence_no,location_name' });
 assertNoError('upsert branch and agent route rows', { error });
 }

 console.log(JSON.stringify({
 ok: true,
 archived_driver_rows: archiveIds.length,
 active_driver_codes: DRIVER_MASTER.map((driver) => driver.code),
 reassigned_driver_references: oldToNew.size,
 route_rows: routeRows.length,
 vehicles: VEHICLES.length,
 }, null, 2));
}

main().catch((error) => {
 console.error(error);
 process.exit(1);
});
