$ErrorActionPreference = 'Stop'

$projectDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$toolDirectory = Join-Path $projectDirectory '.build-tools'
$electronArchive = Join-Path $projectDirectory 'electron-v43.2.0-win32-x64.zip'
$nsisDirectory = Join-Path $toolDirectory 'nsis'
$nsisResourcesDirectory = Join-Path $toolDirectory 'nsis-resources'
$sevenZip = Join-Path $toolDirectory '7zip\7zip\bin\7za.exe'

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'generate-icon.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (Test-Path -LiteralPath (Join-Path $nsisDirectory 'makensis.exe')) {
  $env:ELECTRON_BUILDER_NSIS_DIR = $nsisDirectory
}
if (Test-Path -LiteralPath $nsisResourcesDirectory) {
  $env:ELECTRON_BUILDER_NSIS_RESOURCES_DIR = $nsisResourcesDirectory
}
if (Test-Path -LiteralPath $sevenZip) {
  $env:ELECTRON_BUILDER_7ZIP_PATH = $sevenZip
}

$builder = Join-Path $projectDirectory 'node_modules\.bin\electron-builder.cmd'
$arguments = @('--win', 'nsis')
if (Test-Path -LiteralPath $electronArchive) {
  $arguments += '--config.electronDist=.'
}

& $builder @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectDirectory 'package.json') | ConvertFrom-Json
$artifactName = $package.build.win.artifactName.Replace('${version}', [string]$package.version).Replace('${ext}', 'exe')
$installer = Join-Path $projectDirectory (Join-Path 'release' $artifactName)
$checksumPath = "$installer.sha256.txt"
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $checksumPath -Value "$hash  $(Split-Path $installer -Leaf)" -Encoding ASCII
Write-Host "Installer: $installer"
Write-Host "SHA256: $hash"
