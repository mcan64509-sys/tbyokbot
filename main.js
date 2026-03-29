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

const JOTUNLOG_ROLE_ID = "1382093776826400969";
const SABIT_SES_KANAL_ID = "1399803470302937128";

const LONCA_ROLLERI = {
    VUSLAT:   "1382093776805302298",
    SPARTAN:  "1382093776805302296",
    RULER:    "1382093776805302295",
    CORLEONE: "1382093776805302294",
    OSMANLI:  "1382093776805302293",
    İNFAZ:    "1482754682819575930",
    HAREKAT:  "1483538542914306049"
};

const LONCA_EMOJILERI = {
    VUSLAT:   "⚔️",
    SPARTAN:  "🛡️",
    RULER:    "👑",
    CORLEONE: "🌹",
    OSMANLI:  "🌙",
    İNFAZ:    "💀",
    HAREKAT:  "🎯"
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// --- ÇÖKME ÖNLEMLERİ ---
process.on("unhandledRejection", (err) => {
    console.error("❌ [UnhandledRejection]", new Date().toISOString(), err);
});
process.on("uncaughtException", (err) => {
    console.error("💥 [UncaughtException]", new Date().toISOString(), err);
});

// --- YARDIMCI FONKSİYONLAR ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const applyFooter = (embed) =>
    embed
        .setColor(0x2b2d31)
        .setFooter({ text: "⚡ TBYOKGG LOG BOT • CREATED BY LYMİX ☾✯" })
        .setTimestamp();

function loadStats() {
    try {
        if (!fs.existsSync(STATS_FILE)) return {};
        const raw = fs.readFileSync(STATS_FILE, "utf8");
        return JSON.parse(raw);
    } catch (e) {
        console.error("⚠️ Stats yüklenemedi:", e.message);
        return {};
    }
}

function saveStats(data) {
    try {
        fs.writeFileSync(STATS_FILE_TMP, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(STATS_FILE_TMP, STATS_FILE);
    } catch (e) {
        console.error("⚠️ Stats kaydedilemedi:", e.message);
    }
}

function hasYetki(member) {
    return member.roles.cache.has(JOTUNLOG_ROLE_ID);
}

// Rate-limit korumalı embed gönderici
async function sendEmbedsWithRateLimit(replyFn, followUpFn, embeds) {
    if (embeds.length === 0) return;
    try {
        await replyFn({ embeds: [embeds[0]] });
    } catch (e) {
        console.error("❌ İlk embed gönderilemedi:", e.message);
        return;
    }
    for (let i = 1; i < embeds.length; i++) {
        await sleep(1200);
        try {
            await followUpFn({ embeds: [embeds[i]] });
        } catch (e) {
            console.error(`❌ Embed ${i + 1} gönderilemedi:`, e.message);
        }
    }
}

// Sayfalama için embed listesi oluşturur (lonca bazlı)
function buildGenelsonucPages(stats) {
    const pages = [];
    for (const [loncaAdi, roleId] of Object.entries(LONCA_ROLLERI)) {
        const emoji = LONCA_EMOJILERI[loncaAdi] || "🔹";
        const uyeler = Object.values(stats)
            .filter(u => u.guildName === loncaAdi)
            .sort((a, b) => b.setCount - a.setCount);
        if (uyeler.length === 0) continue;
        const toplamKatilim = uyeler.reduce((sum, u) => sum + u.setCount, 0);

        // Lonca çok kalabalıksa alt sayfalara böl (25 üye per sayfa)
        const chunkSize = 25;
        for (let i = 0; i < uyeler.length; i += chunkSize) {
            const chunk = uyeler.slice(i, i + chunkSize);
            const altSayfa = Math.floor(i / chunkSize) + 1;
            const toplamAltSayfa = Math.ceil(uyeler.length / chunkSize);
            const baslik = toplamAltSayfa > 1
                ? `${emoji} ${loncaAdi} — Toplam: ${toplamKatilim} Katılım (${altSayfa}/${toplamAltSayfa})`
                : `${emoji} ${loncaAdi} — Toplam: ${toplamKatilim} Katılım`;
            const liste = chunk.map(m =>
                `🔸 **${m.displayName}** • ${m.guildName} • **${m.setCount} Set**`
            ).join("\n");
            pages.push(
                applyFooter(
                    new EmbedBuilder()
                        .setTitle(baslik)
                        .setDescription(liste)
                )
            );
        }
    }
    return pages;
}

// Sayfalama butonları
function buildPageButtons(current, total) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("page_prev")
            .setLabel("◄ Geri")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(current === 0),
        new ButtonBuilder()
            .setCustomId("page_info")
            .setLabel(`${current + 1} / ${total}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId("page_next")
            .setLabel("İleri ►")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(current === total - 1)
    );
}

// --- KOMUTLAR ---
const commands = [
    new SlashCommandBuilder().setName("yardım").setDescription("📋 Tüm komutları listeler."),
    new SlashCommandBuilder().setName("genelsonuc").setDescription("📊 Tüm loncaların set sıralaması."),
    new SlashCommandBuilder().setName("jotunlog").setDescription("🎯 Ses kanalındakileri kaydeder."),
    new SlashCommandBuilder().setName("loncasonuc").setDescription("🔍 Lonca bazlı liste."),
    new SlashCommandBuilder().setName("istatistik").setDescription("👤 Üye sorgulama.")
        .addUserOption(o => o.setName("uye").setDescription("Üye").setRequired(true)),
    new SlashCommandBuilder().setName("setekle").setDescription("➕ Üyeye manuel set ekler.")
        .addUserOption(o => o.setName("uye").setDescription("Üye").setRequired(true))
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setRequired(true)),
    new SlashCommandBuilder().setName("setsil").setDescription("➖ Üyeden manuel set siler.")
        .addUserOption(o => o.setName("uye").setDescription("Üye").setRequired(true))
        .addIntegerOption(o => o.setName("miktar").setDescription("Miktar").setRequired(true)),
    new SlashCommandBuilder().setName("logsıfırla").setDescription("🗑️ Tüm verileri sıfırlar.")
].map(c => c.toJSON());

// --- BOT HAZIR ---
client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot hazır: ${client.user.tag}`);
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log("✅ Slash komutları kaydedildi.");
    } catch (e) {
        console.error("❌ Komut kaydı hatası:", e.message);
    }
});

// Bağlantı kopunca log at (PM2 zaten yeniden başlatır)
client.on("disconnect", () => console.warn("⚠️ Bot bağlantısı kesildi."));
client.on("error", (e) => console.error("❌ Client hatası:", e.message));

// --- ETKİLEŞİMLER ---
client.on(Events.InteractionCreate, async (interaction) => {
    try {

        // ==================== SLASH KOMUTLAR ====================

        if (interaction.isChatInputCommand()) {
            const stats = loadStats();
            const member = interaction.member;

            // --- /yardım ---
            if (interaction.commandName === "yardım") {
                const embed = new EmbedBuilder()
                    .setTitle("📋 TBYOKGG Bot Komut Rehberi")
                    .addFields(
                        { name: "🎯 /jotunlog", value: "Sesteki üyeleri kaydeder, lonca lonca embed atar. *(Yetkili)*", inline: false },
                        { name: "📊 /genelsonuc", value: "Tüm loncaların set sıralaması (sayfalama ile).", inline: false },
                        { name: "🔍 /loncasonuc", value: "Dropdown'dan lonca seç, o loncanın listesini göster.", inline: false },
                        { name: "👤 /istatistik", value: "Üye bazlı lonca ve set sorgusu.", inline: false },
                        { name: "➕ /setekle", value: "Manuel set ekleme. *(Yetkili)*", inline: true },
                        { name: "➖ /setsil", value: "Manuel set silme. *(Yetkili)*", inline: true },
                        { name: "🗑️ /logsıfırla", value: "Tüm verileri sıfırlar. *(Yetkili)*", inline: false }
                    );
                return interaction.reply({ embeds: [applyFooter(embed)] });
            }

            // --- /jotunlog ---
            if (interaction.commandName === "jotunlog") {
                if (!hasYetki(member)) return interaction.reply({ content: "🚫 Bu komutu kullanma yetkiniz yok.", ephemeral: true });
                await interaction.deferReply();

                const vChannel = interaction.guild.channels.cache.get(SABIT_SES_KANAL_ID);
                if (!vChannel) return interaction.editReply("❌ Ses kanalı bulunamadı!");

                const currentLog = {};
                vChannel.members.forEach(m => {
                    for (const [lName, rId] of Object.entries(LONCA_ROLLERI)) {
                        if (m.roles.cache.has(rId)) {
                            stats[m.id] = {
                                displayName: m.displayName,
                                guildName: lName,
                                setCount: (stats[m.id]?.setCount || 0) + 1
                            };
                            if (!currentLog[lName]) currentLog[lName] = [];
                            currentLog[lName].push({ name: m.displayName, setCount: stats[m.id].setCount });
                            break;
                        }
                    }
                });
                saveStats(stats);

                if (Object.keys(currentLog).length === 0) {
                    return interaction.editReply("❌ Ses kanalında kayıtlı lonca rollerine sahip kimse bulunamadı.");
                }

                // Her lonca için ayrı embed
                const logEmbeds = [];
                for (const [loncaAdi, uyeler] of Object.entries(currentLog)) {
                    const emoji = LONCA_EMOJILERI[loncaAdi] || "🔹";
                    const toplamKatilim = uyeler.reduce((sum, u) => sum + u.setCount, 0);
                    const liste = uyeler
                        .map(u => `🔸 **${u.name}** • ${loncaAdi} • **${u.setCount} Set**`)
                        .join("\n");
                    logEmbeds.push(
                        applyFooter(
                            new EmbedBuilder()
                                .setTitle(`${emoji} ${loncaAdi} — Toplam: ${toplamKatilim} Katılım`)
                                .setDescription(liste.substring(0, 4000))
                        )
                    );
                }

                await sendEmbedsWithRateLimit(
                    (opts) => interaction.editReply(opts),
                    (opts) => interaction.followUp(opts),
                    logEmbeds
                );
            }

            // --- /genelsonuc ---
            if (interaction.commandName === "genelsonuc") {
                await interaction.deferReply();
                const pages = buildGenelsonucPages(stats);
                if (pages.length === 0) return interaction.editReply("❌ Henüz hiç veri yok.");

                let current = 0;
                const msg = await interaction.editReply({
                    embeds: [pages[current]],
                    components: pages.length > 1 ? [buildPageButtons(current, pages.length)] : []
                });

                if (pages.length <= 1) return;

                const collector = msg.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60000
                });

                collector.on("collect", async (btn) => {
                    try {
                        if (btn.customId === "page_prev" && current > 0) current--;
                        if (btn.customId === "page_next" && current < pages.length - 1) current++;
                        await btn.update({
                            embeds: [pages[current]],
                            components: [buildPageButtons(current, pages.length)]
                        });
                    } catch (e) {
                        console.error("❌ Buton hatası:", e.message);
                    }
                });

                collector.on("end", async () => {
                    try {
                        await msg.edit({ components: [] });
                    } catch {}
                });
            }

            // --- /loncasonuc ---
            if (interaction.commandName === "loncasonuc") {
                const select = new StringSelectMenuBuilder()
                    .setCustomId("lonca_sec")
                    .setPlaceholder("🔍 Lonca seçiniz...")
                    .addOptions(
                        Object.keys(LONCA_ROLLERI).map(name => ({
                            label: `${LONCA_EMOJILERI[name] || "🔹"} ${name}`,
                            value: name
                        }))
                    );
                return interaction.reply({
                    content: "**🔍 Lonca Seçimi**",
                    components: [new ActionRowBuilder().addComponents(select)],
                    ephemeral: true
                });
            }

            // --- /istatistik ---
            if (interaction.commandName === "istatistik") {
                await interaction.deferReply();
                const targetUser = interaction.options.getUser("uye");
                const data = stats[targetUser.id];
                if (!data) return interaction.editReply("❌ Bu üyeye ait veri bulunamadı.");
                const emoji = LONCA_EMOJILERI[data.guildName] || "🔹";
                const embed = new EmbedBuilder()
                    .setTitle("👤 Üye İstatistiği")
                    .addFields(
                        { name: "🏷️ Kullanıcı", value: data.displayName, inline: true },
                        { name: `${emoji} Lonca`, value: data.guildName, inline: true },
                        { name: "🏆 Toplam Set", value: `**${data.setCount} Set**`, inline: true }
                    );
                return interaction.editReply({ embeds: [applyFooter(embed)] });
            }

            // --- /setekle ---
            if (interaction.commandName === "setekle") {
                if (!hasYetki(member)) return interaction.reply({ content: "🚫 Bu komutu kullanma yetkiniz yok.", ephemeral: true });
                await interaction.deferReply();
                const targetUser = interaction.options.getUser("uye");
                const amount = interaction.options.getInteger("miktar");
                const m = await interaction.guild.members.fetch(targetUser.id);
                let lonca = "Bilinmiyor";
                for (const [name, id] of Object.entries(LONCA_ROLLERI)) {
                    if (m.roles.cache.has(id)) { lonca = name; break; }
                }
                stats[targetUser.id] = {
                    displayName: m.displayName,
                    guildName: lonca,
                    setCount: (stats[targetUser.id]?.setCount || 0) + amount
                };
                saveStats(stats);
                const emoji = LONCA_EMOJILERI[lonca] || "🔹";
                return interaction.editReply(`✅ **${m.displayName}** kullanıcısına **${amount}** set eklendi. ${emoji} Toplam: **${stats[targetUser.id].setCount} Set**`);
            }

            // --- /setsil ---
            if (interaction.commandName === "setsil") {
                if (!hasYetki(member)) return interaction.reply({ content: "🚫 Bu komutu kullanma yetkiniz yok.", ephemeral: true });
                await interaction.deferReply();
                const targetUser = interaction.options.getUser("uye");
                const amount = interaction.options.getInteger("miktar");
                const m = await interaction.guild.members.fetch(targetUser.id);
                if (!stats[targetUser.id]) return interaction.editReply("❌ Bu üyeye ait veri bulunamadı.");
                stats[targetUser.id].setCount = Math.max(0, stats[targetUser.id].setCount - amount);
                saveStats(stats);
                return interaction.editReply(`🗑️ **${m.displayName}** kullanıcısından **${amount}** set silindi. Kalan: **${stats[targetUser.id].setCount} Set**`);
            }

            // --- /logsıfırla ---
            if (interaction.commandName === "logsıfırla") {
                if (!hasYetki(member)) return interaction.reply({ content: "🚫 Bu komutu kullanma yetkiniz yok.", ephemeral: true });
                saveStats({});
                return interaction.reply("🗑️ **Tüm veriler başarıyla sıfırlandı!** Artık kayıt temiz.");
            }
        }

        // ==================== SELECT MENU ====================

        if (interaction.isStringSelectMenu() && interaction.customId === "lonca_sec") {
            await interaction.deferUpdate();
            const stats = loadStats();
            const selected = interaction.values[0];
            const emoji = LONCA_EMOJILERI[selected] || "🔹";
            const uyeler = Object.values(stats)
                .filter(u => u.guildName === selected)
                .sort((a, b) => b.setCount - a.setCount);

            if (uyeler.length === 0) {
                return interaction.editReply({ content: "❌ Bu loncaya ait veri yok.", components: [] });
            }

            const toplamKatilim = uyeler.reduce((sum, u) => sum + u.setCount, 0);
            const liste = uyeler
                .map(u => `🔸 **${u.displayName}** • ${u.guildName} • **${u.setCount} Set**`)
                .join("\n")
                .substring(0, 4000);

            const embed = applyFooter(
                new EmbedBuilder()
                    .setTitle(`${emoji} ${selected} — Toplam: ${toplamKatilim} Katılım`)
                    .setDescription(liste)
            );
            return interaction.editReply({ embeds: [embed], components: [] });
        }

    } catch (err) {
        console.error("❌ Komut hatası:", err);
        try {
            const msg = "⚠️ Bir hata oluştu, lütfen tekrar deneyin.";
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(msg);
            } else {
                await interaction.reply({ content: msg, ephemeral: true });
            }
        } catch {}
    }
});

client.login(TOKEN);
