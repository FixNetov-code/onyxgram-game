"""
Веб-сервер на aiohttp: раздача статики, WebSocket для Crash и REST API.
"""
import asyncio
import json
import logging
import os
from aiohttp import web

import database
from engine import CrashGameEngine
from slots_engine import slots_engine
from mines_engine import mines_engine
from upgrade_engine import upgrade_engine
from tower_engine import tower_engine
from chat_engine import chat_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("server")

BASE_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(BASE_DIR, "static")

engine = CrashGameEngine()

async def index_handler(request: web.Request) -> web.Response:
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return web.FileResponse(index_path)
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
            log.warning(f"create_invoice_link unavailable: {err}, fallback to send_invoice")
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
    except Exception as e:
        log.error(f"Invoice creation failed: {e}")
        return web.json_response({"ok": False, "error": f"Ошибка счёта: {e}"})

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

    # Отправляем РЕАЛЬНЫЙ подарок через OnyxGram Bot API sendGift
    from bot import get_bot
    b = get_bot()
    try:
        ok = await b.send_gift(user_id=user_id, gift_id=str(gift_id))
        if not ok:
            return web.json_response({
                "ok": False,
                "error": "OnyxGram отклонил отправку подарка. Проверьте баланс звёзд на аккаунте бота."
            })

        new_bal = await database.update_balance(user_id, -cost)
        log.info(f"🎁 Реальный подарок {gift_name} (ID {gift_id}) за {cost} ⭐ отправлен игроку {user_id}")
        return web.json_response({
            "ok": True,
            "message": f"Подарок '{gift_name}' ({cost} ⭐) успешно отправлен в ваш профиль OnyxGram! 🎁",
            "balance": new_bal
        })
    except Exception as e:
        log.error(f"Ошибка send_gift {gift_id} для юзера {user_id}: {e}")
        return web.json_response({
            "ok": False,
            "error": f"Ошибка отправки подарка: {e}. Убедитесь, что бот держит реальные звёзды для покупки подарка."
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
    return web.json_response({
        "ok": True,
        "mode": mode,
        "rig_mode": engine.rig_mode,
        "slots_rig_mode": slots_engine.rig_mode,
        "mines_rig_mode": mines_engine.rig_mode,
        "upgrade_rig_mode": upgrade_engine.rig_mode,
        "tower_rig_mode": tower_engine.rig_mode
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

async def api_admin_set_balance(request: web.Request) -> web.Response:
    data = await request.json()
    admin_id = int(data.get("admin_id", 0))
    if not is_admin(request, admin_id):
        return web.json_response({"ok": False, "error": "Доступ запрещён"}, status=403)
    
    target_id = int(data.get("target_id", 0))
    amount = int(data.get("amount", 100))
    new_bal = await database.update_balance(target_id, amount)
    return web.json_response({"ok": True, "balance": new_bal})

def create_app() -> web.Application:
    app = web.Application()
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
    # Таблица лидеров (Топ заносов)
    app.router.add_get("/api/leaderboard", api_leaderboard)
    # Живой чат
    app.router.add_get("/api/chat/messages", api_chat_messages)
    app.router.add_post("/api/chat/send", api_chat_send)
    app.router.add_post("/api/admin/chat/toggle", api_admin_chat_toggle)
    # Админка
    app.router.add_get("/api/admin/stats", api_admin_stats)
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
