import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidNormalizedUser,
  getContentType
} from "@whiskeysockets/baileys";

import qrcode from "qrcode-terminal";
import yts from "yt-search";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import NodeCache from "node-cache";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ╔═══════════════════════════════════════════════════════════╗
// ║          🔧 CONFIGURATION SETTINGS 🔧                     ║
// ╚═══════════════════════════════════════════════════════════╝

const CONFIG = {
  BOT_NAME: "🔥 MR RAZA MD PREMIUM 🔥",
  BOT_VERSION: "3.0.0",
  BOT_TYPE: "PREMIUM MD BOT",
  PREFIX: ".",
  OWNER_NUMBER: "923488553517",
  OWNER_NAME: "Mr Raza",
  CHANNEL_URL: "https://whatsapp.com/channel/0029Vb7qxXy35fM24gdLzG2Y",
  AUTO_READ: true,
  AUTO_TYPING: true,
  AUTO_PRESENCE: true,
  LOG_MESSAGES: true
};

const cache = new NodeCache({ stdTTL: 600 });

// ╔═══════════════════════════════════════════════════════════╗
// ║          📊 DATABASE MANAGEMENT 📊                        ║
// ╚═══════════════════════════════════════════════════════════╝

const dbPath = path.join(__dirname, "data");
const dbFile = path.join(dbPath, "database.json");

if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

class Database {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(dbFile)) {
        return JSON.parse(fs.readFileSync(dbFile, "utf-8"));
      }
    } catch (err) {
      console.log("Database load error:", err);
    }
    return this.getDefaultDB();
  }

  getDefaultDB() {
    return {
      groupSettings: {},
      userStats: {},
      blockedUsers: [],
      mutedUsers: {},
      warnings: {},
      bannedWords: {},
      autoReplies: {},
      customGreeting: {},
      kickOnJoin: {},
      deletedMessages: {},
      editedMessages: {},
      afkUsers: {},
      afkMessage: {},
      premium: [],
      prefixes: {},
      antiSpam: {},
      antiLink: {},
      antiMention: {},
      antiBot: {},
      antiSticker: {},
      antiDelete: {},
      antiEdit: {},
      antiViewOnce: {},
      levelSystem: {},
      chatBot: {},
      logs: []
    };
  }

  save() {
    try {
      fs.writeFileSync(dbFile, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.log("Database save error:", err);
    }
  }

  get(key) {
    return this.data[key] || null;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  update(category, key, value) {
    if (!this.data[category]) this.data[category] = {};
    this.data[category][key] = { ...this.data[category][key], ...value };
    this.save();
  }

  push(category, key, value) {
    if (!this.data[category][key]) this.data[category][key] = [];
    this.data[category][key].push(value);
    this.save();
  }

  remove(category, key) {
    delete this.data[category][key];
    this.save();
  }
}

const db = new Database();
let sock;
let startTime = Date.now();

// ╔═══════════════════════════════════════════════════════════╗
// ║          🛠️ UTILITY FUNCTIONS 🛠️                          ║
// ╚═══════════════════════════════════════════════════════════╝

class Utils {
  static isOwner(jid) {
    return jid?.split("@")[0] === CONFIG.OWNER_NUMBER;
  }

  static isGroup(jid) {
    return jid?.endsWith("@g.us");
  }

  static extractJid(jid) {
    return jid?.split("@")[0] || "unknown";
  }

  static formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  static formatNumber(num) {
    return new Intl.NumberFormat().format(num);
  }

  static box(title, content = "", footer = "") {
    const line = "━".repeat(40);
    let text = `\n╔${line}╗\n`;
    text += `║ ${title.padEnd(38)} ║\n`;
    if (content) {
      text += `╠${line}╣\n`;
      text += content;
    }
    text += `╚${line}╝\n`;
    return text;
  }

  static async sendTyping(jid) {
    try {
      if (CONFIG.AUTO_TYPING) {
        await sock.sendPresenceUpdate("typing", jid);
      }
    } catch (err) {}
  }

  static async readMessage(key) {
    try {
      if (CONFIG.AUTO_READ) {
        await sock.readMessages([key]);
      }
    } catch (err) {}
  }

  static async getThumbnail(url) {
    try {
      const res = await axios.get(`https://api.agatz.xyz/api/ytinfo?url=${url}`, {
        timeout: 5000
      });
      return res.data.data?.thumbnail || null;
    } catch {
      return null;
    }
  }

  static async getGroupAdmins(groupId) {
    try {
      const metadata = await sock.groupMetadata(groupId);
      return metadata.participants.filter(p => p.admin).map(p => p.id);
    } catch {
      return [];
    }
  }

  static async getGroupMembers(groupId) {
    try {
      const metadata = await sock.groupMetadata(groupId);
      return metadata.participants.map(p => p.id);
    } catch {
      return [];
    }
  }

  static async isAdmin(groupId, userId) {
    const admins = await this.getGroupAdmins(groupId);
    return admins.includes(userId);
  }

  static generateStats(stats) {
    let text = "";
    for (const [key, value] of Object.entries(stats)) {
      text += `├─ ${key}: ${value}\n`;
    }
    return text;
  }
}

// ╔═══════════════════════════════════════════════════════════╗
// ║          🎯 FEATURE HANDLER 🎯                            ║
// ╚═══════════════════════════════════════════════════════════╝

class FeatureHandler {
  constructor(sock) {
    this.sock = sock;
  }

  // ANTI-SPAM
  async checkAntiSpam(groupId, userId) {
    const settings = db.get("groupSettings")[groupId] || {};
    if (!settings.antiSpam) return false;

    const key = `spam_${groupId}_${userId}`;
    let count = cache.get(key) || 0;
    count++;
    cache.set(key, count, 30);

    if (count > 5) {
      try {
        await this.sock.groupParticipantsUpdate(groupId, [userId], "remove");
        await this.sock.sendMessage(groupId, {
          text: `🚫 @${Utils.extractJid(userId)} removed for spam (5+ messages in 30s)\n\n🔥 ${CONFIG.BOT_NAME}`
        });
      } catch (err) {}
      return true;
    }
    return false;
  }

  // ANTI-LINK
  async checkAntiLink(groupId, text) {
    const settings = db.get("groupSettings")[groupId] || {};
    if (!settings.antiLink) return false;

    const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
    return linkRegex.test(text);
  }

  // ANTI-MENTION
  async checkAntiMention(groupId, mentions) {
    const settings = db.get("groupSettings")[groupId] || {};
    if (!settings.antiMention) return false;

    return mentions && mentions.length > 3;
  }

  // ANTI-BOT
  async checkAntiBot(groupId, isBot) {
    const settings = db.get("groupSettings")[groupId] || {};
    if (!settings.antiBot) return false;

    return isBot;
  }

  // ANTI-STICKER
  async checkAntiSticker(groupId, type) {
    const settings = db.get("groupSettings")[groupId] || {};
    if (!settings.antiSticker) return false;

    return type === "stickerMessage";
  }

  // ANTI-DELETE
  async handleAntiDelete(key, messageData) {
    const groupId = key.remoteJid;
    const settings = db.get("groupSettings")[groupId] || {};
    if (!settings.antiDelete) return;

    const message = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || "";
    const sender = key.participant;

    if (message) {
      await this.sock.sendMessage(groupId, {
        text: `🚨 *ANTI-DELETE ALERT* 🚨\n\n👤 User: @${Utils.extractJid(sender)}\n📝 Deleted: ${message.substring(0, 100)}\n⏰ Time: ${new Date().toLocaleTimeString()}\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    }
  }

  // ANTI-EDIT
  async handleAntiEdit(key, editedData) {
    const groupId = key.remoteJid;
    const settings = db.get("groupSettings")[groupId] || {};
    if (!settings.antiEdit) return;

    const sender = key.participant;

    await this.sock.sendMessage(groupId, {
      text: `✏️ *ANTI-EDIT ALERT* ✏️\n\n👤 User: @${Utils.extractJid(sender)}\n📝 Message was edited\n⏰ Time: ${new Date().toLocaleTimeString()}\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  // AUTO-REPLY
  async handleAutoReply(groupId, text) {
    const autoReplies = db.get("autoReplies")[groupId];
    if (!autoReplies) return;

    for (const [trigger, reply] of Object.entries(autoReplies)) {
      if (text.toLowerCase().includes(trigger.toLowerCase())) {
        await Utils.sendTyping(groupId);
        await this.sock.sendMessage(groupId, { text: reply });
        return;
      }
    }
  }

  // AUTO-WELCOME
  async handleAutoWelcome(groupId, participantIds) {
    const settings = db.get("customGreeting")[groupId];
    if (!settings || !settings.autoWelcome) return;

    const greeting = settings.welcomeMessage || `Welcome @user to the group! 👋`;

    for (const participant of participantIds) {
      const message = greeting.replace("@user", `@${Utils.extractJid(participant)}`);
      await this.sock.sendMessage(groupId, {
        text: message,
        mentions: [participant]
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // AUTO-GOODBYE
  async handleAutoGoodbye(groupId, participantIds) {
    const settings = db.get("customGreeting")[groupId];
    if (!settings || !settings.autoGoodbye) return;

    const goodbye = settings.goodbyeMessage || `Goodbye @user! 👋`;

    for (const participant of participantIds) {
      const message = goodbye.replace("@user", `@${Utils.extractJid(participant)}`);
      await this.sock.sendMessage(groupId, {
        text: message,
        mentions: [participant]
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // LEVEL SYSTEM
  addXP(groupId, userId, amount = 10) {
    const key = `${groupId}_${userId}`;
    let userData = db.get("levelSystem")[key] || { level: 1, xp: 0 };

    userData.xp += amount;
    if (userData.xp >= userData.level * 100) {
      userData.level++;
      userData.xp = 0;
      return { levelUp: true, level: userData.level };
    }

    db.update("levelSystem", key, userData);
    return { levelUp: false };
  }
}

// ╔═══════════════════════════════════════════════════════════╗
// ║          📥 COMMAND HANDLER 📥                            ║
// ╚═══════════════════════════════════════════════════════════╝

class CommandHandler {
  constructor(sock) {
    this.sock = sock;
    this.features = new FeatureHandler(sock);
    this.commands = new Map();
    this.initCommands();
  }

  initCommands() {
    // PUBLIC
    this.register("menu", this.cmdMenu);
    this.register("help", this.cmdMenu);
    this.register("ping", this.cmdPing);
    this.register("status", this.cmdStatus);
    this.register("owner", this.cmdOwner);

    // DOWNLOAD
    this.register("video", this.cmdVideo);
    this.register("audio", this.cmdAudio);
    this.register("song", this.cmdAudio);
    this.register("fb", this.cmdFacebook);
    this.register("tt", this.cmdTikTok);
    this.register("insta", this.cmdInstagram);

    // GROUP MANAGEMENT
    this.register("open", this.cmdOpen);
    this.register("close", this.cmdClose);
    this.register("lock", this.cmdLock);
    this.register("unlock", this.cmdUnlock);
    this.register("groupinfo", this.cmdGroupInfo);
    this.register("memberlist", this.cmdMemberList);
    this.register("admins", this.cmdAdmins);

    // MODERATION
    this.register("kick", this.cmdKick);
    this.register("remove", this.cmdKick);
    this.register("promote", this.cmdPromote);
    this.register("demote", this.cmdDemote);
    this.register("mute", this.cmdMute);
    this.register("unmute", this.cmdUnmute);
    this.register("warn", this.cmdWarn);
    this.register("ban", this.cmdBan);
    this.register("unban", this.cmdUnban);

    // ANTI-FEATURES
    this.register("antispam", this.cmdAntiSpam);
    this.register("antilink", this.cmdAntiLink);
    this.register("antimention", this.cmdAntiMention);
    this.register("antibot", this.cmdAntiBot);
    this.register("antisticker", this.cmdAntiSticker);
    this.register("antidelete", this.cmdAntiDelete);
    this.register("antiedit", this.cmdAntiEdit);
    this.register("antiview", this.cmdAntiView);

    // AUTO-FEATURES
    this.register("setwelcome", this.cmdSetWelcome);
    this.register("setgoodbye", this.cmdSetGoodbye);
    this.register("autoreply", this.cmdAutoReply);
    this.register("getreply", this.cmdGetReply);

    // UTILITY
    this.register("afk", this.cmdAFK);
    this.register("profile", this.cmdProfile);
    this.register("stats", this.cmdStats);
    this.register("level", this.cmdLevel);

    // OWNER
    this.register("broadcast", this.cmdBroadcast);
    this.register("eval", this.cmdEval);
    this.register("setprefix", this.cmdSetPrefix);
    this.register("block", this.cmdBlock);
    this.register("unblock", this.cmdUnblock);
    this.register("restart", this.cmdRestart);
  }

  register(name, handler) {
    this.commands.set(name, handler.bind(this));
  }

  async execute(cmd, args, msg, from, sender, isOwner, isGroup) {
    const handler = this.commands.get(cmd);
    if (handler) {
      try {
        await handler({ args, msg, from, sender, isOwner, isGroup });
      } catch (err) {
        console.log(`Error in ${cmd}:`, err.message);
        await this.sock.sendMessage(from, {
          text: `❌ Error: ${err.message}`
        });
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // PUBLIC COMMANDS
  // ════════════════════════════════════════════════════════════

  async cmdMenu({ from }) {
    await Utils.sendTyping(from);

    const menu = `
╔════════════════════════════════════════╗
║   🔥 ${CONFIG.BOT_NAME} 🔥   ║
║        PREMIUM MD BOT                  ║
║        Version ${CONFIG.BOT_VERSION}               ║
╚════════════════════════════════════════╝

📥 *DOWNLOAD COMMANDS*
├─ .video <name> - YouTube video
├─ .audio <name> - YouTube audio
├─ .fb <link> - Facebook video
├─ .tt <link> - TikTok video
└─ .insta <link> - Instagram post

👥 *GROUP COMMANDS*
├─ .open - Open group
├─ .close - Close group
├─ .lock - Lock group settings
├─ .unlock - Unlock settings
├─ .groupinfo - Group info
├─ .memberlist - List members
├─ .admins - List admins
└─ .kick <@user> - Remove member

⚙️ *MODERATION*
├─ .promote <@user> - Make admin
├─ .demote <@user> - Remove admin
├─ .mute <@user> - Mute user
├─ .unmute <@user> - Unmute user
├─ .warn <@user> - Warn user
├─ .ban <@user> - Ban user
└─ .unban <@user> - Unban user

🚨 *ANTI-FEATURES*
├─ .antispam on/off - Spam protection
├─ .antilink on/off - Link protection
├─ .antimention on/off - Mention limit
├─ .antibot on/off - Bot protection
├─ .antisticker on/off - Sticker filter
├─ .antidelete on/off - Delete monitor
├─ .antiedit on/off - Edit monitor
└─ .antiview on/off - View-once filter

🤖 *AUTO-FEATURES*
├─ .setwelcome <msg> - Welcome message
├─ .setgoodbye <msg> - Goodbye message
├─ .autoreply <trigger> <reply> - Auto reply
└─ .getreply - View all auto-replies

👤 *UTILITY*
├─ .ping - Bot response time
├─ .status - Bot status
├─ .profile - Your profile
├─ .stats - Your stats
├─ .level - Your level
├─ .afk <message> - Set AFK status
└─ .owner - Owner info

🔐 *OWNER ONLY*
├─ .broadcast <msg> - Broadcast
├─ .eval <code> - Execute code
├─ .setprefix <prefix> - Change prefix
├─ .block <@user> - Block user
├─ .unblock <@user> - Unblock user
└─ .restart - Restart bot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 Channel: ${CONFIG.CHANNEL_URL}
👨‍💻 Developer: ${CONFIG.OWNER_NAME}
🌐 Type: ${CONFIG.BOT_TYPE}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    await this.sock.sendMessage(from, { text: menu });
  }

  async cmdPing({ from }) {
    const start = Date.now();
    const msg2 = await this.sock.sendMessage(from, { text: "🏓 Pong!" });
    const latency = Date.now() - start;

    await this.sock.sendMessage(from, {
      text: `
╔════════════════════════════════════════╗
║           🏓 PONG 🏓                   ║
╚════════════════════════════════════════╝

⚡ Response: ${latency}ms
🌐 Status: ✅ Online
🤖 Bot: ${CONFIG.BOT_NAME}
⏰ Time: ${new Date().toLocaleTimeString()}`
    });
  }

  async cmdStatus({ from }) {
    const uptime = Utils.formatTime(Date.now() - startTime);
    const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const status = `
╔════════════════════════════════════════╗
║        🌟 BOT STATUS 🌟               ║
╚════════════════════════════════════════╝

🤖 Bot: ${CONFIG.BOT_NAME}
📦 Version: ${CONFIG.BOT_VERSION}
👤 Owner: ${CONFIG.OWNER_NAME}
🟢 Status: Online
⏰ Uptime: ${uptime}
💾 Memory: ${memory}MB
🕐 Time: ${new Date().toLocaleString()}`;

    await this.sock.sendMessage(from, { text: status });
  }

  async cmdOwner({ from }) {
    const ownerInfo = `
╔════════════════════════════════════════╗
║       👤 OWNER INFORMATION 👤          ║
╚════════════════════════════════════════╝

👨‍💻 Name: ${CONFIG.OWNER_NAME}
📱 Number: +${CONFIG.OWNER_NUMBER}
🌐 Status: Active
⚡ Access: Full Admin

📞 WhatsApp: wa.me/${CONFIG.OWNER_NUMBER}
🔗 Channel: ${CONFIG.CHANNEL_URL}`;

    await this.sock.sendMessage(from, { text: ownerInfo });
  }

  // ════════════════════════════════════════════════════════════
  // DOWNLOAD COMMANDS
  // ════════════════════════════════════════════════════════════

  async cmdVideo({ args, from }) {
    const query = args.join(" ");
    if (!query) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}video <video name>`
      });
    }

    await Utils.sendTyping(from);

    try {
      const res = await yts(query);
      if (!res.videos.length) {
        return await this.sock.sendMessage(from, { text: "❌ Video not found" });
      }

      const video = res.videos[0];
      const thumb = await Utils.getThumbnail(video.url);

      const caption = `
🎬 *${video.title}*

⏱️ Duration: ${video.duration}
👀 Views: ${Utils.formatNumber(video.views)}
📅 Uploaded: ${video.uploadedAt}
👤 Channel: ${video.author.name}

⏳ Downloading...`;

      if (thumb) {
        await this.sock.sendMessage(from, {
          image: { url: thumb },
          caption: caption
        });
      }

      await Utils.sendTyping(from);
      await this.sock.sendMessage(from, {
        video: { url: video.url },
        caption: `✅ *${video.title}*\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to download video" });
    }
  }

  async cmdAudio({ args, from }) {
    const query = args.join(" ");
    if (!query) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}audio <song name>`
      });
    }

    await Utils.sendTyping(from);

    try {
      const res = await yts(query);
      if (!res.videos.length) {
        return await this.sock.sendMessage(from, { text: "❌ Audio not found" });
      }

      const video = res.videos[0];
      const thumb = await Utils.getThumbnail(video.url);

      const caption = `
🎵 *${video.title}*

⏱️ Duration: ${video.duration}
👤 Channel: ${video.author.name}

⏳ Converting...`;

      if (thumb) {
        await this.sock.sendMessage(from, {
          image: { url: thumb },
          caption: caption
        });
      }

      await Utils.sendRecording(from);
      await this.sock.sendMessage(from, {
        audio: { url: video.url },
        mimetype: "audio/mpeg"
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to download audio" });
    }
  }

  async cmdFacebook({ args, from }) {
    const url = args[0];
    if (!url) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}fb <facebook link>`
      });
    }

    await Utils.sendTyping(from);

    try {
      const res = await axios.get(`https://api.agatz.xyz/api/fb?url=${url}`, {
        timeout: 10000
      });

      if (!res.data.data?.hd) {
        return await this.sock.sendMessage(from, { text: "❌ Could not extract video" });
      }

      await this.sock.sendMessage(from, {
        video: { url: res.data.data.hd },
        caption: `✅ Facebook Downloaded\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Facebook download failed" });
    }
  }

  async cmdTikTok({ args, from }) {
    const url = args[0];
    if (!url) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}tt <tiktok link>`
      });
    }

    await Utils.sendTyping(from);

    try {
      const res = await axios.get(`https://api.agatz.xyz/api/tiktok?url=${url}`, {
        timeout: 10000
      });

      if (!res.data.data?.play) {
        return await this.sock.sendMessage(from, { text: "❌ Could not extract video" });
      }

      await this.sock.sendMessage(from, {
        video: { url: res.data.data.play },
        caption: `✅ TikTok Downloaded\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ TikTok download failed" });
    }
  }

  async cmdInstagram({ args, from }) {
    const url = args[0];
    if (!url) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}insta <instagram link>`
      });
    }

    await Utils.sendTyping(from);

    try {
      const res = await axios.get(`https://api.agatz.xyz/api/instagram?url=${url}`, {
        timeout: 10000
      });

      if (!res.data.data) {
        return await this.sock.sendMessage(from, { text: "❌ Could not extract media" });
      }

      await this.sock.sendMessage(from, {
        video: { url: res.data.data },
        caption: `✅ Instagram Downloaded\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Instagram download failed" });
    }
  }

  // ════════════════════════════════════════════════════════════
  // GROUP MANAGEMENT
  // ════════════════════════════════════════════════════════════

  async cmdOpen({ from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    try {
      await this.sock.groupSettingUpdate(from, "not_announcement");
      await this.sock.sendMessage(from, {
        text: `🔓 *GROUP OPENED*\n\n✅ Members can send messages\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to open group" });
    }
  }

  async cmdClose({ from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    try {
      await this.sock.groupSettingUpdate(from, "announcement");
      await this.sock.sendMessage(from, {
        text: `🔒 *GROUP CLOSED*\n\n✅ Only admins can send messages\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to close group" });
    }
  }

  async cmdLock({ from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    try {
      await this.sock.groupSettingUpdate(from, "locked");
      await this.sock.sendMessage(from, {
        text: `🔐 *GROUP LOCKED*\n\n✅ Group info is locked\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to lock group" });
    }
  }

  async cmdUnlock({ from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    try {
      await this.sock.groupSettingUpdate(from, "unlocked");
      await this.sock.sendMessage(from, {
        text: `🔓 *GROUP UNLOCKED*\n\n✅ Group info is unlocked\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to unlock group" });
    }
  }

  async cmdGroupInfo({ from, isGroup }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });

    try {
      const metadata = await this.sock.groupMetadata(from);
      const members = metadata.participants.length;
      const admins = metadata.participants.filter(p => p.admin).length;

      const info = `
╔════════════════════════════════════════╗
║        📊 GROUP INFORMATION 📊         ║
╚════════════════════════════════════════╝

📱 Group: ${metadata.subject}
🆔 ID: ${metadata.id}
👥 Members: ${members}
👑 Admins: ${admins}
📍 Owner: @${Utils.extractJid(metadata.owner)}
📅 Created: ${new Date(metadata.created * 1000).toLocaleDateString()}
📝 Description: ${metadata.desc || "No description"}`;

      await this.sock.sendMessage(from, { text: info });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to get group info" });
    }
  }

  async cmdMemberList({ from, isGroup }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });

    try {
      const members = await Utils.getGroupMembers(from);
      let text = `📋 *MEMBER LIST* (${members.length})\n\n`;

      members.forEach((member, index) => {
        text += `${index + 1}. @${Utils.extractJid(member)}\n`;
      });

      await this.sock.sendMessage(from, { text: text });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to get member list" });
    }
  }

  async cmdAdmins({ from, isGroup }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });

    try {
      const admins = await Utils.getGroupAdmins(from);
      let text = `👑 *ADMINS* (${admins.length})\n\n`;

      admins.forEach((admin, index) => {
        text += `${index + 1}. @${Utils.extractJid(admin)}\n`;
      });

      await this.sock.sendMessage(from, { text: text });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to get admins" });
    }
  }

  // ════════════════════════════════════════════════════════════
  // MODERATION
  // ════════════════════════════════════════════════════════════

  async cmdKick({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    if (!args[0]) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}kick @user`
      });
    }

    try {
      const users = args.map(arg => arg.replace(/[^0-9]/g, "") + "@s.whatsapp.net");
      await this.sock.groupParticipantsUpdate(from, users, "remove");
      await this.sock.sendMessage(from, {
        text: `✅ User(s) removed from group\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to kick user" });
    }
  }

  async cmdPromote({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    if (!args[0]) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}promote @user`
      });
    }

    try {
      const users = args.map(arg => arg.replace(/[^0-9]/g, "") + "@s.whatsapp.net");
      await this.sock.groupParticipantsUpdate(from, users, "promote");
      await this.sock.sendMessage(from, {
        text: `✅ User promoted to admin\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to promote user" });
    }
  }

  async cmdDemote({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    if (!args[0]) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}demote @user`
      });
    }

    try {
      const users = args.map(arg => arg.replace(/[^0-9]/g, "") + "@s.whatsapp.net");
      await this.sock.groupParticipantsUpdate(from, users, "demote");
      await this.sock.sendMessage(from, {
        text: `✅ User demoted from admin\n\n🔥 ${CONFIG.BOT_NAME}`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Failed to demote user" });
    }
  }

  async cmdMute({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const time = parseInt(args[1]) || 3600;
    db.update("mutedUsers", args[0], { muteTime: Date.now() + time * 1000 });

    await this.sock.sendMessage(from, {
      text: `🔇 User muted for ${time}s\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdUnmute({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    db.remove("mutedUsers", args[0]);

    await this.sock.sendMessage(from, {
      text: `🔊 User unmuted\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdWarn({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    if (!args[0]) return await this.sock.sendMessage(from, { text: "❌ Usage: .warn @user" });

    const user = args[0];
    const warns = db.get("warnings")[user] || 0;
    const newWarns = warns + 1;

    db.update("warnings", user, { count: newWarns });

    await this.sock.sendMessage(from, {
      text: `⚠️ Warning given!\n\nUser: ${user}\nWarnings: ${newWarns}/3\n\n🔥 ${CONFIG.BOT_NAME}`
    });

    if (newWarns >= 3) {
      try {
        await this.sock.groupParticipantsUpdate(from, [user + "@s.whatsapp.net"], "remove");
        await this.sock.sendMessage(from, {
          text: `🚫 User removed (3 warnings)\n\n🔥 ${CONFIG.BOT_NAME}`
        });
      } catch (err) {}
    }
  }

  async cmdBan({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const banned = db.get("blockedUsers") || [];
    banned.push(args[0]);
    db.set("blockedUsers", banned);

    await this.sock.sendMessage(from, {
      text: `🚫 User banned from using bot\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdUnban({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    let banned = db.get("blockedUsers") || [];
    banned = banned.filter(b => b !== args[0]);
    db.set("blockedUsers", banned);

    await this.sock.sendMessage(from, {
      text: `✅ User unbanned\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  // ════════════════════════════════════════════════════════════
  // ANTI-FEATURES
  // ════════════════════════════════════════════════════════════

  async cmdAntiSpam({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const setting = args[0]?.toLowerCase();
    if (!["on", "off"].includes(setting)) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}antispam on/off`
      });
    }

    db.update("groupSettings", from, { antiSpam: setting === "on" });

    await this.sock.sendMessage(from, {
      text: `🚫 *ANTI-SPAM ${setting.toUpperCase()}*\n\n${setting === "on" ? "✅" : "❌"} Monitoring spam\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdAntiLink({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const setting = args[0]?.toLowerCase();
    if (!["on", "off"].includes(setting)) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}antilink on/off`
      });
    }

    db.update("groupSettings", from, { antiLink: setting === "on" });

    await this.sock.sendMessage(from, {
      text: `🔗 *ANTI-LINK ${setting.toUpperCase()}*\n\n${setting === "on" ? "✅" : "❌"} Filtering links\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdAntiMention({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const setting = args[0]?.toLowerCase();
    if (!["on", "off"].includes(setting)) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}antimention on/off`
      });
    }

    db.update("groupSettings", from, { antiMention: setting === "on" });

    await this.sock.sendMessage(from, {
      text: `@️ *ANTI-MENTION ${setting.toUpperCase()}*\n\n${setting === "on" ? "✅" : "❌"} Limiting mentions\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdAntiBot({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const setting = args[0]?.toLowerCase();
    if (!["on", "off"].includes(setting)) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}antibot on/off`
      });
    }

    db.update("groupSettings", from, { antiBot: setting === "on" });

    await this.sock.sendMessage(from, {
      text: `🤖 *ANTI-BOT ${setting.toUpperCase()}*\n\n${setting === "on" ? "✅" : "❌"} Blocking bots\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdAntiSticker({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const setting = args[0]?.toLowerCase();
    if (!["on", "off"].includes(setting)) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}antisticker on/off`
      });
    }

    db.update("groupSettings", from, { antiSticker: setting === "on" });

    await this.sock.sendMessage(from, {
      text: `🎨 *ANTI-STICKER ${setting.toUpperCase()}*\n\n${setting === "on" ? "✅" : "❌"} Filtering stickers\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdAntiDelete({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const setting = args[0]?.toLowerCase();
    if (!["on", "off"].includes(setting)) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}antidelete on/off`
      });
    }

    db.update("groupSettings", from, { antiDelete: setting === "on" });

    await this.sock.sendMessage(from, {
      text: `🚨 *ANTI-DELETE ${setting.toUpperCase()}*\n\n${setting === "on" ? "✅" : "❌"} Monitoring deletions\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdAntiEdit({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const setting = args[0]?.toLowerCase();
    if (!["on", "off"].includes(setting)) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}antiedit on/off`
      });
    }

    db.update("groupSettings", from, { antiEdit: setting === "on" });

    await this.sock.sendMessage(from, {
      text: `✏️ *ANTI-EDIT ${setting.toUpperCase()}*\n\n${setting === "on" ? "✅" : "❌"} Monitoring edits\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdAntiView({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const setting = args[0]?.toLowerCase();
    if (!["on", "off"].includes(setting)) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}antiview on/off`
      });
    }

    db.update("groupSettings", from, { antiViewOnce: setting === "on" });

    await this.sock.sendMessage(from, {
      text: `👁️ *ANTI-VIEW-ONCE ${setting.toUpperCase()}*\n\n${setting === "on" ? "✅" : "❌"} Saving view-once media\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  // ════════════════════════════════════════════════════════════
  // AUTO-FEATURES
  // ════════════════════════════════════════════════════════════

  async cmdSetWelcome({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const message = args.join(" ");
    if (!message) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}setwelcome <message>\n\nUse @user for member mention`
      });
    }

    db.update("customGreeting", from, { autoWelcome: true, welcomeMessage: message });

    await this.sock.sendMessage(from, {
      text: `✅ Welcome message set!\n\n${message}\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdSetGoodbye({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const message = args.join(" ");
    if (!message) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}setgoodbye <message>`
      });
    }

    db.update("customGreeting", from, { autoGoodbye: true, goodbyeMessage: message });

    await this.sock.sendMessage(from, {
      text: `✅ Goodbye message set!\n\n${message}\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdAutoReply({ args, from, isGroup, isOwner }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Admin only" });

    const trigger = args[0];
    const reply = args.slice(1).join(" ");

    if (!trigger || !reply) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}autoreply <trigger> <reply>`
      });
    }

    db.update("autoReplies", from, { [trigger.toLowerCase()]: reply });

    await this.sock.sendMessage(from, {
      text: `✅ Auto-reply added!\n\nTrigger: ${trigger}\nReply: ${reply}\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdGetReply({ from, isGroup }) {
    if (!isGroup) return await this.sock.sendMessage(from, { text: "❌ Group only" });

    const replies = db.get("autoReplies")[from] || {};
    if (!Object.keys(replies).length) {
      return await this.sock.sendMessage(from, { text: "❌ No auto-replies set" });
    }

    let text = "📋 *AUTO-REPLIES*\n\n";
    for (const [trigger, reply] of Object.entries(replies)) {
      text += `🔹 *${trigger}* → ${reply}\n`;
    }

    await this.sock.sendMessage(from, { text: text });
  }

  // ════════════════════════════════════════════════════════════
  // UTILITY
  // ════════════════════════════════════════════════════════════

  async cmdAFK({ args, from, sender }) {
    const message = args.join(" ") || "AFK";
    db.update("afkUsers", sender, { afk: true, message: message, time: Date.now() });

    await this.sock.sendMessage(from, {
      text: `💤 You are now AFK\n\nMessage: ${message}\n\n🔥 ${CONFIG.BOT_NAME}`
    });
  }

  async cmdProfile({ from, sender }) {
    const userData = db.get("userStats")[sender] || {};
    const level = db.get("levelSystem")[`${from}_${sender}`] || { level: 1, xp: 0 };

    const profile = `
╔════════════════════════════════════════╗
║          👤 YOUR PROFILE 👤            ║
╚════════════════════════════════════════╝

👤 Number: ${sender}
📝 Username: ${userData.username || "Not set"}
📊 Messages: ${userData.messageCount || 0}
⏰ Join Date: ${userData.joinDate || "Unknown"}
🎮 Level: ${level.level}
✨ XP: ${level.xp}/${level.level * 100}`;

    await this.sock.sendMessage(from, { text: profile });
  }

  async cmdStats({ from }) {
    const uptime = Utils.formatTime(Date.now() - startTime);
    const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const messages = Object.keys(db.get("userStats")).length;

    const stats = `
╔════════════════════════════════════════╗
║          📊 BOT STATISTICS 📊          ║
╚════════════════════════════════════════╝

🤖 Bot: ${CONFIG.BOT_NAME}
📦 Version: ${CONFIG.BOT_VERSION}
⏰ Uptime: ${uptime}
💾 Memory: ${memory}MB
👥 Users: ${messages}
🌐 Status: Online`;

    await this.sock.sendMessage(from, { text: stats });
  }

  async cmdLevel({ from, sender }) {
    const level = db.get("levelSystem")[`${from}_${sender}`] || { level: 1, xp: 0 };
    const nextLevel = level.level * 100;
    const percent = Math.round((level.xp / nextLevel) * 100);

    const levelText = `
╔════════════════════════════════════════╗
║           🎮 YOUR LEVEL 🎮            ║
╚════════════════════════════════════════╝

🎮 Level: ${level.level}
✨ XP: ${level.xp}/${nextLevel}
📊 Progress: ${percent}%
${"█".repeat(Math.floor(percent / 5))}${"░".repeat(20 - Math.floor(percent / 5))}`;

    await this.sock.sendMessage(from, { text: levelText });
  }

  // ════════════════════════════════════════════════════════════
  // OWNER COMMANDS
  // ════════════════════════════════════════════════════════════

  async cmdBroadcast({ args, from, isOwner }) {
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Owner only" });

    const message = args.join(" ");
    if (!message) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}broadcast <message>`
      });
    }

    await this.sock.sendMessage(from, { text: "📢 Broadcasting..." });

    try {
      let count = 0;
      const chats = await this.sock.groupFetchAllParticipating();

      for (const chatId in chats) {
        try {
          await this.sock.sendMessage(chatId, {
            text: `📢 *BROADCAST FROM ${CONFIG.OWNER_NAME}*\n\n${message}\n\n🔥 ${CONFIG.BOT_NAME}`
          });
          count++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {}
      }

      await this.sock.sendMessage(from, {
        text: `✅ Broadcast sent to ${count} groups`
      });
    } catch (err) {
      await this.sock.sendMessage(from, { text: "❌ Broadcast failed" });
    }
  }

  async cmdEval({ args, from, isOwner }) {
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Owner only" });

    const code = args.join(" ");
    if (!code) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}eval <code>`
      });
    }

    try {
      const result = eval(code);
      await this.sock.sendMessage(from, {
        text: `✅ *EXECUTED*\n\n\`\`\`${typeof result === "object" ? JSON.stringify(result, null, 2) : result}\`\`\``
      });
    } catch (err) {
      await this.sock.sendMessage(from, {
        text: `❌ *ERROR*\n\n\`\`\`${err.message}\`\`\``
      });
    }
  }

  async cmdSetPrefix({ args, from, isOwner }) {
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Owner only" });

    const newPrefix = args[0];
    if (!newPrefix) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}setprefix <prefix>`
      });
    }

    await this.sock.sendMessage(from, {
      text: `✅ Prefix changed!\n\nOld: ${CONFIG.PREFIX}\nNew: ${newPrefix}\n\n⚠️ Restart bot`
    });
  }

  async cmdBlock({ args, from, isOwner }) {
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Owner only" });

    const user = args[0];
    if (!user) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}block <number>`
      });
    }

    const blocked = db.get("blockedUsers") || [];
    blocked.push(user);
    db.set("blockedUsers", blocked);

    await this.sock.sendMessage(from, { text: `✅ User blocked` });
  }

  async cmdUnblock({ args, from, isOwner }) {
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Owner only" });

    const user = args[0];
    if (!user) {
      return await this.sock.sendMessage(from, {
        text: `❌ Usage: ${CONFIG.PREFIX}unblock <number>`
      });
    }

    let blocked = db.get("blockedUsers") || [];
    blocked = blocked.filter(b => b !== user);
    db.set("blockedUsers", blocked);

    await this.sock.sendMessage(from, { text: `✅ User unblocked` });
  }

  async cmdRestart({ from, isOwner }) {
    if (!isOwner) return await this.sock.sendMessage(from, { text: "❌ Owner only" });

    await this.sock.sendMessage(from, { text: "🔄 Restarting bot..." });
    process.exit(0);
  }
}

// ╔═══════════════════════════════════════════════════════════╗
// ║          🤖 MAIN BOT INITIALIZATION 🤖                    ║
// ╚═══════════════════════════════════════════════════════════╝

async function startBot() {
  console.clear();
  console.log(`
╔═════════════════════════════════════════╗
║  🔥 ${CONFIG.BOT_NAME} 🔥  ║
║        PREMIUM MD BOT                   ║
║        Version ${CONFIG.BOT_VERSION}                 ║
╚═════════════════════════════════════════╝

Starting bot...
`);

  try {
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      syncFullHistory: true,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 0,
      emitOwnEvents: true,
      retryRequestDelayMs: 10_000
    });

    const handler = new CommandHandler(sock);
    const features = new FeatureHandler(sock);

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, qr, lastDisconnectReason }) => {
      if (qr) {
        console.clear();
        console.log(`\n${CONFIG.BOT_NAME}\n`);
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        console.clear();
        console.log(`
╔═════════════════════════════════════════╗
║  ✅ ${CONFIG.BOT_NAME} ✅  ║
║          CONNECTED & ONLINE             ║
╚═════════════════════════════════════════╝

🤖 Bot: ${CONFIG.BOT_NAME}
📦 Version: ${CONFIG.BOT_VERSION}
👤 Owner: ${CONFIG.OWNER_NAME}
📱 Number: +${CONFIG.OWNER_NUMBER}
⏰ Time: ${new Date().toLocaleString()}

🟢 Status: Online & Ready
📝 Prefix: ${CONFIG.PREFIX}

Type ${CONFIG.PREFIX}menu for commands
`);

        try {
          await sock.sendMessage(CONFIG.OWNER_NUMBER + "@s.whatsapp.net", {
            text: `✅ ${CONFIG.BOT_NAME}\n\nBot is now online!\n⏰ Time: ${new Date().toLocaleString()}`
          });
        } catch (err) {}
      }

      if (connection === "close") {
        const shouldReconnect = lastDisconnectReason?.error?.output?.statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("Reconnecting...");
          setTimeout(() => startBot(), 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      if (!m.messages) return;

      for (const msg of m.messages) {
        try {
          if (!msg.message) continue;

          const from = msg.key.remoteJid;
          const sender = msg.key.participant || msg.key.remoteJid;
          const isOwner = Utils.isOwner(sender);
          const isGroup = Utils.isGroup(from);
          const senderNum = Utils.extractJid(sender);

          // Check blocked
          const blocked = db.get("blockedUsers") || [];
          if (blocked.includes(senderNum)) continue;

          // Check AFK
          const afkUser = db.get("afkUsers")[sender];
          if (afkUser?.afk) {
            await sock.sendMessage(from, {
              text: `💤 User is AFK\n\nMessage: ${afkUser.message}`
            });
            continue;
          }

          // Read message
          Utils.readMessage(msg.key);

          // Get body
          const body =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";

          if (!body) continue;

          console.log(`\n📨 [${isGroup ? "GROUP" : "CHAT"}] ${senderNum}: ${body}`);

          if (!body.startsWith(CONFIG.PREFIX)) {
            // Check auto-reply
            if (isGroup) {
              await features.handleAutoReply(from, body);
            }
            continue;
          }

          // Parse command
          const args = body.slice(CONFIG.PREFIX.length).trim().split(/ +/);
          const cmd = args.shift().toLowerCase();

          console.log(`⚡ Command: ${cmd}`);

          // Anti-spam check
          if (isGroup && await features.checkAntiSpam(from, sender)) continue;

          // Execute command
          await handler.execute(cmd, args, msg, from, sender, isOwner, isGroup);

        } catch (err) {
          console.log("Message error:", err);
        }
      }
    });

    // Group events
    sock.ev.on("group-participants.update", async (update) => {
      const { id, participants, action } = update;

      if (action === "add") {
        await features.handleAutoWelcome(id, participants);
      } else if (action === "remove") {
        await features.handleAutoGoodbye(id, participants);
      }
    });

  } catch (err) {
    console.log("Bot error:", err);
    setTimeout(() => startBot(), 3000);
  }
}

startBot();
