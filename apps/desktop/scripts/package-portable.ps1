$ErrorActionPreference = 'Stop'

$projectDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sourceDirectory = Join-Path $projectDirectory 'release\win-unpacked'
$package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectDirectory 'package.json') | ConvertFrom-Json
$archiveName = '{0}-{1}-win-x64.zip' -f $package.productName, $package.version
$archivePath = Join-Path $projectDirectory (Join-Path 'release' $archiveName)
$checksumPath = "$archivePath.sha256.txt"

if (-not (Test-Path -LiteralPath $sourceDirectory)) {
  throw "Packaged application directory was not found: $sourceDirectory"
}

if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}
if (Test-Path -LiteralPath $checksumPath) {
  Remove-Item -LiteralPath $checksumPath -Force
}

Compress-Archive -Path (Join-Path $sourceDirectory '*') -DestinationPath $archivePath -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $checksumPath -Value "$hash  $(Split-Path $archivePath -Leaf)" -Encoding ASCII

Write-Host "Portable package: $archivePath"
Write-Host "SHA256: $hash"
