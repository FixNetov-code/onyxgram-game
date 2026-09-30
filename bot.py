"""
Бот OnyxGram для запуска Crash («Ракета») с полноценной админ-панелью.
"""
import asyncio
import logging
import os
from aiogram import Bot, Dispatcher, html, F
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton, InlineKeyboardMarkup, Message, CallbackQuery, WebAppInfo,
    LabeledPrice, PreCheckoutQuery, SuccessfulPayment
)
from dotenv import load_dotenv

import database
from server import engine
from slots_engine import slots_engine
from mines_engine import mines_engine

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN") or "600000000238:ElbKsHCeVkesOyuRjhfxpHwSMCmLe_zLUxarovUs_n0"
ADMIN_IDS = {2127001, 289802, 968937}
raw_owner = os.getenv("OWNER_ID", "")
for x in raw_owner.split(","):
    x = x.strip()
    if x.isdigit():
        ADMIN_IDS.add(int(x))
OWNER_ID = list(ADMIN_IDS)[0]
API_BASE = os.getenv("API_BASE") or "https://dev-angel-7553.dev"
WEBAPP_URL = os.getenv("WEBAPP_URL") or "https://onyxgram-game-1.onrender.com"

log = logging.getLogger("bot")
dp = Dispatcher()

def is_owner(user_id: int) -> bool:
    return user_id in ADMIN_IDS

def play_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎰 ИГРАТЬ В КАЗИНО (CRASH, СЛОТЫ, МИНЁР)",
                    web_app=WebAppInfo(url=WEBAPP_URL)
                )
            ],
            [
                InlineKeyboardButton(text="🎁 Каталог подарков", callback_data="show_gifts"),
                InlineKeyboardButton(text="ℹ️ Правила игры", callback_data="show_rules")
            ]
        ]
    )

def admin_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="💥 ВЗОРВАТЬ ПРЯМО СЕЙЧАС (КРАШ)", callback_data="adm_instant_boom")
            ],
            [
                InlineKeyboardButton(text="💀 СУПЕР 5% RTP (ВСЕ ИГРЫ)", callback_data="adm_rtp_5"),
                InlineKeyboardButton(text="🪤 КАПКАН 20%", callback_data="adm_rtp_20")
            ],
            [
                InlineKeyboardButton(text="⚡ Жесткий 50%", callback_data="adm_rtp_50"),
                InlineKeyboardButton(text="Честный 96%", callback_data="adm_rtp_96"),
                InlineKeyboardButton(text="🎉 Буст 130%", callback_data="adm_rtp_130")
            ],
            [
                InlineKeyboardButton(text="🎰 Слоты: Выбить 777 🔥", callback_data="adm_slots_777"),
                InlineKeyboardButton(text="🍒 Слоты: Выигрыш", callback_data="adm_slots_win")
            ],
            [
                InlineKeyboardButton(text="💀 Слоты: Слив", callback_data="adm_slots_loss"),
                InlineKeyboardButton(text="💣 Минёр: Взорвать всех 💥", callback_data="adm_mines_boom_all")
            ],
            [
                InlineKeyboardButton(text="🎯 Краш: 1.10x (Слив)", callback_data="adm_crash_1.10"),
                InlineKeyboardButton(text="🚀 Краш: 20.0x", callback_data="adm_crash_20.0")
            ],
            [
                InlineKeyboardButton(text="🤖 Переключить ботов", callback_data="adm_toggle_bots"),
                InlineKeyboardButton(text="📊 Полная статистика", callback_data="adm_stats")
            ]
        ]
    )

@dp.message(Command("start"))
async def cmd_start(message: Message):
    user_id = message.from_user.id
    username = message.from_user.username or message.from_user.first_name or "Игрок"

    # Обработка реферального приглашения (/start ref_12345)
    parts = (message.text or "").split()
    if len(parts) > 1 and parts[1].startswith("ref_"):
        try:
            referrer_id = int(parts[1].replace("ref_", ""))
            if referrer_id != user_id:
                await database.register_referral(referrer_id, user_id)
        except Exception:
            pass

    user = await database.get_or_create_user(user_id, username)

    admin_note = "\n\n👑 <i>Вам доступна админ-панель: /admin</i>" if is_owner(user_id) else ""

    text = (
        f"👋 Привет, {html.bold(username)}!\n\n"
        f"Добро пожаловать в <b>OnyxGram Casino</b>! 🎰🚀\n\n"
        f"💰 Твой баланс: <b>{user['balance']} ⭐</b>\n\n"
        f"🎮 <b>Доступные игры в лобби:</b>\n"
        f"1. 🚀 <b>Crash («Ракета»)</b> — забирай до взрыва ракеты!\n"
        f"2. 🎰 <b>Слоты 777</b> — крути барабаны и срывай Джекпот 100x!\n\n"
        f"⭐ <b>Баланс один для всех игр</b>, пополнение через инвойс Stars, а вывод реальными подарками OnyxGram прямо в профиль!{admin_note}"
    )
    await message.answer(text, reply_markup=play_keyboard(), parse_mode=ParseMode.HTML)

@dp.message(Command("balance"))
async def cmd_balance(message: Message):
    user = await database.get_or_create_user(message.from_user.id)
    await message.answer(f"💰 Ваш баланс: <b>{user['balance']} ⭐</b>", parse_mode=ParseMode.HTML)

# --- АДМИН-КОМАНДЫ (только для OWNER_ID) ---

@dp.message(Command("admin"))
async def cmd_admin(message: Message):
    if not is_owner(message.from_user.id):
        return await message.answer("⛔ Доступ запрещён.")
    
    stats = await database.get_casino_stats()
    text = (
        f"👑 <b>Панель управления OnyxGram Casino</b>\n\n"
        f"💰 Общая прибыль казино: <b>{stats['net_profit']} ⭐</b>\n"
        f"📥 Ставки в Crash: <b>{stats['crash_bets']} ⭐</b> (раундов: {stats['rounds_count']})\n"
        f"🎰 Ставки в Слотах: <b>{stats['slots_bets']} ⭐</b> (спинов: {stats['spins_count']})\n"
        f"📤 Выплачено выигрышей: <b>{stats['total_payout']} ⭐</b>\n"
        f"👥 Всего игроков: <b>{stats['users_count']}</b>\n\n"
        f"⚙️ Режим Crash: <b>{engine.rig_mode.upper()}</b> | Боты: <b>{'ВКЛ' if engine.enable_bots else 'ВЫКЛ'}</b>\n"
        f"🎰 Режим Слотов: <b>{slots_engine.rig_mode.upper()}</b> | Принудительно: <b>{slots_engine.forced_next or 'Нет'}</b>"
    )
    await message.answer(text, reply_markup=admin_keyboard(), parse_mode=ParseMode.HTML)

@dp.message(Command("stats"))
async def cmd_stats(message: Message):
    if not is_owner(message.from_user.id):
        return
    await cmd_admin(message)

@dp.message(Command("crash"))
async def cmd_crash(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return await message.answer("Использование: <code>/crash 1.50</code>")
    try:
        val = float(args[1])
        engine.set_forced_crash(val)
        await message.answer(f"🎯 <b>Следующий краш установлен на:</b> {val:.2f}x", parse_mode=ParseMode.HTML)
    except ValueError:
        await message.answer("Ошибка: введите число, например /crash 2.50")

@dp.message(Command("rig"))
async def cmd_rig(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2 or args[1] not in ("normal", "greedy", "boost"):
        return await message.answer("Использование: <code>/rig normal</code> | <code>/rig greedy</code> | <code>/rig boost</code>")
    engine.set_rig_mode(args[1])
    await message.answer(f"⚙️ Режим казино переключен на: <b>{args[1].upper()}</b>", parse_mode=ParseMode.HTML)

@dp.message(Command("bots"))
async def cmd_bots(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return await message.answer("Использование: <code>/bots on</code> | <code>/bots off</code>")
    en = args[1].lower() in ("on", "1", "true")
    engine.set_bots(en)
    await message.answer(f"🤖 Боты: <b>{'ВКЛЮЧЕНЫ' if en else 'ВЫКЛЮЧЕНЫ'}</b>", parse_mode=ParseMode.HTML)

@dp.message(Command("give_me"))
@dp.message(Command("add"))
async def cmd_give_me(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    amt = 500
    if len(args) >= 2:
        try:
            amt = int(args[1])
        except ValueError:
            pass
    new_bal = await database.update_balance(message.from_user.id, amt)
    await message.answer(f"💰 <b>Начислено {amt} ⭐ на ваш баланс!</b>\nТекущий баланс: <b>{new_bal} ⭐</b>", parse_mode=ParseMode.HTML)

@dp.message(Command("give"))
async def cmd_give(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 3:
        return await message.answer("Использование: <code>/give &lt;user_id&gt; &lt;amount&gt;</code>")
    try:
        t_id, amt = int(args[1]), int(args[2])
        new_bal = await database.update_balance(t_id, amt)
        await message.answer(f"✅ Начислено {amt} ⭐ игроку {t_id}. Новый баланс: {new_bal} ⭐")
    except Exception as e:
        await message.answer(f"Ошибка: {e}")

@dp.message(Command("take"))
async def cmd_take(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 3:
        return await message.answer("Использование: <code>/take &lt;user_id&gt; &lt;amount&gt;</code>")
    try:
        t_id, amt = int(args[1]), int(args[2])
        new_bal = await database.update_balance(t_id, -amt)
        await message.answer(f"✅ Списано {amt} ⭐ у игрока {t_id}. Новый баланс: {new_bal} ⭐")
    except Exception as e:
        await message.answer(f"Ошибка: {e}")

# --- CALLBACKS ДЛЯ АДМИН-КНОПОК ---

@dp.message(Command("boom"))
@dp.message(Command("kill"))
async def cmd_boom(message: Message):
    if not is_owner(message.from_user.id):
        return
    res = engine.trigger_instant_crash()
    if res["ok"]:
        await message.answer(f"💥 <b>Ракета моментально взорвана на {res['crash_point']:.2f}x!</b>", parse_mode=ParseMode.HTML)
    else:
        await message.answer(f"⚠️ {res.get('error', 'Ошибка')}")

@dp.message(Command("slots_777"))
async def cmd_slots_777(message: Message):
    if not is_owner(message.from_user.id):
        return
    slots_engine.set_forced_result("777")
    await message.answer("🎰 <b>Следующий спин слотов: ДЖЕКПОТ 777! 🔥</b> (100x)", parse_mode=ParseMode.HTML)

@dp.message(Command("slots_win"))
async def cmd_slots_win(message: Message):
    if not is_owner(message.from_user.id):
        return
    slots_engine.set_forced_result("win")
    await message.answer("🍒 <b>Следующий спин слотов: ГАРАНТИРОВАННЫЙ ВЫИГРЫШ!</b>", parse_mode=ParseMode.HTML)

@dp.message(Command("slots_loss"))
async def cmd_slots_loss(message: Message):
    if not is_owner(message.from_user.id):
        return
    slots_engine.set_forced_result("loss")
    await message.answer("💀 <b>Следующий спин слотов: СЛИВ!</b>", parse_mode=ParseMode.HTML)

def parse_rtp_mode(raw: str) -> str | None:
    raw = raw.lower().strip()
    if raw in ("5", "5%", "super_greedy_5", "super", "super_greedy"):
        return "super_greedy_5"
    if raw in ("20", "20%", "trap_20", "trap"):
        return "trap_20"
    if raw in ("50", "50%", "hard_50", "hard"):
        return "hard_50"
    if raw in ("75", "75%", "80", "80%", "greedy"):
        return "greedy"
    if raw in ("96", "96%", "100", "normal"):
        return "normal"
    if raw in ("120", "125", "130", "130%", "boost"):
        return "boost"
    return None

@dp.message(Command("rtp"))
async def cmd_global_rtp(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return await message.answer(
            "Использование: <code>/rtp 5</code> (супер 5%) | <code>/rtp 20</code> (20%) | <code>/rtp 50</code> (50%) | <code>/rtp 75</code> | <code>/rtp 96</code> | <code>/rtp 130</code>"
        )
    mode = parse_rtp_mode(args[1])
    if not mode:
        return await message.answer("❌ Неизвестный режим. Доступны: 5, 20, 50, 75, 96, 130")
    engine.set_rig_mode(mode)
    slots_engine.set_rig_mode(mode)
    mines_engine.set_rig_mode(mode)
    await message.answer(f"⚡ <b>RTP всех 3-х игр казино переключен на: {mode.upper()}</b>", parse_mode=ParseMode.HTML)

@dp.message(Command("slots_rig"))
async def cmd_slots_rig(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return await message.answer("Использование: <code>/slots_rig 5|20|50|75|96|130</code>")
    mode = parse_rtp_mode(args[1])
    if not mode:
        return await message.answer("❌ Доступны: 5, 20, 50, 75, 96, 130")
    slots_engine.set_rig_mode(mode)
    await message.answer(f"🎰 Режим слотов переключен на: <b>{mode.upper()}</b>", parse_mode=ParseMode.HTML)

@dp.message(Command("crash_rig"))
async def cmd_crash_rig(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return await message.answer("Использование: <code>/crash_rig 5|20|50|75|96|130</code>")
    mode = parse_rtp_mode(args[1])
    if not mode:
        return await message.answer("❌ Доступны: 5, 20, 50, 75, 96, 130")
    engine.set_rig_mode(mode)
    await message.answer(f"🚀 Режим Crash переключен на: <b>{mode.upper()}</b>", parse_mode=ParseMode.HTML)

@dp.message(Command("mines_rig"))
async def cmd_mines_rig(message: Message):
    if not is_owner(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return await message.answer("Использование: <code>/mines_rig 5|20|50|75|96|130</code>")
    mode = parse_rtp_mode(args[1])
    if not mode:
        return await message.answer("❌ Доступны: 5, 20, 50, 75, 96, 130")
    mines_engine.set_rig_mode(mode)
    await message.answer(f"💣 Режим Минёра переключен на: <b>{mode.upper()}</b>", parse_mode=ParseMode.HTML)

@dp.callback_query(F.data.startswith("adm_"))
async def cb_admin(call: CallbackQuery):
    if not is_owner(call.from_user.id):
        return await call.answer("Доступ запрещён", show_alert=True)
    
    act = call.data
    if act == "adm_instant_boom":
        res = engine.trigger_instant_crash()
        if res["ok"]:
            await call.answer(f"💥 Ракета взорвана на {res['crash_point']:.2f}x!", show_alert=True)
        else:
            await call.answer(f"⚠️ {res.get('error')}", show_alert=True)
    elif act == "adm_rtp_5":
        engine.set_rig_mode("super_greedy_5")
        slots_engine.set_rig_mode("super_greedy_5")
        mines_engine.set_rig_mode("super_greedy_5")
        await call.answer("💀 СУПЕР 5% RTP включен для ВСЕХ игр!", show_alert=True)
    elif act == "adm_rtp_20":
        engine.set_rig_mode("trap_20")
        slots_engine.set_rig_mode("trap_20")
        mines_engine.set_rig_mode("trap_20")
        await call.answer("🪤 КАПКАН 20% RTP включен для ВСЕХ игр!", show_alert=True)
    elif act == "adm_rtp_50":
        engine.set_rig_mode("hard_50")
        slots_engine.set_rig_mode("hard_50")
        mines_engine.set_rig_mode("hard_50")
        await call.answer("⚡ ЖЕСТКИЙ 50% RTP включен для ВСЕХ игр!", show_alert=True)
    elif act == "adm_rtp_96":
        engine.set_rig_mode("normal")
        slots_engine.set_rig_mode("normal")
        mines_engine.set_rig_mode("normal")
        await call.answer("Честный 96% RTP включен для ВСЕХ игр!", show_alert=True)
    elif act == "adm_rtp_130":
        engine.set_rig_mode("boost")
        slots_engine.set_rig_mode("boost")
        mines_engine.set_rig_mode("boost")
        await call.answer("🎉 БУСТ 130% включен для ВСЕХ игр!", show_alert=True)
    elif act == "adm_mines_boom_all":
        mines_engine.set_forced_outcome("all", "mine")
        await call.answer("💥 ВСЕ игроки в минёре подорвутся на след. шаге!", show_alert=True)
    elif act == "adm_slots_777":
        slots_engine.set_forced_result("777")
        await call.answer("🎰 След. спин: ДЖЕКПОТ 777! 🔥", show_alert=True)
    elif act == "adm_slots_win":
        slots_engine.set_forced_result("win")
        await call.answer("🍒 След. спин: Выигрыш!", show_alert=True)
    elif act == "adm_slots_loss":
        slots_engine.set_forced_result("loss")
        await call.answer("💀 След. спин: Слив!", show_alert=True)
    elif act == "adm_stats":
        stats = await database.get_casino_stats()
        await call.answer(f"Прибыль: {stats['net_profit']} ⭐ | Краш: {stats['crash_bets']} ⭐ | Слоты: {stats['slots_bets']} ⭐ | Минёр: {stats.get('mines_bets', 0)} ⭐", show_alert=True)
    elif act == "adm_crash_1.10":
        engine.set_forced_crash(1.10)
        await call.answer("След. краш: 1.10x 🎯", show_alert=True)
    elif act == "adm_crash_2.0":
        engine.set_forced_crash(2.00)
        await call.answer("След. краш: 2.00x 🎯", show_alert=True)
    elif act == "adm_crash_20.0":
        engine.set_forced_crash(20.0)
        await call.answer("След. краш: 20.0x 🚀", show_alert=True)
    elif act == "adm_toggle_bots":
        engine.set_bots(not engine.enable_bots)
        status = "ВКЛ" if engine.enable_bots else "ВЫКЛ"
        await call.answer(f"Боты: {status}", show_alert=True)
    elif act == "adm_top_users":
        users = await database.get_all_users()
        top_text = "🏆 Топ игроков:\n" + "\n".join([f"{u['username']}: {u['balance']} ⭐" for u in users[:5]])
        await call.answer(top_text, show_alert=True)

@dp.callback_query(F.data == "show_rules")
async def cb_rules(call: CallbackQuery):
    rules = (
        "📖 <b>Правила Crash («Ракета»):</b>\n\n"
        "1. Раунд начинается с 1.00x и растёт по экспоненте.\n"
        "2. В случайный момент происходит взрыв (краш).\n"
        "3. Нажмите «Забрать», чтобы получить ставку × текущий X.\n"
        "4. Если ракета взорвётся раньше — ставка сгорает."
    )
    await call.message.answer(rules, parse_mode=ParseMode.HTML)

@dp.callback_query(F.data == "show_gifts")
async def cb_gifts(call: CallbackQuery):
    gifts = (
        "🎁 <b>Каталог вывода подарками OnyxGram:</b>\n\n"
        "🧸 Teddy Bear — 15 ⭐\n"
        "🎁 Magic Box — 25 ⭐\n"
        "🚀 Space Rocket — 50 ⭐\n"
        "💎 Diamond — 100 ⭐\n"
        "🏆 Golden Trophy — 200 ⭐\n"
        "🏹 Cupid Charm — 500 ⭐\n\n"
        "<i>Вывод осуществляется моментально внутри Mini App!</i>"
    )
    await call.message.answer(gifts, parse_mode=ParseMode.HTML)

# --- ПРИЁМ ПЛАТЕЖЕЙ TELEGRAM / ONYXGRAM STARS (XTR) ---

@dp.pre_checkout_query()
async def on_pre_checkout(query: PreCheckoutQuery):
    """Подтверждение перед списанием звёзд."""
    await query.answer(ok=True)

@dp.message(F.successful_payment)
async def on_successful_payment(message: Message):
    """Зачисление звёзд на баланс после успешной оплаты."""
    sp: SuccessfulPayment = message.successful_payment
    amount = sp.total_amount  # Для XTR это сразу точное количество звёзд
    user_id = message.from_user.id
    new_bal = await database.update_balance(user_id, amount)
    
    log.info(f"💰 Успешная оплата: {amount} ⭐ от пользователя {user_id}. Новый баланс: {new_bal}")
    
    await message.answer(
        f"✅ <b>Оплата успешно подтверждена!</b>\n\n"
        f"На ваш счёт зачислено: <b>+{amount} ⭐</b>\n"
        f"Текущий баланс: <b>{new_bal} ⭐</b>\n\n"
        f"Удачных полётов в Ракету! 🚀",
        parse_mode=ParseMode.HTML
    )

bot_instance: Bot | None = None

def get_bot() -> Bot:
    global bot_instance
    if bot_instance is None:
        server = TelegramAPIServer.from_base(API_BASE, is_local=False)
        session = AiohttpSession(api=server)
        bot_instance = Bot(token=BOT_TOKEN, session=session, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    return bot_instance

async def run_bot():
    b = get_bot()
    try:
        from aiogram.types import MenuButtonWebApp
        if WEBAPP_URL and not WEBAPP_URL.startswith("http://localhost"):
            await b.set_chat_menu_button(
                menu_button=MenuButtonWebApp(text="🎰 Играть", web_app=WebAppInfo(url=WEBAPP_URL))
            )
            log.info(f"✅ Кнопка меню бота обновлена на: {WEBAPP_URL}")
    except Exception as e:
        log.warning(f"Не удалось обновить кнопку меню: {e}")
    log.info("🤖 OnyxGram Бот запущен в режиме long polling")
    await dp.start_polling(b)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_bot())
