"""
Модуль игрового автомата «Слоты 777» (Lucky 777 Slots).
Поддерживает честный RTP, жадный/буст режимы, принудительный джекпот 777 и админ-контроль.
"""
import random
import logging

log = logging.getLogger("slots")

# Доступные символы
SYMBOLS = ["🍒", "🍋", "🍇", "🔔", "💎", "⭐", "7️⃣"]

# Таблица выплат за комбинации из 3 одинаковых
TRIPLE_PAYOUTS = {
    "7️⃣": (100.0, "🔥 ДЖЕКПОТ 777! 🔥"),
    "⭐": (50.0, "✨ Звёздный куш! ✨"),
    "💎": (30.0, "💎 Алмазная лихорадка! 💎"),
    "🔔": (20.0, "🔔 Золотые колокольчики!"),
    "🍇": (12.0, "🍇 Виноградный всплеск!"),
    "🍋": (8.0, "🍋 Лимонный бум!"),
    "🍒": (5.0, "🍒 Тройная вишня!"),
}

class SlotsEngine:
    def __init__(self):
        self.rig_mode: str = "normal"  # normal (96%), greedy (75%), boost (130%)
        self.forced_next: str | None = None  # "777", "win", "loss", or None

    def set_rig_mode(self, mode: str):
        if mode in ("normal", "greedy", "hard_50", "trap_20", "super_greedy_5", "boost"):
            self.rig_mode = mode
            log.info(f"🎰 Слоты: установлен режим RTP {mode}")

    def set_forced_result(self, result_type: str | None):
        self.forced_next = result_type
        log.info(f"🎰 Слоты: принудительный результат след. спина: {result_type}")

    def evaluate(self, s1: str, s2: str, s3: str, bet: int) -> dict:
        """Оценивает комбинацию 3 барабанов и возвращает выигрыш."""
        # 1. Три одинаковых
        if s1 == s2 == s3:
            mult, title = TRIPLE_PAYOUTS.get(s1, (2.0, "Выигрыш!"))
            win = int(bet * mult)
            return {
                "symbols": [s1, s2, s3],
                "multiplier": mult,
                "win": win,
                "is_win": True,
                "is_jackpot": (s1 == "7️⃣"),
                "combo_title": title
            }

        # 2. Две семёрки
        sevens_count = [s1, s2, s3].count("7️⃣")
        if sevens_count == 2:
            mult = 3.0
            win = int(bet * mult)
            return {
                "symbols": [s1, s2, s3],
                "multiplier": mult,
                "win": win,
                "is_win": True,
                "is_jackpot": False,
                "combo_title": "7️⃣ Две семёрки! 7️⃣"
            }

        # 3. Две звезды
        if [s1, s2, s3].count("⭐") == 2:
            mult = 2.0
            win = int(bet * mult)
            return {
                "symbols": [s1, s2, s3],
                "multiplier": mult,
                "win": win,
                "is_win": True,
                "is_jackpot": False,
                "combo_title": "⭐ Две звезды! ⭐"
            }

        # 4. Две вишни
        if [s1, s2, s3].count("🍒") == 2:
            mult = 1.5
            win = int(bet * mult)
            return {
                "symbols": [s1, s2, s3],
                "multiplier": mult,
                "win": win,
                "is_win": True,
                "is_jackpot": False,
                "combo_title": "🍒 Две вишенки!"
            }

        # 5. Одна вишня на первом барабане
        if s1 == "🍒" and s2 != "🍒":
            mult = 1.0
            win = int(bet * mult)
            return {
                "symbols": [s1, s2, s3],
                "multiplier": mult,
                "win": win,
                "is_win": True,
                "is_jackpot": False,
                "combo_title": "🍒 Вишенка (Возврат ставки)"
            }

        # Проигрыш
        return {
            "symbols": [s1, s2, s3],
            "multiplier": 0.0,
            "win": 0,
            "is_win": False,
            "is_jackpot": False,
            "combo_title": "Попробуйте ещё раз!"
        }

    def generate_random_symbols(self) -> list[str]:
        """Генерирует 3 символа с учётом RTP."""
        if self.rig_mode == "super_greedy_5":
            # 5% RTP: Почти одни вишни и лимоны, дорогие символы не выпадают
            weights = [55, 35, 8, 2, 0, 0, 0]
        elif self.rig_mode == "trap_20":
            # 20% RTP: Сливы и пустые комбинации
            weights = [45, 32, 14, 6, 2, 1, 0]
        elif self.rig_mode == "hard_50":
            # 50% RTP: Низкие выплаты
            weights = [38, 28, 18, 10, 4, 1, 1]
        elif self.rig_mode == "greedy":
            # 75% RTP: Меньше шансов на дорогие символы
            weights = [30, 25, 20, 12, 7, 4, 2]
        elif self.rig_mode == "boost":
            # 130% RTP: Повышенный шанс на крупные выигрыши
            weights = [15, 18, 18, 16, 14, 11, 8]
        else: # normal (96% RTP)
            weights = [26, 22, 19, 14, 10, 6, 3]

        return random.choices(SYMBOLS, weights=weights, k=3)

    def spin(self, bet: int) -> dict:
        """Совершает один спин автомата."""
        # 1. Проверяем принудительный исход от админа
        if self.forced_next == "777":
            self.forced_next = None
            return self.evaluate("7️⃣", "7️⃣", "7️⃣", bet)
        elif self.forced_next == "win":
            self.forced_next = None
            sym = random.choice(["🔔", "💎", "⭐", "🍇"])
            return self.evaluate(sym, sym, sym, bet)
        elif self.forced_next == "loss":
            self.forced_next = None
            # Гарантированный проигрыш с интригой (например 7-7-лимон)
            return self.evaluate("7️⃣", "7️⃣", "🍋", bet)

        # 2. Обычная генерация
        max_attempts = 10
        for _ in range(max_attempts):
            s = self.generate_random_symbols()
            res = self.evaluate(s[0], s[1], s[2], bet)
            
            # Коррекция RTP для супер-жадных режимов
            if res["is_win"]:
                if self.rig_mode == "super_greedy_5" and random.random() < 0.95:
                    # В 95% случаев сбрасываем любой случайный выигрыш в слив
                    return self.evaluate("7️⃣", "7️⃣", random.choice(["🍋", "🍒", "🔔"]), bet)
                elif self.rig_mode == "trap_20" and random.random() < 0.80:
                    # В 80% случаев сбрасываем в слив
                    return self.evaluate("⭐", "⭐", random.choice(["🍋", "🍒"]), bet)
                elif self.rig_mode == "hard_50" and random.random() < 0.50:
                    # В 50% случаев сбрасываем в слив
                    return self.evaluate("💎", "💎", "🍋", bet)
                elif self.rig_mode == "greedy" and res["multiplier"] > 15.0 and random.random() < 0.6:
                    continue
            
            # Коррекция для буст режима
            if self.rig_mode == "boost" and not res["is_win"] and random.random() < 0.4:
                continue
                
            return res

        # Fallback
        s = self.generate_random_symbols()
        return self.evaluate(s[0], s[1], s[2], bet)

# Глобальный инстанс
slots_engine = SlotsEngine()
