import { supabase } from "./supabaseClient";

/**
 * Drop-in replacement for the artifact's window.storage API, backed by a
 * single Supabase table `kv_store`. All data is shared company-wide —
 * every logged-in user (partner or staff) reads and writes the same rows,
 * since this app is for one business, not per-user private data.
 *
 * Table shape (see supabase-schema.sql):
 *   kv_store(key text primary key, value text, updated_at timestamptz)
 */
export const storage = {
  async get(key) {
    const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { key, value: data.value };
  },

  async set(key, value) {
    const { error } = await supabase
      .from("kv_store")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) return null;
    return { key, value };
  },

  async delete(key) {
    const { error } = await supabase.from("kv_store").delete().eq("key", key);
    if (error) return null;
    return { key, deleted: true };
  },

  async list(prefix = "") {
    const query = supabase.from("kv_store").select("key");
    const { data, error } = prefix ? await query.like("key", `${prefix}%`) : await query;
    if (error) throw error;
    return { keys: (data || []).map((r) => r.key), prefix };
  },
};
