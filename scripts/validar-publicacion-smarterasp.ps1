[CmdletBinding()]
param(
    [string]$PackagePath = (Join-Path $PSScriptRoot "..\artifacts\smarterasp")
)

$ErrorActionPreference = "Stop"
$package = [System.IO.Path]::GetFullPath($PackagePath)

function Require-File {
    param([string]$Path, [string]$Description)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Falta ${Description}: '$Path'. No suba el paquete."
    }
}

if (-not (Test-Path -LiteralPath $package -PathType Container)) {
    throw "No se encontró el paquete '$package'. Ejecute primero .\scripts\preparar-publicacion-smarterasp.ps1."
}

$apiDll = Join-Path $package "AgroDigital.Api.dll"
$webConfig = Join-Path $package "web.config"
$frontendEntry = Join-Path $package "wwwroot\index.html"
$productionExample = Join-Path $package "appsettings.Production.example.json"
$productionSettings = Join-Path $package "appsettings.Production.json"

Require-File $apiDll "la API publicada"
Require-File $webConfig "web.config de IIS"
Require-File $frontendEntry "el punto de entrada del frontend"
Require-File $productionExample "el ejemplo de configuración de producción"

if (Test-Path -LiteralPath $productionSettings -PathType Leaf) {
    throw "Se encontró '$productionSettings'. El paquete para subir no debe contener secretos; use la configuración protegida del hosting después de publicar."
}

[xml]$webConfigXml = Get-Content -LiteralPath $webConfig -Raw
$aspNetCore = $webConfigXml.SelectSingleNode("/configuration/location/system.webServer/aspNetCore | /configuration/system.webServer/aspNetCore")
if ($null -eq $aspNetCore -or $aspNetCore.GetAttribute("processPath") -ne "dotnet" -or $aspNetCore.GetAttribute("arguments") -notmatch 'AgroDigital\.Api\.dll') {
    throw "'$webConfig' no configura IIS para iniciar AgroDigital.Api.dll con dotnet."
}

$indexHtml = Get-Content -LiteralPath $frontendEntry -Raw
if ($indexHtml -notmatch '<div\s+id=["'']root["'']' -or $indexHtml -match '/src/main\.jsx') {
    throw "'$frontendEntry' no parece ser el frontend compilado de AgroDigital."
}

if (-not (Get-ChildItem -LiteralPath (Join-Path $package "wwwroot") -Recurse -File -Filter "*.js" | Select-Object -First 1)) {
    throw "No se encontró ningún bundle JavaScript en wwwroot."
}

$exampleJson = Get-Content -LiteralPath $productionExample -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($exampleJson.ConnectionStrings.AgroDigital) -or
    [string]::IsNullOrWhiteSpace($exampleJson.Auth.SigningKey) -or
    $exampleJson.ConnectionStrings.AgroDigital -notmatch 'REEMPLAZAR' -or
    $exampleJson.Auth.SigningKey -notmatch 'REEMPLAZAR') {
    throw "'$productionExample' debe seguir siendo una plantilla sin secretos reales."
}

Write-Host "Validación previa a la subida aprobada: API, web.config, frontend y plantilla de producción presentes; no se detectó appsettings.Production.json."
