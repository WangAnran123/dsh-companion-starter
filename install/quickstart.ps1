# quickstart.ps1 —— 一条命令把「AI 伙伴」骨架装进你的 DSH profile
# ---------------------------------------------------------------------------
# 做三件事（不装依赖、不联网、不动现有插件）：
#   1. 找到你的 DSH profile 目录（默认 ~/.dsh/profiles/desktop）
#   2. 把本仓库的 dsh-plugin 复制进 <profile>/node_modules/dsh-companion-onboard
#   3. 在 <profile>/package.json 里登记依赖 + 加进 bundle 列表（会先备份）
# 装完重启 DSH，然后对它说一句「帮我搭个 AI 伙伴」就会开始引导。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File install\quickstart.ps1
#   powershell -ExecutionPolicy Bypass -File install\quickstart.ps1 -Profile "C:\Users\me\.dsh\profiles\desktop"
#   powershell -ExecutionPolicy Bypass -File install\quickstart.ps1 -Uninstall
param(
  [string]$Profile = "",
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$BundleName = 'dsh-companion-onboard'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$SrcPlugin = Join-Path $RepoRoot 'dsh-plugin'

function Fail($msg) { Write-Host "  [X] $msg" -ForegroundColor Red; exit 1 }
function Info($msg) { Write-Host "  $msg" }
function Ok($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }

# ── 1. 找 profile ──────────────────────────────────────────────────────────
if (-not $Profile) {
  $dshHome = Join-Path $env:USERPROFILE '.dsh'
  $candidates = @()
  if (Test-Path (Join-Path $dshHome 'profiles')) {
    $candidates = Get-ChildItem (Join-Path $dshHome 'profiles') -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName 'package.json') }
  }
  if (-not $candidates) { Fail "没找到 DSH profile（~/.dsh/profiles/*/package.json）。先装好 DSH 再来，或用 -Profile 指定目录。" }
  $Profile = ($candidates | Where-Object { $_.Name -eq 'desktop' } | Select-Object -First 1).FullName
  if (-not $Profile) { $Profile = $candidates[0].FullName }
}
if (-not (Test-Path (Join-Path $Profile 'package.json'))) { Fail "不是 DSH profile 目录：$Profile" }
Ok "profile: $Profile"

$pj = Join-Path $Profile 'package.json'
$dstPlugin = Join-Path $Profile "node_modules\$BundleName"

# ── 2. 卸载路径 ────────────────────────────────────────────────────────────
if ($Uninstall) {
  $raw = [IO.File]::ReadAllText($pj, [Text.Encoding]::UTF8) -replace '^\uFEFF',''
  $json = $raw | ConvertFrom-Json
  if ($json.dependencies.PSObject.Properties.Name -contains $BundleName) {
    $json.dependencies.PSObject.Properties.Remove($BundleName)
  }
  $bundles = @($json.dsh.profile.bundles) | Where-Object { $_ -ne $BundleName }
  $json.dsh.profile.bundles = $bundles
  $text = $json | ConvertTo-Json -Depth 12
  [IO.File]::WriteAllText($pj, $text, (New-Object Text.UTF8Encoding($false)))
  if (Test-Path $dstPlugin) { Remove-Item $dstPlugin -Recurse -Force }
  Ok "已卸载（重启 DSH 生效）"
  exit 0
}

# ── 3. 复制插件 ────────────────────────────────────────────────────────────
if (-not (Test-Path $SrcPlugin)) { Fail "找不到 $SrcPlugin —— 请在解压后的仓库根目录运行本脚本" }
$nodeModules = Join-Path $Profile 'node_modules'
New-Item -ItemType Directory -Force -Path $nodeModules | Out-Null
if (Test-Path $dstPlugin) { Remove-Item $dstPlugin -Recurse -Force }
Copy-Item $SrcPlugin $dstPlugin -Recurse -Force
Ok "插件已复制到 node_modules\$BundleName"

# ── 4. 改 package.json（先备份，BOM 安全）──────────────────────────────────
$backup = "$pj.bak-quickstart"
Copy-Item $pj $backup -Force
Ok "已备份 package.json → $([IO.Path]::GetFileName($backup))"

$raw = [IO.File]::ReadAllText($pj, [Text.Encoding]::UTF8) -replace '^\uFEFF',''
$json = $raw | ConvertFrom-Json
if (-not $json.dsh) { Fail "这个 profile 的 package.json 里没有 dsh 字段，不像 DSH profile" }
if (-not $json.dsh.profile) { $json.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{ bundles = @() }) }

# 依赖
if (-not ($json.dependencies.PSObject.Properties.Name -contains $BundleName)) {
  $json.dependencies | Add-Member -NotePropertyName $BundleName -NotePropertyValue "file:./node_modules/$BundleName"
  Ok "已登记依赖 $BundleName"
} else { Info "依赖已存在，跳过" }

# bundle 列表
$bundles = @($json.dsh.profile.bundles)
if ($bundles -notcontains $BundleName) {
  $json.dsh.profile.bundles = @($bundles + $BundleName)
  Ok "已加入 bundle 列表"
} else { Info "bundle 已在列表里，跳过" }

$text = $json | ConvertTo-Json -Depth 12
[IO.File]::WriteAllText($pj, $text, (New-Object Text.UTF8Encoding($false)))
Ok "package.json 已更新"

# ── 5. 收尾提示 ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  装好了。下一步：" -ForegroundColor Cyan
Write-Host "    1) 重启 DSH（完全退出再开）"
Write-Host "    2) 新建一个会话，对它说：帮我搭个 AI 伙伴"
Write-Host "    3) 它会先跑体检（companion_doctor），再一步步问你要人格和记忆"
Write-Host ""
Write-Host "  想卸载：powershell -ExecutionPolicy Bypass -File install\quickstart.ps1 -Uninstall" -ForegroundColor DarkGray
Write-Host "  出问题：把 $backup 覆盖回 package.json 即可恢复原状" -ForegroundColor DarkGray
