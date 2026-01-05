import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";
import puppeteer from "puppeteer";

/* ================= CONFIG ================= */
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const IG_USERNAME = process.env.IG_USERNAME;
/* ========================================== */

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !CHANNEL_ID) {
  throw new Error("❌ ENV ไม่ครบ ตรวจสอบไฟล์ .env");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let lastMessageId = null;

/* ---------- follower parser ---------- */
function parseFollowers(text) {
  const match =
    text.match(/([\d,.]+)\s*([KM]?)\s*Followers/i) ||
    text.match(/ผู้ติดตาม\s*([\d,.]+)\s*([KM]?)/i);

  if (!match) return null;

  let value = parseFloat(match[1].replace(/,/g, ""));
  const unit = match[2]?.toUpperCase();

  if (unit === "K") value *= 1_000;
  if (unit === "M") value *= 1_000_000;

  return Math.round(value);
}

/* ---------- get IG followers ---------- */
async function getFollowers(username) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  );

  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await new Promise(r => setTimeout(r, 3000));

  const description = await page.$eval(
    'meta[name="description"]',
    el => el.content
  ).catch(() => null);

  await browser.close();

  if (!description) throw new Error("ไม่พบ meta description");

  const followers = parseFollowers(description);
  if (!followers) throw new Error("parse follower ไม่ได้");

  return followers;
}

/* ---------- embed ---------- */
function followerEmbed(username, followers) {
  return new EmbedBuilder()
    .setColor(0xE1306C)
    .setTitle(`📊 Instagram Followers`)
    .setURL(`https://www.instagram.com/${username}/`)
    .addFields(
      { name: "บัญชี", value: `@${username}`, inline: true },
      { name: "ผู้ติดตาม", value: followers.toLocaleString(), inline: true }
    )
    .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png")
    .setFooter({ text: "อัปเดตอัตโนมัติวันละครั้ง" })
    .setTimestamp();
}

/* ---------- send / edit message ---------- */
async function updateFollowersMessage() {
  const followers = await getFollowers(IG_USERNAME);
  const channel = await client.channels.fetch(CHANNEL_ID);

  if (lastMessageId) {
    const msg = await channel.messages.fetch(lastMessageId);
    await msg.edit({ embeds: [followerEmbed(IG_USERNAME, followers)] });
  } else {
    const msg = await channel.send({
      embeds: [followerEmbed(IG_USERNAME, followers)]
    });
    lastMessageId = msg.id;
  }
}

/* ---------- slash command ---------- */
const command = new SlashCommandBuilder()
  .setName("followers")
  .setDescription("ดูจำนวนผู้ติดตาม Instagram");

const rest = new REST({ version: "10" }).setToken(TOKEN);

await rest.put(
  Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
  { body: [command.toJSON()] }
);

/* ---------- discord events ---------- */
client.once("clientReady", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  await updateFollowersMessage();

  // วันละครั้ง (24 ชม.)
  setInterval(updateFollowersMessage, 24 * 60 * 60 * 1000);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "followers") {
    await interaction.deferReply();

    try {
      const followers = await getFollowers(IG_USERNAME);
      await interaction.editReply({
        embeds: [followerEmbed(IG_USERNAME, followers)]
      });
    } catch (e) {
      await interaction.editReply("❌ ไม่สามารถดึงข้อมูลได้");
    }
  }
});

client.login(TOKEN);
