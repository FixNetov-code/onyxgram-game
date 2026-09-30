"""
Игровой движок Crash («Ракета») в реальном времени.
Управляет фазами игры, расчётом коэффициентов, сокетами и симуляцией игроков.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import random
import time
from typing import Dict, Any, List

import database

log = logging.getLogger("crash_engine")

STATE_WAITING = "WAITING"   # Обратный отсчёт до взлёта (5 сек)
STATE_FLYING = "FLYING"     # Ракета летит, множитель растёт
STATE_CRASHED = "CRASHED"   # Взрыв, показ итогов (3 сек)

# Имена ботов для создания эффекта живой многопользовательской игры
BOT_NAMES = [
    "💎 ton_whale", "🚀 crypto_kid", "⚡ onyx_pro", "👑 star_king",
    "🎯 sniper_99", "🦊 lucky_fox", "🔥 fire_hand", "🌙 moon_rider",
    "🎲 risk_master", "🤖 cyber_sam", "🌟 star_lord", "⚡ flash_ton"
]

import os

ENABLE_BOTS = os.getenv("ENABLE_BOTS", "true").lower() in ("true", "1", "yes")

def generate_crash_point() -> float:
    """
    Генерация точки краша с House Edge ~4%.
    В 4% случаев краш моментальный (1.00x - 1.05x).
    В остальных случаях экспоненциальное распределение.
    """
    r = random.random()
    if r < 0.04:
        return round(random.uniform(1.00, 1.05), 2)
    
    # E = 1 / (1 - r) * 0.96
    # Ограничиваем разумным потолком 100.00x
    raw = (1.0 / (1.0 - r)) * 0.96
    crash = min(100.0, max(1.01, raw))
    return round(crash, 2)


class CrashGameEngine:
    def __init__(self):
        self.state = STATE_WAITING
        self.round_id = 1
        self.current_multiplier = 1.00
        self.target_crash_point = 2.00
        self.state_start_time = time.time()
        self.waiting_duration = 5.0  # сек
        self.crashed_duration = 3.0  # сек
        
        # Админ-параметры
        self.next_forced_crash: float | None = None
        self.rig_mode: str = "normal"  # "normal" (96%), "greedy" (80%), "boost" (120%)
        self.enable_bots: bool = ENABLE_BOTS

        # Активные ставки в текущем раунде
        self.bets: Dict[int, Dict[str, Any]] = {}
        self.recent_history: List[float] = [1.45, 2.10, 1.15, 8.40, 1.80, 3.20, 1.05]
        
        # Подключенные WebSocket клиенты: ws -> user_id
        self.clients = set()
        self.running = False
        self._task = None

    def calculate_crash_point(self) -> float:
        """Расчёт точки краша с учётом админ-подкрутки и режимов."""
        if self.next_forced_crash is not None:
            val = self.next_forced_crash
            self.next_forced_crash = None
            log.info(f"⚡ Сработал принудительный краш: {val}x")
            return max(1.01, round(val, 2))

        r = random.random()

        if self.rig_mode == "super_greedy_5":  # Супер-супер жадный (RTP ~5%) 💀
            # В 95% случаев моментальный взрыв 1.00x - 1.03x
            if r < 0.95:
                return round(random.uniform(1.00, 1.03), 2)
            raw = (1.0 / (1.0 - r)) * 0.05
            return round(min(1.20, max(1.01, raw)), 2)

        elif self.rig_mode == "trap_20":  # Капкан / Экстремальный слив (RTP ~20%)
            # В 70% случаев моментальный слив 1.00x - 1.08x
            if r < 0.70:
                return round(random.uniform(1.00, 1.08), 2)
            raw = (1.0 / (1.0 - r)) * 0.20
            return round(min(1.50, max(1.01, raw)), 2)

        elif self.rig_mode == "hard_50":  # Жесткий слив (RTP ~50%)
            # В 40% случаев моментальный краш 1.00x - 1.12x
            if r < 0.40:
                return round(random.uniform(1.00, 1.12), 2)
            raw = (1.0 / (1.0 - r)) * 0.50
            return round(min(4.00, max(1.01, raw)), 2)

        elif self.rig_mode == "greedy":  # Жадный режим (RTP ~75-80%)
            if r < 0.15:
                return round(random.uniform(1.00, 1.10), 2)
            raw = (1.0 / (1.0 - r)) * 0.80
            return round(min(50.0, max(1.01, raw)), 2)

        elif self.rig_mode == "boost":  # Праздничный режим (RTP ~125%)
            if r < 0.01:
                return 1.05
            raw = (1.0 / (1.0 - r)) * 1.25
            return round(min(150.0, max(1.02, raw)), 2)

        else:  # Обычный режим (RTP ~96%)
            if r < 0.04:
                return round(random.uniform(1.00, 1.05), 2)
            raw = (1.0 / (1.0 - r)) * 0.96
            return round(min(100.0, max(1.01, raw)), 2)

    def set_forced_crash(self, value: float):
        self.next_forced_crash = value

    def set_rig_mode(self, mode: str):
        if mode in ("normal", "greedy", "hard_50", "trap_20", "super_greedy_5", "boost"):
            self.rig_mode = mode
            log.info(f"🚀 Crash: установлен режим RTP {mode}")

    def set_bots(self, enabled: bool):
        self.enable_bots = enabled

    def trigger_instant_crash(self) -> dict:
        """Моментальный взрыв ракеты прямо в текущем полёте!"""
        if self.state != STATE_FLYING:
            return {"ok": False, "error": "Ракета не в полёте прямо сейчас"}
        
        self.target_crash_point = self.current_multiplier
        self.state = STATE_CRASHED
        self.state_start_time = time.time()
        self.recent_history.append(self.target_crash_point)
        if len(self.recent_history) > 30:
            self.recent_history.pop(0)

        # Сохраняем в БД
        total_bets = sum(b["amount"] for b in self.bets.values() if not b["is_bot"])
        total_payout = sum(b["profit"] for b in self.bets.values() if not b["is_bot"] and b["cashed_out"])
        asyncio.create_task(database.record_round(self.target_crash_point, total_bets, total_payout))

        asyncio.create_task(self.broadcast({
            "type": "round_crashed",
            "round_id": self.round_id,
            "crash_point": self.target_crash_point,
            "bets": list(self.bets.values()),
            "history": self.recent_history[-10:]
        }))
        log.info(f"💥 АДМИН ВЗОРВАЛ РАКЕТУ МОМЕНТАЛЬНО НА {self.target_crash_point:.2f}x!")
        return {"ok": True, "crash_point": self.target_crash_point}

    async def start(self):
        self.running = True
        self.state = STATE_WAITING
        self.state_start_time = time.time()
        self._prepare_new_round()
        self._task = asyncio.create_task(self._game_loop())

    def _prepare_new_round(self):
        self.round_id += 1
        self.target_crash_point = self.calculate_crash_point()
        self.current_multiplier = 1.00
        self.bets.clear()
        
        # Генерируем ботов со случайными ставками (если включены)
        if self.enable_bots:
            num_bots = random.randint(3, 6)
            chosen_bots = random.sample(BOT_NAMES, min(num_bots, len(BOT_NAMES)))
            for i, name in enumerate(chosen_bots):
                bot_id = -1000 - i
                bet_amt = random.choice([5, 10, 15, 20, 50, 100])
                target_out = round(random.uniform(1.20, min(self.target_crash_point * 1.5, 15.0)), 2)
                self.bets[bot_id] = {
                    "user_id": bot_id,
                    "username": name,
                    "amount": bet_amt,
                    "auto_cashout": target_out,
                    "cashed_out": False,
                    "cashout_mult": 0.0,
                    "profit": 0,
                    "is_bot": True
                }

    async def _game_loop(self):
        """Основной игровой цикл."""
        while self.running:
            now = time.time()
            elapsed = now - self.state_start_time

            if self.state == STATE_WAITING:
                remaining = max(0.0, self.waiting_duration - elapsed)
                await self.broadcast({
                    "type": "tick_waiting",
                    "round_id": self.round_id,
                    "remaining": round(remaining, 1),
                    "bets": list(self.bets.values()),
                    "history": self.recent_history[-10:]
                })
                if elapsed >= self.waiting_duration:
                    self.state = STATE_FLYING
                    self.state_start_time = time.time()
                    self.current_multiplier = 1.00
                    await self.broadcast({
                        "type": "round_start",
                        "round_id": self.round_id,
                        "bets": list(self.bets.values())
                    })

            elif self.state == STATE_FLYING:
                # Скорость взлёта: множитель = e^(0.065 * t)
                mult = math.exp(0.065 * elapsed)
                self.current_multiplier = round(mult, 2)

                # Проверяем авто-вывод для всех ставок (включая ботов и реальных игроков)
                for uid, bet in self.bets.items():
                    if not bet["cashed_out"] and bet.get("auto_cashout"):
                        if self.current_multiplier >= bet["auto_cashout"] and bet["auto_cashout"] <= self.target_crash_point:
                            await self._process_cashout(uid, bet["auto_cashout"])

                # Проверяем точку краша
                if self.current_multiplier >= self.target_crash_point:
                    self.current_multiplier = self.target_crash_point
                    self.state = STATE_CRASHED
                    self.state_start_time = time.time()
                    self.recent_history.append(self.target_crash_point)
                    if len(self.recent_history) > 30:
                        self.recent_history.pop(0)

                    # Сохраняем в БД
                    total_bets = sum(b["amount"] for b in self.bets.values() if not b["is_bot"])
                    total_payout = sum(b["profit"] for b in self.bets.values() if not b["is_bot"] and b["cashed_out"])
                    asyncio.create_task(database.record_round(self.target_crash_point, total_bets, total_payout))

                    await self.broadcast({
                        "type": "round_crashed",
                        "round_id": self.round_id,
                        "crash_point": self.target_crash_point,
                        "bets": list(self.bets.values()),
                        "history": self.recent_history[-10:]
                    })
                else:
                    await self.broadcast({
                        "type": "tick_flying",
                        "round_id": self.round_id,
                        "multiplier": self.current_multiplier,
                        "bets": list(self.bets.values())
                    })

            elif self.state == STATE_CRASHED:
                if elapsed >= self.crashed_duration:
                    self.state = STATE_WAITING
                    self.state_start_time = time.time()
                    self._prepare_new_round()

            # Частота обновления сокетов ~50мс (20 FPS по сети, клиент плавно интерполирует на 60 FPS)
            await asyncio.sleep(0.05)

    async def place_bet(self, user_id: int, username: str, amount: int, auto_cashout: float | None = None) -> dict:
        """Игрок делает ставку."""
        if self.state != STATE_WAITING:
            return {"ok": False, "error": "Ставки принимаются только до взлёта!"}

        if amount <= 0:
            return {"ok": False, "error": "Неверная сумма ставки"}

        user = await database.get_or_create_user(user_id, username)
        if user.get("is_banned"):
            return {"ok": False, "error": "Ваш аккаунт заблокирован!"}
        if user["balance"] < amount:
            return {"ok": False, "error": "Недостаточно звёзд на балансе!"}

        # Списываем баланс
        new_balance = await database.update_balance(user_id, -amount)

        self.bets[user_id] = {
            "user_id": user_id,
            "username": username,
            "amount": amount,
            "auto_cashout": round(auto_cashout, 2) if auto_cashout and auto_cashout > 1.01 else None,
            "cashed_out": False,
            "cashout_mult": 0.0,
            "profit": 0,
            "is_bot": False
        }

        await self.broadcast({
            "type": "bet_placed",
            "bet": self.bets[user_id]
        })

        return {"ok": True, "balance": new_balance}

    async def cashout(self, user_id: int) -> dict:
        """Игрок вручную нажимает 'Забрать'."""
        if self.state != STATE_FLYING:
            return {"ok": False, "error": "Ракета не в полёте!"}

        if user_id not in self.bets:
            return {"ok": False, "error": "У вас нет активной ставки"}

        bet = self.bets[user_id]
        if bet["cashed_out"]:
            return {"ok": False, "error": "Вы уже забрали выигрыш!"}

        return await self._process_cashout(user_id, self.current_multiplier)

    async def _process_cashout(self, user_id: int, multiplier: float) -> dict:
        bet = self.bets.get(user_id)
        if not bet or bet["cashed_out"]:
            return {"ok": False}

        bet["cashed_out"] = True
        bet["cashout_mult"] = multiplier
        raw_profit = int(bet["amount"] * multiplier)
        
        # Выигрыш = ставка * множитель
        profit = raw_profit
        bet["profit"] = profit

        new_balance = None
        if not bet["is_bot"]:
            new_balance = await database.update_balance(user_id, profit)
            if profit >= 30:
                try:
                    from chat_engine import chat_engine
                    chat_engine.broadcast_win(bet["username"], "Crash", profit, multiplier)
                except Exception:
                    pass

        await self.broadcast({
            "type": "player_cashout",
            "user_id": user_id,
            "username": bet["username"],
            "multiplier": multiplier,
            "profit": profit,
            "balance": new_balance
        })

        return {"ok": True, "profit": profit, "multiplier": multiplier, "balance": new_balance}

    async def register_client(self, ws):
        self.clients.add(ws)

    async def unregister_client(self, ws):
        self.clients.discard(ws)

    async def broadcast(self, data: dict):
        if not self.clients:
            return
        msg = json.dumps(data)
        to_remove = set()
        for ws in self.clients:
            try:
                await ws.send_str(msg)
            except Exception:
                to_remove.add(ws)
        for ws in to_remove:
            self.clients.discard(ws)
