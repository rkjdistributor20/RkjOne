import type { ApprovalRequest } from "@/lib/approvals/types";
import type { UserRole } from "@/types/enums";

export type GovernanceTone =
  "default" | "success" | "warning" | "danger" | "info";

export type ExceptionGovernance = {
  category: string;
  owner: string;
  slaLabel: string;
  slaMinutes: number;
  ageLabel: string;
  overdue: boolean;
  dueSoon: boolean;
  evidence: string;
  escalation: string;
  tone: GovernanceTone;
};

export type ApprovalMatrixRule = {
  id: string;
  trigger: string;
  firstOwner: string;
  finalOwner: string;
  evidence: string;
  sla: string;
  href: string;
  tone: GovernanceTone;
};

export const EXCEPTION_STATUS_FLOW = [
  "Dikesan",
  "Disemak",
  "Dalam tindakan",
  "Perlu kelulusan",
  "Selesai",
  "Audit",
] as const;

export const APPROVAL_MATRIX: ApprovalMatrixRule[] = [
  {
    id: "stock-delivery-variance",
    trigger:
      "Beza stok delivery, kiraan POS atau stok tidak sama dengan AI/sistem",
    firstOwner: "AM kawasan",
    finalOwner: "OM / HQ jika impak rentas kawasan",
    evidence:
      "Batch, production date, kuantiti sistem, kuantiti fizikal, penerima dan catatan driver",
    sla: "90 minit",
    href: "/approvals",
    tone: "warning",
  },
  {
    id: "route-pod-delay",
    trigger: "Driver lewat, kiosk tutup, POD tidak lengkap atau route berubah",
    firstOwner: "HQ Distributor",
    finalOwner: "OM Distributor",
    evidence:
      "Route, masa keluar/sampai, stop gagal, gambar/POD dan sebab kelewatan",
    sla: "30-60 minit",
    href: "/fleet",
    tone: "danger",
  },
  {
    id: "cash-risk",
    trigger:
      "Tunai tertunggak, refund, void sale atau cash reconciliation tidak seimbang",
    firstOwner: "Finance / AM",
    finalOwner: "OM / Owner untuk risiko tinggi",
    evidence:
      "Resit, bank-in, nombor transaksi, gambar slip, catatan cash usage",
    sla: "Hari sama",
    href: "/finance",
    tone: "danger",
  },
  {
    id: "shift-payroll",
    trigger:
      "Staf masuk pertengahan syif, overtime, rehat lebih masa atau payroll exception",
    firstOwner: "AM / HR",
    finalOwner: "HR + Finance sebelum payslip",
    evidence: "Masa mula/tamat, sebab, lokasi, approval AM dan rekod POS",
    sla: "Hari sama",
    href: "/shifts",
    tone: "info",
  },
  {
    id: "agent-access",
    trigger:
      "Ejen Khas, group rate, POS subscription, outlet dan staf jualan ejen",
    firstOwner: "HQ Distributor",
    finalOwner: "Owner untuk access sensitif",
    evidence:
      "Profil ejen, group rate, outlet, pickup point, staf dipaut dan status bayaran",
    sla: "1 hari bekerja",
    href: "/sales-agent",
    tone: "default",
  },
];

const MINUTE = 60 * 1000;

function ageMinutes(createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.round((Date.now() - created) / MINUTE));
}

function formatAge(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}j ${mins}m` : `${hours}j`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}h ${restHours}j` : `${days}h`;
}

function ruleForEntity(
  entityType: string,
  text: string,
): Omit<ExceptionGovernance, "ageLabel" | "overdue" | "dueSoon"> {
  const normalized = `${entityType} ${text}`.toUpperCase();

  if (
    entityType === "STOCK_TRANSFER" ||
    entityType === "STOCK_ADJUSTMENT" ||
    entityType === "STOCK_WRITE_OFF" ||
    normalized.includes("STOK")
  ) {
    return {
      category: "Stok & Delivery",
      owner: "AM / OM",
      slaLabel: "90 minit",
      slaMinutes: 90,
      evidence:
        "Batch, production date, kuantiti sistem, kuantiti fizikal, penerima dan nota beza stok.",
      escalation:
        "Jika tidak selesai dalam SLA atau melibatkan banyak cawangan, naik kepada OM.",
      tone: "warning",
    };
  }

  if (
    entityType === "POS_SHIFT_STAFF" ||
    entityType === "SHIFT" ||
    normalized.includes("SYIF") ||
    normalized.includes("STAFF")
  ) {
    return {
      category: "Syif & Kehadiran",
      owner: "AM / HR",
      slaLabel: "60 minit",
      slaMinutes: 60,
      evidence:
        "Masa mula/tamat, cawangan, peranan staf, sebab masuk syif dan bukti approval AM.",
      escalation: "Jika kesan gaji atau disiplin, HR semak sebelum payroll.",
      tone: "info",
    };
  }

  if (
    entityType === "PAYROLL" ||
    normalized.includes("GAJI") ||
    normalized.includes("PAYROLL")
  ) {
    return {
      category: "HR & Payroll",
      owner: "HR / Finance",
      slaLabel: "2 hari",
      slaMinutes: 2880,
      evidence:
        "Payroll run, attendance, OT, potongan, elaun, bank staff dan payslip preview.",
      escalation: "Owner hanya lulus payroll final atau perubahan besar.",
      tone: "default",
    };
  }

  if (
    entityType === "BANK_IN" ||
    entityType === "CASH_RECONCILIATION" ||
    entityType === "VOID_SALE" ||
    entityType === "REFUND"
  ) {
    return {
      category: "Tunai & Risiko Jualan",
      owner: "Finance / OM",
      slaLabel: "Hari sama",
      slaMinutes: 480,
      evidence:
        "Resit, bank-in slip, transaksi POS, sebab refund/void dan catatan penerima cash.",
      escalation:
        "Jika tunai tidak seimbang atau refund besar, naik kepada owner.",
      tone: "danger",
    };
  }

  if (
    normalized.includes("DRIVER") ||
    normalized.includes("ROUTE") ||
    normalized.includes("POD")
  ) {
    return {
      category: "Route & POD",
      owner: "HQ Distributor",
      slaLabel: "60 minit",
      slaMinutes: 60,
      evidence: "Route, stop, driver, masa sampai, gambar/POD dan sebab gagal.",
      escalation:
        "Jika route terganggu, OM Distributor susun semula driver atau stok.",
      tone: "danger",
    };
  }

  if (
    normalized.includes("EJEN") ||
    normalized.includes("AGENT") ||
    normalized.includes("GROUP RATE")
  ) {
    return {
      category: "Ejen & POS Outlet",
      owner: "HQ Distributor",
      slaLabel: "1 hari",
      slaMinutes: 1440,
      evidence:
        "Profil ejen, group rate, outlet/POS, pickup point dan status bayaran.",
      escalation: "Owner semak jika akses Ejen Khas atau polisi harga berubah.",
      tone: "default",
    };
  }

  return {
    category: "Kelulusan Operasi",
    owner: "AM / OM / HQ",
    slaLabel: "4 jam",
    slaMinutes: 240,
    evidence:
      "Catatan permintaan, branch, requester, sebab dan rekod sokongan.",
    escalation:
      "Naik kepada owner hanya jika melibatkan legal, gaji final, akses sensitif atau risiko wang.",
    tone: "default",
  };
}

export function deriveApprovalGovernance(
  req: ApprovalRequest,
): ExceptionGovernance {
  const base = ruleForEntity(
    req.entity_type,
    `${req.title} ${req.description ?? ""}`,
  );
  const age = ageMinutes(req.created_at);
  const dueSoon = age >= base.slaMinutes * 0.75 && age < base.slaMinutes;
  const overdue = age >= base.slaMinutes;

  return {
    ...base,
    ageLabel: formatAge(age),
    dueSoon,
    overdue,
    tone: overdue ? "danger" : dueSoon ? "warning" : base.tone,
  };
}

export function summarizeApprovalGovernance(approvals: ApprovalRequest[]) {
  const items = approvals.map(deriveApprovalGovernance);
  return {
    total: approvals.length,
    overdue: items.filter((item) => item.overdue).length,
    dueSoon: items.filter((item) => item.dueSoon).length,
    stock: items.filter((item) => item.category.includes("Stok")).length,
    cashRisk: items.filter((item) => item.category.includes("Tunai")).length,
  };
}

export function approvalMatrixForRole(role: UserRole) {
  if (role === "DRIVER" || role === "STAFF" || role === "SALES_AGENT") {
    return APPROVAL_MATRIX.filter((rule) =>
      role === "DRIVER"
        ? rule.id === "route-pod-delay" || rule.id === "stock-delivery-variance"
        : role === "SALES_AGENT"
          ? rule.id === "agent-access" || rule.id === "stock-delivery-variance"
          : rule.id === "stock-delivery-variance" ||
            rule.id === "shift-payroll",
    );
  }

  if (role === "AREA_MANAGER") {
    return APPROVAL_MATRIX.filter((rule) =>
      ["stock-delivery-variance", "cash-risk", "shift-payroll"].includes(
        rule.id,
      ),
    );
  }

  return APPROVAL_MATRIX;
}
