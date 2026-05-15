@echo off
chcp 437 >nul
title VoltDrive - PenServe 2
color 0A
cls

echo.
echo  ========================================================================
echo.
echo   ##   ##  ####  ##     ######  #####  ####    ##  ##   ##  ######
echo   ##   ## ##  ## ##       ##    ##  ## ##  ##  ##  ##   ##  ##
echo   ##   ## ##  ## ##       ##    ##  ## ####    ##  ##   ##  #####
echo    ## ##  ##  ## ##       ##    ##  ## ## ##   ##   ## ##   ##
echo     ###    ####  ######   ##    #####  ##  ##  ##    ###    ######
echo.
echo  ========================================================================
echo   PenServe 2  ^|  Web-based File Manager for External Storage Devices
echo  ========================================================================
echo.

:: Step 1: Find Node.js
echo  [1/4]  Locating Node.js...

set NODE_EXE=
where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%x in ('where node') do set NODE_EXE=%%x
    goto NODE_FOUND
)

for %%P in (
    "%ProgramFiles%\nodejs\node.exe"
    "%ProgramFiles(x86)%\nodejs\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
    "%APPDATA%\nvm\current\node.exe"
    "C:\nodejs\node.exe"
) do (
    if exist %%P ( set NODE_EXE=%%~P & goto NODE_FOUND )
)

echo.
echo   [FAIL]  Node.js not found.
echo           Install from: https://nodejs.org  (LTS version)
echo.
pause
exit /b 1

:NODE_FOUND
for /f "tokens=*" %%v in ('"%NODE_EXE%" -v 2^>nul') do set NODE_VER=%%v
echo   [ OK ]  Node.js %NODE_VER%
echo.

:: Step 2: npm install if needed
echo  [2/4]  Checking packages...
if not exist "%~dp0node_modules" (
    echo   [WAIT]  Installing packages - please wait...
    pushd "%~dp0"
    npm install --silent 2>nul
    if %errorlevel% neq 0 (
        echo   [FAIL]  npm install failed. Check internet connection.
        popd & pause & exit /b 1
    )
    popd
    echo   [ OK ]  Packages installed
) else (
    echo   [ OK ]  node_modules present
)
echo.

:: Step 3: Create folders
echo  [3/4]  Preparing storage folders...
if not exist "%~dp0files"               mkdir "%~dp0files"
if not exist "%~dp0trash"               mkdir "%~dp0trash"
if not exist "%~dp0logs"                mkdir "%~dp0logs"
if not exist "%~dp0logs\activity.json"  echo [] > "%~dp0logs\activity.json"
echo   [ OK ]  files\   trash\   logs\   ready
echo.

:: Step 4: Loading bar then launch
echo  [4/4]  Starting VoltDrive...
echo.

powershell -NoProfile -Command "$w=40;$b='';for($i=1;$i -le $w;$i++){$b+='#';$p=[int]($i/$w*100);$s=' '*($w-$i);Write-Host ('  Loading  ['+$b+$s+']  '+$p+'%%') -NoNewline;Start-Sleep -Milliseconds 55;if($i -lt $w){Write-Host \"`r\" -NoNewline}};Write-Host \"`r  Loading  [########################################]  100%%  -  Ready!\" -ForegroundColor Green"

echo.
echo.
echo  ==========================================================================
echo   VoltDrive is running!  Open your browser:
echo.
echo     Local :  http://localhost:3000
echo     LAN   :  (address shown below)
echo.
echo   Press Ctrl+C to stop the server.
echo  ==========================================================================
echo.

pushd "%~dp0"
"%NODE_EXE%" server.js
popd

echo.
echo  ==========================================================================
echo   Server stopped. Press any key to close.
echo  ==========================================================================
echo.
pause
exit /b 0
