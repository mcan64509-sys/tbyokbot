require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
    EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
    ButtonBuilder, ButtonStyle, Events, ComponentType
} = require("discord.js");

const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const STATS_FILE = path.join(__dirname, "jotun_stats.json");
const STATS_FILE_TMP = path.join(__dirname, "jotun_stats.tmp.json");
const VOICE_LOG_FILE = path.join(__dirname, "voice_log.json");

const JOTUNLOG_ROLE_ID = "1382093776826400969";
const YETKILI_ROLE_ID  = "1382093776826400968";
const SABIT_SES_KANAL_ID = "1399803470302937128";

const LONCA_ROLLERI = {
  VUSLAT:  "1382093776805302298",
  SPARTAN: "1382093776805302296",
  CORLEONE:"1382093776805302294",
  ALPHA:   "1382093776805302293",
  ARES:    "1494407309827506267"
};

const LONCA_EMOJILERI = {
  VUSLAT:  "\u2694\uFE0F",
  SPARTAN: "\uD83D\uDEE1\uFE0F",
  RULER:   "\uD83D\uDC51",
  ALPHA:   "\uD83D\uDD31",
  ARES:    "\u2694\uFE0F"
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

process.on("unhandledRejection", (err) => {
    console.error("\u274C [UnhandledRejection]", new Date().toISOString(), err);
});
process.on("uncaughtException", (err) => {
    console.error("\uD83D\uDCA5 [UncaughtException]", new Date().toISOString(), err);
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const applyFooter = (embed) =>
    embed
        .setColor(0x2b2d31)
        .setFooter({ text: "\u26A1 TBYOKGG LOG BOT \u2022 CREATED BY LYM\u0130X \u263E\u272F" })
        .setTimestamp();

function nowTR() {
    return new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

function loadStats() {
    try {
        if (!fs.existsSync(STATS_FILE)) return {};
        return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
    } catch (e) {
        console.error("\u26A0\uFE0F Stats yuklenemedi:", e.message);
        return {};
    }
}
function saveStats(data) {
    try {
        fs.writeFileSync(STATS_FILE_TMP, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(STATS_FILE_TMP, STATS_FILE);
    } catch (e) {
        console.error("\u26A0\uFE0F Stats kaydedilemedi:", e.message);
    }
}

function loadVoiceLog() {
    try {
        if (!fs.existsSync(VOICE_LOG_FILE)) return [];
        return JSON.parse(fs.readFileSync(VOICE_LOG_FILE, "utf8"));
    } catch (e) {
        return [];
    }
}
function saveVoiceLog(data) {
    try {
        fs.writeFileSync(VOICE_LOG_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error("\u26A0\uFE0F VoiceLog kaydedilemedi:", e.message);
    }
}

const activeVoiceSessions = new Map();

function hasYetki(member) {
    return member.roles.cache.has(YETKILI_ROLE_ID);
}
function hasJotunYetki(member) {
    return member.roles.cache.has(JOTUNLOG_ROLE_ID) || member.roles.cache.has(YETKILI_ROLE_ID);
}

function buildGenelsonucEmbeds(stats) {
    const embeds = [];
    for (const [loncaAdi] of Object.entries(LONCA_ROLLERI)) {
        const emoji = LONCA_EMOJILERI[loncaAdi] || "\uD83D\uDD39";
        const uyeler = Object.values(stats)
            .filter(u => u.guildName === loncaAdi)
            .sort((a, b) => b.setCount - a.setCount);
        if (uyeler.length === 0) continue;
        const toplamKatilim = uyeler.reduce((sum, u) => sum + u.setCount, 0);
        const liste = uyeler.map(u =>
            `\uD83D\uDD38 **${u.displayName}** \u2022 ${u.guildName} \u2022 **${u.setCount} Set**`
        ).join("\n");
        embeds.push(applyFooter(new EmbedBuilder()
            .setTitle(`${emoji} ${loncaAdi} \u2014 Toplam: ${toplamKatilim} Kat\u0131l\u0131m`)
            .setDescription(liste.substring(0, 4000))
        ));
    }
    return embeds;
}

const commands = [
    new SlashCommandBuilder().setName("yard\u0131m").setDescription("\uD83D\uDCCB T\u00fcm komutlar\u0131 listeler."),
    new SlashCommandBuilder().setName("genelsonuc").setDescription("\uD83D\uDCCA T\u00fcm loncalar\u0131n set s\u0131ralamas\u0131."),
    new SlashCommandBuilder().setName("jotunlog").setDescription("\uD83C\uDFAF Ses kanal\u0131ndakileri kaydeder."),
    new SlashCommandBuilder().setName("loncasonuc").setDescription("\uD83D\uDD0D Lonca bazl\u0131 liste."),
    new SlashCommandBuilder().setName("istatistik").setDescription("\uD83D\uDC64 \u00DCye sorgulama.")
        .addUserOption(o => o.setName("uye").setDescription("\u00DCye").setRequired(true)),
    new SlashCommandBuilder().setName("setekle").setDescription("\u2795 \u00DCyeye manuel set ekler.")
        .addUserOption(o => o.setName("uye").setDescription("\u00DCye").setRequired(true))
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setRequired(true)),
    new SlashCommandBuilder().setName("setsil").setDescription("\u2796 \u00DCyeden manuel set siler.")
        .addUserOption(o => o.setName("uye").setDescription("\u00DCye").setRequired(true))
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setRequired(true)),
    new SlashCommandBuilder().setName("logs\u0131f\u0131rla").setDescription("\uD83D\uDDD1\uFE0F T\u00fcm verileri s\u0131f\u0131rlar."),
    new SlashCommandBuilder().setName("kay\u0131tlar").setDescription("\uD83D\uDD0D Ses kanal\u0131 giri\u015f/\u00e7\u0131k\u0131\u015f listesi.")
        .addIntegerOption(o => o.setName("adet").setDescription("Kac kayit gosterilsin (varsayilan: 20)").setRequired(false))
        .addUserOption(o => o.setName("kullanici").setDescription("Belirli bir kullanicinin kayitlari").setRequired(false))
].map(c => c.toJSON());

client.once(Events.ClientReady, async () => {
    console.log(`\u2705 Bot haz\u0131r: ${client.user.tag}`);
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log("\u2705 Slash komutlar\u0131 kaydedildi.");
    } catch (e) {
        console.error("\u274C Komut kayd\u0131 hatas\u0131:", e.message);
    }
});

client.on("disconnect", () => console.warn("\u26A0\uFE0F Bot baglantisi kesildi."));
client.on("error", (e) => console.error("\u274C Client hatas\u0131:", e.message));

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    try {
        const userId = newState.member?.id || oldState.member?.id;
        const displayName = newState.member?.displayName || oldState.member?.displayName || "Bilinmiyor";

        if (newState.channelId === SABIT_SES_KANAL_ID && oldState.channelId !== SABIT_SES_KANAL_ID) {
            activeVoiceSessions.set(userId, { displayName, giris: nowTR() });
        }

        if (oldState.channelId === SABIT_SES_KANAL_ID && newState.channelId !== SABIT_SES_KANAL_ID) {
            const session = activeVoiceSessions.get(userId);
            if (session) {
                const log = loadVoiceLog();
                log.unshift({ kullanici: session.displayName, userId, giris: session.giris, cikis: nowTR() });
                saveVoiceLog(log.slice(0, 1000));
                activeVoiceSessions.delete(userId);
            }
        }
    } catch (e) {
        console.error("\u274C VoiceState hatasi:", e.message);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const stats = loadStats();
            const member = interaction.member;

            if (interaction.commandName === "yard\u0131m") {
                const embed = new EmbedBuilder()
                    .setTitle("\uD83D\uDCCB TBYOKGG Bot Komut Rehberi")
                    .addFields(
                        { name: "\uD83C\uDFAF /jotunlog", value: "Sesteki \u00fcyeleri kaydeder, lonca lonca embed atar. *(Yetkili)*", inline: false },
                        { name: "\uD83D\uDCCA /genelsonuc", value: "T\u00fcm loncalar\u0131n set s\u0131ralamas\u0131.", inline: false },
                        { name: "\uD83D\uDD0D /loncasonuc", value: "Dropdown'dan lonca sec, o loncan\u0131n listesini goster.", inline: false },
                        { name: "\uD83D\uDC64 /istatistik", value: "\u00DCye bazl\u0131 lonca ve set sorgusu.", inline: false },
                        { name: "\u2795 /setekle", value: "Manuel set ekleme. *(Yetkili)*", inline: true },
                        { name: "\u2796 /setsil", value: "Manuel set silme. *(Yetkili)*", inline: true },
                        { name: "\uD83D\uDDD1\uFE0F /logs\u0131f\u0131rla", value: "T\u00fcm verileri s\u0131f\u0131rlar. *(Yetkili)*", inline: false },
                        { name: "\uD83D\uDD0D /kay\u0131tlar", value: "Ses kanal\u0131 giris/cikis listesi. *(Sadece sen gorursun)*", inline: false }
                    );
                return interaction.reply({ embeds: [applyFooter(embed)] });
            }

            if (interaction.commandName === "jotunlog") {
                if (!hasJotunYetki(member)) return interaction.reply({ content: "\uD83D\uDEAB Bu komutu kullanma yetkiniz yok.", ephemeral: true });
                await interaction.deferReply();
                const vChannel = interaction.guild.channels.cache.get(SABIT_SES_KANAL_ID);
                if (!vChannel) return interaction.editReply("\u274C Ses kanal\u0131 bulunamad\u0131!");
                const currentLog = {};
                vChannel.members.forEach(m => {
                    for (const [lName, rId] of Object.entries(LONCA_ROLLERI)) {
                        if (m.roles.cache.has(rId)) {
                            stats[m.id] = { displayName: m.displayName, guildName: lName, setCount: (stats[m.id]?.setCount || 0) + 1 };
                            if (!currentLog[lName]) currentLog[lName] = [];
                            currentLog[lName].push({ name: m.displayName, setCount: stats[m.id].setCount });
                            break;
                        }
                    }
                });
                saveStats(stats);
                if (Object.keys(currentLog).length === 0) return interaction.editReply("\u274C Ses kanal\u0131nda kay\u0131tl\u0131 lonca rol\u00fcne sahip kimse bulunamad\u0131.");
                const logEmbeds = [];
                for (const [loncaAdi, uyeler] of Object.entries(currentLog)) {
                    const emoji = LONCA_EMOJILERI[loncaAdi] || "\uD83D\uDD39";
                    const toplamKatilim = uyeler.reduce((sum, u) => sum + u.setCount, 0);
                    const liste = uyeler.map(u => `\uD83D\uDD38 **${u.name}** \u2022 ${loncaAdi} \u2022 **${u.setCount} Set**`).join("\n");
                    logEmbeds.push(applyFooter(new EmbedBuilder()
                        .setTitle(`${emoji} ${loncaAdi} \u2014 Toplam: ${toplamKatilim} Kat\u0131l\u0131m`)
                        .setDescription(liste.substring(0, 4000))
                    ));
                }
                await interaction.editReply({ embeds: [logEmbeds[0]] });
                for (let i = 1; i < logEmbeds.length; i++) {
                    await sleep(1200);
                    await interaction.followUp({ embeds: [logEmbeds[i]] });
                }
            }

            if (interaction.commandName === "genelsonuc") {
                await interaction.deferReply();
                const embeds = buildGenelsonucEmbeds(stats);
                if (embeds.length === 0) return interaction.editReply("\u274C Hen\u00fcz hi\u00e7 veri yok.");
                await interaction.editReply({ embeds: [embeds[0]] });
                for (let i = 1; i < embeds.length; i++) {
                    await sleep(1200);
                    await interaction.followUp({ embeds: [embeds[i]] });
                }
            }

            if (interaction.commandName === "loncasonuc") {
                const select = new StringSelectMenuBuilder()
                    .setCustomId("lonca_sec")
                    .setPlaceholder("\uD83D\uDD0D Lonca se\u00e7iniz...")
                    .addOptions(Object.keys(LONCA_ROLLERI).map(name => ({ label: `${LONCA_EMOJILERI[name] || "\uD83D\uDD39"} ${name}`, value: name })));
                return interaction.reply({
                    content: "**\uD83D\uDD0D Lonca Se\u00e7imi**",
                    components: [new ActionRowBuilder().addComponents(select)]
                });
            }

            if (interaction.commandName === "istatistik") {
                await interaction.deferReply();
                const targetUser = interaction.options.getUser("uye");
                const data = stats[targetUser.id];
                if (!data) return interaction.editReply("\u274C Bu \u00fcyeye ait veri bulunamad\u0131.");
                const emoji = LONCA_EMOJILERI[data.guildName] || "\uD83D\uDD39";
                const embed = new EmbedBuilder().setTitle("\uD83D\uDC64 \u00DCye \u0130statisti\u011fi").addFields(
                    { name: "\uD83C\uDFF7\uFE0F Kullan\u0131c\u0131", value: data.displayName, inline: true },
                    { name: `${emoji} Lonca`, value: data.guildName, inline: true },
                    { name: "\uD83C\uDFC6 Toplam Set", value: `**${data.setCount} Set**`, inline: true }
                );
                return interaction.editReply({ embeds: [applyFooter(embed)] });
            }

            if (interaction.commandName === "setekle") {
                if (!hasYetki(member)) return interaction.reply({ content: "\uD83D\uDEAB Bu komutu kullanma yetkiniz yok.", ephemeral: true });
                await interaction.deferReply();
                const targetUser = interaction.options.getUser("uye");
                const amount = interaction.options.getInteger("miktar");
                const m = await interaction.guild.members.fetch(targetUser.id);
                let lonca = "Bilinmiyor";
                for (const [name, id] of Object.entries(LONCA_ROLLERI)) { if (m.roles.cache.has(id)) { lonca = name; break; } }
                stats[targetUser.id] = { displayName: m.displayName, guildName: lonca, setCount: (stats[targetUser.id]?.setCount || 0) + amount };
                saveStats(stats);
                const emoji = LONCA_EMOJILERI[lonca] || "\uD83D\uDD39";
                return interaction.editReply(`\u2705 **${m.displayName}** kullan\u0131c\u0131s\u0131na **${amount}** set eklendi. ${emoji} Toplam: **${stats[targetUser.id].setCount} Set**`);
            }

            if (interaction.commandName === "setsil") {
                if (!hasYetki(member)) return interaction.reply({ content: "\uD83D\uDEAB Bu komutu kullanma yetkiniz yok.", ephemeral: true });
                await interaction.deferReply();
                const targetUser = interaction.options.getUser("uye");
                const amount = interaction.options.getInteger("miktar");
                const m = await interaction.guild.members.fetch(targetUser.id);
                if (!stats[targetUser.id]) return interaction.editReply("\u274C Bu \u00fcyeye ait veri bulunamad\u0131.");
                stats[targetUser.id].setCount = Math.max(0, stats[targetUser.id].setCount - amount);
                saveStats(stats);
                return interaction.editReply(`\uD83D\uDDD1\uFE0F **${m.displayName}** kullan\u0131c\u0131s\u0131ndan **${amount}** set silindi. Kalan: **${stats[targetUser.id].setCount} Set**`);
            }

            if (interaction.commandName === "logs\u0131f\u0131rla") {
                if (!hasYetki(member)) return interaction.reply({ content: "\uD83D\uDEAB Bu komutu kullanma yetkiniz yok.", ephemeral: true });
                saveStats({});
                return interaction.reply("\uD83D\uDDD1\uFE0F **T\u00fcm veriler ba\u015far\u0131yla s\u0131f\u0131rland\u0131!** Art\u0131k kay\u0131t temiz.");
            }

            if (interaction.commandName === "kay\u0131tlar") {
                await interaction.deferReply({ ephemeral: true });
                const adet = interaction.options.getInteger("adet") || 20;
                const hedefKullanici = interaction.options.getUser("kullanici");
                let log = loadVoiceLog();

                if (hedefKullanici) {
                    const m = await interaction.guild.members.fetch(hedefKullanici.id).catch(() => null);
                    const aranan = m?.displayName || hedefKullanici.username;
                    log = log.filter(k => k.kullanici === aranan || k.userId === hedefKullanici.id);
                }

                const aktifler = [];
                for (const [uid, session] of activeVoiceSessions.entries()) {
                    if (!hedefKullanici || uid === hedefKullanici.id) {
                        aktifler.push(`\uD83D\uDFE2 **${session.displayName}** \u2022 Giri\u015f: \`${session.giris}\` \u2022 Hala i\u00e7eride`);
                    }
                }

                const gosterilenLog = log.slice(0, adet);
                if (gosterilenLog.length === 0 && aktifler.length === 0) {
                    return interaction.editReply("\u274C Hi\u00e7 kay\u0131t bulunamad\u0131.");
                }

                let desc = "";
                if (aktifler.length > 0) desc += `**\uD83D\uDFE2 \u015EU AN \u0130\u00c7ER\u0130DE:**\n${aktifler.join("\n")}\n\n`;
                if (gosterilenLog.length > 0) {
                    desc += `**\uD83D\uDCCB SON ${gosterilenLog.length} KAYIT:**\n`;
                    desc += gosterilenLog.map(k =>
                        `\uD83D\uDD34 **${k.kullanici}** \u2022 Giri\u015f: \`${k.giris}\` \u2022 \u00c7\u0131k\u0131\u015f: \`${k.cikis}\``
                    ).join("\n");
                }

                const chunks = [];
                const lines = desc.split("\n");
                let current = "";
                for (const line of lines) {
                    if ((current + "\n" + line).length > 3900) { chunks.push(current); current = line; }
                    else current = current ? `${current}\n${line}` : line;
                }
                if (current) chunks.push(current);

                const baslik = hedefKullanici
                    ? `\uD83D\uDD0D ${hedefKullanici.username} \u2014 Ses Kanal\u0131 Kay\u0131tlar\u0131`
                    : `\uD83D\uDD0D Ses Kanal\u0131 Giri\u015f/\u00c7\u0131k\u0131\u015f Kay\u0131tlar\u0131`;

                await interaction.editReply({
                    embeds: [applyFooter(new EmbedBuilder().setTitle(baslik).setDescription(chunks[0].substring(0, 4000)))]
                });
                for (let i = 1; i < chunks.length; i++) {
                    await sleep(1000);
                    await interaction.followUp({
                        embeds: [applyFooter(new EmbedBuilder().setTitle(`${baslik} (${i+1}/${chunks.length})`).setDescription(chunks[i].substring(0, 4000)))],
                        ephemeral: true
                    });
                }
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId === "lonca_sec") {
            await interaction.deferUpdate();
            const stats = loadStats();
            const selected = interaction.values[0];
            const emoji = LONCA_EMOJILERI[selected] || "\uD83D\uDD39";
            const uyeler = Object.values(stats).filter(u => u.guildName === selected).sort((a, b) => b.setCount - a.setCount);
            if (uyeler.length === 0) return interaction.editReply({ content: "\u274C Bu loncaya ait veri yok.", components: [] });
            const toplamKatilim = uyeler.reduce((sum, u) => sum + u.setCount, 0);
            const liste = uyeler.map(u => `\uD83D\uDD38 **${u.displayName}** \u2022 ${u.guildName} \u2022 **${u.setCount} Set**`).join("\n").substring(0, 4000);
            const embed = applyFooter(new EmbedBuilder().setTitle(`${emoji} ${selected} \u2014 Toplam: ${toplamKatilim} Kat\u0131l\u0131m`).setDescription(liste));
            return interaction.editReply({ embeds: [embed], components: [] });
        }

    } catch (err) {
        console.error("\u274C Komut hatas\u0131:", err);
        try {
            const msg = "\u26A0\uFE0F Bir hata olustu, lutfen tekrar deneyin.";
            if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
            else await interaction.reply({ content: msg, ephemeral: true });
        } catch {}
    }
});

client.login(TOKEN);
