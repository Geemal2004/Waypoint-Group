param([string]$SourceUrl='https://download.geofabrik.de/asia/sri-lanka-261001.osm.pbf')
$ErrorActionPreference='Stop'
$workspacePath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$routingPath=Join-Path $workspacePath 'data/osrm'
New-Item -ItemType Directory -Force -Path $routingPath | Out-Null
$pbfPath=Join-Path $routingPath 'sri-lanka.osm.pbf'
$manifestPath=Join-Path $routingPath 'provenance.json'
if(-not(Test-Path -LiteralPath $pbfPath)) {
    Invoke-WebRequest -Uri $SourceUrl -OutFile $pbfPath
}
$md5Text=(Invoke-WebRequest -Uri ($SourceUrl+'.md5')).Content
$md5String=if($md5Text -is [byte[]]) {[Text.Encoding]::UTF8.GetString($md5Text)} else {[string]$md5Text}
$expectedMd5=$md5String.Trim().Split(' ')[0]
if((Get-FileHash -LiteralPath $pbfPath -Algorithm MD5).Hash.ToLowerInvariant() -ne $expectedMd5.ToLowerInvariant()) {throw 'OSM snapshot checksum mismatch; routing preparation stopped.'}
$imageName='ghcr.io/project-osrm/osrm-backend:v5.27.1'
foreach($stage in @('osrm-extract','osrm-partition','osrm-customize')) {
    $arguments=@('run','--rm','--mount',"type=bind,source=$routingPath,target=/data",$imageName,$stage)
    if($stage -eq 'osrm-extract') {$arguments+=@('-p','/opt/car.lua','/data/sri-lanka.osm.pbf','--threads','2')}
    else {$arguments+=@('/data/sri-lanka.osrm','--threads','2')}
    & docker @arguments
    if($LASTEXITCODE -ne 0) {throw "Routing preparation failed at $stage. No readiness manifest was written."}
}
$imageDigest=(& docker image inspect $imageName --format '{{index .RepoDigests 0}}')
@{sourceUrl=$SourceUrl;sha256=(Get-FileHash -LiteralPath $pbfPath -Algorithm SHA256).Hash;md5=$expectedMd5;image=$imageDigest;profile='car';algorithm='MLD';preparedAt=[DateTime]::UtcNow.ToString('o');attribution='© OpenStreetMap contributors, ODbL; extract by Geofabrik'} | ConvertTo-Json | Set-Content $manifestPath
Write-Output 'Sri Lanka OSRM graph prepared. Start with docker compose --profile routing up --build -d --wait.'
