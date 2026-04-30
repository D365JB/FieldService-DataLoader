<#
.SYNOPSIS
    Import the Tier 1 configuration bundle via Power Platform CLI.

.DESCRIPTION
    Wraps `pac data import` against config/data/fs-config-data.zip.
    Requires Windows; use `--use-webapi-config` on the Python orchestrator
    for a Linux-compatible (slower, partial) fallback.
#>
param(
    [string] $BundlePath = "$PSScriptRoot/../../config/data/fs-config-data.zip"
)

if (-not (Test-Path $BundlePath)) {
    throw "Config bundle not found: $BundlePath"
}

if (-not (Get-Command pac -ErrorAction SilentlyContinue)) {
    throw "pac CLI not found."
}

pac data import --data $BundlePath
