import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.env.PREFIX_FILE || "data/prefixes.json");
const defaultPrefix = String(
  process.env.PREFIX ?? process.env.BOT_PREFIX ?? process.env.CUSTOM_PREFIX ?? "j"
).trim() || "j";

if (defaultPrefix.length > 5) {
  throw new Error("PREFIX must be 1-5 characters.");
}

const prefixes = new Map();

function load() {
  try {
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [guildId, prefix] of Object.entries(data || {})) {
      if (typeof prefix === "string" && prefix.length >= 1 && prefix.length <= 5) {
        prefixes.set(guildId, prefix);
      }
    }
  } catch (error) {
    console.warn("[PREFIX] Could not load prefix file:", error?.message || error);
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const data = Object.fromEntries(prefixes);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn("[PREFIX] Could not save prefix file:", error?.message || error);
  }
}

load();

export function getPrefix(guildId) {
  return prefixes.get(guildId) || defaultPrefix;
}

export function setPrefix(guildId, prefix) {
  const value = String(prefix || "").trim();
  if (!value || value.length > 5) {
    throw new Error("Prefix phải dài từ 1 đến 5 ký tự.");
  }
  if (/\\s|[\\u0000-\\u001F\\u007F]/.test(value)) {
    throw new Error("Prefix không được chứa khoảng trắng hoặc ký tự điều khiển.");
  }
  if (value.includes("@everyone") || value.includes("@here")) {
    throw new Error("Prefix không hợp lệ.");
  }
  prefixes.set(guildId, value);
  save();
  return value;
}

export function resetPrefix(guildId) {
  prefixes.delete(guildId);
  save();
  return defaultPrefix;
}

export { defaultPrefix };
