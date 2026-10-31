[CmdletBinding()]
param(
    [string]$PackagePath = (Join-Path $PSScriptRoot "..\artifacts\smarterasp"),

    [string]$ConfigurationPath = (Join-Path $PSScriptRoot "..\artifacts\smarterasp.private\appsettings.Production.json"),

    [string]$SmtpHost = "smtp.gmail.com",

    [int]$Port = 587,

    [string]$Usuario = "agrodigital.notificaciones@gmail.com",

    [string]$RemitenteNombre = "AgroDigital",

    [string]$RemitenteCorreo = "agrodigital.notificaciones@gmail.com"
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

# La contraseña no se pasa por argumento para evitar que quede en el historial de PowerShell.
$securePassword = Read-Host "Contraseña de aplicación SMTP" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ([string]::IsNullOrWhiteSpace($password)) {
        throw "La contraseña SMTP no puede estar vacía."
    }

    $configuration = Get-Content -LiteralPath $configurationPath -Raw | ConvertFrom-Json
    $configuration | Add-Member -NotePropertyName Email -NotePropertyValue ([pscustomobject]@{
        Host = $SmtpHost
        Port = $Port
        UsarSsl = $true
        Usuario = $Usuario
        Password = $password
        RemitenteNombre = $RemitenteNombre
        RemitenteCorreo = $RemitenteCorreo
        UrlAplicacion = $configuration.Cors.AllowedOrigins[0]
    }) -Force

    $json = $configuration | ConvertTo-Json -Depth 8
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($configurationPath, $json, $utf8WithoutBom)

    Write-Host "Correo SMTP quedó configurado en la configuración privada."
    Write-Host "No agregue appsettings.Production.json a Git, no lo incluya en artifacts\smarterasp ni comparta el archivo. Cargue Email__* como variables de entorno del Application Pool en SmarterASP."
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
}
