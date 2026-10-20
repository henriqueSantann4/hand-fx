@echo off
chcp 65001 >nul
title HandFX
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

echo Abrindo o HandFX em http://localhost:5173
echo Para parar, feche esta janela ou aperte Ctrl+C.
echo.
rem Abre o navegador depois de 3 segundos, quando o servidor ja estiver de pe
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173"
call npm run dev
pause
