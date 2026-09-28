@echo off
chcp 65001 > nul
title OnyxGram Crash Mini App
echo ===================================================
echo     Запуск OnyxGram Crash (Ракета) Mini App
echo ===================================================
echo Открываю браузер...
start http://localhost:8080
echo Запускаю сервер...
python main.py
pause
