# Copyright (c) Microsoft Corporation. All rights reserved.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-PythonCommand {
    param (
        [string]$Command
    )

    try {
        & $Command --version > $null 2>&1
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

$scriptDir = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
Set-Location -Path $scriptDir

Write-Host "Iniciando Knowledge Map..."

if (-not (Test-Path -Path ".env")) {
    Write-Error "No se encontro el archivo .env en $scriptDir."
    Write-Error "Crea .env con GITHUB_TOKEN=tu_token_aqui"
    exit 1
}

if (-not (Test-Path -Path "fetch_data.py")) {
    Write-Error "No se encontro fetch_data.py en $scriptDir."
    exit 1
}

if (-not (Test-Path -Path "build_graph.py")) {
    Write-Error "No se encontro build_graph.py en $scriptDir."
    exit 1
}

$pythonCandidates = @('py', 'python', 'python3')
$pythonCmd = $null

foreach ($candidate in $pythonCandidates) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        if (Test-PythonCommand $candidate) {
            $pythonCmd = $candidate
            break
        }
    }
}

if (-not $pythonCmd) {
    Write-Error "Python no esta instalado o no se encontro un comando valido de Python."
    exit 1
}

$versionOutput = & $pythonCmd --version 2>$null
Write-Host "Usando Python: $pythonCmd ($versionOutput)"

Write-Host "Descargando datos de GitHub..."
& $pythonCmd fetch_data.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "fetch_data.py fallo con codigo $LASTEXITCODE."
    exit $LASTEXITCODE
}

Write-Host "Construyendo el grafo..."
& $pythonCmd build_graph.py
if ($LASTEXITCODE -ne 0) {
    Write-Error "build_graph.py fallo con codigo $LASTEXITCODE."
    exit $LASTEXITCODE
}

Write-Host "Servidor iniciado en http://localhost:8000"
Write-Host "Abre esa URL en tu navegador para ver el Knowledge Map."
Write-Host "Iniciando servidor web... (Ctrl+C para detener)"

& $pythonCmd -m http.server 8000
if ($LASTEXITCODE -ne 0) {
    Write-Error "El servidor HTTP fallo con codigo $LASTEXITCODE."
    exit $LASTEXITCODE
}
