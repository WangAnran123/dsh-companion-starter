<#
.SYNOPSIS
  命令行念一句话（Breeze TTS）。给桌面 AI / 脚本调用。
.EXAMPLE
  .\say.ps1 "我回来了"
  .\say.ps1 "只生成不播放" -NoPlay
#>
param(
  [Parameter(Mandatory = $true)][string]$Text,
  [string]$VoiceId = $env:BREEZE_VOICE_ID,
  [string]$KeyFile = $(if ($env:BREEZE_KEY_FILE) { $env:BREEZE_KEY_FILE } else { "$env:USERPROFILE\.breeze\breeze_key.txt" }),
  [switch]$NoPlay
)

$ErrorActionPreference = 'Stop'
if (-not $VoiceId) { throw '没有 VoiceId：设置环境变量 BREEZE_VOICE_ID 或加 -VoiceId 参数' }
if (-not (Test-Path $KeyFile)) { throw "找不到 Key 文件：$KeyFile" }
$key = (Get-Content $KeyFile -Raw).Trim()
if (-not $key) { throw "Key 文件是空的：$KeyFile" }

$body = @{
  text            = $Text
  language_code   = 'zh'
  model_id        = 'breeze-tts-2'
  voice_settings  = @{ speed = 1.0 }
} | ConvertTo-Json -Depth 5

$tmp = Join-Path $env:TEMP ("say_" + [guid]::NewGuid().ToString('N') + '.mp3')
try {
  Invoke-WebRequest -Uri "https://api.breeze.blue/v1/text-to-speech/$VoiceId" -Method Post `
    -Headers @{ 'xi-api-key' = $key; 'content-type' = 'application/json' } `
    -Body $body -OutFile $tmp -TimeoutSec 180
  if ((Get-Item $tmp).Length -lt 2000) { throw '返回的音频太小，可能没合成成功' }
  if (-not $NoPlay) {
    $p = New-Object System.Media.SoundPlayer
    # mp3 不能直接 SoundPlayer，用系统默认播放器
    Start-Process -FilePath $tmp -WindowStyle Hidden
    Write-Host "播放中: $tmp"
  } else {
    Write-Host "已生成: $tmp"
  }
} catch {
  Write-Error "合成失败（不回落其它音色）: $($_.Exception.Message)"
  exit 1
}
