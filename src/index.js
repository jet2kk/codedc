import "dotenv/config";
import express from "express";
import {
  Client, GatewayIntentBits, Partials, ActivityType,
  PermissionFlagsBits
} from "discord.js";
import { config, command, playerCommandNames } from "./config.js";
import { createMusic } from "./music.js";
import { queueEmbed, errorEmbed, infoEmbed, helpEmbed, nowPlaying } from "./ui.js";
import { getPrefix, setPrefix, resetPrefix, defaultPrefix } from "./prefixes.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const music = createMusic(client);
const app = express();

app.get("/", (_req, res) => res.status(200).send("Jockie Music Bot OK"));
app.get("/health", (_req, res) => {
  const nodes = [...music.shoukaku.nodes.values()];
  const lavalink = nodes.some(n => n.state === 2);
  res.status(lavalink || nodes.length === 0 ? 200 : 503).json({
    ok: true,
    discord: client.isReady(),
    lavalink,
    nodes: nodes.map(n => ({ name: n.name, state: n.state }))
  });
});
app.listen(config.port, "0.0.0.0", () =>
  console.log(`[HTTP] Listening on ${config.port}`)
);

const temp = async (msg, payload, ms = 5000) => {
  const sent = await msg.reply(payload).catch(() => null);
  if (sent && ms > 0) setTimeout(() => sent.delete().catch(() => {}), ms);
  return sent;
};

const sameVoice = (msg, player) =>
  Boolean(msg.member?.voice?.channelId && player?.voiceId === msg.member.voice.channelId);

const parseTime = (input) => {
  if (!input) return null;
  const value = input.trim();
  if (!/^\d+(?::\d{1,2}){0,2}$/.test(value)) return null;
  const parts = value.split(":").map(Number);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2 && parts[1] < 60) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts[1] < 60 && parts[2] < 60) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
};

async function getPlayer(msg, { requireSameVoice = true, prefix = getPrefix(msg.guild.id) } = {}) {
  const player = music.getPlayer(msg.guild.id);
  if (!player) {
    await temp(msg, { embeds: [errorEmbed(`Chưa có player. Dùng ${prefix}play trước.`)] });
    return null;
  }
  if (requireSameVoice && !sameVoice(msg, player)) {
    await temp(msg, { embeds: [errorEmbed("Bạn phải ở cùng voice channel với bot.")] });
    return null;
  }
  return player;
}

async function sendNowPlaying(player, track = player.queue.current) {
  if (!track) return;
  const channel = await client.channels.fetch(player.textId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [nowPlaying(track)] }).catch(e =>
    console.warn("[NOW PLAYING]", e?.message || e)
  );
}

async function safeDestroy(player) {
  if (!player) return;
  try { await player.destroy(); } catch (e) {
    console.warn("[PLAYER DESTROY]", e?.message || e);
  }
}

async function onCommand(msg) {
  if (!msg.guild || msg.author.bot) return;
  const prefix = getPrefix(msg.guild.id);
  if (!msg.content.startsWith(prefix)) return;

  const raw = msg.content.slice(prefix.length).trim();
  if (!raw) return;
  const parts = raw.split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();
  const arg = parts.join(" ").trim();

  try {
    // Per-server custom prefix. Requires Manage Server.
    // Example: jprefix !   -> future commands use !play, !skip, etc.
    // Reset: !prefix reset -> returns to the default PREFIX from environment.
    if (command("prefix", cmd)) {
      if (!msg.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        return temp(msg, { embeds: [errorEmbed("Bạn cần quyền **Quản lý máy chủ** để đổi prefix.")] });
      }

      const requested = arg.trim();
      if (!requested) {
        return temp(msg, {
          embeds: [infoEmbed(`Prefix hiện tại: **${prefix}**\nDùng **${prefix}prefix <ký tự>** để đổi.\nDùng **${prefix}prefix reset** để về **${defaultPrefix}**.`)]
        }, 7000);
      }

      if (requested.toLowerCase() === "reset") {
        const value = resetPrefix(msg.guild.id);
        await msg.delete().catch(() => {});
        return temp(msg, { embeds: [infoEmbed(`Đã đặt lại prefix của server về **${value}**.`)] }, 4000);
      }

      if (requested.length > 5) {
        return temp(msg, { embeds: [errorEmbed("Prefix chỉ được từ **1 đến 5 ký tự**.")] });
      }
      if (/\s/.test(requested)) {
        return temp(msg, { embeds: [errorEmbed("Prefix không được chứa khoảng trắng.")] });
      }

      const value = setPrefix(msg.guild.id, requested);
      await msg.delete().catch(() => {});
      return temp(msg, { embeds: [infoEmbed(`Đã đổi prefix server thành **${value}**.\nVí dụ: **${value}play tên bài**`)] }, 5000);
    }

    // Global commands MUST be handled before player commands.
    // This fixes ping/node working even when no music player exists.
    if (command("ping", cmd)) {
      const nodes = [...music.shoukaku.nodes.values()];
      const ready = nodes.filter(n => n.state === 2).length;
      return temp(msg, {
        embeds: [infoEmbed(`🏓 Discord: **${client.ws.ping}ms**\n🎵 Lavalink: **${ready ? "🟢 ONLINE" : "🔴 OFFLINE"}**`)]
      });
    }

    if (command("node", cmd)) {
      const status = [...music.shoukaku.nodes.values()]
        .map(n => `**${n.name}** — ${n.state === 2 ? "🟢 READY" : "🔴 OFFLINE"}`)
        .join("\n") || "Không có node.";
      return temp(msg, { embeds: [infoEmbed(status)] });
    }

    if (command("help", cmd)) {
      return temp(msg, { embeds: [helpEmbed(prefix, config.commands)] }, 12000);
    }

    if (command("join", cmd)) {
      const voice = msg.member?.voice?.channel;
      if (!voice) return temp(msg, { embeds: [errorEmbed("Hãy vào voice channel trước.")] });
      const old = music.getPlayer(msg.guild.id);
      if (old) {
        if (old.voiceId !== voice.id) {
          return temp(msg, { embeds: [errorEmbed("Bot đang ở voice channel khác.")] });
        }
        await msg.delete().catch(() => {});
        return;
      }
      const player = await music.createPlayer({
        guildId: msg.guild.id,
        textId: msg.channel.id,
        voiceId: voice.id,
        volume: 80,
        deaf: true,
        loadBalancer: true
      });
      player.setTextChannel(msg.channel.id);
      await msg.delete().catch(() => {});
      return;
    }

    if (command("play", cmd)) {
      const voice = msg.member?.voice?.channel;
      if (!voice) return temp(msg, { embeds: [errorEmbed("Hãy vào voice channel trước.")] });
      if (!arg) return temp(msg, { embeds: [errorEmbed(`Dùng ${prefix}play <tên bài hoặc link>`)] });

      let player = music.getPlayer(msg.guild.id);
      if (player && player.voiceId !== voice.id) {
        return temp(msg, { embeds: [errorEmbed("Bot đang ở voice channel khác.")] });
      }
      if (!player) {
        player = await music.createPlayer({
          guildId: msg.guild.id,
          textId: msg.channel.id,
          voiceId: voice.id,
          volume: 80,
          deaf: true,
          loadBalancer: true
        });
      }
      player.setTextChannel(msg.channel.id);

      const result = await music.search(arg, { requester: msg.author });
      if (!result?.tracks?.length) {
        return temp(msg, { embeds: [errorEmbed("Không tìm thấy bài hát.")] });
      }

      if (result.type === "PLAYLIST" || result.type === "SEARCH") {
        if (result.type === "PLAYLIST") {
          player.queue.add(result.tracks);
        } else {
          player.queue.add(result.tracks[0]);
        }
      } else {
        player.queue.add(result.tracks[0]);
      }

      if (!player.playing && !player.paused) await player.play();
      await msg.delete().catch(() => {});
      return;
    }

    if (!playerCommandNames.some(name => command(name, cmd))) return;

    const player = await getPlayer(msg, { prefix });
    if (!player) return;

    if (command("pause", cmd)) {
      await player.pause(true);
    } else if (command("resume", cmd)) {
      await player.pause(false);
    } else if (command("skip", cmd)) {
      if (!player.queue.current && !player.playing) {
        return temp(msg, { embeds: [errorEmbed("Không có bài đang phát.")] });
      }
      await player.skip();
    } else if (command("previous", cmd)) {
      const track = player.getPrevious(true);
      if (!track) return temp(msg, { embeds: [errorEmbed("Không có bài trước.")] });
      await player.play(track);
    } else if (command("stop", cmd)) {
      player.queue.clear();
      await safeDestroy(player);
    } else if (command("leave", cmd)) {
      player.queue.clear();
      await safeDestroy(player);
    } else if (command("nowplaying", cmd)) {
      await sendNowPlaying(player);
    } else if (command("queue", cmd)) {
      const sent = await msg.channel.send({ embeds: [queueEmbed(player)] }).catch(() => null);
      if (sent) setTimeout(() => sent.delete().catch(() => {}), 12000);
    } else if (command("volume", cmd)) {
      const volume = Number(arg);
      if (!Number.isInteger(volume) || volume < 1 || volume > 100) {
        return temp(msg, { embeds: [errorEmbed(`Dùng ${prefix}volume 1-100`)] });
      }
      await player.setVolume(volume);
    } else if (command("seek", cmd)) {
      const seconds = parseTime(arg);
      if (seconds === null || seconds < 0) {
        return temp(msg, { embeds: [errorEmbed(`Dùng ${prefix}seek 1:30`)] });
      }
      await player.seek(seconds * 1000);
    } else if (command("loop", cmd)) {
      const mode = arg.toLowerCase() === "off" ? "none" : arg.toLowerCase();
      if (!["none", "track", "queue"].includes(mode)) {
        return temp(msg, { embeds: [errorEmbed(`Dùng ${prefix}loop off|track|queue`)] });
      }
      await player.setLoop(mode);
    } else if (command("shuffle", cmd)) {
      if (typeof player.queue.shuffle === "function") player.queue.shuffle();
    } else if (command("remove", cmd)) {
      const number = Number(arg);
      const list = Array.from(player.queue);
      if (!Number.isInteger(number) || number < 1 || number > list.length) {
        return temp(msg, { embeds: [errorEmbed(`Dùng ${prefix}remove <số>`)] });
      }
      if (typeof player.queue.remove !== "function") {
        return temp(msg, { embeds: [errorEmbed("Phiên bản queue hiện tại không hỗ trợ remove.")] });
      }
      player.queue.remove(number - 1);
    } else if (command("clear", cmd)) {
      player.queue.clear();
    } else if (command("autoplay", cmd)) {
      const mode = arg.toLowerCase();
      if (!["on", "off"].includes(mode)) {
        return temp(msg, { embeds: [errorEmbed(`Dùng ${prefix}autoplay on|off`)] });
      }
      player.data.set("autoplay", mode === "on");
      return temp(msg, { embeds: [infoEmbed(`Autoplay: **${mode.toUpperCase()}**`)] }, 2500);
    }

    await msg.delete().catch(() => {});
  } catch (error) {
    console.error("[COMMAND]", error);
    await temp(msg, { embeds: [errorEmbed("Lệnh gặp lỗi. Kiểm tra log bot/Lavalink.")] });
  }
}

music.on("playerStart", async (player, track) => {
  console.log(`[PLAY] ${player.guildId}: ${track.title}`);
  await sendNowPlaying(player, track);
});

music.on("playerEnd", () => {});
music.on("playerEmpty", async player => {
  setTimeout(async () => {
    if (
      music.getPlayer(player.guildId) === player &&
      !player.queue.length &&
      !player.playing
    ) {
      await safeDestroy(player);
    }
  }, 30000);
});
music.on("playerException", (player, data) =>
  console.error(`[PLAYER EXCEPTION] ${player.guildId}`, data)
);
music.on("playerStuck", (player, data) =>
  console.warn(`[PLAYER STUCK] ${player.guildId}`, data)
);
music.on("playerResolveError", (player, track, message) =>
  console.warn(`[RESOLVE ERROR] ${player.guildId} ${track?.title || ""}`, message)
);

client.on("messageCreate", onCommand);

client.once("ready", () => {
  console.log(`[DISCORD] ${client.user.tag} READY`);
  console.log(`[BOT] Default Prefix=${defaultPrefix} (per-server prefix can be changed with <prefix>prefix <newPrefix>)`);
  console.log(`[LAVALINK] ${config.lavalink.host}:${config.lavalink.port}`);
  client.user.setPresence({
    activities: [{ name: config.status, type: ActivityType.Listening }],
    status: "online"
  });
});

client.on("error", error => console.error("[DISCORD]", error));
client.on("warn", warning => console.warn("[DISCORD]", warning));
process.on("unhandledRejection", error => console.error("[UNHANDLED REJECTION]", error));
process.on("uncaughtException", error => console.error("[UNCAUGHT EXCEPTION]", error));

const shutdown = async signal => {
  console.log(`[SYSTEM] ${signal}`);
  for (const player of music.players.values()) await safeDestroy(player);
  client.destroy();
  process.exit(0);
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

await client.login(config.token);
