[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SiteUrl,

    [string]$SqlServer = "REEMPLAZAR_CON_SERVIDOR_SQL",

    [string]$Database = "REEMPLAZAR_CON_BASE_DE_DATOS",

    [string]$SqlUser = "REEMPLAZAR_CON_USUARIO_SQL",

    [string]$PackagePath = (Join-Path $PSScriptRoot "..\artifacts\smarterasp"),

    [string]$ConfigurationPath = (Join-Path $PSScriptRoot "..\artifacts\smarterasp.private\appsettings.Production.json")
)

$ErrorActionPreference = "Stop"
$package = [System.IO.Path]::GetFullPath($PackagePath)
$configurationPath = [System.IO.Path]::GetFullPath($ConfigurationPath)
$packagePrefix = $package.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar

if ($configurationPath.StartsWith($packagePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ConfigurationPath no puede estar dentro de '$package'. La configuración con secretos debe mantenerse fuera del paquete publicable."
}

if (-not (Test-Path (Join-Path $package "AgroDigital.Api.dll"))) {
    throw "No se encontró un paquete publicado en '$package'. Ejecute primero .\scripts\preparar-publicacion-smarterasp.ps1."
}

if ($SiteUrl -notmatch '^https://') {
    throw "SiteUrl debe comenzar con https://."
}

$securePassword = Read-Host "Contraseña del usuario SQL $SqlUser" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ([string]::IsNullOrWhiteSpace($plainPassword)) {
        throw "La contraseña SQL no puede estar vacía."
    }

    $signingKeyBytes = New-Object byte[] 64
    $randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $randomGenerator.GetBytes($signingKeyBytes)
    }
    finally {
        $randomGenerator.Dispose()
    }
    $signingKey = [Convert]::ToBase64String($signingKeyBytes)

    # Solo configura valores necesarios para la demostración. Correo y OpenAI se
    # agregan después, únicamente con credenciales reales y fuera de Git.
    $configuration = [ordered]@{
        ConnectionStrings = [ordered]@{
            AgroDigital = "Server=$SqlServer;Database=$Database;User Id=$SqlUser;Password=$plainPassword;Encrypt=True;TrustServerCertificate=True;"
        }
        Cors = [ordered]@{
            AllowedOrigins = @($SiteUrl.TrimEnd('/'))
        }
        Storage = [ordered]@{
            DocumentsPath = "App_Data"
        }
        Auth = [ordered]@{
            SigningKey = $signingKey
        }
    }

    $json = $configuration | ConvertTo-Json -Depth 5
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    New-Item -ItemType Directory -Path (Split-Path -Parent $configurationPath) -Force | Out-Null
    [System.IO.File]::WriteAllText($configurationPath, $json, $utf8WithoutBom)
    Write-Host "Configuración privada creada en: $configurationPath"
    Write-Host "No agregue este archivo a Git, no lo incluya en artifacts\\smarterasp ni lo comprima para subirlo. Cargue sus valores como variables de entorno del Application Pool en SmarterASP."
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
}
