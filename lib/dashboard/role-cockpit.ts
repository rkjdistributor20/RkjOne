import type { UserRole } from "@/types/enums";
import type { DashboardStats } from "@/types/database";
import type { RoleWorkflow } from "@/lib/dashboard/role-workflows";
import { LEGAL_ENTITIES } from "@/lib/brand/legal-entities";
import {
  EXCEPTION_STATUS_FLOW,
  approvalMatrixForRole,
  type ApprovalMatrixRule,
  type GovernanceTone,
} from "@/lib/workflow/exception-governance";

export type RoleCockpitSignal = {
  label: string;
  value: string;
  description: string;
  href: string;
  tone: "default" | "success" | "warning" | "danger";
};

export type RoleCockpitAction = {
  title: string;
  description: string;
  href: string;
  badge: string;
};

export type RoleCockpitHandoff = {
  title: string;
  from: string;
  to: string;
  description: string;
  href: string;
  tone: "default" | "success" | "warning" | "danger" | "info";
};

export type RoleCockpitRhythm = {
  time: string;
  title: string;
  description: string;
  href: string;
};

export type RoleCockpitSla = {
  title: string;
  target: string;
  owner: string;
  trigger: string;
  href: string;
  tone: GovernanceTone;
};

export type RoleCockpitAuditControl = {
  title: string;
  evidence: string;
  risk: string;
  href: string;
  tone: GovernanceTone;
};

export type RoleCockpit = {
  title: string;
  subtitle: string;
  companyScope: string;
  boundary: string;
  prediction: string;
  focusMode: string;
  commandPath: string[];
  signals: RoleCockpitSignal[];
  actions: RoleCockpitAction[];
  handoffs: RoleCockpitHandoff[];
  rhythm: RoleCockpitRhythm[];
  exceptionFlow: string[];
  slaRules: RoleCockpitSla[];
  approvalMatrix: ApprovalMatrixRule[];
  auditControls: RoleCockpitAuditControl[];
};

export type RoleCockpitInput = {
  role: UserRole;
  workflow: RoleWorkflow;
  legalEntityCode?: string | null;
  stats?: DashboardStats | null;
  branchCount?: number | null;
  specialAssignmentCount?: number;
};

function legalEntityLabel(code?: string | null) {
  return (
    LEGAL_ENTITIES.find((entity) => entity.code === code)?.legalName ??
    "Roti Kaya Junus Group"
  );
}

function roleBoundary(role: UserRole, legalEntityCode?: string | null) {
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return "Boleh pantau semua syarikat, tetapi tindakan tetap dipecahkan ikut legal entity, cawangan dan modul.";
  }
  if (role === "AREA_MANAGER") {
    return "Fokus kepada cawangan dalam kawasan sendiri; data syarikat lain hanya muncul bila berkaitan tugasan rasmi.";
  }
  if (role === "SALES_AGENT") {
    return "Fokus kepada akaun ejen, order stok, payment, outlet POS dan staf jualan ejen sahaja.";
  }
  if (legalEntityCode === "RKJ_MFG") {
    return "Fokus kilang, production, bahan mentah dan handoff stok. Data Distributor/Retail hanya melalui order rasmi.";
  }
  if (legalEntityCode === "RKJ_DIST") {
    return "Fokus HQ Distributor, logistik, driver, agent dan support cawangan. Data kilang/retail tidak bercampur tanpa tugasan.";
  }
  if (legalEntityCode === "RKJ") {
    return "Fokus cawangan, POS, syif, inventory kiosk dan pelanggan. Maklumat dalaman Distributor/Kilang tidak dipaparkan.";
  }
  return "Dashboard ikut role, syarikat majikan dan skop branch yang ditetapkan oleh Pentadbir Utama.";
}

function focusMode(role: UserRole, legalEntityCode?: string | null) {
  if (role === "HR") return "HR + Gaji";
  if (role === "FINANCE") return "Kutipan + Reconciliation";
  if (role === "DRIVER") return "Route + POD";
  if (role === "MAINTENANCE_MANAGER") return "Ticket + Staf Ganti";
  if (role === "AREA_MANAGER") return "Kawasan + Stok + Syif";
  if (role === "SALES_AGENT") return "Order + POS Outlet";
  if (legalEntityCode === "RKJ_MFG") return "Production + Bahan Mentah";
  if (legalEntityCode === "RKJ_DIST") return "HQ + Logistik + Agent";
  if (legalEntityCode === "RKJ") return "Cawangan + POS";
  return "Operasi Harian";
}

function prediction(
  role: UserRole,
  workflow: RoleWorkflow,
  stats?: DashboardStats | null,
) {
  if ((stats?.critical_stock_count ?? 0) > 0) {
    return "AI cadang semak stok kritikal dahulu sebelum buka tugasan lain.";
  }
  if ((stats?.pending_approvals ?? 0) > 0) {
    return "AI cadang selesaikan kelulusan tertunda supaya aliran kerja tidak tersekat.";
  }
  if (
    (stats?.outstanding_cash ?? 0) > 0 &&
    (role === "FINANCE" ||
      role === "ADMIN" ||
      role === "SUPER_ADMIN" ||
      role === "AREA_MANAGER" ||
      role === "OPERATION_MANAGER")
  ) {
    return "AI cadang reconcile tunai tertunggak dan semak bank-in sebelum tutup hari.";
  }
  const first = workflow.steps[0]?.title ?? "Semak dashboard";
  return `AI cadang mulakan dengan "${first}" dan ikut urutan SOP hingga selesai.`;
}

function buildSignals(input: RoleCockpitInput): RoleCockpitSignal[] {
  const signals: RoleCockpitSignal[] = [];
  const { stats, branchCount, specialAssignmentCount, role } = input;

  if (branchCount != null) {
    signals.push({
      label: "Skop Cawangan",
      value: String(branchCount),
      description: "Cawangan di bawah pantauan dashboard ini.",
      href: "/dashboard",
      tone: branchCount > 0 ? "success" : "default",
    });
  }

  if (stats) {
    signals.push({
      label: "Kelulusan",
      value: String(stats.pending_approvals ?? 0),
      description:
        (stats.pending_approvals ?? 0) > 0
          ? "Perlu tindakan supaya operasi tidak tersekat."
          : "Tiada kelulusan tertunda.",
      href: "/approvals",
      tone: (stats.pending_approvals ?? 0) > 0 ? "warning" : "success",
    });
    signals.push({
      label: "Stok Kritikal",
      value: String(stats.critical_stock_count ?? 0),
      description:
        (stats.critical_stock_count ?? 0) > 0
          ? "Semak stok sebelum jualan/production terganggu."
          : "Tiada stok kritikal dikesan.",
      href: "/inventory",
      tone: (stats.critical_stock_count ?? 0) > 0 ? "danger" : "success",
    });
    if (
      role === "FINANCE" ||
      role === "SUPER_ADMIN" ||
      role === "ADMIN" ||
      role === "AREA_MANAGER" ||
      role === "OPERATION_MANAGER"
    ) {
      signals.push({
        label: "Tunai Tertunggak",
        value: `RM ${(stats.outstanding_cash ?? 0).toLocaleString("ms-MY", { minimumFractionDigits: 2 })}`,
        description:
          role === "AREA_MANAGER"
            ? "Semak collection dan bank-in kawasan sendiri."
            : "Semak collection dan bank-in.",
        href: "/finance",
        tone: (stats.outstanding_cash ?? 0) > 0 ? "warning" : "success",
      });
    }
  }

  if ((specialAssignmentCount ?? 0) > 0) {
    signals.push({
      label: "Ejen Khas",
      value: String(specialAssignmentCount),
      description: "Tugasan khas ejen aktif pada profile ini.",
      href: "/sales-agent",
      tone: "warning",
    });
  }

  if (signals.length === 0) {
    signals.push({
      label: "Status Kerja",
      value: "Aktif",
      description: "Ikut SOP role dan selesaikan tugasan mengikut urutan.",
      href: "/dashboard",
      tone: "default",
    });
  }

  return signals.slice(0, 4);
}

function commandPath(role: UserRole, legalEntityCode?: string | null) {
  if (role === "DRIVER") {
    return ["Terima route", "Ambil stok", "Hantar & POD", "Lapor isu"];
  }
  if (role === "AREA_MANAGER") {
    return ["Pantau kawasan", "Arah staf", "Sahkan exception", "Lapor OM"];
  }
  if (role === "STAFF") {
    return ["Buka syif", "Sahkan stok", "Jualan POS", "Tutup syif"];
  }
  if (role === "SALES_AGENT") {
    return ["Semak harga", "Order stok", "Terima stok", "Urus POS"];
  }
  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_DIST") {
    return ["Terima kilang", "Rancang route", "Arah driver", "Pantau ejen"];
  }
  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_MFG") {
    return ["Terima order", "Rancang production", "Rekod bahan", "Serah stok"];
  }
  if (role === "OPERATION_MANAGER") {
    return ["Pantau cawangan", "Arah AM", "Sahkan exception", "Lapor owner"];
  }
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return ["Pantau exception", "Delegate", "Sahkan risiko", "Audit hasil"];
  }
  return ["Semak tugas", "Laksana SOP", "Rekod bukti", "Sahkan selesai"];
}

function buildHandoffs(input: RoleCockpitInput): RoleCockpitHandoff[] {
  const { role, legalEntityCode } = input;

  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_DIST") {
    return [
      {
        title: "Handoff kilang ke HQ Distributor",
        from: "RKJ Manufacturing",
        to: "HQ Distributor",
        description:
          "Terima order production yang disahkan, semak batch dan pecahkan kuantiti mengikut cawangan atau ejen.",
        href: "/warehouse",
        tone: "success",
      },
      {
        title: "Arahan route kepada driver",
        from: "HQ Distributor",
        to: "Driver",
        description:
          "Gabungkan DO, pilih driver, susun hentian, kemudian pantau status keluar, sampai dan POD.",
        href: "/fleet",
        tone: "info",
      },
      {
        title: "Exception cawangan kepada AM/OM",
        from: "Staf / AM",
        to: "OM Distributor",
        description:
          "Jika stok tidak sama, driver lewat, atau cawangan tutup, sahkan tindakan supaya rekod rasmi tidak bercampur.",
        href: "/approvals",
        tone: "warning",
      },
      {
        title: "Order dan group rate ejen",
        from: "Ejen",
        to: "HQ Distributor",
        description:
          "Semak order, group rate, POS outlet, pickup point dan status bayaran sebelum route dihantar.",
        href: "/sales-agent",
        tone: "default",
      },
    ];
  }

  if (role === "DRIVER") {
    return [
      {
        title: "Route harian diterima",
        from: "HQ / OM Distributor",
        to: "Driver",
        description:
          "Driver semak kenderaan, stok yang perlu dibawa, urutan hentian dan pickup point sebelum keluar.",
        href: "/fleet",
        tone: "info",
      },
      {
        title: "Serahan stok ke cawangan/ejen",
        from: "Driver",
        to: "Staf Cawangan / Ejen",
        description:
          "Setiap hentian perlu update status, masa sampai, bukti serahan dan catatan jika kiosk tutup.",
        href: "/fleet",
        tone: "success",
      },
      {
        title: "Beza stok perlu disahkan",
        from: "Staf / Ejen",
        to: "AM / OM",
        description:
          "Jika jumlah diterima tidak sama, staf hantar laporan dan AM/OM sahkan sebelum stok rasmi berubah.",
        href: "/approvals",
        tone: "warning",
      },
      {
        title: "Isu kenderaan atau route",
        from: "Driver",
        to: "Maintenance / HQ",
        description:
          "Lapor kerosakan, kelewatan, pickup gagal atau perubahan route supaya operasi boleh disusun semula.",
        href: "/maintenance",
        tone: "danger",
      },
    ];
  }

  if (role === "AREA_MANAGER") {
    return [
      {
        title: "Sasaran harian kawasan",
        from: "OM / HQ",
        to: "AM",
        description:
          "AM fokus POS buka, staf hadir, stok cukup, cash collection dan cawangan bermasalah dalam kawasan sendiri.",
        href: "/dashboard",
        tone: "info",
      },
      {
        title: "Arahan operasi cawangan",
        from: "AM",
        to: "Staf Jualan",
        description:
          "Tetapkan syif, semak stok, selesaikan request barang, pastikan kiosk beroperasi ikut SOP.",
        href: "/shifts",
        tone: "success",
      },
      {
        title: "Pengesahan stok dan isu",
        from: "Staf Jualan",
        to: "AM",
        description:
          "AM semak kiraan stok, beza delivery, maintenance, cuti kecemasan dan keperluan staf ganti.",
        href: "/inventory",
        tone: "warning",
      },
      {
        title: "Escalation kepada OM",
        from: "AM",
        to: "OM",
        description:
          "Naikkan hanya isu kawasan yang perlukan keputusan lebih tinggi: cash tertunggak, driver gagal, permit atau disiplin.",
        href: "/approvals",
        tone: "default",
      },
    ];
  }

  if (role === "STAFF") {
    return [
      {
        title: "Arahan syif dan kiosk",
        from: "AM / Branch Manager",
        to: "Staf Jualan",
        description:
          "Staf hanya fokus buka syif, sahkan stok, jualan POS, laporan ringkas dan tutup syif.",
        href: "/pos",
        tone: "info",
      },
      {
        title: "Delivery masuk cawangan",
        from: "Driver",
        to: "Staf Jualan",
        description:
          "Jika stok dihantar semasa kiosk tutup, staf pertama yang masuk wajib sahkan penerimaan sebelum jualan.",
        href: "/pos",
        tone: "warning",
      },
      {
        title: "Jualan dan stok POS",
        from: "Staf Jualan",
        to: "POS",
        description:
          "Kiraan pembukaan, pertengahan syif dan tutup syif direkod supaya baki stok, gaji dan laporan tepat.",
        href: "/pos",
        tone: "success",
      },
      {
        title: "Laporan isu kepada AM",
        from: "Staf Jualan",
        to: "AM / OM",
        description:
          "Request barang, beza stok, maintenance, keluar kiosk dan isu customer dihantar ikut kategori yang betul.",
        href: "/maintenance",
        tone: "default",
      },
    ];
  }

  if (role === "SALES_AGENT") {
    return [
      {
        title: "Order stok ejen",
        from: "Ejen",
        to: "HQ Distributor",
        description:
          "Order ikut group rate, jadual production dan status bayaran atau syarat Ejen Khas.",
        href: "/sales-agent",
        tone: "info",
      },
      {
        title: "Route ejen/pickup point",
        from: "HQ Distributor",
        to: "Driver",
        description:
          "Pickup point dan cawangan POS ejen masuk dalam route driver bersama cawangan syarikat.",
        href: "/fleet",
        tone: "success",
      },
      {
        title: "Penerimaan stok",
        from: "Driver",
        to: "Ejen / Outlet POS",
        description:
          "Ejen sahkan stok diterima; jika ada beza, status menunggu semakan HQ Distributor.",
        href: "/sales-agent",
        tone: "warning",
      },
      {
        title: "Staf jualan ejen",
        from: "Ejen",
        to: "Staf Jualan Ejen",
        description:
          "Jika POS aktif, ejen boleh daftar staf jualan, pautkan outlet dan kawal akses operasi.",
        href: "/sales-agent",
        tone: "default",
      },
    ];
  }

  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_MFG") {
    return [
      {
        title: "Order HQ masuk kilang",
        from: "HQ Distributor",
        to: "Kilang",
        description:
          "Order disusun mengikut production date, batch dan kapasiti bahan mentah.",
        href: "/factory",
        tone: "info",
      },
      {
        title: "Arahan production",
        from: "OM Kilang",
        to: "Staf Kilang",
        description:
          "Staf kilang rekod bahan mentah keluar, batch siap, reject dan stok siap untuk handoff.",
        href: "/factory",
        tone: "success",
      },
      {
        title: "Stok siap diserahkan",
        from: "Kilang",
        to: "HQ Distributor",
        description:
          "Stok siap dihantar ke cross-dock, kemudian terus ke route driver.",
        href: "/warehouse",
        tone: "default",
      },
      {
        title: "Exception production",
        from: "OM Kilang",
        to: "Owner / HQ",
        description:
          "Hanya escalate bila bahan kritikal, batch gagal, kapasiti tidak cukup atau order perlu ditunda.",
        href: "/approvals",
        tone: "warning",
      },
    ];
  }

  if (role === "OPERATION_MANAGER") {
    return [
      {
        title: "Arahan operasi cawangan",
        from: "OM",
        to: "AM",
        description:
          "OM semak kawasan, target jualan, staf, cash collection dan isu cawangan.",
        href: "/dashboard",
        tone: "info",
      },
      {
        title: "Pelaksanaan kawasan",
        from: "AM",
        to: "Staf Jualan",
        description:
          "AM arah syif, stok, request barang, maintenance dan disiplin harian.",
        href: "/shifts",
        tone: "success",
      },
      {
        title: "Bukti dan laporan",
        from: "Staf / AM",
        to: "OM",
        description:
          "POS, stok, cash, attendance dan maintenance disemak sebelum naik kepada owner.",
        href: "/reports",
        tone: "default",
      },
    ];
  }

  return [
    {
      title: "Tugas utama role",
      from: input.workflow.label,
      to: "Modul RKJ One",
      description:
        "Ikut skop role, syarikat majikan dan cawangan yang telah ditetapkan.",
      href: input.workflow.steps[0]?.href ?? "/dashboard",
      tone: "default",
    },
    {
      title: "Rekod bukti kerja",
      from: "Pengguna",
      to: "Dashboard",
      description:
        "Setiap tindakan penting perlu ada status, masa, nota atau bukti ringkas.",
      href: "/dashboard",
      tone: "success",
    },
  ];
}

function buildRhythm(input: RoleCockpitInput): RoleCockpitRhythm[] {
  const { role, legalEntityCode } = input;

  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_DIST") {
    return [
      {
        time: "Pagi",
        title: "Kunci order dan stok masuk",
        description:
          "Semak order kilang, order ejen, stok cross-dock dan keperluan cawangan.",
        href: "/warehouse",
      },
      {
        time: "Sebelum route",
        title: "Sahkan driver dan hentian",
        description:
          "Pastikan driver, kenderaan, cawangan, ejen dan pickup point lengkap.",
        href: "/fleet",
      },
      {
        time: "Tengah hari",
        title: "Kejar exception",
        description:
          "Selesaikan beza stok, kiosk tutup, bayaran ejen dan route yang tertangguh.",
        href: "/approvals",
      },
      {
        time: "Tutup hari",
        title: "Semak POD dan laporan",
        description:
          "Pastikan semua penghantaran ada status akhir atau catatan tindakan esok.",
        href: "/reports",
      },
    ];
  }

  if (role === "DRIVER") {
    return [
      {
        time: "Sebelum keluar",
        title: "Semak load dan route",
        description:
          "Pastikan stok, kenderaan dan hentian sama dengan arahan dashboard.",
        href: "/fleet",
      },
      {
        time: "Setiap hentian",
        title: "Update status & POD",
        description: "Rekod sampai, serah, penerima, bukti dan isu jika ada.",
        href: "/fleet",
      },
      {
        time: "Jika kiosk tutup",
        title: "Tanda perlu sah staf",
        description:
          "Catat penghantaran supaya staf pertama masuk boleh sahkan stok.",
        href: "/fleet",
      },
      {
        time: "Tutup route",
        title: "Serah laporan akhir",
        description: "Pastikan semua leg selesai atau ada sebab yang jelas.",
        href: "/fleet",
      },
    ];
  }

  if (role === "AREA_MANAGER") {
    return [
      {
        time: "Buka hari",
        title: "POS dan staf hadir",
        description:
          "Semak cawangan yang belum buka POS atau staf belum masuk.",
        href: "/dashboard",
      },
      {
        time: "Tengah hari",
        title: "Stok dan request cawangan",
        description:
          "Sahkan request barang, beza delivery dan pindahan stok kawasan.",
        href: "/inventory",
      },
      {
        time: "Petang",
        title: "Cash dan isu operasi",
        description:
          "Rekod collection, bank-in, maintenance dan disiplin sebelum tutup hari.",
        href: "/finance",
      },
      {
        time: "Mingguan",
        title: "Roster dan kawalan kawasan",
        description:
          "Sediakan jadual staf, spring cleaning dan meeting highway jika berkaitan.",
        href: "/shifts?tab=roster",
      },
    ];
  }

  if (role === "STAFF") {
    return [
      {
        time: "Mula syif",
        title: "Sahkan stok sebelum jualan",
        description:
          "Kira baki roti, kaya, butter dan packaging yang perlu sebelum kaunter dibuka.",
        href: "/pos",
      },
      {
        time: "Semasa jualan",
        title: "Jual ikut POS",
        description:
          "Pastikan setiap transaksi masuk POS dan payment manual/QR dicatat betul.",
        href: "/pos",
      },
      {
        time: "Pertengahan syif",
        title: "Kiraan ringkas",
        description:
          "Sistem tanya stok semasa; boleh tangguh jika sedang layan customer.",
        href: "/pos",
      },
      {
        time: "Tutup syif",
        title: "Kiraan akhir dan tamat kerja",
        description:
          "Rekod stok akhir, cash, masa tamat sebenar dan isu untuk AM.",
        href: "/pos",
      },
    ];
  }

  if (role === "SALES_AGENT") {
    return [
      {
        time: "Sebelum order",
        title: "Semak katalog dan rate",
        description:
          "Pastikan harga group rate, outlet POS dan pickup point tepat.",
        href: "/sales-agent",
      },
      {
        time: "Order stok",
        title: "Pilih produk dan tarikh",
        description:
          "Order ikut jadual production atau status Ejen Khas tanpa bayaran.",
        href: "/sales-agent",
      },
      {
        time: "Terima stok",
        title: "Sahkan delivery",
        description:
          "Semak kuantiti diterima dan lapor beza kepada HQ Distributor.",
        href: "/sales-agent",
      },
      {
        time: "Operasi POS",
        title: "Urus outlet dan staf jualan",
        description: "Jika POS aktif, pantau staf outlet dan jualan harian.",
        href: "/sales-agent",
      },
    ];
  }

  return input.workflow.steps.slice(0, 4).map((step, index) => ({
    time: index === 0 ? "Mula" : step.cadence,
    title: step.title,
    description: step.description,
    href: step.href,
  }));
}

function buildSlaRules(input: RoleCockpitInput): RoleCockpitSla[] {
  const { role, legalEntityCode } = input;

  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return [
      {
        title: "Exception kumpulan berisiko tinggi",
        target: "2 jam",
        owner: "OM / HR / Finance sebelum owner",
        trigger:
          "Jualan jatuh, stok kritikal, tunai tertunggak, access sensitif atau payroll final.",
        href: "/approvals",
        tone: "danger",
      },
      {
        title: "Delegation matrix tidak jelas",
        target: "Hari sama",
        owner: "Pentadbir Utama",
        trigger:
          "Jika tugasan masih menunggu owner walaupun patut selesai oleh OM, AM, HR atau Finance.",
        href: "/settings",
        tone: "warning",
      },
      {
        title: "Audit dokumen dan legal entity",
        target: "Bulanan",
        owner: "Admin / HR",
        trigger:
          "SSM, lesen, permit cawangan, polisi gaji, rate ejen atau dokumen profile luput.",
        href: "/reports",
        tone: "default",
      },
    ];
  }

  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_DIST") {
    return [
      {
        title: "Route driver dan POD lewat",
        target: "30-60 minit",
        owner: "HQ Distributor / OM Distributor",
        trigger:
          "Driver belum keluar, kiosk tutup, POD tidak lengkap atau pickup point ejen gagal.",
        href: "/fleet",
        tone: "danger",
      },
      {
        title: "Order ejen atau cawangan tersekat",
        target: "Hari sama",
        owner: "HQ Distributor",
        trigger:
          "Bayaran ejen, group rate, pre-order, cross-dock atau stok belum dipadankan dengan route.",
        href: "/sales-agent",
        tone: "warning",
      },
      {
        title: "Beza stok antara driver dan penerima",
        target: "90 minit",
        owner: "AM kawasan kemudian OM",
        trigger:
          "Kuantiti driver tidak sama dengan kiraan staf/ejen atau production date bercampur.",
        href: "/approvals",
        tone: "warning",
      },
      {
        title: "Kapasiti driver tidak cukup",
        target: "Sebelum route diterbit",
        owner: "OM Distributor",
        trigger:
          "Hentian terlalu banyak, helper driver diperlukan atau driver kilang ganti perlu diaktifkan.",
        href: "/fleet",
        tone: "info",
      },
    ];
  }

  if (role === "DRIVER") {
    return [
      {
        title: "Load stok tidak sama dengan arahan",
        target: "Sebelum keluar",
        owner: "Driver + HQ Distributor",
        trigger:
          "Jumlah stok, batch atau hentian tidak sama dengan arahan route di dashboard.",
        href: "/fleet",
        tone: "danger",
      },
      {
        title: "Update setiap hentian",
        target: "Serta-merta",
        owner: "Driver",
        trigger:
          "Setiap sampai, serah, gagal serah, kiosk tutup atau pickup point agent selesai.",
        href: "/fleet",
        tone: "info",
      },
      {
        title: "Kerosakan kenderaan / route berubah",
        target: "15 minit",
        owner: "Driver kepada HQ / Maintenance",
        trigger:
          "Kenderaan rosak, jalan tutup, helper tidak hadir atau masa serahan lari dari jadual.",
        href: "/maintenance",
        tone: "warning",
      },
    ];
  }

  if (role === "AREA_MANAGER") {
    return [
      {
        title: "POS cawangan belum buka",
        target: "30 minit dari jadual",
        owner: "AM kawasan",
        trigger:
          "Staf belum mula perniagaan, stok pembukaan belum disahkan atau staf tidak hadir.",
        href: "/pos",
        tone: "danger",
      },
      {
        title: "Beza stok cawangan",
        target: "90 minit",
        owner: "AM kawasan",
        trigger:
          "Opening, midsyif, closing atau delivery tidak sama dengan AI/sistem.",
        href: "/inventory",
        tone: "warning",
      },
      {
        title: "Staf dan jadual kawasan",
        target: "Mingguan",
        owner: "AM kawasan",
        trigger:
          "Roster, spring cleaning, meeting highway atau pindah staf cawangan perlu disusun.",
        href: "/shifts?tab=roster",
        tone: "default",
      },
      {
        title: "Cash collection kawasan",
        target: "Hari sama",
        owner: "AM + Finance",
        trigger:
          "Tunai tertunggak, voucher penggunaan cash, bank-in atau slip tidak lengkap.",
        href: "/finance",
        tone: "warning",
      },
    ];
  }

  if (role === "STAFF") {
    return [
      {
        title: "Pengesahan stok sebelum jualan",
        target: "Sebelum POS dibuka",
        owner: "Staf jualan",
        trigger:
          "Mula syif, delivery semasa kiosk tutup atau stok pembukaan belum dikira.",
        href: "/pos",
        tone: "danger",
      },
      {
        title: "Laporan keluar kiosk",
        target: "Sebelum tinggalkan kiosk",
        owner: "Staf jualan",
        trigger:
          "Rehat, makan, solat, tandas, ambil stok atau keluar atas arahan AM.",
        href: "/pos",
        tone: "warning",
      },
      {
        title: "Kiraan midsyif dan tutup syif",
        target: "Ikut prompt POS",
        owner: "Staf jualan",
        trigger:
          "POS minta kiraan roti, kaya, butter dan packaging mengikut production date.",
        href: "/pos",
        tone: "info",
      },
    ];
  }

  if (role === "SALES_AGENT") {
    return [
      {
        title: "Order stok dan group rate",
        target: "Sebelum cut-off order",
        owner: "Ejen / HQ Distributor",
        trigger:
          "Ejen buat order, pilih pickup point, atau Ejen Khas order tanpa bayaran.",
        href: "/sales-agent",
        tone: "info",
      },
      {
        title: "POS outlet ejen",
        target: "Hari sama",
        owner: "Ejen / HQ Distributor",
        trigger:
          "Outlet POS aktif, staf jualan ejen dipaut atau langganan POS RM200/cawangan.",
        href: "/sales-agent",
        tone: "warning",
      },
      {
        title: "Penerimaan stok ejen",
        target: "Serta-merta selepas driver sampai",
        owner: "Ejen / Staf outlet",
        trigger:
          "Stok diterima dari driver, pickup point berubah atau kuantiti tidak sama.",
        href: "/sales-agent",
        tone: "default",
      },
    ];
  }

  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_MFG") {
    return [
      {
        title: "Order HQ belum masuk jadual kilang",
        target: "Hari sama",
        owner: "OM Kilang",
        trigger:
          "Order ramalan/pre-order tidak masuk production schedule atau minggu belum diterbit.",
        href: "/factory",
        tone: "danger",
      },
      {
        title: "Bahan mentah kritikal",
        target: "Sebelum production",
        owner: "OM Kilang / Store",
        trigger:
          "Roti, kaya, butter, packaging atau bahan supplier tidak cukup untuk batch.",
        href: "/factory",
        tone: "warning",
      },
      {
        title: "Handoff stok siap",
        target: "Sebelum route Distributor",
        owner: "Kilang + HQ Distributor",
        trigger:
          "Batch siap, reject, kuantiti siap atau stok perlu serah ke cross-dock.",
        href: "/warehouse",
        tone: "info",
      },
    ];
  }

  if (role === "HR") {
    return [
      {
        title: "Permohonan cuti dan masalah kehadiran",
        target: "Hari sama",
        owner: "HR / AM",
        trigger:
          "Staf hantar cuti, laporan kehadiran, medical, MC atau pembetulan masa kerja.",
        href: "/hr",
        tone: "warning",
      },
      {
        title: "Payroll exception",
        target: "Sebelum jana payslip",
        owner: "HR + Finance",
        trigger:
          "OT, potongan rehat lebih masa, cuti tanpa gaji, gaji syarikat berbeza atau staf baru.",
        href: "/hr?tab=payroll",
        tone: "danger",
      },
    ];
  }

  if (role === "FINANCE") {
    return [
      {
        title: "Bank-in dan tunai tertunggak",
        target: "Hari sama",
        owner: "Finance",
        trigger:
          "Cash collection belum dipadan, QR manual belum sah atau voucher cash belum lengkap.",
        href: "/finance",
        tone: "danger",
      },
      {
        title: "Payroll payout readiness",
        target: "Sebelum payroll final",
        owner: "Finance + HR",
        trigger:
          "Payslip preview, bank staff, potongan, elaun dan jumlah bersih perlu disahkan.",
        href: "/hr?tab=payroll",
        tone: "warning",
      },
    ];
  }

  return [
    {
      title: "Tugasan role belum selesai",
      target: "Hari sama",
      owner: input.workflow.label,
      trigger:
        "Ada step SOP, kelulusan, stok, syif atau laporan yang belum lengkap.",
      href: input.workflow.steps[0]?.href ?? "/dashboard",
      tone: "default",
    },
  ];
}

function buildAuditControls(
  input: RoleCockpitInput,
): RoleCockpitAuditControl[] {
  const { role, legalEntityCode } = input;

  const base: RoleCockpitAuditControl[] = [
    {
      title: "Jejak masa dan pemilik tugas",
      evidence:
        "Setiap tindakan penting mesti ada masa mula/tamat, nama pengguna dan status akhir.",
      risk: "Jika tiada timestamp, sukar tentukan siapa bertanggungjawab bila isu berlaku.",
      href: "/reports",
      tone: "default",
    },
  ];

  if (role === "STAFF") {
    return [
      {
        title: "Bukti buka POS dan mula perniagaan",
        evidence:
          "Masa mula kerja, kiraan stok pembukaan, delivery diterima dan status POS terbuka.",
        risk: "Jualan tidak boleh bermula tanpa stok disahkan dan masa kerja direkod.",
        href: "/pos",
        tone: "danger",
      },
      {
        title: "Kiraan stok ikut production date",
        evidence:
          "Opening, midsyif dan closing untuk roti, kaya, butter serta packaging.",
        risk: "Beza stok perlu tunggu AM/OM sebelum menjadi stok rasmi.",
        href: "/pos",
        tone: "warning",
      },
      {
        title: "Keluar kiosk direkod",
        evidence:
          "Sebab keluar, masa keluar, masa kembali dan pengecualian ambil stok.",
        risk: "Lebih 1 jam tanpa alasan sah boleh masuk kiraan potongan gaji.",
        href: "/pos",
        tone: "info",
      },
    ];
  }

  if (role === "DRIVER") {
    return [
      {
        title: "Proof of delivery setiap hentian",
        evidence:
          "Masa sampai, penerima, kuantiti, status kiosk tutup dan bukti serahan.",
        risk: "POD kosong menyebabkan stok tidak boleh disahkan oleh cawangan/ejen.",
        href: "/fleet",
        tone: "danger",
      },
      {
        title: "Kenderaan dan helper driver",
        evidence:
          "Driver utama, pembantu, kenderaan, route dan isu kenderaan direkod.",
        risk: "Route bercampur tanpa rekod menyukarkan audit penghantaran.",
        href: "/fleet",
        tone: "warning",
      },
    ];
  }

  if (role === "AREA_MANAGER") {
    return [
      {
        title: "Approval stok cawangan",
        evidence:
          "Kiraan staf, AI estimate, reason beza stok dan keputusan AM/OM.",
        risk: "Stok rasmi boleh tersasar jika approval dibuat tanpa semakan batch.",
        href: "/approvals",
        tone: "warning",
      },
      {
        title: "Kawalan staf kawasan",
        evidence:
          "Roster, masuk syif, pindah cawangan, cuti, masalah kehadiran dan tindakan AM.",
        risk: "Payroll dan operasi bercanggah jika staf bekerja luar kawasan tanpa kelulusan.",
        href: "/shifts",
        tone: "info",
      },
      {
        title: "Cash dan voucher kawasan",
        evidence:
          "Collection, cash usage voucher, slip bank-in dan baki tunai.",
        risk: "Tunai tertunggak tanpa bukti perlu escalate kepada Finance/OM.",
        href: "/finance",
        tone: "danger",
      },
    ];
  }

  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_DIST") {
    return [
      {
        title: "Route command center",
        evidence:
          "Order kilang, DO cawangan, ejen, driver, pickup point dan status POD.",
        risk: "Jika route tidak lengkap, cawangan dan ejen mungkin tidak terima stok.",
        href: "/fleet",
        tone: "danger",
      },
      {
        title: "Agent access dan group rate",
        evidence:
          "Jenis ejen, group rate, langganan POS, outlet, staf jualan dan status bayaran.",
        risk: "Ejen biasa dan Ejen Khas tidak boleh bercampur akses atau bayaran.",
        href: "/sales-agent",
        tone: "warning",
      },
      {
        title: "Cross-dock handoff",
        evidence:
          "Batch kilang diterima, kuantiti pecahan, route dan driver ditetapkan.",
        risk: "Stok dari kilang tidak boleh terus dianggap sampai cawangan tanpa POD.",
        href: "/warehouse",
        tone: "info",
      },
    ];
  }

  if (role === "OPERATION_MANAGER" && legalEntityCode === "RKJ_MFG") {
    return [
      {
        title: "Batch production trail",
        evidence:
          "Order HQ, production date, bahan mentah keluar, batch siap dan reject.",
        risk: "Stok siap tidak boleh dihantar tanpa batch dan kuantiti sah.",
        href: "/factory",
        tone: "danger",
      },
      {
        title: "Raw material usage",
        evidence:
          "Resipi, penggunaan bahan, stok supplier, packaging dan baki store.",
        risk: "Kos production dan stok kilang tidak tepat jika penggunaan tidak direkod.",
        href: "/factory",
        tone: "warning",
      },
    ];
  }

  if (role === "SALES_AGENT") {
    return [
      {
        title: "Profil ejen dan outlet POS",
        evidence:
          "Company ejen, PIC, rate, POS outlet, pickup point dan staf jualan.",
        risk: "Order dan route tidak tepat jika profile atau pickup point tidak dikemaskini.",
        href: "/sales-agent",
        tone: "warning",
      },
      {
        title: "Penerimaan stok ejen",
        evidence:
          "Driver, kuantiti diterima, production date dan laporan beza stok.",
        risk: "Beza stok ejen perlu menunggu HQ Distributor sebelum rasmi.",
        href: "/sales-agent",
        tone: "info",
      },
    ];
  }

  if (role === "HR" || role === "FINANCE") {
    return [
      {
        title: "Payroll audit trail",
        evidence:
          "Attendance, leave, OT, deduction, allowance, payslip preview dan final approval.",
        risk: "Gaji tiga syarikat perlu jelas mengikut legal employer masing-masing.",
        href: "/hr?tab=payroll",
        tone: "danger",
      },
      {
        title: "Data pekerja dan akses",
        evidence:
          "Profile staf, role, company, leave balance, access level dan status aktif.",
        risk: "Akses salah boleh buka data syarikat lain kepada pengguna tidak berkaitan.",
        href: "/hr",
        tone: "warning",
      },
    ];
  }

  return base;
}

export function buildRoleCockpit(input: RoleCockpitInput): RoleCockpit {
  const companyScope =
    input.workflow.companyScope || legalEntityLabel(input.legalEntityCode);
  const actions = input.workflow.steps.slice(0, 4).map((step, index) => ({
    title: step.title,
    description: step.description,
    href: step.href,
    badge: index === 0 ? "Mula di sini" : step.cadence,
  }));

  return {
    title: input.workflow.label,
    subtitle: input.workflow.primaryObjective,
    companyScope,
    boundary: roleBoundary(input.role, input.legalEntityCode),
    prediction: prediction(input.role, input.workflow, input.stats),
    focusMode: focusMode(input.role, input.legalEntityCode),
    commandPath: commandPath(input.role, input.legalEntityCode),
    signals: buildSignals(input),
    actions,
    handoffs: buildHandoffs(input),
    rhythm: buildRhythm(input),
    exceptionFlow: [...EXCEPTION_STATUS_FLOW],
    slaRules: buildSlaRules(input),
    approvalMatrix: approvalMatrixForRole(input.role),
    auditControls: buildAuditControls(input),
  };
}
