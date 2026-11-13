@echo off
cd /d "%~dp0"
echo Mahjong Wave DEMO: http://localhost:4177
echo Stop with Ctrl+C. Local network only.
node serve.cjs
pause
