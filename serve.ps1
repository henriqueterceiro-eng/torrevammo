# Vammo Fase 1 — Local dev server
# Roda um HTTP server simples na pasta atual pra testar torre.html + colab.html
# Uso:  .\serve.ps1   (ou  powershell -ExecutionPolicy Bypass -File .\serve.ps1)

$port = 8000
$root = $PSScriptRoot

# Tenta Python primeiro (já vem instalado em muitos Windows recentes)
$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) {
  Write-Host ""
  Write-Host "==========================================" -ForegroundColor Cyan
  Write-Host "  Vammo Fase 1 - Servidor local" -ForegroundColor Cyan
  Write-Host "==========================================" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Torre  -> http://localhost:$port/torre.html" -ForegroundColor Green
  Write-Host "  Colab  -> http://localhost:$port/colab.html" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Ctrl+C para parar" -ForegroundColor Yellow
  Write-Host ""
  Set-Location $root
  python -m http.server $port
  exit
}

# Tenta Node
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  Write-Host "Usando 'npx serve' (vai baixar pacote na primeira vez)..." -ForegroundColor Yellow
  Set-Location $root
  npx serve -p $port .
  exit
}

# Fallback: servidor mini em PowerShell puro
Write-Host "Python e Node nao encontrados. Subindo servidor PowerShell..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Torre  -> http://localhost:$port/torre.html" -ForegroundColor Green
Write-Host "  Colab  -> http://localhost:$port/colab.html" -ForegroundColor Green
Write-Host ""

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

$mimeMap = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.md'   = 'text/markdown; charset=utf-8'
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $path = $req.Url.LocalPath
    if ($path -eq '/') { $path = '/torre.html' }
    $file = Join-Path $root ($path.TrimStart('/'))

    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentType = $mime
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
  }
} finally {
  $listener.Stop()
}
