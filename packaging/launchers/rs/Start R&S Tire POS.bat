@echo off
REM ============================================================
REM  R&S Tire Sales POS (Inerica POS) - one-click launcher
REM  Offline, self-contained. Starts the API + web, opens the POS.
REM ============================================================
setlocal
title R^&S Tire POS
set "ROOT=%~dp0"
set "NODE=%ROOT%node\node.exe"

REM Its own data folder (kept separate from any other Inerica POS install and
REM preserved across updates).
set "DATADIR=%LOCALAPPDATA%\InericaPOS-RS\data"
if not exist "%DATADIR%" mkdir "%DATADIR%"

set "NODE_ENV=production"
set "BALM_DATA_DIR=%DATADIR%"
set "CORS_ORIGINS=http://localhost:3000"
REM The API listens on this PC only; nothing else on the network can reach it.
set "HOST=127.0.0.1"
REM Clean store install: only the tire catalog + inventory + the first admin.
set "SEED_DEMO=false"
set "PORT="

echo Starting R^&S Tire POS services...

start "R&S Tire POS - API" /min "%NODE%" "%ROOT%api\server.mjs"
pushd "%ROOT%web"
start "R&S Tire POS - Web" /min "%NODE%" "node_modules\next\dist\bin\next" start -p 3000
popd

echo Waiting for the POS to come up...
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{$r=Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/pos' -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}}catch{}; Start-Sleep -Seconds 1}; exit 1"

set "POSURL=http://localhost:3000/pos"
where msedge >nul 2>&1 && (start "" msedge --app=%POSURL% --window-size=1460,920) || (start "" %POSURL%)

echo.
echo R^&S Tire POS is running.  Sign in with your admin account (first start: see README.txt).
echo Leave this window open while you use the POS. Close it to stop the services.
echo.
pause >nul

taskkill /F /FI "WINDOWTITLE eq R&S Tire POS - API*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq R&S Tire POS - Web*" >nul 2>&1
endlocal
