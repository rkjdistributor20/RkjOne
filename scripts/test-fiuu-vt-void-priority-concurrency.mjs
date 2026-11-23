import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_rkj-one";
const actorId = "95000000-0000-4000-8000-000000000001";
const shiftId = "95000000-0000-4000-8000-000000000002";

function runPsql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-Atq",
      ],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(
            `psql exited ${code}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
      }
    });
    child.stdin.end(sql);
  });
}

function parseJson(output) {
  const line = output
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith("{") && value.endsWith("}"));
  if (!line) throw new Error(`Expected JSON result, received: ${output}`);
  return JSON.parse(line);
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function cleanup() {
  const exists = await runPsql(
    "SELECT to_regclass('public._fiuu_vt_void_concurrency_context') IS NOT NULL;",
  );
  if (exists !== "t") return;

  await runPsql(`
    SET session_replication_role = replica;
    DELETE FROM public.pos_fiuu_vt_attempts
    WHERE provider_order_id LIKE 'VOIDCONC%';
    DELETE FROM public.pos_online_payments
    WHERE created_by = '${actorId}'::UUID
      AND provider_order_id LIKE 'VOIDCONC%';
    DELETE FROM public.pos_shifts WHERE id = '${shiftId}'::UUID;
    DELETE FROM public.profiles WHERE id = '${actorId}'::UUID;
    UPDATE public.pos_devices AS device
    SET device_code = backup.device_code,
        device_name = backup.device_name,
        status = backup.status,
        enrolled_at = backup.enrolled_at,
        enrolled_by = backup.enrolled_by,
        metadata = backup.metadata,
        created_by = backup.created_by,
        serial_number = backup.serial_number,
        imei = backup.imei,
        asset_verified_at = backup.asset_verified_at,
        asset_verified_by = backup.asset_verified_by,
        enrollment_generation = backup.enrollment_generation,
        updated_at = backup.updated_at
    FROM public._fiuu_vt_void_concurrency_device_backup AS backup
    WHERE device.id = backup.id;
    DROP TABLE public._fiuu_vt_void_concurrency_context;
    DROP TABLE public._fiuu_vt_void_concurrency_device_backup;
    SET session_replication_role = origin;
  `);
}

async function setup() {
  await cleanup();
  await runPsql(`
    SET session_replication_role = replica;

    CREATE TABLE public._fiuu_vt_void_concurrency_device_backup AS
    SELECT
      device.id,
      device.device_code,
      device.device_name,
      device.status,
      device.enrolled_at,
      device.enrolled_by,
      device.metadata,
      device.created_by,
      device.serial_number,
      device.imei,
      device.asset_verified_at,
      device.asset_verified_by,
      device.enrollment_generation,
      device.updated_at
    FROM public.pos_devices AS device
    JOIN public.branches AS branch ON branch.id = device.branch_id
    WHERE branch.branch_code = 'BR001'
    ORDER BY device.created_at
    LIMIT 1;

    CREATE TABLE public._fiuu_vt_void_concurrency_context AS
    SELECT
      branch.organization_id,
      branch.id AS branch_id,
      branch.branch_code,
      device.id AS device_id
    FROM public.branches AS branch
    JOIN public._fiuu_vt_void_concurrency_device_backup AS device ON true
    WHERE branch.branch_code = 'BR001'
    LIMIT 1;

    INSERT INTO public.profiles (
      id, organization_id, full_name, email, role, status,
      must_change_password
    )
    SELECT
      '${actorId}'::UUID,
      organization_id,
      'Fiuu VT concurrency test actor',
      'fiuu-vt-concurrency@example.invalid',
      'SUPER_ADMIN',
      'ACTIVE',
      false
    FROM public._fiuu_vt_void_concurrency_context;

    UPDATE public.pos_devices AS device
    SET device_code = 'POS-BR001-VOID-CONCURRENCY-TEST',
        device_name = 'BR001 VOID priority concurrency tablet',
        status = 'ACTIVE',
        enrolled_at = clock_timestamp(),
        enrolled_by = '${actorId}'::UUID,
        metadata = jsonb_build_object(
          'official_hardware_profile',
          'SAMSUNG_TAB_S10_LITE_5G_128'
        ),
        created_by = '${actorId}'::UUID,
        serial_number = 'RKJ-VOID-CONCURRENCY-001',
        imei = '990000000000021',
        asset_verified_at = clock_timestamp(),
        asset_verified_by = '${actorId}'::UUID,
        enrollment_generation = 21,
        updated_at = clock_timestamp()
    FROM public._fiuu_vt_void_concurrency_context AS context
    WHERE device.id = context.device_id;

    INSERT INTO public.pos_shifts (
      id, organization_id, branch_id, shift_number,
      opened_by, status, opening_cash
    )
    SELECT
      '${shiftId}'::UUID,
      organization_id,
      branch_id,
      'FIUU-VT-VOID-CONCURRENCY-TEST',
      '${actorId}'::UUID,
      'OPEN',
      0
    FROM public._fiuu_vt_void_concurrency_context;

    SET session_replication_role = origin;
  `);

  const count = await runPsql(
    "SELECT count(*) FROM public._fiuu_vt_void_concurrency_context;",
  );
  assert.equal(count, "1", "BR001 concurrency fixture was not created");
}

function paymentFixture({ paymentId, statusId, orderId, amount }) {
  const statusHost = `a-${statusId.replaceAll("-", "")}.fiuu-vt.rkj.one`;
  return `
    INSERT INTO public.pos_online_payments (
      id, organization_id, branch_id, shift_id, amount_rm, status, provider,
      sale_payload, created_by, expires_at, provider_order_id
    )
    SELECT
      '${paymentId}'::UUID,
      organization_id,
      branch_id,
      '${shiftId}'::UUID,
      ${amount},
      'PENDING',
      'fiuu_vt',
      jsonb_build_object(
        'fiuu_branch_code', branch_code,
        'fiuu_device_id', device_id,
        'fiuu_device_code', 'POS-BR001-VOID-CONCURRENCY-TEST',
        'fiuu_enrollment_generation', 21,
        'branchId', branch_id,
        'shiftId', '${shiftId}'::UUID,
        'qr_amount', ${amount}
      ),
      '${actorId}'::UUID,
      clock_timestamp() + interval '15 minutes',
      '${orderId}'
    FROM public._fiuu_vt_void_concurrency_context;

    INSERT INTO public.pos_fiuu_vt_attempts (
      id, payment_id, provider_order_id, op_type, callback_host, state,
      expires_at, launched_at, launch_lease_token,
      launch_lease_expires_at, launch_lease_generation
    ) VALUES (
      '${statusId}'::UUID,
      '${paymentId}'::UUID,
      '${orderId}',
      'STATUS',
      '${statusHost}',
      'LAUNCHED',
      clock_timestamp() + interval '5 minutes',
      clock_timestamp(),
      gen_random_uuid(),
      clock_timestamp() + interval '25 seconds',
      1
    );
  `;
}

function voidClaim(paymentId, voidId) {
  const callbackHost = `a-${voidId.replaceAll("-", "")}.fiuu-vt.rkj.one`;
  return `SELECT public.claim_pos_fiuu_vt_launch_lease(
    '${paymentId}'::UUID,
    'VOID',
    '${voidId}'::UUID,
    '${callbackHost}',
    gen_random_uuid(),
    '${actorId}'::UUID
  );`;
}

function callbackClaim({ paymentId, statusId, orderId, amount, fingerprint }) {
  return `SELECT public.claim_pos_fiuu_vt_callback_processing(
    '${paymentId}'::UUID,
    '${statusId}'::UUID,
    '${fingerprint}',
    jsonb_build_object(
      'opType', 'STATUS',
      'status', '00',
      'orderId', '${orderId}',
      'transactionId', '${orderId}-LATE-SUCCESS',
      'amountRm', ${amount}
    ),
    gen_random_uuid(),
    true
  );`;
}

async function expirePayment(paymentId) {
  await runPsql(`
    UPDATE public.pos_online_payments
    SET status = 'EXPIRED'
    WHERE id = '${paymentId}'::UUID;
  `);
}

async function run() {
  await setup();
  const results = [];

  const first = {
    paymentId: "96000000-0000-4000-8000-000000000101",
    statusId: "96000000-0000-4000-8000-000000000102",
    orderId: "VOIDCONC001",
    amount: "2.50",
  };
  const firstVoidA = "96000000-0000-4000-8000-000000000103";
  const firstVoidB = "96000000-0000-4000-8000-000000000104";
  await runPsql(paymentFixture(first));
  const [firstA, firstB] = await Promise.all([
    runPsql(voidClaim(first.paymentId, firstVoidA)),
    runPsql(voidClaim(first.paymentId, firstVoidB)),
  ]);
  const firstOutcomes = [parseJson(firstA).outcome, parseJson(firstB).outcome];
  assert.deepEqual(firstOutcomes.sort(), ["ACTIVE", "LAUNCH"]);
  const firstState = parseJson(
    await runPsql(`
      SELECT jsonb_build_object(
        'voidCount', count(*) FILTER (WHERE op_type = 'VOID'),
        'activeVoidCount', count(*) FILTER (
          WHERE op_type = 'VOID' AND state IN ('PREPARED', 'LAUNCHED', 'RECEIVED')
        ),
        'supersededStatusCount', count(*) FILTER (
          WHERE id = '${first.statusId}'::UUID
            AND state = 'EXPIRED'
            AND superseded_by_attempt_id IS NOT NULL
        )
      )
      FROM public.pos_fiuu_vt_attempts
      WHERE payment_id = '${first.paymentId}'::UUID;
    `),
  );
  assert.deepEqual(firstState, {
    voidCount: 1,
    activeVoidCount: 1,
    supersededStatusCount: 1,
  });
  results.push("two simultaneous VOID claims: passed");
  await expirePayment(first.paymentId);

  const second = {
    paymentId: "96000000-0000-4000-8000-000000000201",
    statusId: "96000000-0000-4000-8000-000000000202",
    orderId: "VOIDCONC002",
    amount: "3.50",
  };
  const secondVoid = "96000000-0000-4000-8000-000000000203";
  await runPsql(paymentFixture(second));
  const callbackFirst = runPsql(`
    BEGIN;
    ${callbackClaim({ ...second, fingerprint: "b".repeat(64) })}
    SELECT pg_sleep(1.5);
    COMMIT;
  `);
  await delay(300);
  const voidAfterCallback = runPsql(voidClaim(second.paymentId, secondVoid));
  const [callbackFirstOutput, voidAfterCallbackOutput] = await Promise.all([
    callbackFirst,
    voidAfterCallback,
  ]);
  assert.equal(parseJson(callbackFirstOutput).outcome, "CLAIMED");
  const blockedVoid = parseJson(voidAfterCallbackOutput);
  assert.equal(blockedVoid.outcome, "ACTIVE");
  assert.equal(blockedVoid.reason, "STATUS_CALLBACK_EVIDENCE_ACTIVE");
  const callbackFirstState = parseJson(
    await runPsql(`
      SELECT jsonb_build_object(
        'statusState', (SELECT state FROM public.pos_fiuu_vt_attempts
          WHERE id = '${second.statusId}'::UUID),
        'voidCount', (SELECT count(*) FROM public.pos_fiuu_vt_attempts
          WHERE payment_id = '${second.paymentId}'::UUID AND op_type = 'VOID')
      );
    `),
  );
  assert.deepEqual(callbackFirstState, { statusState: "RECEIVED", voidCount: 0 });
  results.push("callback claim winning before VOID: passed");
  await expirePayment(second.paymentId);

  const third = {
    paymentId: "96000000-0000-4000-8000-000000000301",
    statusId: "96000000-0000-4000-8000-000000000302",
    orderId: "VOIDCONC003",
    amount: "4.50",
  };
  const thirdVoid = "96000000-0000-4000-8000-000000000303";
  await runPsql(paymentFixture(third));
  const voidFirst = runPsql(`
    BEGIN;
    ${voidClaim(third.paymentId, thirdVoid)}
    SELECT pg_sleep(1.5);
    COMMIT;
  `);
  await delay(300);
  const callbackAfterVoid = runPsql(
    callbackClaim({ ...third, fingerprint: "c".repeat(64) }),
  );
  const [voidFirstOutput, callbackAfterVoidOutput] = await Promise.all([
    voidFirst,
    callbackAfterVoid,
  ]);
  assert.equal(parseJson(voidFirstOutput).outcome, "LAUNCH");
  assert.equal(parseJson(callbackAfterVoidOutput).outcome, "CLAIMED");
  const voidFirstState = parseJson(
    await runPsql(`
      SELECT jsonb_build_object(
        'statusState', (SELECT state FROM public.pos_fiuu_vt_attempts
          WHERE id = '${third.statusId}'::UUID),
        'voidState', (SELECT state FROM public.pos_fiuu_vt_attempts
          WHERE id = '${thirdVoid}'::UUID),
        'supersededBy', (SELECT superseded_by_attempt_id FROM public.pos_fiuu_vt_attempts
          WHERE id = '${third.statusId}'::UUID)
      );
    `),
  );
  assert.deepEqual(voidFirstState, {
    statusState: "RECEIVED",
    voidState: "PREPARED",
    supersededBy: thirdVoid,
  });
  results.push("VOID winning before late STATUS=00: passed");
  await expirePayment(third.paymentId);

  const fourth = {
    paymentId: "96000000-0000-4000-8000-000000000401",
    statusId: "96000000-0000-4000-8000-000000000402",
    orderId: "VOIDCONC004",
    amount: "5.50",
  };
  const fourthVoid = "96000000-0000-4000-8000-000000000403";
  await runPsql(paymentFixture(fourth));
  assert.equal(
    parseJson(await runPsql(voidClaim(fourth.paymentId, fourthVoid))).outcome,
    "LAUNCH",
  );
  await runPsql(`
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'LAUNCHED', launched_at = clock_timestamp()
    WHERE id = '${fourthVoid}'::UUID;
  `);
  const lateSuccessFirst = runPsql(`
    BEGIN;
    ${callbackClaim({ ...fourth, fingerprint: "d".repeat(64) })}
    SELECT pg_sleep(1.5);
    COMMIT;
  `);
  await delay(300);
  const releaseAfterSuccess = runPsql(`
    SELECT public.release_pos_fiuu_vt_cashier_lane(
      '${fourth.paymentId}'::UUID,
      '${fourthVoid}'::UUID,
      '${actorId}'::UUID,
      (SELECT device_id FROM public._fiuu_vt_void_concurrency_context),
      21
    );
  `);
  const [lateSuccessFirstOutput, releaseAfterSuccessOutput] = await Promise.all([
    lateSuccessFirst,
    releaseAfterSuccess,
  ]);
  assert.equal(parseJson(lateSuccessFirstOutput).outcome, "CLAIMED");
  assert.equal(
    parseJson(releaseAfterSuccessOutput).outcome,
    "PAYMENT_SUCCESS_OR_REVIEW_REQUIRED",
  );
  const successRaceState = parseJson(
    await runPsql(`
      SELECT jsonb_build_object(
        'cashierReleased', fiuu_vt_cashier_released_at IS NOT NULL,
        'successAttempts', (SELECT count(*) FROM public.pos_fiuu_vt_attempts
          WHERE payment_id = '${fourth.paymentId}'::UUID
            AND result_json->>'status' = '00')
      )
      FROM public.pos_online_payments
      WHERE id = '${fourth.paymentId}'::UUID;
    `),
  );
  assert.deepEqual(successRaceState, { cashierReleased: false, successAttempts: 1 });
  results.push("late success winning release race: passed");
  await expirePayment(fourth.paymentId);

  const fifth = {
    paymentId: "96000000-0000-4000-8000-000000000501",
    statusId: "96000000-0000-4000-8000-000000000502",
    orderId: "VOIDCONC005",
    amount: "6.50",
  };
  const fifthVoid = "96000000-0000-4000-8000-000000000503";
  await runPsql(paymentFixture(fifth));
  assert.equal(
    parseJson(await runPsql(voidClaim(fifth.paymentId, fifthVoid))).outcome,
    "LAUNCH",
  );
  await runPsql(`
    UPDATE public.pos_fiuu_vt_attempts
    SET state = 'LAUNCHED', launched_at = clock_timestamp()
    WHERE id = '${fifthVoid}'::UUID;
  `);
  const releaseFirst = runPsql(`
    BEGIN;
    SELECT public.release_pos_fiuu_vt_cashier_lane(
      '${fifth.paymentId}'::UUID,
      '${fifthVoid}'::UUID,
      '${actorId}'::UUID,
      (SELECT device_id FROM public._fiuu_vt_void_concurrency_context),
      21
    );
    SELECT pg_sleep(1.5);
    COMMIT;
  `);
  await delay(300);
  const callbackAfterRelease = runPsql(
    callbackClaim({ ...fifth, fingerprint: "e".repeat(64) }),
  );
  const [releaseFirstOutput, callbackAfterReleaseOutput] = await Promise.all([
    releaseFirst,
    callbackAfterRelease,
  ]);
  assert.equal(parseJson(releaseFirstOutput).outcome, "RELEASED");
  const releasedCallback = parseJson(callbackAfterReleaseOutput);
  assert.equal(releasedCallback.outcome, "CLAIMED");
  assert.ok(releasedCallback.cashier_released_at);
  const releaseFirstState = parseJson(
    await runPsql(`
      SELECT jsonb_build_object(
        'cashierReleased', payment.fiuu_vt_cashier_released_at IS NOT NULL,
        'statusState', attempt.state,
        'statusCode', attempt.result_json->>'status'
      )
      FROM public.pos_online_payments AS payment
      JOIN public.pos_fiuu_vt_attempts AS attempt
        ON attempt.id = '${fifth.statusId}'::UUID
      WHERE payment.id = '${fifth.paymentId}'::UUID;
    `),
  );
  assert.deepEqual(releaseFirstState, {
    cashierReleased: true,
    statusState: "RECEIVED",
    statusCode: "00",
  });
  results.push("cashier release winning late-success race: passed");

  console.log(results.join("\n"));
}

try {
  await run();
} finally {
  await cleanup();
}
