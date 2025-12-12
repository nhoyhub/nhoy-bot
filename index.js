// bot.js
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// --- CONFIGURATION ---
const BOT_TOKEN = "7586151294:AAE56w1KsB01qmfebOY4jccne2VI11ueMqM";
const BOT_2_TOKEN = "7836377853:AAHvTlYlqK-TbvbwVRzvG5oPotaFdNntn3A"; // Admin Bot

// Admin Chat IDs
const BOT_2_ADMIN_CHAT_ID = "1732455712";

// Link to Backend
const BACKEND_API_URL = "http://127.0.0.1:5000/api/v1/save_order";

// Payment Link
const ABA_PAY_LINK = "https://pay.ababank.com/oRF8/2ug5pzi4";

// --- ASSET URLs ---
const START_PHOTO_URL = "https://i.pinimg.com/736x/fa/af/0a/faaf0a3dbfeff4591b189d7b5016ae04.jpg";
const PAYMENT_PHOTO_URL = "https://i.pinimg.com/1200x/44/4b/af/444baf1fba6fcf56f53d3740162d2e61.jpg";
const QR_PHOTO_10_URL = "https://i.pinimg.com/736x/c2/c5/03/c2c50300cc357884d7819e57e4e9d860.jpg";
const SUCCESS_PHOTO_URL = "https://i.pinimg.com/originals/23/50/8e/23508e8b1e8dea194d9e06ae507e4afc.gif";
const REJECTED_PHOTO_URL = "https://i.pinimg.com/originals/a5/75/0b/a5750babcf0f417f30e0b4773b29e376.gif";

// --- IN-MEMORY DATA ---
const userData = {}; // Map: userId -> { udid, payment_option }
const pendingApprovals = {}; // Map: userId -> { username, udid, payment_option, timestamp }
const completedOrders = {}; // Map: userId -> { username, udid, payment_option, completion_time }

// --- INITIALIZE BOTS ---
const bot1 = new Telegraf(BOT_TOKEN);
const bot2 = new Telegraf(BOT_2_TOKEN);

// --- HELPER FUNCTIONS ---

// Escape MarkdownV2 characters
const escapeMarkdown = (text) => {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
};

const validateUdid = (udid) => {
    if (!udid) return false;
    const regex = /^[a-fA-F0-9-]{20,50}$/;
    return regex.test(udid);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendAlertAfter30s = async (userId) => {
    await sleep(30000);
    // Placeholder for future logic
    console.log(`⏰ 30s timer finished for user ${userId}`);
};

// Send request to Admin via Bot 2
const sendToBot2ForApproval = async (userId, username, udid, paymentOption) => {
    const currentTime = new Date().toLocaleString();

    const messageText = 
        `🔍 សំណើរស្នើសុំការអនុម័ត\n\n` +
        `👤 អ្នកប្រើប្រាស់: ${username}\n` +
        `🆔 លេខសំគាល់: ${userId}\n` +
        `📱 UDID: ${udid}\n` +
        `💳 តម្លៃបង់ប្រាក់: ${paymentOption}\n` +
        `⏰ ពេលវេលា: ${currentTime}\n\n` +
        `សូមពិនិត្យនិងសម្រេចចិត្ត:`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ អនុម័ត', `approve_${userId}`),
            Markup.button.callback('❌ បដិសេធ', `reject_${userId}`)
        ],
        [
            Markup.button.callback('📋 ចម្លង UDID', `copyudid_${userId}`)
        ]
    ]);

    try {
        await bot2.telegram.sendMessage(BOT_2_ADMIN_CHAT_ID, messageText, keyboard);
        return true;
    } catch (e) {
        console.error(`Error sending to Bot 2: ${e.message}`);
        return false;
    }
};

// Handle approval/rejection logic
const sendResponseToUser = async (userId, approved) => {
    let userInfo = pendingApprovals[userId];

    // Fallback if memory cleared
    if (!userInfo && completedOrders[userId]) {
        userInfo = completedOrders[userId];
    }

    if (approved && userInfo) {
        const username = userInfo.username || 'Unknown';
        const udid = userInfo.udid || 'N/A';
        const paymentOption = userInfo.payment_option || '0';
        const displayName = username.startsWith('@') ? username.replace('@', '') : username;
        
        // --- SAVE TO BACKEND ---
        const payloadDb = {
            user_id: userId,
            username: username,
            udid: udid,
            payment_option: paymentOption,
            completion_time: new Date().toISOString()
        };

        console.log(`🔄 Sending data to Backend for User ${userId}...`);

        try {
            const response = await axios.post(BACKEND_API_URL, payloadDb, {
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.status === 200) {
                console.log(`✅ Data saved to Web Backend for ${userId}`);
            } else {
                console.error(`❌ Failed to save to DB. Status: ${response.status}`);
            }
        } catch (e) {
            console.error(`❌ Connection error to Backend: ${e.message}`);
        }

        // Save to local cache
        completedOrders[userId] = {
            username: username,
            udid: udid,
            payment_option: paymentOption,
            completion_time: new Date().toLocaleString()
        };

        const caption = 
            `🎉 *អរគុណ ${escapeMarkdown(displayName)}\\!* ✅\n\n` +
            `ការបញ្ជាទិញបានបញ្ចប់ហើយ\\. 🎊\n\n` +
            `📱 UDID: \`${escapeMarkdown(udid)}\`\n` +
            `💰 តម្លៃ: \`$${paymentOption}\`\n` +
            `⏳ កំពុងដំណេីរការ\n\n` +
            `🔄 ទិញថ្មី​​ សូមចុច​​​​ /start \n` +
            `📋 ពិនិត្យការទិញបានបញ្ចប់ /details`;

        // Send Success Photo via Bot 1
        try {
            await bot1.telegram.sendPhoto(userId, SUCCESS_PHOTO_URL, {
                caption: caption,
                parse_mode: 'MarkdownV2'
            });
            // Trigger 30s alert
            sendAlertAfter30s(userId);
        } catch (e) {
            console.error(`Failed to send success msg: ${e.message}`);
            return false;
        }

    } else {
        // Rejected
        const caption = 
            "❌ *សំណើរមិនត្រូវបានអនុម័ត*\n\n" +
            "សូមព្យាយាមម្តងទៀតឬទាក់ទងផ្នែកជំនួយ\\.\n" +
            "ទិញម្តងទៀត /start  \\.";
            
        try {
            await bot1.telegram.sendPhoto(userId, REJECTED_PHOTO_URL, {
                caption: caption,
                parse_mode: 'MarkdownV2'
            });
        } catch (e) {
            console.error(`Failed to send reject msg: ${e.message}`);
            return false;
        }
    }
    return true;
};

// --- BOT 1 HANDLERS (USER) ---

bot1.command('start', async (ctx) => {
    const user = ctx.from;
    const userId = user.id;

    // Reset session
    delete userData[userId];

    const HELP_URL = "https://t.me/Irra_Esign/3";
    const caption = 
        `🎉 *ស្វាគមន៍ ${escapeMarkdown(user.first_name)}\\!* 🎉\n\n` +
        "📋 *របៀបចាប់ផ្តើម:*\n\n" +
        "1️⃣ ចុចប៊ូតុងខាងក្រោមដើម្បីទាញយក UDID profile\\.\n" +
        "2️⃣ ដំឡើងវានៅលើឧបករណ៍របស់អ្នក\\.\n" +
        "3️⃣ ចម្លង UDID របស់អ្នកនិងផ្ញើមកខ្ញុំ\\.\n\n" +
        `💡 [${escapeMarkdown('របៀប​ Download UDID profile?')}](${escapeMarkdown(HELP_URL)}) `;

    const keyboard = Markup.inlineKeyboard([
        Markup.button.url('📱 ទាញយក UDID Profile', 'https://udid.tech/download-profile')
    ]);

    await ctx.replyWithPhoto(START_PHOTO_URL, {
        caption: caption,
        parse_mode: 'MarkdownV2',
        ...keyboard
    });
});

bot1.command('details', async (ctx) => {
    const userId = ctx.from.id;
    if (!completedOrders[userId]) {
        return ctx.reply("❌ *រកមិនឃើញព័ត៌មានការបញ្ជាទិញ*\nសូមបញ្ជាទិញជាមុនសិន /start", { parse_mode: 'MarkdownV2' });
    }

    const info = completedOrders[userId];
    const text = 
        `📋 *ព័ត៌មានការបញ្ជាទិញ*\n\n` +
        `📱 UDID: \`${escapeMarkdown(info.udid)}\`\n` +
        `💳 Price: \`$${info.payment_option}\`\n` +
        `⏰ Date: \`${escapeMarkdown(info.completion_time)}\``;
    
    await ctx.reply(text, { parse_mode: 'MarkdownV2' });
});

// Handle Payment Selection Callback
bot1.action(/^payment_/, async (ctx) => {
    const userId = ctx.from.id;
    await ctx.answerCbQuery();

    if (!userData[userId]) {
        return ctx.editMessageText("❌ Session expired. សូមចុច /start ម្តងទៀត។");
    }

    const paymentOption = ctx.match.input.split('_')[1]; // Extracts '10' from 'payment_10'
    userData[userId].payment_option = paymentOption;

    const caption = 
        `💳 *Esign Premium \\- $${paymentOption}*\n` +
        `📱 *UDID:* \`${escapeMarkdown(userData[userId].udid)}\`\n\n` +
        `1️⃣ Scan QR code ឬចុចប៊ូតុង Pay Now\n` +
        `2️⃣ ថតរូបភាពបង់ប្រាក់ \\(Screenshot\\)\n` +
        `3️⃣ ផ្ញើរូបភាពចូលក្នុង Chat នេះ\\.`;

    const keyboard = Markup.inlineKeyboard([
        Markup.button.url('Pay Now', ABA_PAY_LINK)
    ]);

    // Edit previous caption
    try {
        await ctx.editMessageCaption("✅ កំពុងដំណើរការ...", { reply_markup: undefined });
    } catch (e) { /* ignore */ }

    // Send new QR photo
    await ctx.replyWithPhoto(QR_PHOTO_10_URL, {
        caption: caption,
        parse_mode: 'MarkdownV2',
        ...keyboard
    });
});

// Handle Photo (Screenshot)
bot1.on('photo', async (ctx) => {
    const user = ctx.from;
    const userId = user.id;

    if (!userData[userId] || !userData[userId].payment_option) {
        return ctx.reply("❌ សូមចុច /start ដើម្បីចាប់ផ្តើម។");
    }

    if (pendingApprovals[userId]) {
        return ctx.reply("⏳ សំណើររបស់អ្នកកំពុងត្រូវបានត្រួតពិនិត្យ។");
    }

    const username = user.username ? `@${user.username}` : user.first_name;

    pendingApprovals[userId] = {
        username: username,
        udid: userData[userId].udid,
        payment_option: userData[userId].payment_option,
        timestamp: new Date()
    };

    await ctx.reply("🔄 បានទទួលរូបភាព។ សូមរង់ចាំ Admin ត្រួតពិនិត្យ...");

    // Send to Admin Bot
    await sendToBot2ForApproval(userId, username, userData[userId].udid, userData[userId].payment_option);
});

// Handle Text Input (UDID)
bot1.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    // Ignore commands
    if (text.startsWith('/')) return;

    const userId = ctx.from.id;

    if (!validateUdid(text)) {
        return ctx.reply("❌ *ទម្រង់ UDID មិនត្រឹមត្រូវ*\nUDID ត្រូវតែមានលេខនិងអក្សរប្រវែង 20-50 តួ។", { parse_mode: 'MarkdownV2' });
    }

    userData[userId] = { udid: text };
    
    const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('🟢 Esign Premium - 10$', 'payment_10')
    ]);

    const caption = `✅ <b>បានទទួល UDID:</b> <code>${text}</code>\n\n👇 <b>ជ្រេីសរេីសតម្លៃ:</b>`;
    
    await ctx.replyWithPhoto(PAYMENT_PHOTO_URL, {
        caption: caption,
        parse_mode: 'HTML',
        ...keyboard
    });
});

// --- BOT 2 HANDLERS (ADMIN) ---

bot2.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    const [action, userIdStr] = data.split('_');
    const userId = parseInt(userIdStr);

    if (action === 'copyudid') {
        const userInfo = pendingApprovals[userId];
        if (userInfo) {
            return ctx.reply(`\`${userInfo.udid}\``, { parse_mode: 'MarkdownV2' });
        } else {
            return ctx.reply("រកមិនឃើញទិន្នន័យ។");
        }
    }

    if (!pendingApprovals[userId]) {
        return ctx.editMessageText("❌ សំណើរនេះត្រូវបានដំណើរការរួចហើយ។");
    }

    const approved = (action === 'approve');

    // Notify User & Save
    await sendResponseToUser(userId, approved);

    const status = approved ? "✅ បានអនុម័ត" : "❌ បានបដិសេធ";
    
    // Update Admin Message
    // Note: Telegraf doesn't give easy access to original text in caption edits sometimes,
    // so we just append status
    try {
        await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\nស្ថានភាព: ${status}`, { reply_markup: undefined });
    } catch (e) {
        // If message content is same or text issue
        await ctx.editMessageReplyMarkup(undefined);
        await ctx.reply(`User ${userId}: ${status}`);
    }

    // Cleanup
    delete pendingApprovals[userId];
    if (approved && userData[userId]) delete userData[userId];
});

// --- MAIN EXECUTION ---

const launchBots = async () => {
    console.log("🚀 Starting Bots...");
    console.log(`🔗 Connected to Backend: ${BACKEND_API_URL}`);

    // Enable graceful stop
    const stopBots = (signal) => {
        bot1.stop(signal);
        bot2.stop(signal);
    };
    process.once('SIGINT', () => stopBots('SIGINT'));
    process.once('SIGTERM', () => stopBots('SIGTERM'));

    await Promise.all([
        bot1.launch(),
        bot2.launch()
    ]);
    console.log("✅ Both Bots are running!");
};

launchBots().catch(err => console.error(err));