# RouterDeck installer for Windows.
#   irm https://router.pramitha.lk/install.ps1 | iex
# Downloads the latest release from GitHub
# (github.com/PramithaMJ/RouterDeck/releases), checks it against the
# published SHA-256 checksum, installs it for the current user and opens it.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = 'https://github.com/PramithaMJ/RouterDeck/releases/latest/download'
$name = 'RouterDeck-Windows-x64-Setup.exe'
$out = Join-Path $env:TEMP $name

Write-Host 'Downloading RouterDeck for Windows...' -ForegroundColor Cyan
Invoke-WebRequest -UseBasicParsing "$base/$name" -OutFile $out

try {
  $sums = (Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS.txt").Content
  $line = ($sums -split "`n") | Where-Object { $_ -match " $([regex]::Escape($name))\s*$" } | Select-Object -First 1
  if ($line) {
    $want = ($line -split '\s+')[0].ToLower()
    $got = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
    if ($want -ne $got) { Remove-Item $out; throw "Checksum mismatch for $name. Not installing." }
    Write-Host 'Checksum OK.'
  }
} catch [System.Net.WebException] { }

Unblock-File $out
Get-Process RouterDeck -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'Installing...' -ForegroundColor Cyan
Start-Process $out -ArgumentList '/S' -Wait
Remove-Item $out -ErrorAction SilentlyContinue

$exe = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Filter RouterDeck.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($exe) {
  Write-Host "Installed. Opening RouterDeck..." -ForegroundColor Green
  Start-Process $exe.FullName
} else {
  Write-Host 'Installed. Open RouterDeck from the Start menu.' -ForegroundColor Green
}
