import { Telegraf, Markup } from 'telegraf';

// --- CONSTANTS ---
const ABA_PAY_LINK = "https://pay.ababank.com/oRF8/2ug5pzi4";
const START_PHOTO = "https://i.pinimg.com/736x/fa/af/0a/faaf0a3dbfeff4591b189d7b5016ae04.jpg";
const PAYMENT_PHOTO = "https://i.pinimg.com/1200x/44/4b/af/444baf1fba6fcf56f53d3740162d2e61.jpg";
const QR_PHOTO = "https://i.pinimg.com/736x/c2/c5/03/c2c50300cc357884d7819e57e4e9d860.jpg";
const SUCCESS_PHOTO = "https://i.pinimg.com/originals/23/50/8e/23508e8b1e8dea194d9e06ae507e4afc.gif";
const REJECT_PHOTO = "https://i.pinimg.com/originals/a5/75/0b/a5750babcf0f417f30e0b4773b29e376.gif";

// --- KV STORAGE WRAPPER ---
const db = {
    async get(env, key) {
        if (!env.SHOP_SESSION) return null;
        const val = await env.SHOP_SESSION.get(key);
        return val ? JSON.parse(val) : null;
    },
    async set(env, key, val) {
        if (!env.SHOP_SESSION) return;
        await env.SHOP_SESSION.put(key, JSON.stringify(val));
    },
    async del(env, key) {
        if (!env.SHOP_SESSION) return;
        await env.SHOP_SESSION.delete(key);
    }
};

// --- WORKER ENTRY POINT ---
export default {
    async fetch(request, env) {
        const bot1 = new Telegraf(env.BOT_TOKEN);
        const bot2 = new Telegraf(env.BOT_2_TOKEN);
        const url = new URL(request.url);

        // --- BOT 1 LOGIC (USER) ---
        bot1.command('start', async (ctx) => {
            const userId = ctx.from.id;
            await db.del(env, `user:${userId}`);

            const caption = "🎉 *ស្វាគមន៍!*\n1️⃣ Download UDID Profile\n2️⃣ Send UDID here";
            await ctx.replyWithPhoto(START_PHOTO, {
                caption,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([Markup.button.url('📱 Download Profile', 'https://udid.tech/download-profile')])
            });
        });

        bot1.on('text', async (ctx) => {
            const text = ctx.message.text.trim();
            if (text.startsWith('/')) return;

            if (!/^[a-fA-F0-9-]{20,50}$/.test(text)) {
                return ctx.reply("❌ Invalid UDID format.");
            }

            await db.set(env, `user:${ctx.from.id}`, { udid: text });

            await ctx.replyWithPhoto(PAYMENT_PHOTO, {
                caption: `✅ UDID: \`${text}\`\n👇 Select Price:`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([Markup.button.callback('🟢 10$ - Premium', 'pay_10')])
            });
        });

        bot1.action('pay_10', async (ctx) => {
            const userId = ctx.from.id;
            const data = await db.get(env, `user:${userId}`);

            if (!data) return ctx.reply("❌ Session expired. /start again.");

            data.payment = "10";
            await db.set(env, `user:${userId}`, data);

            await ctx.replyWithPhoto(QR_PHOTO, {
                caption: `💳 *Price: $10*\n📱 UDID: \`${data.udid}\`\n\nSend Screenshot here after pay.`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([Markup.button.url('Pay Now', ABA_PAY_LINK)])
            });
        });

        bot1.on('photo', async (ctx) => {
            const userId = ctx.from.id;
            const data = await db.get(env, `user:${userId}`);
            if (!data || !data.payment) return ctx.reply("❌ Please start over /start");

            const username = ctx.from.username || ctx.from.first_name;

            const approvalData = {
                id: userId,
                username,
                udid: data.udid,
                price: data.payment,
                time: new Date().toISOString()
            };
            await db.set(env, `pending:${userId}`, approvalData);

            await ctx.reply("⏳ Checking payment...");

            const adminMsg =
                `🔍 *New Request*\n` +
                `👤 User: ${username} (ID: ${userId})\n` +
                `📱 UDID: \`${data.udid}\`\n` +
                `💰 Price: $${data.payment}`;

            const adminKeyboard = {
                inline_keyboard: [
                    [{ text: "✅ Approve", callback_data: `ok_${userId}` }, { text: "❌ Reject", callback_data: `no_${userId}` }],
                    [{ text: "📋 Copy UDID", callback_data: `cp_${userId}` }]
                ]
            };

            try {
                const res = await fetch(`https://api.telegram.org/bot${env.BOT_2_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: env.ADMIN_CHAT_ID,
                        text: adminMsg,
                        parse_mode: 'Markdown',
                        reply_markup: adminKeyboard
                    })
                });
                const json = await res.json();
                console.log('Admin message response:', json);

                if (!json.ok) {
                    await ctx.reply("❌ Cannot notify admin. Please check ADMIN_CHAT_ID and Bot 2 permissions.");
                }
            } catch (err) {
                console.log("Error sending to admin:", err);
                await ctx.reply("❌ Failed to notify admin.");
            }
        });

        // --- BOT 2 LOGIC (ADMIN) ---
        bot2.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            const [action, userId] = data.split('_');

            const pending = await db.get(env, `pending:${userId}`);
            if (!pending) return ctx.editMessageText("❌ Data expired or already processed.");

            if (action === 'cp') {
                return ctx.reply(`\`${pending.udid}\``, { parse_mode: 'MarkdownV2' });
            }

            if (action === 'ok') {
                try {
                    await fetch(env.BACKEND_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: pending.id,
                            username: pending.username,
                            udid: pending.udid,
                            payment_option: pending.price,
                            completion_time: new Date().toISOString()
                        })
                    });
                } catch (e) { console.log("Backend Save Error", e); }

                await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: pending.id,
                        photo: SUCCESS_PHOTO,
                        caption: `✅ *Approved!*\n\nUDID: \`${pending.udid}\`\nWait for processing...`,
                        parse_mode: 'Markdown'
                    })
                });

                await ctx.editMessageText(`✅ Approved for ${pending.username}`);
            } else {
                await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: pending.id, photo: REJECT_PHOTO, caption: "❌ Request Rejected." })
                });
                await ctx.editMessageText(`❌ Rejected ${pending.username}`);
            }

            await db.del(env, `pending:${userId}`);
            await db.del(env, `user:${userId}`);
        });

        // --- ROUTING ---
        if (url.pathname === `/bot1`) {
            await bot1.handleUpdate(await request.json());
            return new Response('Ok');
        } else if (url.pathname === `/bot2`) {
            await bot2.handleUpdate(await request.json());
            return new Response('Ok');
        }

        return new Response('Bot Worker Running. Set Webhooks to /bot1 and /bot2');
    }
};
