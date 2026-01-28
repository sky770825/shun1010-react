const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  const { error } = await supabase.from("members").insert([
    {
      id: "demo-1",
      name: "示範成員1",
      is_active: true,
      exclude_roster: false,
      role: "member",
      max_shifts_per_day: 1,
      note: "CLI seed demo",
    },
  ]);

  if (error) {
    console.error("Insert error:", error);
    process.exit(1);
  }

  console.log("Seed members done.");
  process.exit(0);
}

main();

