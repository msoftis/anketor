@echo off
chcp 65001 >nul
title ANKETOR - Anket ve Simülasyon Platformu
echo ===================================================
echo             ANKETOR PLATFORMU BASLATILIYOR        
echo ===================================================
echo.
set "PATH=%PATH%;C:\Program Files\nodejs"
echo Sunucu aktif ediliyor...
echo.
start http://localhost:3000
node server.js
pause
