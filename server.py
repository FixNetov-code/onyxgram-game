"""
Веб-сервер на aiohttp: раздача статики, WebSocket для Crash и REST API.
"""
import asyncio
import json
import logging
import os
import random
from aiohttp import web

import database
from engine import CrashGameEngine
from slots_engine import slots_engine
from mines_engine import mines_engine
from upgrade_engine import upgrade_engine
from tower_engine import tower_engine
from coinflip_engine import coinflip_engine
from plinko_engine import plinko_engine
from dice_engine import dice_engine
from cases_engine import cases_engine
from chat_engine import chat_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("server")

BASE_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(BASE_DIR, "static")

engine = CrashGameEngine()

@web.middleware
async def no_cache_middleware(request: web.Request, handler):
    resp = await handler(request)
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

async def index_handler(request: web.Request) -> web.Response:
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return web.FileResponse(index_path, headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        })
    return web.Response(text="index.html not found", status=404)

async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    await engine.register_client(ws)

    # При подключении сразу отправляем текущее состояние раунда
    await ws.send_str(json.dumps({
        "type": "init",
        "state": engine.state,
        "round_id": engine.round_id,
        "multiplier": engine.current_multiplier,
        "bets": list(engine.bets.values()),
        "history": engine.recent_history[-10:]
    }))

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    action = data.get("action")
                    user_id = data.get("user_id", 1001)
                    username = data.get("username", "Игрок")

                    if action == "bet":
                        amount = int(data.get("amount", 10))
                        auto_cashout = data.get("auto_cashout")
                        res = await engine.place_bet(user_id, username, amount, auto_cashout)
                        await ws.send_str(json.dumps({"type": "bet_response", **res}))

                    elif action == "cashout":
                        res = await engine.cashout(user_id)
                        await ws.send_str(json.dumps({"type": "cashout_response", **res}))

                except Exception as e:
                    log.error(f"WS message error: {e}")
                    await ws.send_str(json.dumps({"type": "error", "message": str(e)}))

            elif msg.type == web.WSMsgType.ERROR:
                log.error(f"WS error: {ws.exception()}")
    finally:
        await engine.unregister_client(ws)

    return ws

async def api_user(request: web.Request) -> web.Response:
    user_id = int(request.query.get("id", 1001))
    username = request.query.get("name", "Игрок")
    user = await database.get_or_create_user(user_id, username)
    return web.json_response(user)

async def api_topup(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    amount = int(data.get("amount", 100))
    new_bal = await database.update_balance(user_id, amount)
    return web.json_response({"ok": True, "balance": new_bal})

async def api_create_invoice(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    amount = int(data.get("amount", 25))
    if amount < 1:
        return web.json_response({"ok": False, "error": "Минимум 1 ⭐"})

    try:
        from bot import get_bot
        from aiogram.types import LabeledPrice
        b = get_bot()
        payload = f"topup:{user_id}:{amount}"

        try:
            link = await b.create_invoice_link(
                title="Пополнение баланса ⭐",
                description=f"Пополнение баланса игры на {amount} Stars",
                payload=payload,
                currency="XTR",
                prices=[LabeledPrice(label=f"{amount} Stars", amount=amount)]
            )
            return web.json_response({"ok": True, "type": "link", "invoice_link": link})
        except Exception as err:
            log.warning(f"create_invoice_link unavailable: {err}, trying send_invoice")
            try:
                await b.send_invoice(
                    chat_id=user_id,
                    title="Пополнение баланса ⭐",
                    description=f"Пополнение баланса игры на {amount} Stars",
                    payload=payload,
                    currency="XTR",
                    prices=[LabeledPrice(label=f"{amount} Stars", amount=amount)]
                )
                return web.json_response({
                    "ok": True,
                    "type": "chat",
                    "message": f"Счёт на {amount} ⭐ отправлен вам в чат с ботом! Оплатите его там."
                })
            except Exception as err2:
                log.warning(f"send_invoice failed: {err2}, performing direct topup fallback")
                new_bal = await database.update_balance(user_id, amount)
                return web.json_response({
                    "ok": True,
                    "type": "direct",
                    "message": f"Пополнение успешно! Начислено +{amount} ⭐",
                    "balance": new_bal
                })
    except Exception as e:
        log.warning(f"Invoice fallback triggered: {e}")
        new_bal = await database.update_balance(user_id, amount)
        return web.json_response({
            "ok": True,
            "type": "direct",
            "message": f"Пополнение успешно! Начислено +{amount} ⭐",
            "balance": new_bal
        })

async def api_withdraw(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    gift_name = data.get("gift", "Подарок")
    cost = int(data.get("cost", 15))
    gift_id = data.get("gift_id")

    if not gift_id:
        return web.json_response({"ok": False, "error": "Не указан ID подарка"})

    user = await database.get_or_create_user(user_id)
    if user["balance"] < cost:
        return web.json_response({
            "ok": False,
            "error": f"Недостаточно звёзд! Нужно {cost} ⭐, у вас {user['balance']} ⭐"
        })

    # Списываем баланс
    new_bal = await database.update_balance(user_id, -cost)

    # Пробуем отправить РЕАЛЬНЫЙ подарок через OnyxGram Bot API sendGift
    sent_real = False
    try:
        from bot import get_bot
        b = get_bot()
        ok = await b.send_gift(user_id=user_id, gift_id=str(gift_id))
        sent_real = bool(ok)
    except Exception as e:
        log.warning(f"send_gift failed: {e}")

    chat_engine.broadcast_win(user["username"], "Вывод подарка", cost, 1.0)

    if sent_real:
        msg = f"Подарок '{gift_name}' ({cost} ⭐) успешно отправлен в ваш профиль OnyxGram! 🎁"
    else:
        msg = f"Вывод '{gift_name}' ({cost} ⭐) успешно оформлен! 🎁"

    log.info(f"🎁 Вывод подарка {gift_name} (ID {gift_id}) за {cost} ⭐ для юзера {user_id}")
    return web.json_response({
        "ok": True,
        "message": msg,
        "balance": new_bal
    })

# --- Админские API эндпоинты ---

ADMIN_IDS = {2127001, 289802, 968937}
raw_owner = os.getenv("OWNER_ID", "")
for x in raw_owner.split(","):
    x = x.strip()
    if x.isdigit():
        ADMIN_IDS.add(int(x))

OWNER_ID = list(ADMIN_IDS)[0]

def is_admin(request: web.Request, user_id: int) -> bool:
    # 1. По ID пользователя (Telegram ID или локальный ID)
    if user_id in ADMIN_IDS:
        return True
    # 2. Прямой доступ с локальной машины (не через туннель Cloudflare)
    headers_lower = {k.lower(): v for k, v in request.headers.items()}
    if "cf-connecting-ip" not in headers_lower and "cf-ray" not in headers_lower:
        if request.remote in ("127.0.0.1", "localhost", "::1"):
            return True
    return False

async def api_admin_stats(request: web.Request) -> web.Response:
    user_id = int(request.query.get("id", 0))
    if not is_admin(request, user_id):
        log.warning(f"Admin stats denied for user_id={user_id}, remote={request.remote}")
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    
    db_stats = await database.get_casino_stats()
    return web.json_response({
        "ok": True,
        **db_stats,
        "rig_mode": engine.rig_mode,
        "slots_rig_mode": slots_engine.rig_mode,
        "slots_forced_next": slots_engine.forced_next,
        "mines_rig_mode": mines_engine.rig_mode,
        "upgrade_rig_mode": upgrade_engine.rig_mode,
        "upgrade_forced_next": upgrade_engine.forced_next,
        "tower_rig_mode": tower_engine.rig_mode,
        "tower_forced_next": tower_engine.forced_next,
        "coinflip_rig_mode": coinflip_engine.rig_mode,
        "coinflip_forced_next": coinflip_engine.forced_next,
        "plinko_rig_mode": plinko_engine.rig_mode,
        "plinko_forced_slot": plinko_engine.forced_slot,
        "dice_rig_mode": dice_engine.rig_mode,
        "dice_forced_next": dice_engine.forced_next,
        "cases_rig_mode": cases_engine.rig_mode,
        "cases_forced_item_id": cases_engine.forced_item_id,
        "chat_bots_enabled": chat_engine.enable_bot_chat,
        "active_mines_count": len(mines_engine.active_games),
        "enable_bots": engine.enable_bots,
        "next_forced_crash": engine.next_forced_crash,
        "online_clients": len(engine.clients)
    })

async def api_slots_spin(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    bet = int(data.get("bet", 10))
    if bet < 1:
        return web.json_response({"ok": False, "error": "Минимальная ставка 1 ⭐"})

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < bet:
        return web.json_response({"ok": False, "error": "Недостаточно звёзд на балансе!"})

    # Списываем ставку
    bal_after_bet = await database.update_balance(user_id, -bet)

    # Крутим барабаны слотов
    res = slots_engine.spin(bet)
    win = res["win"]
    final_bal = bal_after_bet

    if win > 0:
        final_bal = await database.update_balance(user_id, win)
        if win >= 30:
            chat_engine.broadcast_win(user["username"], "Слоты 777", win, res["multiplier"])

    # Записываем в базу данных
    await database.record_slot_spin(
        user_id=user_id,
        bet=bet,
        payout=win,
        multiplier=res["multiplier"],
        symbols=res["symbols"]
    )

    return web.json_response({
        "ok": True,
        "symbols": res["symbols"],
        "multiplier": res["multiplier"],
        "win": win,
        "is_win": res["is_win"],
        "is_jackpot": res["is_jackpot"],
        "combo_title": res["combo_title"],
        "balance": final_bal
    })

async def api_admin_slots_force(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    force_type = data.get("force")  # "777", "win", "loss", or None
    slots_engine.set_forced_result(force_type)
    return web.json_response({"ok": True, "forced_next": slots_engine.forced_next})

async def api_admin_slots_rig(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    mode = data.get("mode", "normal")
    slots_engine.set_rig_mode(mode)
    return web.json_response({"ok": True, "slots_rig_mode": slots_engine.rig_mode})

# --- ИГРА МИНЁР (MINES 5x5) ---

async def api_mines_start(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id") or data.get("user_id") or 1001)
    bet = int(data.get("bet", 10))
    mines_count = int(data.get("mines") or data.get("mines_count") or 3)

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < bet:
        return web.json_response({"ok": False, "error": "Недостаточно звёзд на балансе!"})

    res = mines_engine.start_game(user_id, user["username"], bet, mines_count)
    if not res.get("ok"):
        return web.json_response(res)

    new_bal = await database.update_balance(user_id, -bet)
    res["balance"] = new_bal
    return web.json_response(res)

async def api_mines_reveal(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id") or data.get("user_id") or 1001)
    tile = int(data.get("tile") if data.get("tile") is not None else (data.get("tile_index") or 0))

    res = mines_engine.reveal_tile(user_id, tile)
    if not res.get("ok"):
        return web.json_response(res)

    status = res.get("status")
    if status == "exploded":
        await database.record_mines_game(
            user_id=user_id,
            bet=res["bet"],
            mines_count=len(res["all_mines"]),
            steps_cleared=res["steps_cleared"],
            multiplier=0.0,
            payout=0,
            status="exploded"
        )
        user = await database.get_or_create_user(user_id)
        res["balance"] = user["balance"]
    elif status == "all_cleared":
        win = res["win"]
        new_bal = await database.update_balance(user_id, win)
        await database.record_mines_game(
            user_id=user_id,
            bet=int(win / res["multiplier"]),
            mines_count=len(res["all_mines"]),
            steps_cleared=res["steps_cleared"],
            multiplier=res["multiplier"],
            payout=win,
            status="cashed_out"
        )
        res["balance"] = new_bal
    return web.json_response(res)

async def api_mines_cashout(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id") or data.get("user_id") or 1001)

    res = mines_engine.cashout(user_id)
    if not res.get("ok"):
        return web.json_response(res)

    win = res["win"]
    new_bal = await database.update_balance(user_id, win)
    if win >= 30:
        chat_engine.broadcast_win(res["username"], "Минёр", win, res["multiplier"])
    await database.record_mines_game(
        user_id=user_id,
        bet=res["bet"],
        mines_count=len(res["all_mines"]),
        steps_cleared=res["steps_cleared"],
        multiplier=res["multiplier"],
        payout=win,
        status="cashed_out"
    )
    res["balance"] = new_bal
    return web.json_response(res)

# --- АДМИН МОНИТОРИНГ И КОНТРОЛЬ МИНЁРА ---

async def api_admin_mines_live(request: web.Request) -> web.Response:
    """Возвращает всех игроков в минёре прямо сейчас в реальном времени."""
    user_id = int(request.query.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    active_players = mines_engine.get_active_games_list()
    return web.json_response({
        "ok": True,
        "active_count": len(active_players),
        "players": active_players
    })

async def api_admin_mines_rig(request: web.Request) -> web.Response:
    """Админское вмешательство в ход минёра: подложить мину или алмаз."""
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    target_uid = data.get("target_user_id", "all")
    if target_uid != "all":
        try:
            target_uid = int(target_uid)
        except (ValueError, TypeError):
            target_uid = "all"
    outcome = data.get("outcome")  # "mine", "gem", or None
    mines_engine.set_forced_outcome(target_uid, outcome)
    return web.json_response({"ok": True, "target": target_uid, "outcome": outcome})

async def api_admin_mines_mode(request: web.Request) -> web.Response:
    """Изменение RTP минёра."""
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    mode = data.get("mode", "normal")
    mines_engine.set_rig_mode(mode)
    return web.json_response({"ok": True, "mines_rig_mode": mines_engine.rig_mode})

# --- ИГРА КОНТРАКТЫ ОБМЕНА (UPGRADE / CRAFT) ---

async def api_upgrade_play(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id") or data.get("user_id") or 1001)
    bet = int(data.get("bet", 10))
    target_mult = float(data.get("multiplier", 2.0))

    if bet < 1:
        return web.json_response({"ok": False, "error": "Минимальная ставка 1 ⭐"})

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < bet:
        return web.json_response({"ok": False, "error": "Недостаточно звёзд на балансе!"})

    bal_after = await database.update_balance(user_id, -bet)

    res = upgrade_engine.upgrade(bet, target_mult)
    if not res.get("ok"):
        await database.update_balance(user_id, bet)
        return web.json_response(res)

    win = res["win"]
    final_bal = bal_after
    if win > 0:
        final_bal = await database.update_balance(user_id, win)
        if win >= 30:
            chat_engine.broadcast_win(user["username"], "Апгрейд", win, target_mult)

    await database.record_upgrade_game(
        user_id=user_id,
        bet=bet,
        target_multiplier=res["target_multiplier"],
        payout=win,
        chance=res["chance"],
        roll=res["roll_angle"],
        status="win" if res["is_win"] else "loss"
    )

    res["balance"] = final_bal
    return web.json_response(res)

async def api_admin_upgrade_force(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    force = data.get("force")
    upgrade_engine.set_forced_result(force)
    return web.json_response({"ok": True, "forced_next": upgrade_engine.forced_next})

async def api_admin_upgrade_rig(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    mode = data.get("mode", "normal")
    upgrade_engine.set_rig_mode(mode)
    return web.json_response({"ok": True, "upgrade_rig_mode": upgrade_engine.rig_mode})

# --- ТАБЛИЦА ЛИДЕРОВ (ТОП ЗАНОСОВ) ---

async def api_leaderboard(request: web.Request) -> web.Response:
    period = request.query.get("period", "day")
    leaders = await database.get_leaderboard(period, exclude_owner_ids=tuple(ADMIN_IDS))
    return web.json_response({"ok": True, "period": period, "leaderboard": leaders})

# --- ЖИВОЙ ЧАТ ИГРОКОВ ---

async def api_chat_messages(request: web.Request) -> web.Response:
    msgs = chat_engine.get_messages(50)
    return web.json_response({"ok": True, "messages": msgs})

async def api_chat_send(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id") or data.get("user_id") or 1001)
    text = str(data.get("text", "")).strip()
    if not text:
        return web.json_response({"ok": False, "error": "Сообщение не может быть пустым"})

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Вы заблокированы в чате"}, status=403)

    is_owner = (user_id in ADMIN_IDS)
    badge = "owner" if is_owner else None
    avatar = "👑" if is_owner else None
    msg = chat_engine.add_message(user_id, user["username"], text, badge=badge, avatar=avatar)
    return web.json_response({"ok": True, "message": msg})

async def api_admin_chat_toggle(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    enabled = bool(data.get("enabled", True))
    chat_engine.enable_bot_chat = enabled
    return web.json_response({"ok": True, "enable_bot_chat": chat_engine.enable_bot_chat})

async def api_admin_global_rtp(request: web.Request) -> web.Response:
    """Глобальное переключение RTP сразу для ВСЕХ игр казино."""
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    mode = data.get("mode", "normal")
    engine.set_rig_mode(mode)
    slots_engine.set_rig_mode(mode)
    mines_engine.set_rig_mode(mode)
    upgrade_engine.set_rig_mode(mode)
    tower_engine.set_rig_mode(mode)
    coinflip_engine.set_rig_mode(mode)
    plinko_engine.rig_mode = mode
    dice_engine.rig_mode = mode
    cases_engine.rig_mode = mode
    return web.json_response({
        "ok": True,
        "mode": mode,
        "rig_mode": engine.rig_mode,
        "slots_rig_mode": slots_engine.rig_mode,
        "mines_rig_mode": mines_engine.rig_mode,
        "upgrade_rig_mode": upgrade_engine.rig_mode,
        "tower_rig_mode": tower_engine.rig_mode,
        "coinflip_rig_mode": coinflip_engine.rig_mode,
        "plinko_rig_mode": plinko_engine.rig_mode,
        "dice_rig_mode": dice_engine.rig_mode,
        "cases_rig_mode": cases_engine.rig_mode
    })

# --- ИГРА TOWER («БАШНЯ» / СТУПЕНИ) ---

async def api_tower_start(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id") or data.get("user_id") or 1001)
    bet = int(data.get("bet", 10))
    difficulty = str(data.get("difficulty", "medium"))

    if bet < 1:
        return web.json_response({"ok": False, "error": "Минимальная ставка 1 ⭐"})

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < bet:
        return web.json_response({"ok": False, "error": "Недостаточно звёзд на балансе!"})

    bal_after = await database.update_balance(user_id, -bet)

    res = tower_engine.start_game(user_id, bet, difficulty)
    if not res.get("ok"):
        await database.update_balance(user_id, bet)
        return web.json_response(res)

    res["balance"] = bal_after
    return web.json_response(res)

async def api_tower_step(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id") or data.get("user_id") or 1001)
    tile_index = int(data.get("tile_index", 0))

    user = await database.get_or_create_user(user_id)
    game_before = tower_engine.get_game(user_id)
    if not game_before:
        return web.json_response({"ok": False, "error": "Нет активной игры в Tower"})

    bet = game_before["bet"]
    difficulty = game_before["difficulty"]

    res = tower_engine.step(user_id, tile_index)
    if not res.get("ok"):
        return web.json_response(res)

    final_bal = user["balance"]

    if res.get("status") == "lost":
        await database.record_tower_game(
            user_id=user_id,
            bet=bet,
            difficulty=difficulty,
            floors_cleared=res["floor"] - 1,
            multiplier=0.0,
            payout=0,
            status="lost"
        )
        res["balance"] = final_bal
    elif res.get("status") == "won":
        win = res["win"]
        final_bal = await database.update_balance(user_id, win)
        await database.record_tower_game(
            user_id=user_id,
            bet=bet,
            difficulty=difficulty,
            floors_cleared=res["floor"],
            multiplier=res["current_multiplier"],
            payout=win,
            status="won"
        )
        if win >= 30:
            chat_engine.broadcast_win(user["username"], "Башня", win, res["current_multiplier"])
        res["balance"] = final_bal
    else:
        res["balance"] = final_bal

    return web.json_response(res)

async def api_tower_cashout(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id") or data.get("user_id") or 1001)

    user = await database.get_or_create_user(user_id)
    game_before = tower_engine.get_game(user_id)
    if not game_before:
        return web.json_response({"ok": False, "error": "Нет активной игры в Tower"})

    bet = game_before["bet"]
    difficulty = game_before["difficulty"]

    res = tower_engine.cashout(user_id)
    if not res.get("ok"):
        return web.json_response(res)

    win = res["win"]
    final_bal = await database.update_balance(user_id, win)
    await database.record_tower_game(
        user_id=user_id,
        bet=bet,
        difficulty=difficulty,
        floors_cleared=res["floor"],
        multiplier=res["multiplier"],
        payout=win,
        status="cashed_out"
    )

    if win >= 30:
        chat_engine.broadcast_win(user["username"], "Башня", win, res["multiplier"])

    res["balance"] = final_bal
    return web.json_response(res)

async def api_admin_tower_rig(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    mode = data.get("mode", "normal")
    tower_engine.set_rig_mode(mode)
    return web.json_response({"ok": True, "tower_rig_mode": tower_engine.rig_mode})

async def api_admin_tower_force(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    force = data.get("force")  # "safe" | "trap" | None
    tower_engine.set_forced_result(force)
    return web.json_response({"ok": True, "forced_next": tower_engine.forced_next})

async def api_admin_instant_crash(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    res = engine.trigger_instant_crash()
    return web.json_response(res)

async def api_admin_force_crash(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    
    crash_val = float(data.get("crash", 1.50))
    engine.set_forced_crash(crash_val)
    return web.json_response({"ok": True, "message": f"Следующий краш установлен на {crash_val:.2f}x"})

async def api_admin_rig_mode(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    
    mode = data.get("mode", "normal")
    engine.set_rig_mode(mode)
    return web.json_response({"ok": True, "rig_mode": engine.rig_mode})

async def api_admin_toggle_bots(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    
    enabled = bool(data.get("enabled", True))
    engine.set_bots(enabled)
    return web.json_response({"ok": True, "enable_bots": engine.enable_bots})

async def api_admin_users_list(request: web.Request) -> web.Response:
    user_id = int(request.query.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    search = request.query.get("search", "")
    users = await database.get_all_users(search)
    return web.json_response({"ok": True, "users": users})

async def api_admin_user_ban(request: web.Request) -> web.Response:
    data = await request.json()
    admin_id = int(data.get("admin_id") or data.get("id") or 0)
    if not is_admin(request, admin_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    
    target_id = int(data.get("target_id", 0))
    ban = bool(data.get("ban", True))
    if target_id in ADMIN_IDS:
        return web.json_response({"ok": False, "error": "Нельзя забанить администратора!"})
    
    await database.admin_ban_user(target_id, ban)
    return web.json_response({"ok": True, "target_id": target_id, "is_banned": ban})

async def api_admin_set_balance(request: web.Request) -> web.Response:
    data = await request.json()
    admin_id = int(data.get("admin_id") or data.get("id") or 0)
    if not is_admin(request, admin_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    
    target_id = int(data.get("target_id", 0))
    if "balance" in data:
        exact_bal = max(0, int(data["balance"]))
        await database.admin_set_balance(target_id, exact_bal)
        return web.json_response({"ok": True, "balance": exact_bal})
    else:
        amount = int(data.get("amount", 100))
        new_bal = await database.update_balance(target_id, amount)
        return web.json_response({"ok": True, "balance": new_bal})

# --- Coinflip API ---
async def api_coinflip_play(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    bet = int(data.get("bet", 10))
    choice = str(data.get("choice", "heads")).lower()

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)

    is_new = user_id not in coinflip_engine.active_games
    if is_new:
        if bet < 1:
            return web.json_response({"ok": False, "error": "Минимальная ставка 1 ⭐"})
        if user["balance"] < bet:
            return web.json_response({"ok": False, "error": "Недостаточно звёзд на балансе!"})
        await database.update_balance(user_id, -bet)

    res = coinflip_engine.play(user_id, bet, choice)
    if not res["ok"]:
        if is_new:
            await database.update_balance(user_id, bet)
        return web.json_response(res)

    is_win = res["win"]
    streak = res["streak"]
    multiplier = res["multiplier"]
    payout = res["payout"]
    outcome = res["outcome"]

    if not is_win:
        await database.record_coinflip_game(
            user_id=user_id, bet=bet, choice=choice, outcome=outcome,
            multiplier=0.0, payout=0, streak=streak, status="loss"
        )
    
    u = await database.get_or_create_user(user_id)
    return web.json_response({
        **res,
        "balance": u["balance"]
    })

async def api_coinflip_cashout(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))

    res = coinflip_engine.cashout(user_id)
    if not res["ok"]:
        return web.json_response(res)

    payout = res["payout"]
    bet = res["bet"]
    multiplier = res["multiplier"]
    streak = res["streak"]

    new_bal = await database.update_balance(user_id, payout)
    await database.record_coinflip_game(
        user_id=user_id, bet=bet, choice="cashout", outcome="cashout",
        multiplier=multiplier, payout=payout, streak=streak, status="cashout"
    )

    user = await database.get_or_create_user(user_id)
    if payout >= 30:
        chat_engine.broadcast_win(user["username"], f"Монетка ({streak}x комбо)", payout, multiplier)

    return web.json_response({
        "ok": True,
        "payout": payout,
        "multiplier": multiplier,
        "streak": streak,
        "balance": new_bal
    })

async def api_admin_coinflip_rig(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    mode = data.get("mode", "normal")
    coinflip_engine.rig_mode = mode
    return web.json_response({"ok": True, "coinflip_rig_mode": coinflip_engine.rig_mode})

async def api_admin_coinflip_force(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    outcome = data.get("outcome")
    coinflip_engine.forced_next = outcome
    return web.json_response({"ok": True, "coinflip_forced_next": coinflip_engine.forced_next})

# --- Plinko API ---
async def api_plinko_drop(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    bet = int(data.get("bet", 10))
    risk = str(data.get("risk", "medium")).lower()

    if bet < 1:
        return web.json_response({"ok": False, "error": "Минимальная ставка 1 ⭐"})

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < bet:
        return web.json_response({"ok": False, "error": "Недостаточно звёзд на балансе!"})

    await database.update_balance(user_id, -bet)

    res = plinko_engine.drop_ball(bet, risk)
    payout = res["payout"]
    multiplier = res["multiplier"]
    slot_index = res["slot_index"]

    final_bal = await database.update_balance(user_id, payout)
    await database.record_plinko_game(
        user_id=user_id, bet=bet, risk=risk, rows=res["rows"],
        slot_index=slot_index, multiplier=multiplier, payout=payout
    )

    if payout >= 30:
        chat_engine.broadcast_win(user["username"], f"Плинко ({risk.upper()})", payout, multiplier)

    return web.json_response({
        **res,
        "balance": final_bal
    })

async def api_admin_plinko_rig(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    mode = data.get("mode", "normal")
    plinko_engine.rig_mode = mode
    return web.json_response({"ok": True, "plinko_rig_mode": plinko_engine.rig_mode})

async def api_admin_plinko_force(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    slot = int(data.get("slot", 0))
    plinko_engine.forced_slot = slot
    return web.json_response({"ok": True, "plinko_forced_slot": plinko_engine.forced_slot})

# --- Promocode API ---
async def api_promo_activate(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    code = str(data.get("code", ""))

    res = await database.activate_promocode(code, user_id)
    return web.json_response(res)

async def api_admin_promo_create(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    code = str(data.get("code", ""))
    reward = int(data.get("reward", 50))
    max_act = int(data.get("max_activations", 10))

    res = await database.create_promocode(code, reward, max_act)
    return web.json_response(res)

async def api_admin_promo_list(request: web.Request) -> web.Response:
    user_id = int(request.query.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    promos = await database.list_promocodes()
    return web.json_response({"ok": True, "promos": promos})

async def api_admin_promo_delete(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)

    code = str(data.get("code", ""))
    await database.delete_promocode(code)
    return web.json_response({"ok": True})

# --- РЕФЕРАЛЬНАЯ СИСТЕМА (REFERRALS) ---
async def api_referrals(request: web.Request) -> web.Response:
    user_id = int(request.query.get("id", 1001))
    info = await database.get_referral_info(user_id)
    return web.json_response({"ok": True, **info})

async def api_referral_register(request: web.Request) -> web.Response:
    data = await request.json()
    referred_id = int(data.get("id", 1001))
    referrer_id = int(data.get("referrer_id", 0))
    if referrer_id and referrer_id != referred_id:
        success = await database.register_referral(referrer_id, referred_id)
        return web.json_response({"ok": success})
    return web.json_response({"ok": False})

# --- ИГРА КОСТИ (DICE 1-100) ---
async def api_dice_roll(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    bet = int(data.get("bet", 10))
    target = float(data.get("target", 50.0))
    condition = str(data.get("condition", "under"))

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < bet:
        return web.json_response({"ok": False, "error": "Недостаточно звёзд на балансе!"})

    bal_after = await database.update_balance(user_id, -bet)

    res = dice_engine.roll(bet, target, condition)
    if not res.get("ok"):
        await database.update_balance(user_id, bet)
        return web.json_response(res)

    payout = res["payout"]
    final_bal = bal_after
    if payout > 0:
        final_bal = await database.update_balance(user_id, payout)
        if payout >= 25:
            chat_engine.broadcast_win(user["username"], "Кости 🎲", payout, res["multiplier"])

    await database.record_dice_game(
        user_id=user_id,
        bet=bet,
        target=target,
        condition=condition,
        roll=res["roll"],
        multiplier=res["multiplier"],
        payout=payout,
        status="win" if res["win"] else "loss"
    )
    res["balance"] = final_bal
    return web.json_response(res)

async def api_admin_dice_rig(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    dice_engine.rig_mode = data.get("mode", "normal")
    return web.json_response({"ok": True, "dice_rig_mode": dice_engine.rig_mode})

async def api_admin_dice_force(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    dice_engine.forced_next = data.get("outcome")
    return web.json_response({"ok": True, "dice_forced_next": dice_engine.forced_next})

# --- ИГРА КЕЙСЫ (CASES / ЛУТБОКСЫ) ---
async def api_cases_catalog(request: web.Request) -> web.Response:
    return web.json_response({"ok": True, "cases": cases_engine.get_cases_catalog()})

async def api_cases_open(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    case_id = str(data.get("case_id", "novice"))

    cases_cat = cases_engine.get_cases_catalog()
    case_cfg = cases_cat.get(case_id)
    if not case_cfg:
        return web.json_response({"ok": False, "error": "Кейс не существует"})

    cost = case_cfg["cost"]
    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < cost:
        return web.json_response({"ok": False, "error": f"Недостаточно звёзд! Нужно {cost} ⭐"})

    bal_after = await database.update_balance(user_id, -cost)
    res = cases_engine.open_case(case_id)
    if not res.get("ok"):
        await database.update_balance(user_id, cost)
        return web.json_response(res)

    won_item = res["won_item"]
    reward_amt = won_item["amount"]
    final_bal = bal_after
    if reward_amt > 0:
        final_bal = await database.update_balance(user_id, reward_amt)
        mult = round(reward_amt / cost, 2)
        if reward_amt >= cost * 1.5:
            chat_engine.broadcast_win(user["username"], f"Кейс {case_cfg['name']} 📦", reward_amt, mult)

    await database.record_case_opening(
        user_id=user_id,
        case_id=case_id,
        cost=cost,
        reward_type="stars",
        reward_title=won_item["name"],
        reward_amount=reward_amt
    )

    res["balance"] = final_bal
    return web.json_response(res)

async def api_admin_cases_rig(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    cases_engine.rig_mode = data.get("mode", "normal")
    return web.json_response({"ok": True, "cases_rig_mode": cases_engine.rig_mode})

async def api_admin_cases_force(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 0))
    if not is_admin(request, user_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    cases_engine.forced_item_id = data.get("item_id")
    return web.json_response({"ok": True, "cases_forced_item_id": cases_engine.forced_item_id})

# --- PvP ДУЭЛИ (PvP COINFLIP 1v1) ---
async def api_pvp_list(request: web.Request) -> web.Response:
    duels = await database.list_open_pvp_duels()
    return web.json_response({"ok": True, "duels": duels})

async def api_pvp_create(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    bet = int(data.get("bet", 10))
    choice = str(data.get("choice", "heads")).lower()
    if choice not in ("heads", "tails"):
        choice = "heads"
    if bet < 1:
        return web.json_response({"ok": False, "error": "Минимум 1 ⭐"})

    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < bet:
        return web.json_response({"ok": False, "error": "Недостаточно звёзд на балансе!"})

    bal = await database.update_balance(user_id, -bet)
    duel_id = await database.create_pvp_duel(user_id, user["username"], bet, choice)
    return web.json_response({"ok": True, "duel_id": duel_id, "balance": bal})

async def api_pvp_cancel(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    duel_id = int(data.get("duel_id", 0))
    
    duel = await database.get_pvp_duel(duel_id)
    if not duel or duel["creator_id"] != user_id or duel["status"] != "open":
        return web.json_response({"ok": False, "error": "Дуэль нельзя отменить"})

    success = await database.cancel_pvp_duel(duel_id, user_id)
    if success:
        new_bal = await database.update_balance(user_id, duel["bet"])
        return web.json_response({"ok": True, "balance": new_bal})
    return web.json_response({"ok": False, "error": "Не удалось отменить"})

async def api_pvp_join(request: web.Request) -> web.Response:
    data = await request.json()
    user_id = int(data.get("id", 1001))
    duel_id = int(data.get("duel_id", 0))

    duel = await database.get_pvp_duel(duel_id)
    if not duel or duel["status"] != "open":
        return web.json_response({"ok": False, "error": "Дуэль уже завершена или отменена"})
    if duel["creator_id"] == user_id:
        return web.json_response({"ok": False, "error": "Нельзя играть с самим собой!"})

    bet = duel["bet"]
    user = await database.get_or_create_user(user_id)
    if user.get("is_banned"):
        return web.json_response({"ok": False, "error": "Аккаунт заблокирован"}, status=403)
    if user["balance"] < bet:
        return web.json_response({"ok": False, "error": "Недостаточно звёзд для дуэли!"})

    bal_after = await database.update_balance(user_id, -bet)

    outcome = "heads" if random.random() < 0.5 else "tails"
    creator_wins = (outcome == duel["choice"])
    winner_id = duel["creator_id"] if creator_wins else user_id
    winner_name = duel["creator_name"] if creator_wins else user["username"]

    total_pot = bet * 2
    commission = int(total_pot * 0.05)
    prize = total_pot - commission

    await database.join_pvp_duel(duel_id, user_id, user["username"], winner_id, outcome)
    new_bal_winner = await database.update_balance(winner_id, prize)

    chat_engine.broadcast_win(winner_name, "PvP Дуэль ⚔️", prize, round(prize / bet, 2))

    return web.json_response({
        "ok": True,
        "duel_id": duel_id,
        "outcome": outcome,
        "winner_id": winner_id,
        "winner_name": winner_name,
        "prize": prize,
        "commission": commission,
        "balance": new_bal_winner if winner_id == user_id else bal_after
    })

def create_app() -> web.Application:
    app = web.Application(middlewares=[no_cache_middleware])
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/api/user", api_user)
    app.router.add_post("/api/topup", api_topup)
    app.router.add_post("/api/create_invoice", api_create_invoice)
    app.router.add_post("/api/withdraw", api_withdraw)
    # Слоты 777
    app.router.add_post("/api/slots/spin", api_slots_spin)
    # Минёр
    app.router.add_post("/api/mines/start", api_mines_start)
    app.router.add_post("/api/mines/reveal", api_mines_reveal)
    app.router.add_post("/api/mines/cashout", api_mines_cashout)
    # Апгрейд (Upgrade / Craft)
    app.router.add_post("/api/upgrade/play", api_upgrade_play)
    app.router.add_post("/api/admin/upgrade/force", api_admin_upgrade_force)
    app.router.add_post("/api/admin/upgrade/rig", api_admin_upgrade_rig)
    # Башня (Tower / Ступени)
    app.router.add_post("/api/tower/start", api_tower_start)
    app.router.add_post("/api/tower/step", api_tower_step)
    app.router.add_post("/api/tower/cashout", api_tower_cashout)
    app.router.add_post("/api/admin/tower/rig", api_admin_tower_rig)
    app.router.add_post("/api/admin/tower/force", api_admin_tower_force)
    # Монетка (Coinflip)
    app.router.add_post("/api/coinflip/play", api_coinflip_play)
    app.router.add_post("/api/coinflip/cashout", api_coinflip_cashout)
    app.router.add_post("/api/admin/coinflip/rig", api_admin_coinflip_rig)
    app.router.add_post("/api/admin/coinflip/force", api_admin_coinflip_force)
    # Плинко (Plinko)
    app.router.add_post("/api/plinko/drop", api_plinko_drop)
    app.router.add_post("/api/admin/plinko/rig", api_admin_plinko_rig)
    app.router.add_post("/api/admin/plinko/force", api_admin_plinko_force)
    # Кости (Dice 1-100)
    app.router.add_post("/api/dice/roll", api_dice_roll)
    app.router.add_post("/api/admin/dice/rig", api_admin_dice_rig)
    app.router.add_post("/api/admin/dice/force", api_admin_dice_force)
    # Кейсы (Cases)
    app.router.add_get("/api/cases/list", api_cases_catalog)
    app.router.add_post("/api/cases/open", api_cases_open)
    app.router.add_post("/api/admin/cases/rig", api_admin_cases_rig)
    app.router.add_post("/api/admin/cases/force", api_admin_cases_force)
    # PvP Дуэли
    app.router.add_get("/api/pvp/list", api_pvp_list)
    app.router.add_post("/api/pvp/create", api_pvp_create)
    app.router.add_post("/api/pvp/cancel", api_pvp_cancel)
    app.router.add_post("/api/pvp/join", api_pvp_join)
    # Рефералы
    app.router.add_get("/api/referrals", api_referrals)
    app.router.add_post("/api/referrals/register", api_referral_register)
    # Промокоды
    app.router.add_post("/api/promo/activate", api_promo_activate)
    app.router.add_post("/api/admin/promo/create", api_admin_promo_create)
    app.router.add_get("/api/admin/promo/list", api_admin_promo_list)
    app.router.add_post("/api/admin/promo/delete", api_admin_promo_delete)
    # Таблица лидеров (Топ заносов)
    app.router.add_get("/api/leaderboard", api_leaderboard)
    # Живой чат
    app.router.add_get("/api/chat/messages", api_chat_messages)
    app.router.add_post("/api/chat/send", api_chat_send)
    app.router.add_post("/api/admin/chat/toggle", api_admin_chat_toggle)
    # Админка
    app.router.add_get("/api/admin/stats", api_admin_stats)
    app.router.add_get("/api/admin/users/list", api_admin_users_list)
    app.router.add_post("/api/admin/users/ban", api_admin_user_ban)
    app.router.add_post("/api/admin/instant_crash", api_admin_instant_crash)
    app.router.add_post("/api/admin/force_crash", api_admin_force_crash)
    app.router.add_post("/api/admin/rig_mode", api_admin_rig_mode)
    app.router.add_post("/api/admin/toggle_bots", api_admin_toggle_bots)
    app.router.add_post("/api/admin/set_balance", api_admin_set_balance)
    app.router.add_post("/api/admin/slots_force", api_admin_slots_force)
    app.router.add_post("/api/admin/slots_rig", api_admin_slots_rig)
    app.router.add_get("/api/admin/mines/live", api_admin_mines_live)
    app.router.add_post("/api/admin/mines/rig", api_admin_mines_rig)
    app.router.add_post("/api/admin/mines/mode", api_admin_mines_mode)
    app.router.add_post("/api/admin/global_rtp", api_admin_global_rtp)
    app.router.add_static("/static/", STATIC_DIR)
    return app

async def start_server():
    await database.init_db()
    await engine.start()
    chat_engine.start()
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8080)
    await site.start()
    log.info("🚀 Crash сервер запущен на http://localhost:8080")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(start_server())
    try:
        loop.run_forever()
    except KeyboardInterrupt:
        pass
