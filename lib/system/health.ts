import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProfileWithBranch } from "@/types/database";
import {
  buildProductionReadiness,
  type ProductionReadinessSnapshot,
} from "@/lib/system/production-readiness";

export type SystemHealthStatus = "PASS" | "WARN" | "FAIL";

export type SystemHealthCheck = {
  key: string;
  label: string;
  status: SystemHealthStatus;
  detail: string;
  action?: string;
};

export type SystemHealthSection = {
  key: string;
  title: string;
  description: string;
  checks: SystemHealthCheck[];
};

export type LaunchControlStatus = "DONE" | "ACTION" | "WAITING";

export type LaunchControlItem = {
  key: string;
  title: string;
  owner: string;
  priority: "P0" | "P1" | "P2";
  status: LaunchControlStatus;
  summary: string;
  next_step: string;
  proof: string[];
};

export type LaunchControlSnapshot = {
  done: number;
  action: number;
  waiting: number;
  items: LaunchControlItem[];
};

export type SystemHealthSnapshot = {
  generated_at: string;
  overall: SystemHealthStatus;
  production_readiness: ProductionReadinessSnapshot;
  launch_control: LaunchControlSnapshot;
  profile: {
    id: string;
    name: string;
    role: string;
    legal_entity_id: string | null;
  };
  counters: {
    branches: number | null;
    legal_entities: number | null;
    active_profiles: number | null;
    migrations: number | null;
  };
  sections: SystemHealthSection[];
};

type DbClient = SupabaseClient<Database>;

function statusWeight(status: SystemHealthStatus) {
  if (status === "FAIL") return 3;
  if (status === "WARN") return 2;
  return 1;
}

function worstStatus(statuses: SystemHealthStatus[]): SystemHealthStatus {
  return statuses.reduce<SystemHealthStatus>(
    (worst, status) =>
      statusWeight(status) > statusWeight(worst) ? status : worst,
    "PASS",
  );
}

async function countTable(
  supabase: DbClient,
  table: string,
  eq?: { column: string; value: string },
) {
  try {
    let query = supabase
      .from(table as keyof Database["public"]["Tables"])
      .select("id", { count: "exact", head: true });
    if (eq) query = query.eq(eq.column, eq.value);
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

function check(
  key: string,
  label: string,
  status: SystemHealthStatus,
  detail: string,
  action?: string,
): SystemHealthCheck {
  return { key, label, status, detail, action };
}

function envReady(names: string[]) {
  return names.some((name) => Boolean(process.env[name]));
}

function launchItem(
  key: string,
  title: string,
  owner: string,
  priority: LaunchControlItem["priority"],
  status: LaunchControlStatus,
  summary: string,
  nextStep: string,
  proof: string[],
): LaunchControlItem {
  return {
    key,
    title,
    owner,
    priority,
    status,
    summary,
    next_step: nextStep,
    proof,
  };
}

function buildLaunchControl(input: {
  hasSupabaseEnv: boolean;
  hasPaymentEnv: boolean;
  branches: number | null;
  legalEntities: number | null;
  activeProfiles: number | null;
  migrationRows: number | null;
}): LaunchControlSnapshot {
  const hasCoreData =
    (input.branches ?? 0) >= 36 &&
    (input.legalEntities ?? 0) >= 3 &&
    (input.activeProfiles ?? 0) > 0;
  const hasMigrations = (input.migrationRows ?? 0) > 0;
  const items: LaunchControlItem[] = [
    launchItem(
      "browser-uat",
      "UAT browser semua dashboard",
      "Owner / Pentadbir Utama",
      "P0",
      "ACTION",
      "Semak dashboard Owner, HQ Distributor, Kilang, OM, AM, Driver, Staf Jualan, HR, Finance dan Ejen supaya tiada teks pelik atau flow tersangkut.",
      "Login ikut role satu demi satu, buat rekod isu kecil, kemudian refresh production selepas fix.",
      ["Role dashboard", "POS flow", "Branch profile"],
    ),
    launchItem(
      "pos-pilot",
      "Pilot POS BR011 RNR Sg Nyiur Arah Utara",
      "AM / OM / Staf Testing",
      "P0",
      input.branches !== null && input.branches >= 36 ? "ACTION" : "WAITING",
      "Uji SOP sebenar: buka syif, kira stok permulaan, sahkan stok driver jika ada, jualan tunai/QR manual, rehat, mid-shift, tutup syif dan payroll time.",
      "Guna akaun staf testing, kekalkan QR payment manual, dan pastikan AM/OM sahkan exception stok.",
      ["BR011", "Manual QR", "Shift SOP"],
    ),
    launchItem(
      "payment-live",
      "Payment gateway live",
      "Finance / Owner",
      "P0",
      input.hasPaymentEnv ? "ACTION" : "WAITING",
      input.hasPaymentEnv
        ? "Konfigurasi payment ditemui, tetapi transaksi live masih perlu diuji dengan callback/webhook dan settlement company account."
        : "Payment online belum dibuka untuk operasi real sehingga merchant approved dan key rasmi dimasukkan.",
      input.hasPaymentEnv
        ? "Buat transaksi kecil, semak webhook, resit, laporan collection dan bank settlement."
        : "Tunggu approval merchant Billplz/Fiuu/iPay88, kemudian masukkan merchant key di Vercel.",
      ["Merchant approval", "Webhook", "Settlement"],
    ),
    launchItem(
      "store-release",
      "Play Store & App Store release",
      "Owner / Admin Teknikal",
      "P1",
      "WAITING",
      "PWA dan Android shell boleh disiapkan, tetapi akaun organisasi Google/Apple bergantung pada D-U-N-S 9 digit dan verification.",
      "Sambung Google Play Console dan Apple Developer sebaik sahaja nombor D-U-N-S diterima.",
      ["D-U-N-S", "Play Console", "Apple Developer"],
    ),
    launchItem(
      "supabase-lockdown",
      "Kunci akses production",
      "Admin Teknikal",
      "P0",
      input.hasSupabaseEnv ? "ACTION" : "WAITING",
      "Sistem testing owner tidak disekat, tetapi sebelum go-live perlu pastikan signup awam OFF, RLS aktif dan role sensitif diuji.",
      "Semak Supabase Auth, RLS policy, service role usage dan audit log sebelum buka kepada staf real.",
      ["Supabase Auth", "RLS", "Audit log"],
    ),
    launchItem(
      "go-live-36",
      "Go-live 36 cawangan",
      "Owner / OM / AM",
      "P1",
      hasCoreData ? "ACTION" : "WAITING",
      "Data cawangan, staf, role dan profile syarikat perlu disahkan sebelum sistem digunakan di semua kiosk.",
      "Mulakan dari pilot 1 cawangan, kemudian tambah batch kawasan selepas SOP POS dan stock count stabil.",
      ["36 cawangan", "AM area", "Training"],
    ),
    launchItem(
      "checkpoint",
      "Checkpoint & backup kerja",
      "Codex / Admin Teknikal",
      "P2",
      hasMigrations ? "DONE" : "ACTION",
      "Rekod kerja, migration dan resume perlu sentiasa dikemaskini supaya kerja boleh disambung tanpa kehilangan konteks.",
      "Update CHECKPOINT.json dan RESUME.md selepas perubahan besar atau deploy.",
      ["CHECKPOINT.json", "RESUME.md", "schema_migrations"],
    ),
  ];

  return {
    done: items.filter((item) => item.status === "DONE").length,
    action: items.filter((item) => item.status === "ACTION").length,
    waiting: items.filter((item) => item.status === "WAITING").length,
    items,
  };
}

export async function buildSystemHealthSnapshot(
  supabase: DbClient,
  profile: ProfileWithBranch,
): Promise<SystemHealthSnapshot> {
  const now = new Date().toISOString();
  const branches = await countTable(supabase, "branches");
  const legalEntities = await countTable(supabase, "legal_entities");
  const activeProfiles = await countTable(supabase, "profiles", {
    column: "status",
    value: "ACTIVE",
  });
  const migrationRows = await countTable(supabase, "schema_migrations");
  const hasSupabaseEnv =
    envReady(["NEXT_PUBLIC_SUPABASE_URL"]) &&
    envReady(["SUPABASE_SERVICE_ROLE_KEY"]);
  const hasPaymentEnv = envReady([
    "BILLPLZ_API_KEY",
    "FIUU_MERCHANT_ID",
    "RAZER_MERCHANT_ID",
    "IPAY88_MERCHANT_CODE",
  ]);
  const productionReadiness = buildProductionReadiness({
    hasSupabaseEnv,
    hasPaymentEnv,
    branches,
    legalEntities,
    activeProfiles,
    migrationRows,
  });
  const launchControl = buildLaunchControl({
    hasSupabaseEnv,
    hasPaymentEnv,
    branches,
    legalEntities: legalEntities,
    activeProfiles,
    migrationRows,
  });

  const sections: SystemHealthSection[] = [
    {
      key: "security",
      title: "Keselamatan Aplikasi",
      description: "Kawalan asas production tanpa memaparkan rahsia sistem.",
      checks: [
        check(
          "runtime-secrets",
          "Rahsia tidak dipaparkan",
          "PASS",
          "Dashboard ini hanya tunjuk status readiness, bukan nilai API key, token, password atau service role key.",
        ),
        check(
          "supabase-env",
          "Sambungan Supabase admin",
          hasSupabaseEnv ? "PASS" : "FAIL",
          hasSupabaseEnv
            ? "Konfigurasi Supabase production ditemui dalam runtime."
            : "Konfigurasi Supabase production tidak lengkap.",
          "Semak Vercel Environment Variables jika gagal.",
        ),
        check(
          "build-security-audit",
          "Audit fail melalui CLI",
          "WARN",
          "Semakan fail seperti security headers, proxy, PWA dan AAB dijalankan melalui npm run system:audit supaya runtime production tidak membaca seluruh projek.",
          "Run npm run system:audit sebelum deploy besar.",
        ),
      ],
    },
    {
      key: "access",
      title: "Akses Pengguna & Data Syarikat",
      description:
        "Pastikan staf hanya nampak syarikat, cawangan dan modul yang berkaitan.",
      checks: [
        check(
          "active-profiles",
          "Profil aktif dipantau",
          activeProfiles !== null ? "PASS" : "WARN",
          activeProfiles !== null
            ? `${activeProfiles} profil aktif direkod dalam sistem.`
            : "Tidak dapat kira profil aktif.",
          "Semak role staf baharu selepas daftar HR.",
        ),
        check(
          "legal-entities",
          "Profil syarikat berasingan",
          legalEntities !== null && legalEntities >= 3 ? "PASS" : "WARN",
          legalEntities !== null
            ? `${legalEntities} syarikat legal direkod.`
            : "Tidak dapat kira syarikat legal.",
          "Pastikan RKJ Manufacturing, RKJ Distributor dan Roti Kaya Junus tidak bercampur akses.",
        ),
        check(
          "branch-scope",
          "Cawangan boleh diaudit",
          branches !== null && branches >= 36 ? "PASS" : "WARN",
          branches !== null
            ? `${branches} cawangan boleh dipantau.`
            : "Tidak dapat kira cawangan.",
          "Owner boleh semak profile cawangan, dokumen, POS, staf dan stok dari dashboard cawangan.",
        ),
      ],
    },
    {
      key: "backup",
      title: "Backup & Pemulihan",
      description:
        "Database dan worklog perlu ada rujukan pemulihan sebelum kerja besar.",
      checks: [
        check(
          "schema-migrations",
          "Migrasi database boleh dikesan",
          migrationRows !== null && migrationRows > 0 ? "PASS" : "WARN",
          migrationRows !== null
            ? `${migrationRows} rekod migration dikesan dalam database.`
            : "Tidak dapat membaca schema_migrations daripada database.",
          "Jika tidak dapat dikesan, jalankan npm run system:audit dan bundle migration secara manual.",
        ),
        check(
          "checkpoint-process",
          "Checkpoint kerja wajib",
          "WARN",
          "Checkpoint fail disahkan melalui CLI audit, bukan melalui API live.",
          "Update CHECKPOINT.json dan RESUME.md selepas deploy atau perubahan besar.",
        ),
      ],
    },
    {
      key: "mobile",
      title: "PWA & Mobile App",
      description:
        "Persediaan Play Store dan App Store sementara menunggu D-U-N-S.",
      checks: [
        check(
          "pwa-policy",
          "PWA dikawal melalui build audit",
          "WARN",
          "Manifest, service worker, AAB dan readiness audit disemak melalui npm run system:audit.",
          "Run npm run mobile:readiness sebelum submit Play Store/App Store.",
        ),
        check(
          "duns-status",
          "D-U-N-S masih proses luar",
          "WARN",
          "Sistem sudah boleh disiapkan, tetapi akaun Play Console/App Store organisasi masih bergantung pada nombor D-U-N-S 9 digit.",
          "Sambung pendaftaran store sebaik sahaja D-U-N-S diterima.",
        ),
      ],
    },
    {
      key: "operations",
      title: "Operasi & Monitoring",
      description:
        "Kawalan UAT, health endpoint dan payment status sebelum sistem digunakan real.",
      checks: [
        check(
          "uat-mode",
          "Testing owner tidak disekat",
          "PASS",
          "Pentadbir Utama boleh terus membuat tindakan testing, manakala sistem memberi amaran SOP yang sepatutnya.",
        ),
        check(
          "payment-env",
          "Payment gateway belum dipaksa live",
          hasPaymentEnv ? "PASS" : "WARN",
          hasPaymentEnv
            ? "Sekurang-kurangnya satu konfigurasi payment gateway ditemui."
            : "Payment gateway live belum lengkap dalam environment.",
          "Kekalkan QR/manual payment untuk testing sehingga merchant approved dan webhook diuji.",
        ),
      ],
    },
  ];

  const allStatuses = sections.flatMap((section) =>
    section.checks.map((item) => item.status),
  );

  return {
    generated_at: now,
    overall: worstStatus(allStatuses),
    production_readiness: productionReadiness,
    launch_control: launchControl,
    profile: {
      id: profile.id,
      name: profile.full_name,
      role: profile.role,
      legal_entity_id: profile.legal_entity_id ?? null,
    },
    counters: {
      branches,
      legal_entities: legalEntities,
      active_profiles: activeProfiles,
      migrations: migrationRows,
    },
    sections,
  };
}
