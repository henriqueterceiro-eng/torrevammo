@echo off
REM Atualiza o Apps Script "upload torre" automaticamente (versão Windows).
REM Roda: update-apps-script.bat
REM Requer: clasp instalado (npm i -g @google/clasp) e logado (clasp login)

setlocal
set "CLONE_DIR=%USERPROFILE%\.vammo-apps-script-clone"
set "SCRIPT_ID=1DgNurVDOVtqmgH86BnM5hh6ueoHZOn87TThwO-2TdtxNodZrMy02CPhK"
set "DEPLOYMENT_ID=AKfycbz4i5IGgCe8bbbJTfycMQiAAJOjUtsu22T_8WNuOiMbHKaIJXZi-xwrunOSiV3dTTkv"
set "HERE=%~dp0"
set "SOURCE=%HERE%apps-script-code.gs"

if not exist "%SOURCE%" (
  echo Arquivo nao encontrado: %SOURCE%
  exit /b 1
)

if not exist "%CLONE_DIR%\.clasp.json" (
  echo Primeiro deploy - clonando projeto Apps Script...
  mkdir "%CLONE_DIR%" 2>nul
  pushd "%CLONE_DIR%"
  call clasp clone "%SCRIPT_ID%"
  popd
)

echo Copiando codigo...
copy /Y "%SOURCE%" "%CLONE_DIR%\Código.js" >nul

pushd "%CLONE_DIR%"
echo Push pro Apps Script...
call clasp push -f
echo Deploy da versao nova...
call clasp deploy --deploymentId "%DEPLOYMENT_ID%" --description "Auto-deploy via bat"
popd

echo.
echo Pronto. URL do Web App continua a mesma:
echo    https://script.google.com/macros/s/%DEPLOYMENT_ID%/exec
echo.
echo Testando endpoint...
curl -sL "https://script.google.com/macros/s/%DEPLOYMENT_ID%/exec"
echo.
