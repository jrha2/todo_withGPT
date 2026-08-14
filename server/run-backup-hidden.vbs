Option Explicit

Dim shell, fileSystem, scriptDirectory, command, exitCode
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

scriptDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ _
  & fileSystem.BuildPath(scriptDirectory, "backup-server.ps1") & """"

exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
