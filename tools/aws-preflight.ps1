param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z]{2}(-[a-z]+)+-[0-9]+$')][string]$Region,
    [string]$Profile,
    [Parameter(Mandatory)][ValidatePattern('^[0-9]{12}$')][string]$ExpectedAccountId
)

$ErrorActionPreference = 'Stop'
$awsCommand = Get-Command aws -ErrorAction SilentlyContinue
$awsExecutable = if ($awsCommand) { $awsCommand.Source } else {
    @("$env:ProgramFiles/Amazon/AWSCLIV2/aws.exe", "$env:LOCALAPPDATA/Programs/Amazon/AWSCLIV2/aws.exe") |
        Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $awsExecutable) {
    throw 'AWS CLI v2 is unavailable. Install it and configure an authorized profile or SSO session first. Never paste credentials into chat.'
}
$awsArguments = @('--region', $Region, '--no-cli-pager')
if ($Profile) { $awsArguments += @('--profile', $Profile) }
$identityJson = & $awsExecutable sts get-caller-identity @awsArguments --output json
if ($LASTEXITCODE -ne 0) { throw 'AWS authentication failed. Authenticate the selected profile and retry.' }
$identity = $identityJson | ConvertFrom-Json
if ($identity.Account -ne $ExpectedAccountId) { throw 'Authenticated AWS account does not match the requested deployment account. No resources were changed.' }
Write-Output "Verified AWS account: $($identity.Account)"
Write-Output "Region: $Region"
Write-Output 'Read-only preflight passed. This does not verify provisioning permissions, service quotas or budget.'
