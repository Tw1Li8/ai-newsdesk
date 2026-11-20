@echo off
chcp 65001 >nul
title AI 뉴스데스크
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js 가 설치돼 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  echo.
  pause
  exit /b 1
)
rem 이미 켜져 있으면 브라우저만 연다
curl.exe -s -o nul --max-time 2 http://localhost:4577/api/status
if not errorlevel 1 (
  echo  이미 실행 중입니다. 브라우저를 엽니다.
  if not defined NO_OPEN start "" http://localhost:4577
  timeout /t 2 >nul
  exit /b 0
)
set HOST=0.0.0.0
if not defined NO_OPEN start "" cmd /c "timeout /t 3 >nul & start http://localhost:4577"
echo.
echo  ====================================================
echo   AI 뉴스데스크 실행 중  (이 창을 닫으면 종료됩니다)
echo   이 PC      : http://localhost:4577
echo   폰·다른 PC : 아래 "다른 기기" 주소를 브라우저에 입력
echo  ====================================================
echo.
node server.js
echo.
echo  서버가 종료되었습니다.
pause
