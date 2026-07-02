@echo off
echo Starting POS Local Database Server...

:: 1. Start the Node server in a new window
:: (Using /k keeps the window open if there's an error so you can read it)
start "POS Database Server" cmd /k "node server.js"

:: 2. Wait for 3 seconds to let the server boot up
echo Waiting for server to initialize...
timeout /t 3 /nobreak > NUL

:: 3. Open the index.html file in your default web browser
echo Opening POS App...
start index.html

exit