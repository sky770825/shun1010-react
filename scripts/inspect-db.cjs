const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function countTable(name) {
  const { count, error } = await supabase
    .from(name)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(`❌ ${name}:`, error.message);
    return;
  }

  console.log(`✅ ${name}: ${count} rows`);
}

async function main() {
  const tables = [
    "members",
    "availability_rules",
    "roster_slots",
    "duty_balance",
    "fairness_settings",
    "same_day_pairs",
    "keys",
    "lendings",
    "lending_items",
    "app_versions",
    "temp_duty",
    "key_item_history",
    "external_links",
  ];

  for (const t of tables) {
    // eslint-disable-next-line no-await-in-loop
    await countTable(t);
  }

  process.exit(0);
}

main();

