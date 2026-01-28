import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 僅在 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY 都有值時建立；否則為 null */
export const supabase =
  url && anon ? createClient(url, anon) : null;

export const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === "true" && !!supabase;
