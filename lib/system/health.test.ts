import { describe, expect, it, vi } from "vitest";
import {
  buildLaunchControl,
  hasCompleteFiuuApplicationsConfig,
  hasFiuuDatabaseSchema,
} from "./health";

const VALID_MAPPING = {
  BR001: {
    organizationId: "11111111-1111-4111-8111-111111111111",
    branchId: "22222222-2222-4222-8222-222222222222",
    applicationCode: "application-code",
    secretKey: "server-only-secret",
    storeId: "STORE001",
    terminalId: "TERM001",
    credentialVersion: "v1.2026-11-03",
  },
};

describe("Fiuu OPA configuration health", () => {
  it("accepts a complete tenant-bound mapping with credential version", () => {
    expect(hasCompleteFiuuApplicationsConfig(JSON.stringify(VALID_MAPPING))).toBe(true);
  });

  it.each([
    "organizationId",
    "branchId",
    "applicationCode",
    "secretKey",
    "storeId",
    "terminalId",
    "credentialVersion",
  ])("rejects a mapping missing %s", (field) => {
    const entry = { ...VALID_MAPPING.BR001 } as Record<string, string>;
    delete entry[field];

    expect(hasCompleteFiuuApplicationsConfig(JSON.stringify({ BR001: entry }))).toBe(false);
  });

  it.each([
    "",
    " leading-space",
    "trailing-space ",
    "contains/slash",
    "version-that-is-longer-than-thirty-two-characters",
  ])("rejects invalid credentialVersion %j", (credentialVersion) => {
    expect(hasCompleteFiuuApplicationsConfig(JSON.stringify({
      BR001: { ...VALID_MAPPING.BR001, credentialVersion },
    }))).toBe(false);
  });

  it("rejects empty, malformed, non-canonical and duplicate-normalized mappings", () => {
    expect(hasCompleteFiuuApplicationsConfig(undefined)).toBe(false);
    expect(hasCompleteFiuuApplicationsConfig("not-json")).toBe(false);
    expect(hasCompleteFiuuApplicationsConfig("{}")).toBe(false);
    expect(hasCompleteFiuuApplicationsConfig(JSON.stringify({ BR037: VALID_MAPPING.BR001 }))).toBe(false);
    expect(hasCompleteFiuuApplicationsConfig(JSON.stringify({
      BR001: VALID_MAPPING.BR001,
      br001: VALID_MAPPING.BR001,
    }))).toBe(false);
  });
});

type SchemaProbeClient = Parameters<typeof hasFiuuDatabaseSchema>[0];

function createSchemaProbe(input?: {
  failingTable?: string;
  readiness?: boolean;
  rpcError?: boolean;
  rpcThrows?: boolean;
}) {
  const from = vi.fn((table: string) => ({
    select: vi.fn(async () => ({
      error: table === input?.failingTable ? new Error("missing") : null,
    })),
  }));
  const rpc = vi.fn(async () => {
    if (input?.rpcThrows) throw new Error("function missing");
    return {
      data: input?.readiness ?? true,
      error: input?.rpcError ? new Error("rpc unavailable") : null,
    };
  });

  return {
    client: { from, rpc } as unknown as SchemaProbeClient,
    from,
    rpc,
  };
}

describe("Fiuu database rollout-control health", () => {
  it("passes only when rollout table and readiness RPC are available", async () => {
    const { client, from, rpc } = createSchemaProbe();

    await expect(hasFiuuDatabaseSchema(client)).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("pos_fiuu_opa_branch_rollouts");
    expect(rpc).toHaveBeenCalledWith(
      "is_pos_fiuu_opa_rollout_control_ready",
    );
  });

  it("fails closed when the rollout table is missing", async () => {
    const { client, rpc } = createSchemaProbe({
      failingTable: "pos_fiuu_opa_branch_rollouts",
    });

    await expect(hasFiuuDatabaseSchema(client)).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { readiness: false },
    { rpcError: true },
    { rpcThrows: true },
  ])("fails closed when rollout readiness is unavailable: %j", async (input) => {
    const { client } = createSchemaProbe(input);

    await expect(hasFiuuDatabaseSchema(client)).resolves.toBe(false);
  });
});

const BASE_LAUNCH_INPUT: Parameters<typeof buildLaunchControl>[0] = {
  hasSupabaseEnv: true,
  hasFiuuCredentials: true,
  hasFiuuRecoveryWorkerConfig: true,
  hasFiuuRecoveryOperationalGate: false,
  hasFiuuVtPilot: false,
  hasFiuuCloudEcrPilot: false,
  hasFiuuSchema: true,
  posQrPaymentMode: "fiuu",
  branches: 36,
  legalEntities: 3,
  activeProfiles: 1,
  activeAdmins: 1,
  activeProfilesMissingLegalEntity: 0,
  activeProfilesWithoutAuthUser: 0,
  activeProfilesNeverSignedIn: 0,
  migrationRows: 1,
};

describe("Fiuu recovery launch gate", () => {
  it("keeps payment launch waiting when only worker config is present", () => {
    const payment = buildLaunchControl(BASE_LAUNCH_INPUT).items.find(
      (item) => item.key === "payment-live",
    );

    expect(payment?.status).toBe("WAITING");
    expect(payment?.summary).toContain("tiada bukti scheduler");
  });

  it("allows payment launch action only after the operational gate is proven", () => {
    const payment = buildLaunchControl({
      ...BASE_LAUNCH_INPUT,
      hasFiuuRecoveryOperationalGate: true,
    }).items.find((item) => item.key === "payment-live");

    expect(payment?.status).toBe("ACTION");
  });
});
