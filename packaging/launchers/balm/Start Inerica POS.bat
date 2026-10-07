@echo off
REM ============================================================
REM  Inerica POS - one-click launcher (offline, self-contained)
REM  Starts the bundled API + web server, then opens the POS.
REM ============================================================
setlocal
title Inerica POS
set "ROOT=%~dp0"
set "NODE=%ROOT%node\node.exe"

REM Persistent data lives outside the program folder so it survives updates.
set "DATADIR=%LOCALAPPDATA%\InericaPOS\data"
if not exist "%DATADIR%" mkdir "%DATADIR%"

REM Shared runtime env for both services.
set "NODE_ENV=production"
set "BALM_DATA_DIR=%DATADIR%"
set "CORS_ORIGINS=http://localhost:3000"
REM Served over http://localhost (no HTTPS), so cookies must not be Secure or
REM the browser drops them and sign-in fails.
set "COOKIE_SECURE=false"
set "PORT="

echo Starting Inerica POS services...

REM --- API (port 4000, JSON store, offline) ---
start "Inerica POS - API" /min "%NODE%" "%ROOT%api\server.mjs"

REM --- Web / POS UI (port 3000) ---
pushd "%ROOT%web"
start "Inerica POS - Web" /min "%NODE%" "node_modules\next\dist\bin\next" start -p 3000
popd

REM --- Wait until the POS is ready, then open it in an app window ---
echo Waiting for the POS to come up...
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{$r=Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/pos' -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}}catch{}; Start-Sleep -Seconds 1}; exit 1"

set "POSURL=http://localhost:3000/pos"
where msedge >nul 2>&1 && (start "" msedge --app=%POSURL% --window-size=1460,920) || (start "" %POSURL%)

echo.
echo Inerica POS is running.  Sign in:  admin@balm.local  /  admin1234
echo Leave this window open while you use the POS. Close it to stop the services.
echo.
pause >nul

REM On close, stop the two node services started above.
taskkill /F /FI "WINDOWTITLE eq Inerica POS - API*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Inerica POS - Web*" >nul 2>&1
endlocal
