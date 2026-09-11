# Tshovani Primary School - tiny static file server
# Built into Windows (PowerShell) - nothing to install.
# Stop: press Ctrl+C here, or just close this window.
param(
    [int]$Port = 8000
)

$ErrorActionPreference = 'Continue'
$rootFull = [System.IO.Path]::GetFullPath($PSScriptRoot)

Write-Host ''
Write-Host '============================================================'
Write-Host '  Tshovani Primary School - server running'
Write-Host ('  Folder: ' + $rootFull)
Write-Host ('  Local:  http://localhost:' + $Port + '/index.html')
try {
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1).IPAddress
    if ($lanIp) {
        Write-Host ('  Wi-Fi:  http://' + $lanIp + ':' + $Port + '/index.html   (phones on same Wi-Fi)')
    }
} catch { }
Write-Host '  Stop:   press Ctrl+C here, or close this window'
Write-Host '============================================================'
Write-Host ''

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
try {
    $listener.Start()
} catch {
    Write-Host ('ERROR: could not start on port ' + $Port + ' - it is probably already in use.')
    Write-Host 'Fix: edit start-server.bat, change the PORT value (e.g. to 8080), run it again.'
    Read-Host 'Press Enter to close this window'
    exit 1
}

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.json' = 'application/json'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.webp' = 'image/webp'
    '.txt'  = 'text/plain; charset=utf-8'
    '.pdf'  = 'application/pdf'
    '.woff' = 'font/woff'
    '.woff2' = 'font/woff2'
    '.ttf'  = 'font/ttf'
    '.mp3'  = 'audio/mpeg'
    '.mp4'  = 'video/mp4'
    '.webm' = 'video/webm'
}

function Send-Response([System.Net.Sockets.NetworkStream]$s, [int]$code, [string]$desc, [string]$ctype, [byte[]]$body, [bool]$headOnly) {
    $len = 0
    if ($body) { $len = $body.Length }
    $head = "HTTP/1.1 $code $desc`r`nContent-Type: $ctype`r`nContent-Length: $len`r`nConnection: close`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`n`r`n"
    $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
    $s.Write($headBytes, 0, $headBytes.Length)
    if (-not $headOnly -and $body -and $body.Length -gt 0) { $s.Write($body, 0, $body.Length) }
    $s.Flush()
}

function Send-Text([System.Net.Sockets.NetworkStream]$s, [int]$code, [string]$desc, [string]$text) {
    Send-Response $s $code $desc 'text/html; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes($text)) $false
}

while ($true) {
    $client = $null
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $stream.ReadTimeout = 3000

        # Read the request headers (until blank line)
        $sb = New-Object System.Text.StringBuilder
        $buffer = New-Object byte[] 8192
        $total = 0
        while ($total -lt 16384) {
            $read = $stream.Read($buffer, 0, $buffer.Length)
            if ($read -le 0) { break }
            $total += $read
            [void]$sb.Append([System.Text.Encoding]::ASCII.GetString($buffer, 0, $read))
            if ($sb.ToString().IndexOf("`r`n`r`n") -ge 0) { break }
        }
        if ($total -eq 0) { continue }

        $first = ($sb.ToString() -split "`r`n")[0]
        $parts = $first -split ' '
        $method = $parts[0].ToUpper()
        $url = if ($parts.Count -gt 1) { $parts[1] } else { '/' }
        $headOnly = ($method -eq 'HEAD')

        if ($method -ne 'GET' -and -not $headOnly) {
            Send-Text $stream 405 'Method Not Allowed' '<h1>405 - only GET is supported</h1>'
            Write-Host ('405  ' + $method + ' ' + $url)
        } else {
            $path = ($url -split '\?')[0]
            $path = [System.Uri]::UnescapeDataString($path)
            if ($path -eq '' -or $path -eq '/') { $path = '/index.html' }
            $rel = $path.TrimStart('/') -replace '/', '\'
            $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))

            $inside = $full.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or
                      $full.StartsWith($rootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)
            if (-not $inside) {
                Send-Text $stream 403 'Forbidden' '<h1>403 Forbidden</h1>'
                Write-Host ('403  ' + $path)
            } else {
                if (Test-Path -LiteralPath $full -PathType Container) { $full = Join-Path $full 'index.html' }
                if (Test-Path -LiteralPath $full) {
                    $ext = [System.IO.Path]::GetExtension($full).ToLower()
                    $ct = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
                    $bytes = [System.IO.File]::ReadAllBytes($full)
                    Send-Response $stream 200 'OK' $ct $bytes $headOnly
                    Write-Host ('200  ' + $path)
                } else {
                    Send-Text $stream 404 'Not Found' '<h1>404 Not Found</h1><p><a href="/index.html">Back to the Tshovani home page</a></p>'
                    Write-Host ('404  ' + $path)
                }
            }
        }
    } catch {
        # Connection timed out or aborted - ignore and keep serving.
    } finally {
        if ($client) { $client.Close() }
    }
}
