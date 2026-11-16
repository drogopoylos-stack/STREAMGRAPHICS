@echo off
rem HLL Broadcast Graphics - start the program and open the control panel.
title HLL Broadcast Graphics
cd /d "%~dp0"
if exist "data\.git" (
  echo Getting the newest data from GitHub...
  git -C data pull --ff-only || echo Could not get the newest data. The program starts with the data on this PC.
)
start "" http://localhost:4610/
node server/index.js
pause
