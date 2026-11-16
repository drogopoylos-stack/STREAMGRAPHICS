@echo off
rem HLL Broadcast Graphics - get the newest program version. Your data is not changed.
title HLL Broadcast Graphics - update
cd /d "%~dp0"
echo Stop the program before you update (close its window).
pause
git pull --ff-only || goto :error
call npm install --no-audit --no-fund || goto :error
echo.
echo The program is up to date. Start it with start.bat.
pause
exit /b 0
:error
echo The update stopped because of an error. Read the message above.
pause
exit /b 1
