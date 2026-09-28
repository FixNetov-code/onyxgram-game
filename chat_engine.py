"""
Модуль живого чата игроков (Live Chat) с поддержкой реальных сообщений,
автоматических уведомлений о крупных заносах и фоновой активности ботов.
"""
import asyncio
import logging
import random
import time
from typing import List, Dict, Any

log = logging.getLogger("chat")

# Список имён ботов для чата
BOT_CHATTERS = [
    ("💎 ton_whale", "vip"),
    ("🚀 crypto_kid", None),
    ("👑 star_king", "vip"),
    ("⚡ onyx_pro", None),
    ("🦊 lucky_fox", None),
    ("🎯 sniper_99", None),
    ("🔥 fire_hand", None),
    ("🎲 risk_master", None),
    ("🌙 moon_rider", None),
    ("🌟 star_lord", None),
]

BOT_MESSAGES = [
    "ракета сегодня прямо сочно наваливает 🚀",
    "в минёре на 3 минах забрал 3.5x, кайф!",
    "кто сколько в слотах поднял?",
    "апгрейднул 20 звёзд в 100 с шансом 19% ахах ⚡",
    "вывод подарком моментально в профиль прилетел, спс админу 🎁",
    "сейчас попробую 5 мин в минёре прощупать",
    "подскажите, какой авто-вывод лучше на ракете ставить?",
    "у меня 2.0x авто-вывод на ракете стабильно в плюс идет",
    "777 в слотах кто-то выбивал сегодня?",
    "закинул 50 на апгрейд, держим кулаки 🤞",
    "только что х5 на краше забрал, изи звёзды",
    "минёр топ игра конечно, нервы щекочет))",
    "главное не жадничать и вовремя забирать",
    "погнали крутить слоты 🔥",
    "сегодня явно фартовый день 🍀"
]

class ChatEngine:
    def __init__(self):
        self.messages: List[Dict[str, Any]] = []
        self.enable_bot_chat: bool = True
        self._bot_task = None
        self.max_history = 60

        # Начальные сообщения, чтобы чат сразу выглядел живым
        self._init_starter_messages()

    def _init_starter_messages(self):
        sample_starters = [
            ("💎 ton_whale", "vip", "всем привет! ракета сегодня бодро летит 🚀"),
            ("🦊 lucky_fox", None, "только что 85 ⭐ в минёре поднял)"),
            ("👑 star_king", "vip", "слоты 777 реально сыпят, забрал x20!"),
            ("⚡ onyx_pro", None, "вывод мишкой Тедди пришел за секунду 🧸"),
            ("🚀 crypto_kid", None, "пробуйте апгрейды на x3, шанс почти 30%")
        ]
        now = time.time()
        for idx, (user, badge, text) in enumerate(sample_starters):
            self.messages.append({
                "id": idx + 1,
                "user_id": 900000 + idx,
                "username": user,
                "badge": badge,
                "text": text,
                "is_bot": True,
                "time": time.strftime("%H:%M", time.localtime(now - (len(sample_starters) - idx) * 120))
            })

    def get_messages(self, limit: int = 50) -> List[Dict[str, Any]]:
        res = []
        for m in self.messages[-limit:]:
            item = dict(m)
            if item.get("user_id") != 2127001 and item.get("badge") == "owner":
                item["badge"] = None
                if item.get("avatar") == "👑":
                    item["avatar"] = None
            res.append(item)
        return res

    def add_message(self, user_id: int, username: str, text: str, badge: str | None = None, is_bot: bool = False, avatar: str | None = None) -> Dict[str, Any]:
        """Добавляет новое сообщение в чат."""
        text = text.strip()[:200]  # Ограничение длины
        if not text:
            return {}

        # Только создатель (ID 2127001) может иметь бейдж owner
        if user_id != 2127001 and badge == "owner":
            badge = None
            if avatar == "👑":
                avatar = None

        msg = {
            "id": int(time.time() * 1000) + random.randint(10, 99),
            "user_id": user_id,
            "username": username or "Игрок",
            "badge": badge,
            "avatar": avatar,
            "text": text,
            "is_bot": is_bot,
            "time": time.strftime("%H:%M")
        }
        self.messages.append(msg)
        if len(self.messages) > self.max_history:
            self.messages = self.messages[-self.max_history:]
        return msg

    def broadcast_win(self, username: str, game_title: str, win_stars: int, multiplier: float):
        """Публикует системную плашку о крупном выигрыше в чат."""
        if win_stars < 30:
            return  # Только заметные выигрыши
        
        msg_text = f"🎉 {username} сорвал куш {win_stars} ⭐ в «{game_title}» ({multiplier:.2f}x)!"
        msg = {
            "id": int(time.time() * 1000) + random.randint(10, 99),
            "user_id": 0,
            "username": "СИСТЕМА КАЗИНО",
            "badge": "win_alert",
            "text": msg_text,
            "is_bot": True,
            "time": time.strftime("%H:%M")
        }
        self.messages.append(msg)
        if len(self.messages) > self.max_history:
            self.messages = self.messages[-self.max_history:]

    async def start_bot_loop(self):
        """Периодическая отправка реалистичных сообщений от ботов."""
        while True:
            try:
                # Пауза между сообщениями 25-50 секунд
                await asyncio.sleep(random.uniform(25.0, 55.0))
                if self.enable_bot_chat:
                    bot_user, badge = random.choice(BOT_CHATTERS)
                    bot_text = random.choice(BOT_MESSAGES)
                    self.add_message(
                        user_id=random.randint(900000, 999999),
                        username=bot_user,
                        text=bot_text,
                        badge=badge,
                        is_bot=True
                    )
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.error(f"Chat bot error: {e}")
                await asyncio.sleep(10)

    def start(self):
        if not self._bot_task:
            self._bot_task = asyncio.create_task(self.start_bot_loop())

    def stop(self):
        if self._bot_task:
            self._bot_task.cancel()
            self._bot_task = None

# Глобальный экземпляр
chat_engine = ChatEngine()
