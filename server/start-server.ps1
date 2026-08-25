param(
  [string]$EnvironmentFile = (Join-Path $PSScriptRoot '.env')
)

$ErrorActionPreference = 'Stop'

if (Test-Path -LiteralPath $EnvironmentFile) {
  foreach ($line in Get-Content -LiteralPath $EnvironmentFile -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }

    $separator = $trimmed.IndexOf('=')
    if ($separator -lt 1) { continue }

    $name = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

if (-not $env:TODO_DATABASE_PATH) {
  $env:TODO_DATABASE_PATH = Join-Path $PSScriptRoot 'database\todo_app.db'
}
if (-not $env:TODO_UPLOADS_PATH) {
  $env:TODO_UPLOADS_PATH = Join-Path $PSScriptRoot 'uploads'
}
if (-not $env:TODO_UPDATES_PATH) {
  $env:TODO_UPDATES_PATH = Join-Path $PSScriptRoot 'updates'
}

$node = (Get-Command node -ErrorAction Stop).Source
Set-Location -LiteralPath $PSScriptRoot
& $node (Join-Path $PSScriptRoot 'index.js')
exit $LASTEXITCODE
