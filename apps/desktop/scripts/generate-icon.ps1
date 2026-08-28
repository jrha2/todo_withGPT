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
$trayIconPath = Join-Path $outputDirectory 'tray-icon.png'
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

# Windows notification icons are rendered at a very small size. Draw this asset
# directly at 32 px with a dark fill, bright outline, and thick white check so it
# remains visible on both light and dark taskbars instead of relying on SVG resize.
$trayBitmap = New-Object System.Drawing.Bitmap 32, 32
$trayGraphics = [System.Drawing.Graphics]::FromImage($trayBitmap)
$trayGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$trayGraphics.Clear([System.Drawing.Color]::Transparent)

$trayShape = New-Object System.Drawing.Drawing2D.GraphicsPath
$trayShape.AddArc(2, 2, 10, 10, 180, 90)
$trayShape.AddArc(20, 2, 10, 10, 270, 90)
$trayShape.AddArc(20, 20, 10, 10, 0, 90)
$trayShape.AddArc(2, 20, 10, 10, 90, 90)
$trayShape.CloseFigure()

$trayFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(7, 52, 58))
$trayBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45, 212, 232)), 2
$trayGraphics.FillPath($trayFill, $trayShape)
$trayGraphics.DrawPath($trayBorder, $trayShape)

$trayCheck = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 3.2
$trayCheck.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$trayCheck.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$trayCheck.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$trayGraphics.DrawLines($trayCheck, [System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point 9, 16),
  (New-Object System.Drawing.Point 14, 21),
  (New-Object System.Drawing.Point 24, 10)
))

$trayBitmap.Save($trayIconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$trayCheck.Dispose()
$trayBorder.Dispose()
$trayFill.Dispose()
$trayShape.Dispose()
$trayGraphics.Dispose()
$trayBitmap.Dispose()

Write-Host "Application icon: $iconPath"
Write-Host "System tray icon: $trayIconPath"
