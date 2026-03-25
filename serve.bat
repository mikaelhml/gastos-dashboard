@echo off
echo.
echo  ====================================
echo   Dashboard de Gastos — Servidor Local
echo  ====================================
echo.
echo  Iniciando servidor em http://localhost:8080
echo  Pressione Ctrl+C para parar.
echo.

:: Tenta Python 3
python --version >nul 2>&1
if %errorlevel% == 0 (
  echo  Usando Python...
  python -m http.server 8080
  goto :end
)

:: Tenta Python 3 explícito
python3 --version >nul 2>&1
if %errorlevel% == 0 (
  echo  Usando Python3...
  python3 -m http.server 8080
  goto :end
)

:: Tenta Node/npx
npx --version >nul 2>&1
if %errorlevel% == 0 (
  echo  Usando npx serve...
  npx serve -l 8080 .
  goto :end
)

echo  ERRO: Python ou Node.js nao encontrado.
echo.
echo  Opcoes:
echo    1. Instale Python: https://python.org
echo    2. Instale Node.js: https://nodejs.org
echo    3. Use a extensao "Live Server" no VSCode
echo.
pause

:end
