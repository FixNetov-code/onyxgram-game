"""
Единая точка запуска OnyxGram Crash: веб-сервер игры + бот (опционально).
"""
import asyncio
import logging
import os
import webbrowser
from dotenv import load_dotenv

import database
from engine import CrashGameEngine
from server import create_app
from aiohttp import web

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("main")

async def run_all():
    await database.init_db()
    
    # 1. Запуск движка
    from server import engine
    await engine.start()
    
    # 2. Запуск веб-сервера aiohttp
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    
    port = int(os.getenv("PORT", "8080"))
    try:
        site = web.TCPSite(runner, "0.0.0.0", port)
        await site.start()
    except OSError:
        port = 8081
        try:
            site = web.TCPSite(runner, "0.0.0.0", port)
            await site.start()
        except OSError:
            port = 8082
            site = web.TCPSite(runner, "0.0.0.0", port)
            await site.start()

    with open("active_port.txt", "w", encoding="utf-8") as f:
        f.write(str(port))
    
    log.info("=" * 60)
    log.info(f"🚀 OnyxGram Crash Mini App запущен на порту {port}!")
    log.info(f"👉 Локальный адрес для игры в браузере: http://localhost:{port}")
    log.info("=" * 60)

    # 3. Запуск бота (если задан BOT_TOKEN)
    bot_token = os.getenv("BOT_TOKEN", "").strip()
    if bot_token and not bot_token.startswith("your_"):
        try:
            from bot import run_bot
            log.info("🤖 Запускаем OnyxGram бота...")
            asyncio.create_task(run_bot())
        except Exception as e:
            log.warning(f"Не удалось запустить бота (проверьте сеть/токен): {e}")

    # Держим процесс активным
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    try:
        asyncio.run(run_all())
    except KeyboardInterrupt:
        log.info("Сервер остановлен.")
