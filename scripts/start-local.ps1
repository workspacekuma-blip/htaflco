# Restarts the local environment prepared during verification. Does not initialize or erase databases.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot
$toolsRoot = Join-Path (Split-Path $projectRoot) '.local-tools'
$postgresBin = Join-Path $toolsRoot 'pg-runtime/pgsql/bin/pg_ctl.exe'
$postgresData = Join-Path $toolsRoot 'pg-data'
$runtimeNode = (Get-Command node).Source
if (!(Test-Path $postgresBin) -or !(Test-Path "$projectRoot/api/.env")) {
  throw 'This helper requires the prepared portable PostgreSQL runtime and api/.env. For another machine, use the README setup.'
}
& $postgresBin -D $postgresData status | Out-Null
if ($LASTEXITCODE) {
  & $postgresBin -D $postgresData -l "$toolsRoot/postgres.log" -o '-h 127.0.0.1 -p 5432' -w start
  if ($LASTEXITCODE) { throw 'PostgreSQL did not start' }
}
function Test-LocalPort([int]$port) {
  $client = [Net.Sockets.TcpClient]::new()
  try { $client.Connect('localhost', $port); return $true } catch { return $false } finally { $client.Dispose() }
}
function Start-LocalNode([string]$name, [string]$directory, [string[]]$arguments) {
  Start-Process -FilePath $runtimeNode -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden `
    -RedirectStandardOutput "$toolsRoot/$name.log" -RedirectStandardError "$toolsRoot/$name.err.log" | Out-Null
}
if (!(Test-LocalPort 3000)) { Start-LocalNode 'api' "$projectRoot/api" @("`"$projectRoot/api/node_modules/tsx/dist/cli.mjs`"", 'watch', 'src/server.ts') }
if (!(Test-LocalPort 3001)) { Start-LocalNode 'web' "$projectRoot/web" @("`"$projectRoot/web/node_modules/next/dist/bin/next`"", 'dev', '-p', '3001', '-H', 'localhost') }
if (!(Test-LocalPort 9000)) { Start-LocalNode 's3' "$toolsRoot/s3" @('start.cjs') }
# Ranking is a long-running worker with no listening port.
$workers = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -like '*htafl-site/api/node_modules/tsx/dist/cli.mjs*src/ranking/worker.ts*'
}
if (!$workers) { Start-LocalNode 'rank' "$projectRoot/api" @("`"$projectRoot/api/node_modules/tsx/dist/cli.mjs`"", 'src/ranking/worker.ts') }
Write-Output 'HTAFL local services started. Website: http://localhost:3001. Logs: ../.local-tools/*.log'
