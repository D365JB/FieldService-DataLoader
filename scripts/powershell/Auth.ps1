<#
.SYNOPSIS
    Authenticate the Power Platform CLI to a Dataverse environment.

.DESCRIPTION
    Wraps `pac auth create` for Windows users running the loader interactively.
    For CI / non-interactive flows use service principal env vars instead.

.EXAMPLE
    .\Auth.ps1 -EnvUrl https://orgname.crm.dynamics.com
#>
param(
    [Parameter(Mandatory)] [string] $EnvUrl,
    [string] $Name = "fsloader"
)

if (-not (Get-Command pac -ErrorAction SilentlyContinue)) {
    throw "pac CLI not found. Install: https://learn.microsoft.com/power-platform/developer/cli/introduction"
}

pac auth create --url $EnvUrl --name $Name
pac auth select --name $Name
pac org who
