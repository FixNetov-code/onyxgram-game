"""
Модуль игры «Контракты обмена» (Upgrade / Craft).
Игрок делает ставку и выбирает желаемый множитель апгрейда (от 1.1x до 100x).
Колесо рассчитывает шанс успеха на основе текущего RTP (от 5% до 130%).
Стрелка крутится на 360 градусов и при попадании в сектор успеха начисляет выигрыш.
Поддерживает админскую подкрутку (гарантированный успех / слив).
"""
import random
import logging
from typing import Dict, Any

log = logging.getLogger("upgrade")

class UpgradeEngine:
    def __init__(self):
        self.rig_mode: str = "normal"  # normal (96%), greedy (75%), hard_50, trap_20, super_greedy_5 (5%), boost (130%)
        self.forced_next: str | None = None  # "win" | "loss" | None

    def set_rig_mode(self, mode: str):
        if mode in ("normal", "greedy", "hard_50", "trap_20", "super_greedy_5", "boost"):
            self.rig_mode = mode
            log.info(f"⚡ Upgrade: установлен режим RTP {mode}")

    def get_current_rtp(self) -> float:
        if self.rig_mode == "super_greedy_5":
            return 0.05
        elif self.rig_mode == "trap_20":
            return 0.20
        elif self.rig_mode == "hard_50":
            return 0.50
        elif self.rig_mode == "greedy":
            return 0.75
        elif self.rig_mode == "boost":
            return 1.30
        return 0.96

    def set_forced_result(self, result: str | None):
        """result: 'win' | 'loss' | None"""
        self.forced_next = result
        log.info(f"⚡ Upgrade: принудительный исход след. апгрейда: {result}")

    def calculate_chance(self, target_mult: float) -> float:
        """Возвращает шанс успеха в процентах (0.01% .. 95.0%)."""
        if target_mult <= 1.0:
            return 95.0
        rtp = self.get_current_rtp()
        chance = (rtp / target_mult) * 100.0
        return max(0.05, min(95.0, round(chance, 2)))

    def upgrade(self, bet: int, target_mult: float) -> dict:
        """
        Совершает попытку апгрейда.
        Генерирует угол стрелки (0..360) и точку сектора.
        """
        if bet < 1:
            return {"ok": False, "error": "Минимальная ставка 1 ⭐"}
        
        target_mult = max(1.10, min(100.0, float(target_mult)))
        target_payout = int(round(bet * target_mult))
        chance = self.calculate_chance(target_mult)
        
        # Сектор победы занимает от 0 градусов до win_angle_span
        win_angle_span = (chance / 100.0) * 360.0

        # Проверка принудительного исхода от админа
        if self.forced_next == "win":
            self.forced_next = None
            is_win = True
            roll_angle = random.uniform(2.0, max(2.1, win_angle_span - 2.0))
        elif self.forced_next == "loss":
            self.forced_next = None
            is_win = False
            roll_angle = random.uniform(min(358.0, win_angle_span + 2.0), 358.0)
        else:
            # Обычный честный ролл от 0.0 до 360.0
            roll_angle = round(random.uniform(0.0, 360.0), 2)
            is_win = (roll_angle <= win_angle_span)

        win_amount = target_payout if is_win else 0

        log.info(f"⚡ Upgrade: ставка {bet} ⭐ на {target_mult}x (Шанс {chance}%). Ролл {roll_angle}° / Сектор {win_angle_span:.1f}°. Победа: {is_win}")

        return {
            "ok": True,
            "bet": bet,
            "target_multiplier": round(target_mult, 2),
            "target_payout": target_payout,
            "win": win_amount,
            "is_win": is_win,
            "chance": chance,
            "win_angle_span": round(win_angle_span, 2),
            "roll_angle": roll_angle
        }

# Глобальный экземпляр
upgrade_engine = UpgradeEngine()
