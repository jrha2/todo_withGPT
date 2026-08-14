param(
  [string]$ServerTaskName = '투자기획팀 업무관리 공간 서버',
  [string]$BackupTaskName = '투자기획팀 업무관리 공간 일일 백업'
)

$ErrorActionPreference = 'Stop'

$serverLauncher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'run-server-hidden.vbs')).Path
$backupLauncher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'run-backup-hidden.vbs')).Path
$wscript = (Get-Command wscript.exe -ErrorAction Stop).Source
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$serverAction = New-ScheduledTaskAction `
  -Execute $wscript `
  -Argument "`"$serverLauncher`"" `
  -WorkingDirectory $PSScriptRoot
$serverTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$serverPrincipal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited
$serverSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $ServerTaskName `
  -Action $serverAction `
  -Trigger $serverTrigger `
  -Principal $serverPrincipal `
  -Settings $serverSettings `
  -Description '투자기획팀 업무관리 공간 API 서버' `
  -Force | Out-Null

$backupAction = New-ScheduledTaskAction `
  -Execute $wscript `
  -Argument "`"$backupLauncher`"" `
  -WorkingDirectory $PSScriptRoot
$backupTrigger = New-ScheduledTaskTrigger -Daily -At '02:00'

Register-ScheduledTask `
  -TaskName $BackupTaskName `
  -Action $backupAction `
  -Trigger $backupTrigger `
  -Principal $serverPrincipal `
  -Settings $serverSettings `
  -Description '투자기획팀 업무관리 공간 SQLite 및 첨부파일 백업' `
  -Force | Out-Null

Write-Host "Installed scheduled task: $ServerTaskName"
Write-Host "Installed scheduled task: $BackupTaskName"
Write-Host 'The API server starts automatically when this Windows account signs in.'
