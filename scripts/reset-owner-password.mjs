/**
 * Reset kata laluan owner (matisa@rkj.com) ke go-live password.
 * Usage: npm run reset:owner-password
 * Optional: npm run reset:owner-password -- --show-password
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { DEFAULT_PASSWORD } from "./lib/default-password.mjs";
import { loadProjectEnv, ROOT } from "./lib/load-env.mjs";

const OWNER_EMAIL = "matisa@rkj.com";
const GO_LIVE_PASSWORD_FILE = path.join(
  ROOT,
  "csv_import",
  ".go-live-temp-password.txt",
);

function readGoLivePassword() {
  if (process.env.GO_LIVE_PASSWORD?.trim())
    return process.env.GO_LIVE_PASSWORD.trim();
  if (!fs.existsSync(GO_LIVE_PASSWORD_FILE)) return DEFAULT_PASSWORD;
  const line = fs
    .readFileSync(GO_LIVE_PASSWORD_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return line || DEFAULT_PASSWORD;
}

async function findUser(admin, email) {
  const target = email.toLowerCase();
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

const args = process.argv.slice(2);
const passwordArg = args
  .find((a) => a.startsWith("--password="))
  ?.slice("--password=".length)
  ?.trim();
const showPassword = args.includes("--show-password");
const password = passwordArg || readGoLivePassword();
const env = loadProjectEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error(
    "Perlu NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY dalam .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

console.log(`\nReset owner ${OWNER_EMAIL} ...\n`);

const user = await findUser(admin, OWNER_EMAIL);
if (!user) {
  console.error("x Auth user owner tidak dijumpai");
  process.exit(1);
}

const { error: resetErr } = await admin.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
});
if (resetErr) {
  console.error("x Reset gagal:", resetErr.message);
  process.exit(1);
}

await admin
  .from("profiles")
  .update({ must_change_password: false, status: "ACTIVE" })
  .eq("id", user.id);

const { error: loginErr } = await anon.auth.signInWithPassword({
  email: OWNER_EMAIL,
  password,
});

if (loginErr) {
  console.error("x Ujian login gagal selepas reset:", loginErr.message);
  process.exit(1);
}

console.log("OK Password owner direset");
console.log(`OK Ujian login OK (${password.slice(0, 4)}***)`);
console.log("\nCuba login di https://rkj-one.vercel.app/login");
console.log(`  Email: ${OWNER_EMAIL}`);
console.log(
  `  Password: ${showPassword ? password : `${password.slice(0, 4)}***`}\n`,
);
