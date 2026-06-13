@echo off
cd /d "%~dp0"
echo Iniciando MediClock en8000 http://localhost:
echo.
echo Si Firebase muestra error de dominio, agrega localhost en:
echo Firebase Console ^> Authentication ^> Settings ^> Authorized domains
echo.
"C:\xampp\php\php.exe" -S localhost:8000 -t "%~dp0"
pause
