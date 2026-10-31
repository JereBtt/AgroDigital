[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\artifacts\smarterasp")
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontend = Join-Path $root "frontend\AgroDigital.Web"
$backend = Join-Path $root "backend\AgroDigital.Api"
$backendProject = Join-Path $backend "AgroDigital.Api.csproj"
$expectedOutput = [System.IO.Path]::GetFullPath((Join-Path $root "artifacts\smarterasp")).TrimEnd([char[]]@('\', '/'))
$output = [System.IO.Path]::GetFullPath($OutputPath).TrimEnd([char[]]@('\', '/'))
$previousApiUrl = $env:VITE_API_BASE_URL

function Invoke-NativeCommand {
    param([scriptblock]$Command, [string]$Name)

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Name finalizó con código $LASTEXITCODE. No se generó un paquete publicable."
    }
}

function Assert-SafeOutputDirectory {
    if (-not [string]::Equals($output, $expectedOutput, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Por seguridad, OutputPath debe ser exactamente '$expectedOutput'. El script solo puede limpiar artifacts\\smarterasp."
    }

    if (Test-Path -LiteralPath $output) {
        $outputItem = Get-Item -LiteralPath $output
        if (-not $outputItem.PSIsContainer) {
            throw "La salida esperada '$output' existe pero no es un directorio. No se eliminará."
        }

        if (($outputItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "La salida esperada '$output' es un enlace o punto de montaje. No se eliminará por seguridad."
        }
    }
}

Assert-SafeOutputDirectory

try {
    Push-Location $frontend
    if (-not (Test-Path "node_modules")) {
        Invoke-NativeCommand { npm ci } "npm ci"
    }

    # El sitio se publica bajo el mismo origen que la API; no se incorpora una URL local al bundle.
    $env:VITE_API_BASE_URL = ""
    Invoke-NativeCommand { npm run build } "npm run build"
    Pop-Location

    if (Test-Path -LiteralPath $output) {
        Remove-Item -LiteralPath $output -Recurse -Force
    }

    Invoke-NativeCommand { dotnet publish $backendProject -c Release -o $output --no-restore } "dotnet publish"
    New-Item -ItemType Directory -Path (Join-Path $output "wwwroot") -Force | Out-Null
    Copy-Item (Join-Path $frontend "dist\*") (Join-Path $output "wwwroot") -Recurse -Force

    & (Join-Path $PSScriptRoot "validar-publicacion-smarterasp.ps1") -PackagePath $output

    Write-Host "Paquete preparado en: $output"
    Write-Host "El paquete no incluye appsettings.Production.json ni secretos. Configure los valores de producción como variables de entorno del Application Pool en SmarterASP."
}
finally {
    if ((Get-Location).Path -eq $frontend) {
        Pop-Location
    }
    $env:VITE_API_BASE_URL = $previousApiUrl
}
