@echo off
setlocal
cd /d "%~dp0"
set PORT=8000
title Tshovani Primary School - Launcher

echo ==============================================================
echo   Tshovani Primary School - local web server
echo   (uses Windows built-in PowerShell - nothing to install)
echo.
echo   URL on this PC:  http://localhost:%PORT%/index.html
echo   A minimized server window will open - close it to stop.
echo ==============================================================

start "Tshovani Server (close this window to stop)" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port %PORT%

rem ---- Wait until the port is really listening (up to ~15 s) ----
set /a TRIES=0
:waitloop
ping -n 2 127.0.0.1 >nul
netstat -an | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 goto opened
set /a TRIES+=1
if %TRIES% lss 15 goto waitloop

echo.
echo WARNING: nothing is listening on port %PORT% after 15 seconds.
echo Check the minimized "Tshovani Server" window for the exact error.
echo If port %PORT% is busy, change the PORT value at the top of this
echo file (e.g. to 8080) and run it again.
goto done

:opened
echo Server is up! Opening your browser...
start "" "http://localhost:%PORT%/index.html"

:done
echo.
echo The site runs in the minimized window titled "Tshovani Server".
echo Close that window to stop it.
echo.
pause
