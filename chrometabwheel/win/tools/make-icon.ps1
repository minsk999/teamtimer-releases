# 트레이·실행 파일 아이콘을 그려 assets\app.ico(사용 중) / app-off.ico(일시 중지)로 저장한다.
# 아이콘을 바꾸고 싶을 때만 다시 실행하면 된다.
Add-Type -AssemblyName System.Drawing
$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'
New-Item -ItemType Directory -Force $out | Out-Null

function New-Frame([int]$n, [bool]$on) {
    $bmp = New-Object System.Drawing.Bitmap $n, $n, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
    $bg = if ($on) { [System.Drawing.Color]::FromArgb(255, 26, 115, 232) } else { [System.Drawing.Color]::FromArgb(255, 128, 134, 139) }
    $w = [single]$n; $d = [single]($n * 0.44)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc(0, 0, $d, $d, 180, 90); $p.AddArc($w - $d, 0, $d, $d, 270, 90)
    $p.AddArc($w - $d, $w - $d, $d, $d, 0, 90); $p.AddArc(0, $w - $d, $d, $d, 90, 90); $p.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush $bg), $p)
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $cx = $w / 2; $hw = $w * 0.27
    $up = @((New-Object System.Drawing.PointF $cx, ($w * 0.15)), (New-Object System.Drawing.PointF ($cx - $hw), ($w * 0.44)), (New-Object System.Drawing.PointF ($cx + $hw), ($w * 0.44)))
    $dn = @((New-Object System.Drawing.PointF $cx, ($w * 0.85)), (New-Object System.Drawing.PointF ($cx - $hw), ($w * 0.56)), (New-Object System.Drawing.PointF ($cx + $hw), ($w * 0.56)))
    $g.FillPolygon($white, [System.Drawing.PointF[]]$up); $g.FillPolygon($white, [System.Drawing.PointF[]]$dn)
    $g.Dispose()
    return $bmp
}

function Get-Dib([System.Drawing.Bitmap]$bmp) {
    $n = $bmp.Width
    $data = $bmp.LockBits((New-Object System.Drawing.Rectangle 0, 0, $n, $n), 'ReadOnly', 'Format32bppArgb')
    $px = New-Object byte[] ($n * $n * 4)
    [Runtime.InteropServices.Marshal]::Copy($data.Scan0, $px, 0, $px.Length)
    $bmp.UnlockBits($data)
    $ms = New-Object IO.MemoryStream; $bw = New-Object IO.BinaryWriter $ms
    $maskRow = [int]([Math]::Floor(($n + 31) / 32) * 4)
    $bw.Write([int]40); $bw.Write([int]$n); $bw.Write([int]($n * 2)); $bw.Write([int16]1); $bw.Write([int16]32)
    $bw.Write([int]0); $bw.Write([int]($n * $n * 4 + $maskRow * $n)); $bw.Write([int]0); $bw.Write([int]0); $bw.Write([int]0); $bw.Write([int]0)
    for ($y = $n - 1; $y -ge 0; $y--) { $bw.Write($px, $y * $n * 4, $n * 4) }   # 아래에서 위로
    $bw.Write((New-Object byte[] ($maskRow * $n)))                               # AND 마스크(알파를 쓰므로 0)
    $bw.Flush(); return , $ms.ToArray()
}

function Save-Ico([string]$path, [bool]$on) {
    $sizes = 16, 20, 24, 32, 40, 48, 64
    $frames = foreach ($s in $sizes) { , (Get-Dib (New-Frame $s $on)) }
    $fs = [IO.File]::Create($path); $bw = New-Object IO.BinaryWriter $fs
    $bw.Write([int16]0); $bw.Write([int16]1); $bw.Write([int16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $bw.Write([byte]$sizes[$i]); $bw.Write([byte]$sizes[$i]); $bw.Write([byte]0); $bw.Write([byte]0)
        $bw.Write([int16]1); $bw.Write([int16]32); $bw.Write([int]$frames[$i].Length); $bw.Write([int]$offset)
        $offset += $frames[$i].Length
    }
    foreach ($f in $frames) { $bw.Write($f) }
    $bw.Close()
}

Save-Ico (Join-Path $out 'app.ico') $true
Save-Ico (Join-Path $out 'app-off.ico') $false
Get-ChildItem $out | Select-Object Name, Length
