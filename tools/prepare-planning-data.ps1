param([Parameter(Mandatory=$true)][string]$SourceDirectory)
$ErrorActionPreference='Stop'
$workspacePath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath=[IO.Path]::GetFullPath($SourceDirectory)
foreach($file in @('General Data/outlets.csv','General Data/calendar.csv','Test Data/task2b_peak_day_scenarios.csv','Test Data/task2b_peak_day_fleet.csv')) {
    if(-not(Test-Path -LiteralPath (Join-Path $sourcePath $file))) {throw "Missing source: $file"}
}
# Start the routing profile first. No source rows are sent to a public routing service.
docker run --rm --network waypoint_default --mount "type=bind,source=$workspacePath,target=/workspace" --mount "type=bind,source=$sourcePath,target=/source,readonly" python:3.12-slim python /workspace/tools/prepare_planning.py /source /workspace/data/private/planning-scenario.sql http://osrm:5000
if($LASTEXITCODE -ne 0){throw 'Private planning import failed. Do not run a judge walkthrough with incomplete source data.'}
Write-Output 'Private S1 import ready. Start/restart core to load it. Supplemental road points and cold capabilities are labelled.'
