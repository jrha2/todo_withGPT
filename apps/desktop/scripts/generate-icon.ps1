$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class InvestmentPlanningWorkspaceIconNative {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool DestroyIcon(IntPtr handle);
}
'@

$outputDirectory = Join-Path $PSScriptRoot '..\build'
$iconPath = Join-Path $outputDirectory 'icon.ico'
$pngPath = Join-Path $outputDirectory 'icon.png'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$shape = New-Object System.Drawing.Drawing2D.GraphicsPath
$shape.AddArc(16, 16, 96, 96, 180, 90)
$shape.AddArc(144, 16, 96, 96, 270, 90)
$shape.AddArc(144, 144, 96, 96, 0, 90)
$shape.AddArc(16, 144, 96, 96, 90, 90)
$shape.CloseFigure()

$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point 30, 24),
  (New-Object System.Drawing.Point 226, 232),
  ([System.Drawing.Color]::FromArgb(118, 103, 242)),
  ([System.Drawing.Color]::FromArgb(81, 64, 209))
)
$graphics.FillPath($gradient, $shape)

$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 24
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawLines($pen, [System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point 73, 132),
  (New-Object System.Drawing.Point 109, 169),
  (New-Object System.Drawing.Point 187, 82)
))

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$iconHandle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()

[InvestmentPlanningWorkspaceIconNative]::DestroyIcon($iconHandle) | Out-Null
$pen.Dispose()
$gradient.Dispose()
$shape.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Application icon: $iconPath"
