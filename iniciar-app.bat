@echo off
chcp 65001 >nul
title HandFX (app)
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando as dependencias pela primeira vez...
  call npm install
  if errorlevel 1 (
    echo.
    echo Erro na instalacao. Veja a mensagem acima.
    pause
    exit /b 1
  )
)

echo Abrindo o HandFX como app...
call npm run electron:dev
pause
