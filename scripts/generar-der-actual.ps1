[CmdletBinding()]
param(
    [string]$SchemaPath = (Join-Path $PSScriptRoot "..\database\schema-actual.sql"),
    [string]$OutputPath = (Join-Path $PSScriptRoot "..\docs\DER-AgroDigital-actual.svg")
)

$ErrorActionPreference = "Stop"

function Escape-Xml([string]$value) {
    return [System.Security.SecurityElement]::Escape($value)
}

$schemaFullPath = (Resolve-Path -LiteralPath $SchemaPath).Path
$sql = Get-Content -LiteralPath $schemaFullPath -Raw

$groups = [ordered]@{
    "Usuarios y empresas" = @("Usuarios", "Empresas", "GruposGestion", "UsuarioEmpresas", "GrupoGestionOtps", "SolicitudesUsuario", "AccesosGerenteIniciales", "CorreosEnviados")
    "Lotes y campañas" = @("Lotes", "LoteCoordenadas", "LoteDeshabilitaciones", "Campanias", "CampaniaCombinaciones", "CampaniaPlanificacionBajas", "CampaniaVeranoOmisiones")
    "Siembras y seguimiento" = @("Siembras", "SiembraSeguimientos", "SiembraInsumos", "SiembraDocumentos", "SeguimientoInsumos", "SeguimientoDocumentos")
    "Cosechas" = @("Cosechas", "CosechaTiradaAros", "CosechaDocumentos", "CosechaPartes", "GranoToleranciasCosecha", "GranoParametrosCosecha")
    "Silos y almacenamiento" = @("Silos", "SiloControles", "SiloControlIncidencias", "SiloControlInsumos", "SiloDocumentos", "Almacenamientos", "AlmacenamientoDocumentos", "AlmacenamientoPartidas", "AlmacenamientoPartidaConsumos", "GranoBasesComercializacion", "GranoParametrosAlmacenamiento")
    "Distribución" = @("Transportistas", "Choferes", "Camiones", "DestinosDistribucion", "Distribuciones", "DistribucionCamiones", "DistribucionDocumentos", "GranoParametrosDistribucion")
    "IA y catálogos" = @("ReporteriaConversaciones", "ReporteriaMensajes", "CatalogoValores")
}

$palette = @{
    "Usuarios y empresas" = @{ Fill = "#ffffff"; Stroke = "#8c8c8c" }
    "Lotes y campañas" = @{ Fill = "#ffffff"; Stroke = "#8c8c8c" }
    "Siembras y seguimiento" = @{ Fill = "#ffffff"; Stroke = "#8c8c8c" }
    "Cosechas" = @{ Fill = "#ffffff"; Stroke = "#8c8c8c" }
    "Silos y almacenamiento" = @{ Fill = "#ffffff"; Stroke = "#8c8c8c" }
    "Distribución" = @{ Fill = "#ffffff"; Stroke = "#8c8c8c" }
    "IA y catálogos" = @{ Fill = "#ffffff"; Stroke = "#8c8c8c" }
}

$layouts = @{
    "Usuarios y empresas" = @{ X = 50; Y = 100; W = 1500; H = 1860 }
    "Lotes y campañas" = @{ X = 1600; Y = 100; W = 1500; H = 1860 }
    "Siembras y seguimiento" = @{ X = 3150; Y = 100; W = 1500; H = 1860 }
    "Cosechas" = @{ X = 4700; Y = 100; W = 1500; H = 1860 }
    "Silos y almacenamiento" = @{ X = 50; Y = 2040; W = 2550; H = 2630 }
    "Distribución" = @{ X = 2650; Y = 2040; W = 2550; H = 2630 }
    "IA y catálogos" = @{ X = 5250; Y = 2040; W = 950; H = 2630 }
}

$tables = @{}
$createPattern = [regex]'(?ms)^CREATE TABLE \[dbo\]\.\[(?<name>[^\]]+)\]\(\s*(?<body>.*?)^\) ON \[PRIMARY\]'
foreach ($match in $createPattern.Matches($sql)) {
    $name = $match.Groups['name'].Value
    $columns = [regex]::Matches($match.Groups['body'].Value, '(?m)^\s*\[(?<name>[^\]]+)\]\s+\[(?<type>[^\]]+)\]') | ForEach-Object {
        "$($_.Groups['name'].Value) : $($_.Groups['type'].Value)"
    }
    $tables[$name] = [pscustomobject]@{ Name = $name; Columns = @($columns) }
}

$edges = @()
$foreignKeyPattern = [regex]'(?ms)ALTER TABLE \[dbo\]\.\[(?<child>[^\]]+)\].*?FOREIGN KEY\((?<childColumns>.*?)\)\s*REFERENCES \[dbo\]\.\[(?<parent>[^\]]+)\]\s*\((?<parentColumns>.*?)\)'
foreach ($match in $foreignKeyPattern.Matches($sql)) {
    $edges += [pscustomobject]@{
        Child = $match.Groups['child'].Value
        Parent = $match.Groups['parent'].Value
        ChildColumns = (($match.Groups['childColumns'].Value -replace '[\[\]\s]', '') -replace ',', ', ')
        ParentColumns = (($match.Groups['parentColumns'].Value -replace '[\[\]\s]', '') -replace ',', ', ')
    }
}

$foreignColumnsByTable = @{}
foreach ($edge in $edges) {
    if (-not $foreignColumnsByTable.ContainsKey($edge.Child)) {
        $foreignColumnsByTable[$edge.Child] = @{}
    }
    foreach ($column in ($edge.ChildColumns -split ',\s*')) {
        $foreignColumnsByTable[$edge.Child][$column] = $true
    }
}

$knownTables = @($groups.Values | ForEach-Object { $_ })
$missing = @($tables.Keys | Where-Object { $_ -notin $knownTables })
if ($missing.Count -gt 0) {
    throw "Hay tablas sin clasificar en el DER: $($missing -join ', ')"
}

$positions = @{}
$fragments = [System.Collections.Generic.List[string]]::new()
$fragments.Add('<svg xmlns="http://www.w3.org/2000/svg" width="6250" height="4740" viewBox="0 0 6250 4740" role="img" aria-labelledby="title desc">')
$fragments.Add('<title id="title">Diagrama de base de datos actual de AgroDigital</title><desc id="desc">Diagrama estilo SQL Server Management Studio, generado desde el esquema SQL exportado el 30 de octubre de 2026. Las líneas indican claves foráneas desde la tabla hija hacia la tabla padre.</desc>')
$fragments.Add('<rect width="6250" height="4740" fill="#f5f5f5"/>')
$fragments.Add('<rect x="0" y="0" width="6250" height="42" fill="#2f2f2f"/>')
$fragments.Add('<text x="16" y="28" font-family="Segoe UI, Arial, sans-serif" font-size="17" fill="#ffffff">DESKTOP-IDSFFDV.AgroDigital - Database Diagrams - DER-AgroDigital-actual</text>')
$fragments.Add('<rect x="0" y="42" width="6250" height="34" fill="#ededed" stroke="#b6b6b6"/>')
$fragments.Add('<text x="16" y="65" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#202020">File   Edit   View   Diagram   Database   Tools   Window   Help</text>')

foreach ($groupName in $groups.Keys) {
    $layout = $layouts[$groupName]
    $color = $palette[$groupName]
    $tableNames = $groups[$groupName]
    $columnsPerRow = if ($layout.W -ge 1500) { 3 } else { 2 }
    $nodeWidth = [math]::Floor(($layout.W - 70 - (($columnsPerRow - 1) * 25)) / $columnsPerRow)
    for ($i = 0; $i -lt $tableNames.Count; $i++) {
        $tableName = $tableNames[$i]
        if (-not $tables.ContainsKey($tableName)) { continue }
        $table = $tables[$tableName]
        $shownColumns = @($table.Columns)
        $extraColumns = 0
        $nodeHeight = 45 + ($shownColumns.Count * 19)
        $col = $i % $columnsPerRow
        $row = [math]::Floor($i / $columnsPerRow)
        $x = $layout.X + 23 + ($col * ($nodeWidth + 25))
        $y = $layout.Y + ($row * 620)
        $positions[$tableName] = [pscustomobject]@{ X = $x; Y = $y; W = $nodeWidth; H = $nodeHeight; CenterX = $x + ($nodeWidth / 2); CenterY = $y + ($nodeHeight / 2); Group = $groupName }
    }
}

# Relaciones detrás de las entidades para que las etiquetas continúen legibles.
$fragments.Add('<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#555555"/></marker></defs>')
foreach ($edge in $edges) {
    if (-not ($positions.ContainsKey($edge.Child) -and $positions.ContainsKey($edge.Parent))) { continue }
    $from = $positions[$edge.Child]
    $to = $positions[$edge.Parent]
    $dx = $to.CenterX - $from.CenterX
    $dy = $to.CenterY - $from.CenterY
    if ([math]::Abs($dx) -gt [math]::Abs($dy)) {
        $x1 = if ($dx -gt 0) { $from.X + $from.W } else { $from.X }
        $y1 = $from.CenterY
        $x2 = if ($dx -gt 0) { $to.X } else { $to.X + $to.W }
        $y2 = $to.CenterY
        $midX = ($x1 + $x2) / 2
        $path = "M $x1 $y1 C $midX $y1, $midX $y2, $x2 $y2"
    } else {
        $x1 = $from.CenterX
        $y1 = if ($dy -gt 0) { $from.Y + $from.H } else { $from.Y }
        $x2 = $to.CenterX
        $y2 = if ($dy -gt 0) { $to.Y } else { $to.Y + $to.H }
        $midY = ($y1 + $y2) / 2
        $path = "M $x1 $y1 C $x1 $midY, $x2 $midY, $x2 $y2"
    }
    $fragments.Add("<path d=`"$path`" fill=`"none`" stroke=`"#555555`" stroke-width=`"1.1`" opacity=`"0.82`" marker-end=`"url(#arrow)`"/>")
}

foreach ($groupName in $groups.Keys) {
    $color = $palette[$groupName]
    foreach ($tableName in $groups[$groupName]) {
        if (-not ($positions.ContainsKey($tableName) -and $tables.ContainsKey($tableName))) { continue }
        $position = $positions[$tableName]
        $table = $tables[$tableName]
        $shownColumns = @($table.Columns)
        $extraColumns = 0
        $fragments.Add("<g><rect x=`"$($position.X)`" y=`"$($position.Y)`" width=`"$($position.W)`" height=`"$($position.H)`" fill=`"#ffffff`" stroke=`"$($color.Stroke)`" stroke-width=`"1.3`"/>")
        $fragments.Add("<rect x=`"$($position.X)`" y=`"$($position.Y)`" width=`"$($position.W)`" height=`"30`" fill=`"#d9d9d9`" stroke=`"$($color.Stroke)`" stroke-width=`"1.3`"/>")
        $fragments.Add("<text x=`"$($position.X + 9)`" y=`"$($position.Y + 21)`" font-family=`"Tahoma, Segoe UI, Arial, sans-serif`" font-size=`"14`" font-weight=`"700`" fill=`"#111111`">$(Escape-Xml $tableName)</text>")
        for ($i = 0; $i -lt $shownColumns.Count; $i++) {
            $column = $shownColumns[$i]
            $columnName = ($column -split '\s*:\s*')[0]
            $isPrimary = $column -match '^[^:]*Id\s*:' -and $i -eq 0
            $isForeign = $foreignColumnsByTable.ContainsKey($tableName) -and $foreignColumnsByTable[$tableName].ContainsKey($columnName)
            $prefix = if ($isPrimary) { '🔑 ' } elseif ($isForeign) { '◦ ' } else { '  ' }
            $weight = if ($isPrimary) { '700' } else { '400' }
            $fragments.Add("<text x=`"$($position.X + 9)`" y=`"$($position.Y + 48 + ($i * 19))`" font-family=`"Tahoma, Segoe UI, Arial, sans-serif`" font-size=`"12`" font-weight=`"$weight`" fill=`"#1b1b1b`">$(Escape-Xml ($prefix + $column))</text>")
        }
        if ($extraColumns -gt 0) {
            $fragments.Add("<text x=`"$($position.X + 13)`" y=`"$($position.Y + 61 + ($shownColumns.Count * 24))`" font-family=`"Segoe UI, Arial, sans-serif`" font-size=`"13`" font-style=`"italic`" fill=`"#53646a`">… $extraColumns columnas más</text>")
        }
        $fragments.Add('</g>')
    }
}

$fragments.Add('<rect x="0" y="4704" width="6250" height="36" fill="#ededed" stroke="#b6b6b6"/>')
$fragments.Add(("<text x=`"14`" y=`"4728`" font-family=`"Tahoma, Segoe UI, Arial, sans-serif`" font-size=`"13`" fill=`"#222222`">$($tables.Count) Tables · $($edges.Count) Foreign Key Relationships · 🔑 Primary key · ◦ Foreign key</text>"))
$fragments.Add('</svg>')

$outputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $outputFullPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
[System.IO.File]::WriteAllLines($outputFullPath, $fragments, [System.Text.UTF8Encoding]::new($false))
Write-Host "DER generado: $outputFullPath"
Write-Host "Tablas: $($tables.Count); relaciones: $($edges.Count)"
