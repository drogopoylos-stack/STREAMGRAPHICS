@echo off
setlocal
rem HLL Broadcast Graphics - first install on a new PC.
rem Downloads the program and your private data from GitHub, installs it, and starts it.
title HLL Broadcast Graphics - setup

set "TARGET=%USERPROFILE%\HLL-Broadcast"
set "CODE_REPO=https://github.com/drogopoylos-stack/STREAMGRAPHICS.git"
set "DATA_REPO=https://github.com/drogopoylos-stack/STREAMGRAPHICS-data.git"

echo.
echo === HLL Broadcast Graphics setup ===
echo The program goes to: %TARGET%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Installing it with winget...
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  echo.
  echo Close this window and run setup.bat again, so Windows finds Git.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Installing Node.js LTS with winget...
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  echo.
  echo Close this window and run setup.bat again, so Windows finds Node.js.
  pause
  exit /b 1
)

if exist "%TARGET%\package.json" (
  echo The program is already installed. Getting the newest version...
  git -C "%TARGET%" pull --ff-only
) else (
  echo Downloading the program...
  git clone "%CODE_REPO%" "%TARGET%" || goto :error
)

if exist "%TARGET%\data\.git" (
  echo Getting the newest data...
  git -C "%TARGET%\data" pull --ff-only
) else (
  echo Downloading your private data. A GitHub sign-in window can open: sign in with your account.
  git clone "%DATA_REPO%" "%TARGET%\data" || goto :error
)

echo Installing the program parts (this takes a few minutes the first time)...
pushd "%TARGET%"
call npm install --no-audit --no-fund || goto :error
popd

echo.
echo Setup is complete. Use start.bat in %TARGET% to start the program.
echo Starting it now...
call "%TARGET%\start.bat"
exit /b 0

:error
echo.
echo Setup stopped because of an error. Read the message above.
pause
exit /b 1
