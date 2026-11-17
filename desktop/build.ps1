[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework compiler was not found. Build on Windows 10/11 with .NET Framework 4.8.' }

# Use the repository's existing brand artwork, embedded as PNG inside a Windows ICO.
Add-Type -AssemblyName System.Drawing
$source = Join-Path $repo 'public\brand\hll-logo.png'
$icon = Join-Path $dist 'hll.ico'
if (Test-Path -LiteralPath $source) {
    $image = [Drawing.Image]::FromFile($source)
    $bitmap = New-Object Drawing.Bitmap 256,256
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $memory = New-Object IO.MemoryStream
    try {
        $graphics.Clear([Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $scale = [Math]::Min(240.0 / $image.Width, 240.0 / $image.Height)
        $w = [int]($image.Width * $scale); $h = [int]($image.Height * $scale)
        $graphics.DrawImage($image, [int]((256-$w)/2), [int]((256-$h)/2), $w, $h)
        $bitmap.Save($memory, [Drawing.Imaging.ImageFormat]::Png)
        $png = $memory.ToArray()
        $writer = New-Object IO.BinaryWriter ([IO.File]::Create($icon))
        try {
            $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
            $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([UInt16]1); $writer.Write([UInt16]32)
            $writer.Write([UInt32]$png.Length); $writer.Write([UInt32]22); $writer.Write($png)
        } finally { $writer.Dispose() }
    } finally { $memory.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $image.Dispose() }
}
$output = Join-Path $dist 'HLL-Broadcast.exe'
$arguments = @('/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/utf8output', "/out:$output",
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
    '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll')
if (Test-Path -LiteralPath $icon) { $arguments += "/win32icon:$icon" }
$arguments += Join-Path $PSScriptRoot 'launcher\HllLauncher.cs'
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw "Launcher compilation failed ($LASTEXITCODE)." }
$size = (Get-Item -LiteralPath $output).Length
if ($size -ge 1MB) { throw "Launcher exceeds the expected 1 MB budget: $size bytes." }
# The social edition is the same launcher with another name; the launcher reads its own file name.
$social = Join-Path $dist 'HLL-Social.exe'
Copy-Item -LiteralPath $output -Destination $social -Force
Write-Host "Built $output ($size bytes) and $social"
