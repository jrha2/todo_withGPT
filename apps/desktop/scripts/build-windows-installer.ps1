$ErrorActionPreference = 'Stop'

$projectDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$toolDirectory = Join-Path $projectDirectory '.build-tools'
$electronArchive = Join-Path $projectDirectory 'electron-v43.2.0-win32-x64.zip'
$nsisDirectory = Join-Path $toolDirectory 'nsis'
$nsisResourcesDirectory = Join-Path $toolDirectory 'nsis-resources'
$sevenZip = Join-Path $toolDirectory '7zip\7zip\bin\7za.exe'
$asarCli = Join-Path $projectDirectory 'node_modules\.bin\asar.cmd'

function Assert-RendererBuild {
  $indexPath = Join-Path $projectDirectory 'dist\index.html'
  $assetDirectory = Join-Path $projectDirectory 'dist\assets'

  if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    throw "Renderer build is missing index.html: $indexPath"
  }
  if (-not (Test-Path -LiteralPath $assetDirectory -PathType Container)) {
    throw "Renderer build is missing the assets directory: $assetDirectory"
  }

  $javascriptAssets = @(Get-ChildItem -LiteralPath $assetDirectory -File -Filter '*.js')
  $cssAssets = @(Get-ChildItem -LiteralPath $assetDirectory -File -Filter '*.css')
  if ($javascriptAssets.Count -eq 0 -or $cssAssets.Count -eq 0) {
    throw 'Renderer build must contain at least one JavaScript asset and one CSS asset.'
  }

  Write-Host "Verified renderer build: index.html, $($javascriptAssets.Count) JS, $($cssAssets.Count) CSS"
}

function Assert-AsarRenderer {
  param(
    [Parameter(Mandatory = $true)][string]$AsarPath,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (-not (Test-Path -LiteralPath $AsarPath -PathType Leaf)) {
    throw "$Label app.asar was not found: $AsarPath"
  }
  if (-not (Test-Path -LiteralPath $asarCli -PathType Leaf)) {
    throw "asar CLI was not found: $asarCli"
  }

  $listing = @(& $asarCli list $AsarPath 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "$Label app.asar could not be listed: $($listing -join [Environment]::NewLine)"
  }

  $normalizedListing = @($listing | ForEach-Object {
    ([string]$_).Replace('\', '/').Trim()
  })
  $hasIndex = @($normalizedListing | Where-Object {
    $_ -match '^/?dist/index\.html$'
  }).Count -gt 0
  $javascriptAssets = @($normalizedListing | Where-Object {
    $_ -match '^/?dist/assets/.+\.js$'
  })
  $cssAssets = @($normalizedListing | Where-Object {
    $_ -match '^/?dist/assets/.+\.css$'
  })

  if (-not $hasIndex -or $javascriptAssets.Count -eq 0 -or $cssAssets.Count -eq 0) {
    throw "$Label app.asar is missing renderer payload (index=$hasIndex, js=$($javascriptAssets.Count), css=$($cssAssets.Count)): $AsarPath"
  }

  Write-Host "Verified $Label app.asar renderer: index.html, $($javascriptAssets.Count) JS, $($cssAssets.Count) CSS"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'generate-icon.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Assert-RendererBuild

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
$arguments = @('--win', 'nsis', '--publish', 'never')
if (Test-Path -LiteralPath $electronArchive) {
  $arguments += '--config.electronDist=.'
}

& $builder @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectDirectory 'package.json') | ConvertFrom-Json
$artifactName = $package.build.win.artifactName.Replace('${version}', [string]$package.version).Replace('${ext}', 'exe')
$installer = Join-Path $projectDirectory (Join-Path 'release' $artifactName)
$blockmap = "$installer.blockmap"
$updateChannel = 'latest'
if ([string]$package.version -match '-([a-zA-Z]+)') {
  $updateChannel = $Matches[1].ToLowerInvariant()
}
$metadata = Join-Path $projectDirectory "release\$updateChannel.yml"

foreach ($artifact in @($installer, $blockmap, $metadata)) {
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
    throw "Automatic update artifact was not generated: $artifact"
  }
}

$unpackedAsar = Join-Path $projectDirectory 'release\win-unpacked\resources\app.asar'
Assert-AsarRenderer -AsarPath $unpackedAsar -Label 'win-unpacked'

if (-not (Test-Path -LiteralPath $sevenZip -PathType Leaf)) {
  throw "7-Zip is required to verify the installer payload: $sevenZip"
}
$verificationDirectory = Join-Path $projectDirectory "release\.installer-verification-$PID"
New-Item -ItemType Directory -Force -Path $verificationDirectory | Out-Null
try {
  $extractionOutput = @(
    & $sevenZip e -y "-o$verificationDirectory" $installer 'resources\app.asar' 2>&1
  )
  if ($LASTEXITCODE -ne 0) {
    throw "Installer app.asar extraction failed: $($extractionOutput -join [Environment]::NewLine)"
  }

  $installerAsar = Join-Path $verificationDirectory 'app.asar'
  Assert-AsarRenderer -AsarPath $installerAsar -Label 'NSIS installer'
} finally {
  if (Test-Path -LiteralPath $verificationDirectory) {
    Remove-Item -LiteralPath $verificationDirectory -Recurse -Force
  }
}

$checksumPath = "$installer.sha256.txt"
$hashStream = [System.IO.File]::OpenRead($installer)
try {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($hashStream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
} finally {
  $hashStream.Dispose()
}
Set-Content -LiteralPath $checksumPath -Value "$hash  $(Split-Path $installer -Leaf)" -Encoding UTF8

# Publish only after every renderer and artifact check has passed. Metadata is copied
# last so clients never observe a version before its installer and blockmap exist.
$repositoryDirectory = (Resolve-Path -LiteralPath (Join-Path $projectDirectory '..\..')).Path
$updateDirectory = Join-Path $repositoryDirectory 'server\updates'
New-Item -ItemType Directory -Force -Path $updateDirectory | Out-Null
Copy-Item -LiteralPath $installer -Destination $updateDirectory -Force
Copy-Item -LiteralPath $blockmap -Destination $updateDirectory -Force
Copy-Item -LiteralPath $metadata -Destination (Join-Path $updateDirectory "$updateChannel.yml") -Force
if ($updateChannel -eq 'latest') {
  Copy-Item -LiteralPath $metadata -Destination (Join-Path $updateDirectory 'beta.yml') -Force
}

Write-Host "Installer: $installer"
Write-Host "SHA256: $hash"
Write-Host "Update files: $updateDirectory"
