param([Parameter(Mandatory=$true)][string]$SourceDirectory)
$ErrorActionPreference='Stop'
$workspacePath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath=[IO.Path]::GetFullPath($SourceDirectory)
if (-not (Test-Path -LiteralPath (Join-Path $sourcePath 'outlets.csv')) -and (Test-Path -LiteralPath (Join-Path $sourcePath 'General Data') -PathType Container)) {
    $sourcePath=Join-Path $sourcePath 'General Data'
}
$privatePath=Join-Path $workspacePath 'data/private/network'
New-Item -ItemType Directory -Force -Path $privatePath | Out-Null
$files=@('calendar.csv','district_travel.csv','outlets.csv','road_conditions.csv','service_allowance.csv','traffic_speed.csv','vehicles.csv')
foreach($file in $files) {
    $inputFile=Join-Path $sourcePath $file
    if(-not(Test-Path -LiteralPath $inputFile -PathType Leaf)) { throw "Missing source: $file" }
    Copy-Item -LiteralPath $inputFile -Destination (Join-Path $privatePath $file)
}
docker run --rm --mount "type=bind,source=$workspacePath,target=/workspace" python:3.12-slim python /workspace/tools/import_network.py /workspace/data/private/network /workspace/data/private/shared-network.sql
if($LASTEXITCODE -ne 0) { throw 'Network validation/import generation failed. Do not start with an invalid generated import.' }
Write-Output 'Private network import prepared. Raw files and generated SQL are gitignored; Compose mounts the import read-only.'
