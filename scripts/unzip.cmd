@echo off
setlocal

set "DEST="
set "ZIP="

:parse
if "%~1"=="" goto run
if /I "%~1"=="-d" (
  set "DEST=%~2"
  shift
  shift
  goto parse
)
if /I "%~1"=="-q" (
  shift
  goto parse
)
if /I "%~1"=="-o" (
  shift
  goto parse
)
if /I "%~1"=="-qo" (
  shift
  goto parse
)
if not defined ZIP set "ZIP=%~1"
shift
goto parse

:run
if not defined ZIP (
  echo unzip shim error: missing zip path
  exit /b 1
)
if not defined DEST (
  set "DEST=."
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%DEST%' -Force" >nul
if errorlevel 1 exit /b 1
exit /b 0
