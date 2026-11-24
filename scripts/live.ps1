<#
.SYNOPSIS
  往「三端实时流水」里追加一行。桌面 AI / QQ / 抖音共用这一份，互相知道对方刚说了什么。
.EXAMPLE
  .\live.ps1 -Text "哥问 iRacing 能不能连" -Who "我(DSH)"
#>
param(
  [Parameter(Mandatory = $true)][string]$Text,
  [string]$Who = '我',
  [string]$File = $(if ($env:BRIDGE_LIVE_FILE) { $env:BRIDGE_LIVE_FILE } else { "$env:USERPROFILE\.dsh\shared\bridge-live.md" })
)
$ErrorActionPreference = 'Stop'
$dir = Split-Path $File -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$line = "- [$((Get-Date).ToString('MM-dd HH:mm'))] $Who`: $Text"
Add-Content -Path $File -Value $line -Encoding UTF8
# 只保留最近 200 行
$all = Get-Content $File -Encoding UTF8
if ($all.Count -gt 200) { $all[-200..-1] | Set-Content $File -Encoding UTF8 }
Write-Host "live +1  $line"
