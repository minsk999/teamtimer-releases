# 광고창 차단 윈도우판 빌드 — Windows 기본 .NET Framework 4.x 컴파일러(csc.exe)만 쓴다. SDK 설치 불필요.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File adpopupblock\win\build.ps1
# 결과: adpopupblock\win\build\AdPopupBlock\AdPopupBlock.exe, adpopupblock\win\build\AdPopupBlock-<버전>-win.zip
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe 없음: $csc" }

$src = Join-Path $here 'AdPopupBlock.cs'
$ver = ([regex]::Match((Get-Content $src -Raw -Encoding UTF8), 'AppVersion = "([0-9.]+)"')).Groups[1].Value
if (-not $ver) { throw 'AppVersion 을 못 찾음' }
if ((Get-Content $src -Raw -Encoding UTF8) -notmatch [regex]::Escape("AssemblyVersion(""$ver.0"")")) { throw "AssemblyVersion 이 $ver.0 이 아님 — 두 곳을 같이 올릴 것" }

$out = Join-Path $here 'build'
$appDir = Join-Path $out 'AdPopupBlock'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $appDir | Out-Null

# 아이콘(.ico) — 트레이와 같은 방패 그림을 16/24/32/48/64/256 으로 그려 PNG 항목 ICO 로 저장
Add-Type -AssemblyName System.Drawing
$ico = Join-Path $out 'app.ico'
$sizes = 16, 24, 32, 48, 64, 256
$pngs = foreach ($s in $sizes) {
    $bmp = New-Object Drawing.Bitmap $s, $s
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $k = $s / 16.0
    $pts = [Drawing.PointF[]]@(
        (New-Object Drawing.PointF (8*$k), (0.8*$k)), (New-Object Drawing.PointF (14.6*$k), (3*$k)),
        (New-Object Drawing.PointF (14.6*$k), (7.6*$k)), (New-Object Drawing.PointF (13.4*$k), (11.2*$k)),
        (New-Object Drawing.PointF (8*$k), (15.2*$k)), (New-Object Drawing.PointF (2.6*$k), (11.2*$k)),
        (New-Object Drawing.PointF (1.4*$k), (7.6*$k)), (New-Object Drawing.PointF (1.4*$k), (3*$k)))
    $g.FillPolygon((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(0x1F, 0x6F, 0xEB))), $pts)
    $pen = New-Object Drawing.Pen ([Drawing.Color]::White), (1.7*$k)
    $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
    $g.DrawEllipse($pen, (4.6*$k), (4.4*$k), (6.8*$k), (6.8*$k))
    $g.DrawLine($pen, (5.6*$k), (10.2*$k), (10.4*$k), (5.4*$k))
    $g.Dispose()
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    , $ms.ToArray()
}
$fs = [IO.File]::Create($ico)
$bw = New-Object IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $d = $pngs[$i]
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$d.Length); $bw.Write([uint32]$offset)
    $offset += $d.Length
}
foreach ($d in $pngs) { $bw.Write($d) }
$bw.Close()

$exe = Join-Path $appDir 'AdPopupBlock.exe'
& $csc /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 `
    "/out:$exe" "/win32icon:$ico" "/win32manifest:$(Join-Path $here 'app.manifest')" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll $src
if ($LASTEXITCODE -ne 0) { throw "컴파일 실패 ($LASTEXITCODE)" }

Copy-Item (Join-Path $here '사용법.txt') $appDir
$zip = Join-Path $out "AdPopupBlock-$ver-win.zip"
Compress-Archive -Path $appDir -DestinationPath $zip -Force
"빌드 완료: $zip"
(Get-FileHash $zip -Algorithm SHA256).Hash
