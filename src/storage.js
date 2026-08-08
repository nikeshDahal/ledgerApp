import { supabase } from "./supabaseClient";

// Same shape as the Claude-artifact window.storage API (get/set returning
// { key, value } or null), backed by a single generic kv_store table so the
// app's own code doesn't need to know or care that it's talking to Supabase
// instead of the artifact runtime.

export const storage = {
  async get(key) {
    const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
    if (error) {
      console.error("storage.get error:", error);
      return null;
    }
    if (!data) return null;
    return { key, value: data.value };
  },

  async set(key, value) {
    const { error } = await supabase.from("kv_store").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) {
      console.error("storage.set error:", error);
      return null;
    }
    return { key, value };
  },
};
