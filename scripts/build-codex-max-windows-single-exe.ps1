param(
  [string]$OutputDir = "",
  [string]$NodePath = ""
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
if (-not $OutputDir) {
  $OutputDir = Join-Path $repoRoot 'dist\windows\ChatGPT Win SingleExe'
}

if (Test-Path -LiteralPath $OutputDir) {
  Remove-Item -LiteralPath $OutputDir -Recurse -Force
}

& (Join-Path $repoRoot 'scripts\build-codex-max-windows.ps1') -OutputDir $OutputDir -NodePath $NodePath -SingleExe
Write-Host "Windows single exe: $(Join-Path $OutputDir 'ChatGPT Win.exe')"
