[CmdletBinding()]
param([string]$InstallHome, [int]$Port = 0, [switch]$Social)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build.ps1')
if (!$InstallHome) { $InstallHome = Join-Path $PSScriptRoot ('test-install-' + [Guid]::NewGuid().ToString('N')) }
$InstallHome = [IO.Path]::GetFullPath($InstallHome)
if ($Port -eq 4610) { throw 'Tests must not use port 4610.' }
if ($Port -eq 0) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $Port = $listener.LocalEndpoint.Port
    $listener.Stop()
}
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Choose a valid TCP port.' }
New-Item -ItemType Directory -Force -Path $InstallHome | Out-Null
$resultPath = Join-Path $InstallHome 'smoke-result.json'
if (Test-Path -LiteralPath $resultPath) { Remove-Item -LiteralPath $resultPath }
$launcher = Join-Path $PSScriptRoot $(if ($Social) { 'dist\HLL-Social.exe' } else { 'dist\HLL-Broadcast.exe' })
$process = Start-Process -FilePath $launcher -ArgumentList @('--home', ('"' + $InstallHome + '"'), '--port', $Port, '--smoke-test') -WindowStyle Hidden -PassThru
Write-Host "Testing PID $($process.Id), home $InstallHome, port $Port"
while (!$process.WaitForExit(1000)) { } # Launcher logs progress and exits after its health check.
if (!(Test-Path -LiteralPath $resultPath)) { throw "Launcher exited without a result. Read $InstallHome\launcher.log" }
$result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
if ($process.ExitCode -ne 0 -or !$result.ok) { throw "Smoke test failed: $($result.error)" }
if ([bool]$result.socialOnly -ne [bool]$Social) { throw "Expected socialOnly=$([bool]$Social), got $($result.socialOnly)." }
if (!$result.ownedServer) { throw 'Test port was already serving HLL. Retry with an unused port.' }
if (!(Test-Path -LiteralPath (Join-Path $InstallHome 'node\node.exe'))) { throw 'Portable Node was not installed.' }
if (!(Test-Path -LiteralPath (Join-Path $InstallHome 'app\node_modules\express'))) { throw 'Dependencies were not installed.' }
if (!(Test-Path -LiteralPath (Join-Path $InstallHome 'app\data\db.json'))) { throw 'No initial database was created.' }
Write-Host "PASS: installed $($result.sha), started the owned server, /api/netinfo answered on $Port, then stopped only that server."
Write-Host "Logs and installation retained at $InstallHome"
