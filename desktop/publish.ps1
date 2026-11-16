[CmdletBinding()]
param([string]$Version = '1.0.0')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'build.ps1')
$site = Join-Path $repo 'cloud\download'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dist\HLL-Broadcast.exe') -Destination (Join-Path $site 'HLL-Broadcast.exe') -Force
$sha = & git -C $repo rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not read the local Git revision.' }
$release = [ordered]@{ version = $Version; date = [DateTime]::UtcNow.ToString('yyyy-MM-dd'); sha = $sha.Trim() }
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $site 'version.json'), ($release | ConvertTo-Json) + "`n", $utf8)

Push-Location $repo
try {
    # A failed list (for example, missing login) must not be mistaken for a missing project.
    $listOutput = & npx --yes wrangler pages project list --json
    if ($LASTEXITCODE -ne 0) { throw 'Could not list Cloudflare Pages projects. Run npx wrangler login and retry.' }
    $projects = ($listOutput -join "`n") | ConvertFrom-Json
    if (!($projects | Where-Object { $_.'Project Name' -eq 'hll-broadcast' -or $_.name -eq 'hll-broadcast' })) {
        & npx --yes wrangler pages project create hll-broadcast --production-branch main --force
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the Cloudflare Pages project.' }
    }
    & npx --yes wrangler pages deploy cloud/download --project-name hll-broadcast --branch main --force
    if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Pages deployment failed.' }
} finally { Pop-Location }
