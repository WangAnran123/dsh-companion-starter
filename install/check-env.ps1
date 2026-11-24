<#
.SYNOPSIS
  环境体检：Python / Node / Edge / AstrBot / 插件目录 / 配置文件，缺什么直接说怎么办。
#>
$ErrorActionPreference = 'Continue'
function Ok($m)   { Write-Host "[OK]   $m" -ForegroundColor Green }
function Bad($m, $fix) { Write-Host "[缺]   $m" -ForegroundColor Red; if ($fix) { Write-Host "       怎么办: $fix" -ForegroundColor Yellow } }

Write-Host "=== 1) Python ==="
$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) { Ok "$($py.Source)  $(& $py.Source --version 2>&1)" } else { Bad '没有 Python' '去 python.org 装 3.10+，装的时候勾 add to PATH' }

Write-Host "=== 2) Node.js ==="
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Ok "$($node.Source)  $(& $node.Source --version 2>&1)" } else { Bad '没有 Node.js' '去 nodejs.org 装 LTS' }

Write-Host "=== 3) 浏览器（消息通道要用）==="
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (Test-Path $edge) { Ok "Edge: $edge" } else { Bad '没找到 Edge' '装 Edge 或改用 Chrome（插件里改浏览器路径）' }

Write-Host "=== 4) AstrBot ==="
$astr = "$env:USERPROFILE\.astrbot_launcher"
if (Test-Path $astr) { Ok "AstrBot 目录: $astr" } else { Bad '没装 AstrBot' '按 docs/SETUP-WINDOWS.md 第 2 步装' }

Write-Host "=== 5) 插件 ==="
$pl = Join-Path $astr 'instances'
if (Test-Path $pl) {
  $pushed = Get-ChildItem $pl -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'core\data\plugins' } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($pushed) {
    foreach ($n in 'astrbot_plugin_breeze_tts', 'astrbot_plugin_file_push') {
      if (Test-Path (Join-Path $pushed $n)) { Ok "插件在: $n" } else { Bad "插件缺: $n" '把 plugins/astrbot 下对应目录整个拷进 AstrBot 插件目录' }
    }
  }
}

Write-Host "=== 6) 配置文件 ==="
foreach ($f in @("$env:USERPROFILE\.breeze\breeze_key.txt")) {
  if (Test-Path $f) { Ok "有: $f" } else { Bad "没有: $f" '建这个文件，里面写一行 Breeze API Key' }
}
