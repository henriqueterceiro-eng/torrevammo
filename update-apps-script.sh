#!/bin/bash
# Atualiza o Apps Script "upload torre" automaticamente.
# Roda: bash update-apps-script.sh
# Requer: clasp instalado e logado (clasp login)

set -e

CLONE_DIR="$HOME/.vammo-apps-script-clone"
SCRIPT_ID="1DgNurVDOVtqmgH86BnM5hh6ueoHZOn87TThwO-2TdtxNodZrMy02CPhK"
DEPLOYMENT_ID="AKfycbz4i5IGgCe8bbbJTfycMQiAAJOjUtsu22T_8WNuOiMbHKaIJXZi-xwrunOSiV3dTTkv"
HERE="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$HERE/apps-script-code.gs"

if [ ! -f "$SOURCE" ]; then
  echo "❌ Arquivo não encontrado: $SOURCE" >&2
  exit 1
fi

# Clona se ainda não existe (1ª vez)
if [ ! -f "$CLONE_DIR/.clasp.json" ]; then
  echo "📥 Primeiro deploy — clonando projeto Apps Script..."
  mkdir -p "$CLONE_DIR"
  cd "$CLONE_DIR"
  clasp clone "$SCRIPT_ID"
fi

# Copia código novo por cima e faz push + deploy
echo "📋 Copiando código..."
cp "$SOURCE" "$CLONE_DIR/Código.js"

cd "$CLONE_DIR"
echo "🚀 Push pro Apps Script..."
clasp push -f

echo "🔄 Deploy da versão nova..."
clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "Auto-deploy $(date '+%Y-%m-%d %H:%M')"

echo
echo "✅ Pronto! A URL do Web App continua a mesma:"
echo "   https://script.google.com/macros/s/$DEPLOYMENT_ID/exec"
echo
echo "Testando endpoint..."
curl -sL "https://script.google.com/macros/s/$DEPLOYMENT_ID/exec" -w "\nHTTP %{http_code}\n"
