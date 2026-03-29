@echo off
echo === J4J Scheduler — Windows Task Scheduler Setup ===
echo.
echo This will create a scheduled task that runs every 5 minutes
echo to check for and publish due Etsy listings.
echo.
echo Press Ctrl+C to cancel, or any key to continue...
pause >nul

schtasks /create /tn "J4J-Listing-Scheduler" /tr "node \"%~dp0scheduler.js\"" /sc minute /mo 5 /f

if %ERRORLEVEL% equ 0 (
    echo.
    echo Task created successfully!
    echo   Name: J4J-Listing-Scheduler
    echo   Runs: Every 5 minutes
    echo   Script: %~dp0scheduler.js
    echo.
    echo To remove: schtasks /delete /tn "J4J-Listing-Scheduler" /f
    echo To check:  schtasks /query /tn "J4J-Listing-Scheduler"
) else (
    echo.
    echo Failed to create task. Try running as Administrator.
)

echo.
pause
