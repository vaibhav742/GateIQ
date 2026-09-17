import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD ?? "CampusAccess!2026";

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const gates = [
  { name: "Main Gate", location: "Joka main entrance" },
  { name: "Lake Gate", location: "Lakeside access" },
  { name: "Staff Gate", location: "Staff and service entrance" },
];

const students = [
  {
    fullName: "Vaibhav Bhatt",
    rollNumber: "0308/63",
    batch: "63",
    section: null,
    email: "0308@campus.local",
  },
  ["Diya Kapoor", "A"],
  ["Kabir Nair", "A"],
  ["Ananya Iyer", "A"],
  ["Rohan Sen", "A"],
  ["Ishita Bose", "A"],
  ["Vihaan Reddy", "B"],
  ["Sara Malhotra", "B"],
  ["Aditya Ghosh", "B"],
  ["Meher Khan", "B"],
  ["Arjun Patel", "B"],
  ["Nisha Verma", "B"],
  ["Kunal Das", "C"],
  ["Priya Menon", "C"],
  ["Siddharth Rao", "C"],
  ["Tara Banerjee", "C"],
  ["Nikhil Joshi", "C"],
  ["Aisha Qureshi", "C"],
  ["Rahul Khanna", "D"],
  ["Sneha Pillai", "D"],
  ["Dev Sharma", "D"],
  ["Pooja Nanda", "D"],
  ["Harsh Vora", "D"],
  ["Leela Krishnan", "D"],
];

async function ensureUser({
  email,
  fullName,
  role,
}) {
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((user) => user.email === email);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name: fullName },
    });
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    throw error ?? new Error(`Unable to create ${email}`);
  }
  return data.user.id;
}

async function main() {
  for (const gate of gates) {
    const { data: existing } = await supabase.from("gates").select("id").eq("name", gate.name).maybeSingle();
    if (!existing) {
      await supabase.from("gates").insert(gate);
    }
  }

  const { data: gateRows } = await supabase.from("gates").select("*");
  const gateByName = Object.fromEntries((gateRows ?? []).map((gate) => [gate.name, gate.id]));

  const adminId = await ensureUser({
    email: "admin@campus.local",
    fullName: "Campus Administrator",
    role: "admin",
  });
  await supabase.from("profiles").update({
    full_name: "Campus Administrator",
    role: "admin",
    status: "active",
    email: "admin@campus.local",
  }).eq("id", adminId);

  const security1 = await ensureUser({
    email: "security1@example.com",
    fullName: "Raj Kumar",
    role: "security",
  });
  const security2 = await ensureUser({
    email: "security2@example.com",
    fullName: "Meera Iyer",
    role: "security",
  });

  await supabase.from("profiles").update({
    full_name: "Raj Kumar",
    role: "security",
    status: "active",
    email: "security1@example.com",
  }).eq("id", security1);
  await supabase.from("profiles").update({
    full_name: "Meera Iyer",
    role: "security",
    status: "active",
    email: "security2@example.com",
  }).eq("id", security2);

  await supabase.from("security_gate_assignments").update({ active: false }).eq("active", true);
  await supabase.from("security_gate_assignments").insert([
    { security_user_id: security1, gate_id: gateByName["Main Gate"], active: true },
    { security_user_id: security2, gate_id: gateByName["Lake Gate"], active: true },
  ]);

  const studentIds = [];
  for (let index = 0; index < students.length; index += 1) {
    const entry = students[index];
    const isExplicit = !Array.isArray(entry);
    const fullName = isExplicit ? entry.fullName : entry[0];
    const section = isExplicit ? entry.section : entry[1];
    const roll = isExplicit ? entry.rollNumber : `63${section}${String(index + 1).padStart(3, "0")}`;
    const batch = isExplicit ? entry.batch : "63";
    const email = isExplicit ? entry.email : `${roll.toLowerCase()}@campus.local`;
    const id = await ensureUser({ email, fullName, role: "student" });
    await supabase.from("profiles").update({
      full_name: fullName,
      email,
      role: "student",
      status: "active",
      roll_number: roll,
      batch,
      section,
    }).eq("id", id);
    studentIds.push(id);
  }

  await supabase.from("entry_exit_logs").delete().eq("verification_method", "SEED");

  const now = new Date();
  const morning = new Date(now);
  morning.setHours(8, 12, 0, 0);
  const samples = [];
  for (let i = 0; i < 12; i += 1) {
    const entered = new Date(morning.getTime() + i * 7 * 60 * 1000);
    samples.push({
      student_id: studentIds[i],
      gate_id: i % 2 === 0 ? gateByName["Main Gate"] : gateByName["Lake Gate"],
      action: "ENTRY",
      timestamp: entered.toISOString(),
      recorded_by: i % 2 === 0 ? security1 : security2,
      verification_method: "SEED",
    });
    if (i % 3 === 0) {
      samples.push({
        student_id: studentIds[i],
        gate_id: i % 2 === 0 ? gateByName["Main Gate"] : gateByName["Lake Gate"],
        action: "EXIT",
        timestamp: new Date(entered.getTime() + 4 * 60 * 60 * 1000).toISOString(),
        recorded_by: i % 2 === 0 ? security1 : security2,
        verification_method: "SEED",
      });
    }
  }

  const { error: logError } = await supabase.from("entry_exit_logs").insert(samples);
  if (logError) {
    console.error("Seed logs failed:", logError.message);
    process.exit(1);
  }

  console.log("Seed complete.");
  console.log("Admin: admin@campus.local");
  console.log("Security: security1@example.com / security2@example.com");
  console.log("Student: 0308@campus.local (Vaibhav Bhatt, 0308/63)");
  console.log(`Password: ${password}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
