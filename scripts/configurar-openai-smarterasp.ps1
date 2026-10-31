[CmdletBinding()]
param(
    [string]$PackagePath = (Join-Path $PSScriptRoot "..\artifacts\smarterasp"),

    [string]$ConfigurationPath = (Join-Path $PSScriptRoot "..\artifacts\smarterasp.private\appsettings.Production.json"),

    [string]$ModeloSimple = "gpt-6-luna",

    [string]$ModeloAnalisis = "gpt-6-sol",

    [string]$ModeloAgroBot = "gpt-6-luna"
)

$ErrorActionPreference = "Stop"
$package = [System.IO.Path]::GetFullPath($PackagePath)
$configurationPath = [System.IO.Path]::GetFullPath($ConfigurationPath)
$packagePrefix = $package.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar

if ($configurationPath.StartsWith($packagePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ConfigurationPath no puede estar dentro de '$package'. La configuración con secretos debe mantenerse fuera del paquete publicable."
}

if (-not (Test-Path $configurationPath)) {
    throw "No se encontró '$configurationPath'. Ejecute primero .\scripts\configurar-publicacion-smarterasp.ps1."
}

# La clave nunca se pasa por argumento: así no queda en el historial de PowerShell.
$secureApiKey = Read-Host "Clave de OpenAI" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)

try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        throw "La clave de OpenAI no puede estar vacía."
    }

    $configuration = Get-Content -LiteralPath $configurationPath -Raw | ConvertFrom-Json
    $configuration | Add-Member -NotePropertyName OpenAI -NotePropertyValue ([pscustomobject]@{
        ApiKey = $apiKey
    }) -Force
    $configuration | Add-Member -NotePropertyName ReporteriaIA -NotePropertyValue ([pscustomobject]@{
        ModeloSimple = $ModeloSimple
        ModeloAnalisis = $ModeloAnalisis
    }) -Force
    $configuration | Add-Member -NotePropertyName AgroBot -NotePropertyValue ([pscustomobject]@{
        Modelo = $ModeloAgroBot
    }) -Force

    $json = $configuration | ConvertTo-Json -Depth 8
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($configurationPath, $json, $utf8WithoutBom)

    Write-Host "OpenAI quedó configurado en la configuración privada."
    Write-Host "No agregue appsettings.Production.json a Git, no lo incluya en artifacts\\smarterasp ni comparta el archivo. Cargue OpenAI__ApiKey como variable de entorno del Application Pool en SmarterASP."
}
finally {
    if ($keyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }
}
