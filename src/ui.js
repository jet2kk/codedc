import { EmbedBuilder } from "discord.js";

const safeUrl = track =>
  track?.uri && /^https?:\/\//i.test(track.uri) ? track.uri : null;

const linkTitle = track => {
  const title = track?.title || "Unknown";
  const url = safeUrl(track);
  return url ? `[**${title}**](${url})` : `**${title}**`;
};

export const errorEmbed = text =>
  new EmbedBuilder().setColor(0xED4245).setDescription(`❌ ${text}`);

export const infoEmbed = text =>
  new EmbedBuilder().setColor(0x5865F2).setDescription(text);

export function nowPlaying(track) {
  const artist = track?.author || "Unknown";
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`🎵 Started playing ${linkTitle(track)} by **${artist}**`);
}

export function queueEmbed(player) {
  const tracks = Array.from(player.queue || []);
  let text = player.queue.current
    ? `**Đang phát:** ${player.queue.current.title}\n\n`
    : "";

  text += tracks.length
    ? tracks.slice(0, 20).map((track, index) =>
        `**${index + 1}.** ${track.title} — ${track.author || "Unknown"}`
      ).join("\n")
    : "Queue trống.";

  if (tracks.length > 20) text += `\n\n… và ${tracks.length - 20} bài khác.`;
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("📜 QUEUE")
    .setDescription(text);
}

export function helpEmbed(prefix, commands = {}) {
  const a = name => (commands[name] || []).map(x => `${prefix}${x}`).join(" / ");
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🎵 Jockie Music")
    .setDescription([
      `${a("play")} <tên/link>`,
      `${a("join")} — vào phòng`,
      `${a("pause")} / ${a("resume")}`,
      `${a("skip")} / ${a("previous")}`,
      `${a("stop")} / ${a("leave")} — thoát phòng`,
      `${a("nowplaying")} / ${a("queue")}`,
      `${a("volume")} 1-100`,
      `${a("seek")} 1:30`,
      `${a("loop")} off|track|queue`,
      `${a("shuffle")}`,
      `${a("remove")} <số>`,
      `${a("clear")}`,
      `${a("autoplay")} on|off`,
      `${a("ping")} / ${a("node")}`
    ].map(x => `\`${x}\``).join("\n"));
}
