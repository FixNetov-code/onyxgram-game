"""
Движок игры Plinko (Плинко).
Генерирует траекторию отскока шарика по колышкам (10 рядов), рассчитывает итоговый слот и множитель.
Поддерживает 3 уровня риска (Low, Medium, High) и админскую подкрутку.
"""
import random
import logging

log = logging.getLogger("plinko")

# Множители для 10 рядов (11 слотов от 0 до 10)
MULTIPLIERS = {
    "low": [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    "medium": [22.0, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22.0],
    "high": [110.0, 15.0, 4.0, 1.3, 0.3, 0.2, 0.3, 1.3, 4.0, 15.0, 110.0]
}

class PlinkoEngine:
    def __init__(self):
        self.rows: int = 10
        self.rig_mode: str = "normal"  # "normal", "win", "loss", "jackpot", "rtp_5", "rtp_20", "rtp_50", "rtp_130"
        self.forced_slot: int | None = None  # 0..10

    def generate_path_for_slot(self, target_slot: int) -> list[int]:
        """Генерирует массив из 10 шагов (0 = влево, 1 = вправо), дающий нужный слот."""
        ones_needed = max(0, min(self.rows, target_slot))
        zeros_needed = self.rows - ones_needed
        path = [1] * ones_needed + [0] * zeros_needed
        random.shuffle(path)
        return path

    def drop_ball(self, bet: int, risk: str = "medium") -> dict:
        """
        Бросок шарика в Plinko.
        Возвращает:
          - path: список шагов [0, 1, 0, 1...] для плавной анимации на фронте
          - slot_index: индекс упавшей корзины (0..10)
          - multiplier: коэффициент выигрыша
          - payout: итоговая выплата (bet * mult)
          - win: True если multiplier >= 1.0
        """
        risk = risk.lower()
        if risk not in MULTIPLIERS:
            risk = "medium"

        table = MULTIPLIERS[risk]

        # 1. Принудительный слот от админа
        if self.forced_slot is not None and 0 <= self.forced_slot < len(table):
            slot = self.forced_slot
            self.forced_slot = None
            path = self.generate_path_for_slot(slot)
            mult = table[slot]
            payout = int(bet * mult)
            return {
                "ok": True,
                "risk": risk,
                "rows": self.rows,
                "path": path,
                "slot_index": slot,
                "multiplier": mult,
                "payout": payout,
                "win": mult >= 1.0
            }

        # 2. Админская подкрутка
        if self.rig_mode == "jackpot":
            slot = random.choice([0, len(table) - 1])
        elif self.rig_mode == "win":
            # Выбираем только выигрышные слоты (>= 1.4x)
            win_slots = [i for i, m in enumerate(table) if m >= 1.4]
            slot = random.choice(win_slots) if win_slots else 0
        elif self.rig_mode in ("loss", "rtp_5"):
            # Выбираем центральные сливные слоты (0.2x..0.6x)
            loss_slots = [i for i, m in enumerate(table) if m < 1.0]
            slot = random.choice(loss_slots) if loss_slots else len(table) // 2
        elif self.rig_mode == "rtp_20":
            if random.random() < 0.20:
                slot = random.choice([3, 4, 6, 7])
            else:
                loss_slots = [i for i, m in enumerate(table) if m < 1.0]
                slot = random.choice(loss_slots)
        elif self.rig_mode == "rtp_50":
            if random.random() < 0.40:
                slot = random.choice([2, 3, 7, 8])
            else:
                slot = random.choice([4, 5, 6])
        elif self.rig_mode == "rtp_130":
            if random.random() < 0.50:
                slot = random.choice([0, 1, 2, 8, 9, 10])
            else:
                slot = random.choice([3, 4, 6, 7])
        else:
            # Честный биномиальный закон распределения Galton board:
            # Каждый колышек даёт 50% влево и 50% вправо
            path = [1 if random.random() < 0.5 else 0 for _ in range(self.rows)]
            slot = sum(path)
            mult = table[slot]
            payout = int(bet * mult)
            return {
                "ok": True,
                "risk": risk,
                "rows": self.rows,
                "path": path,
                "slot_index": slot,
                "multiplier": mult,
                "payout": payout,
                "win": mult >= 1.0
            }

        # Если слот выбран через подкрутку, генерируем под него путь
        path = self.generate_path_for_slot(slot)
        mult = table[slot]
        payout = int(bet * mult)
        return {
            "ok": True,
            "risk": risk,
            "rows": self.rows,
            "path": path,
            "slot_index": slot,
            "multiplier": mult,
            "payout": payout,
            "win": mult >= 1.0
        }

plinko_engine = PlinkoEngine()
