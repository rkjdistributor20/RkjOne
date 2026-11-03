import { describe, expect, it } from "vitest";
import { hasCompleteFiuuApplicationsConfig } from "./health";

const VALID_MAPPING = {
  BR001: {
    organizationId: "11111111-1111-4111-8111-111111111111",
    branchId: "22222222-2222-4222-8222-222222222222",
    applicationCode: "application-code",
    secretKey: "server-only-secret",
    storeId: "STORE001",
    terminalId: "TERM001",
  },
};

describe("Fiuu OPA configuration health", () => {
  it("accepts a complete tenant-bound six-field mapping", () => {
    expect(hasCompleteFiuuApplicationsConfig(JSON.stringify(VALID_MAPPING))).toBe(true);
  });

  it.each([
    "organizationId",
    "branchId",
    "applicationCode",
    "secretKey",
    "storeId",
    "terminalId",
  ])("rejects a mapping missing %s", (field) => {
    const entry = { ...VALID_MAPPING.BR001 } as Record<string, string>;
    delete entry[field];

    expect(hasCompleteFiuuApplicationsConfig(JSON.stringify({ BR001: entry }))).toBe(false);
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
