# One-shot image compressor for the site photos (uses GDI+ built into Windows)
Add-Type -AssemblyName System.Drawing

$jobs = @(
    @{ f = 'images\hero-children.jpg';  w = 1600; q = 74 },
    @{ f = 'images\sports-football.jpg'; w = 1200; q = 70 },
    @{ f = 'images\clean-yard.jpg';      w = 1200; q = 70 },
    @{ f = 'images\street-football.jpg'; w = 1200; q = 70 },
    @{ f = 'images\child-sports.jpg';    w = 1200; q = 70 },
    @{ f = 'images\early-years.jpg';     w = 1200; q = 72 },
    @{ f = 'images\classroom.jpg';       w = 1200; q = 72 },
    @{ f = 'images\school-life.jpg';     w = 1200; q = 72 }
)

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }

foreach ($j in $jobs) {
    $path = Join-Path $PSScriptRoot $j.f
    $img = [System.Drawing.Image]::FromFile($path)
    try {
        if ($img.Width -le $j.w) { Write-Output ("skip  " + $j.f + " (" + $img.Width + "px)"); continue }
        $h = [int][math]::Round($img.Height * $j.w / $img.Width)
        $bmp = New-Object System.Drawing.Bitmap($j.w, $h)
        try {
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.DrawImage($img, 0, 0, $j.w, $h)
            $g.Dispose()

            $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
            $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$j.q)
            $tmp = $path + '.tmp'
            $bmp.Save($tmp, $codec, $ep)
            $ep.Dispose()
        } finally { $bmp.Dispose() }
    } finally { $img.Dispose() }
    Move-Item -Force $tmp $path
    Write-Output ("done  " + $j.f + " -> " + $j.w + "px q" + $j.q)
}
