@echo off
chcp 65001 >nul
title ANKETOR - Firebase Online Yayina Alma
echo ===================================================
echo       ANKETOR - FIREBASE ONLİNE YAYINA ALMA
echo ===================================================
echo.
echo Adim 1: Firebase Google hesabiniz ile giris yapiliyor...
echo Tarayicinizda acilacak sekmede Google hesabinizi onaylayiniz.
echo.
call .\firebase.exe login
echo.
echo Adim 2: Proje Firebase Hosting'e yukleniyor...
call .\firebase.exe deploy --only hosting
echo.
echo ===================================================
echo TEBRIKLER! Anket sisteminiz online olarak yayinda:
echo 👉 https://anketor1.web.app
echo 👉 https://anketor1.web.app/s/s_olcek_mv00deur
echo ===================================================
pause
