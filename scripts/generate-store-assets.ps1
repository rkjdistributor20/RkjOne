$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $repoRoot "outputs\mobile-release\store-assets"
$appStoreOutDir = Join-Path $repoRoot "outputs\mobile-release\app-store-assets\iphone-6.9"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $appStoreOutDir | Out-Null

$logoPath = Join-Path $repoRoot "public\brand\logo-official.jpg"
$logo = [System.Drawing.Image]::FromFile($logoPath)

function New-Canvas([int] $Width, [int] $Height) {
  # App Store Connect rejects PNG files that contain an alpha channel.
  $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(248, 246, 239))
  return @($bmp, $g)
}

function Add-RoundedRect($g, [float] $x, [float] $y, [float] $w, [float] $h, [float] $r, $fill, $stroke = $null, [float] $strokeWidth = 2) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($fill, $path)
  if ($stroke -ne $null) {
    $pen = New-Object System.Drawing.Pen($stroke, $strokeWidth)
    $g.DrawPath($pen, $path)
    $pen.Dispose()
  }
  $path.Dispose()
}

function Add-Text($g, [string] $text, [float] $x, [float] $y, [float] $w, [float] $h, [int] $size, [string] $style, $color, [string] $align = "Near") {
  $fontStyle = [System.Drawing.FontStyle]::Regular
  if ($style -eq "Bold") { $fontStyle = [System.Drawing.FontStyle]::Bold }
  $font = New-Object System.Drawing.Font("Segoe UI", $size, $fontStyle, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush($color)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::$align
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $g.DrawString($text, $font, $brush, $rect, $format)
  $format.Dispose()
  $brush.Dispose()
  $font.Dispose()
}

function Add-Logo($g, [float] $x, [float] $y, [float] $size) {
  $g.DrawImage($script:logo, $x, $y, $size, $size)
}

function Save-Png($bmp, $g, [string] $fileName) {
  $path = Join-Path $script:outDir $fileName
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "Created $path"
}

function New-PhoneScreenshot([string] $fileName, [string] $eyebrow, [string] $title, [string] $subtitle, [string[]] $cards) {
  $pair = New-Canvas 1080 1920
  $bmp = $pair[0]
  $g = $pair[1]

  $gold = [System.Drawing.Color]::FromArgb(229, 174, 35)
  $ink = [System.Drawing.Color]::FromArgb(25, 25, 25)
  $muted = [System.Drawing.Color]::FromArgb(92, 86, 78)
  $panel = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 252))
  $soft = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 235))
  $green = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(228, 247, 237))
  $blue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 242, 255))
  $goldBrush = New-Object System.Drawing.SolidBrush($gold)
  $stroke = [System.Drawing.Color]::FromArgb(229, 222, 209)

  Add-RoundedRect $g 56 72 968 1776 42 $panel ([System.Drawing.Color]::FromArgb(228, 218, 197)) 3
  Add-Logo $g 96 112 126
  Add-Text $g "RKJ One Staff" 250 120 680 54 42 "Bold" $ink
  Add-Text $g "Aplikasi operasi dalaman" 252 176 680 42 30 "Regular" $muted
  Add-Text $g $eyebrow.ToUpperInvariant() 96 300 880 42 30 "Bold" $gold
  Add-Text $g $title 96 354 890 150 62 "Bold" $ink
  Add-Text $g $subtitle 96 516 880 120 35 "Regular" $muted

  Add-RoundedRect $g 96 690 888 120 32 $soft $stroke 2
  Add-Text $g "Akses selamat mengikut syarikat, peranan dan cawangan." 132 720 820 56 30 "Regular" $ink

  $y = 870
  $idx = 0
  foreach ($card in $cards) {
    $brush = $panel
    if ($idx % 3 -eq 1) { $brush = $green }
    if ($idx % 3 -eq 2) { $brush = $blue }
    Add-RoundedRect $g 96 $y 888 150 28 $brush $stroke 2
    Add-RoundedRect $g 126 ($y + 36) 78 78 22 $goldBrush $null 0
    Add-Text $g ([string]($idx + 1)) 126 ($y + 47) 78 60 38 "Bold" ([System.Drawing.Color]::White) "Center"
    Add-Text $g $card 236 ($y + 36) 700 82 34 "Bold" $ink
    $y += 184
    $idx++
  }

  Add-RoundedRect $g 96 1646 888 112 30 (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(17, 17, 17))) $null 0
  Add-Text $g "Operasi staf RKJ dalam satu aplikasi selamat" 134 1682 812 50 32 "Bold" ([System.Drawing.Color]::White) "Center"

  Save-Png $bmp $g $fileName
}

function New-AppStoreScreenshot([string] $fileName) {
  $sourcePath = Join-Path $script:outDir $fileName
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  $targetWidth = 1290
  $targetHeight = 2796
  $contentHeight = [int][Math]::Round($source.Height * ($targetWidth / $source.Width))
  $top = [int][Math]::Floor(($targetHeight - $contentHeight) / 2)
  $target = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($target)
  $graphics.Clear([System.Drawing.Color]::FromArgb(248, 246, 239))
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($source, 0, $top, $targetWidth, $contentHeight)
  $targetPath = Join-Path $script:appStoreOutDir $fileName
  $target.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $target.Dispose()
  $source.Dispose()
  Write-Host "Created $targetPath"
}

function New-FeatureGraphic() {
  $pair = New-Canvas 1024 500
  $bmp = $pair[0]
  $g = $pair[1]
  $ink = [System.Drawing.Color]::FromArgb(20, 20, 20)
  $muted = [System.Drawing.Color]::FromArgb(87, 82, 76)
  $gold = [System.Drawing.Color]::FromArgb(229, 174, 35)
  $black = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(17, 17, 17))
  $cream = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 235))

  Add-RoundedRect $g 32 32 960 436 36 $cream ([System.Drawing.Color]::FromArgb(224, 210, 177)) 3
  Add-RoundedRect $g 660 72 260 356 38 $black $null 0
  Add-Logo $g 710 116 160
  Add-Text $g "RKJ One" 710 302 160 42 34 "Bold" ([System.Drawing.Color]::White) "Center"
  Add-Text $g "Staff App" 710 346 160 32 24 "Regular" ([System.Drawing.Color]::FromArgb(232, 222, 198)) "Center"

  Add-Text $g "RKJ One Staff" 74 86 540 72 56 "Bold" $ink
  Add-Text $g "POS, stok, HR, logistik dan laporan operasi dalam satu aplikasi selamat." 78 176 520 132 31 "Regular" $muted
  Add-RoundedRect $g 78 342 132 56 26 (New-Object System.Drawing.SolidBrush($gold)) $null 0
  Add-Text $g "POS" 92 356 104 32 24 "Bold" ([System.Drawing.Color]::White) "Center"
  Add-RoundedRect $g 230 342 132 56 26 (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(32, 130, 91))) $null 0
  Add-Text $g "HR" 244 356 104 32 24 "Bold" ([System.Drawing.Color]::White) "Center"
  Add-RoundedRect $g 382 342 132 56 26 (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(55, 94, 160))) $null 0
  Add-Text $g "Route" 396 356 104 32 24 "Bold" ([System.Drawing.Color]::White) "Center"

  Save-Png $bmp $g "play-store-feature-graphic.png"
}

New-FeatureGraphic
New-PhoneScreenshot "01-secure-login.png" "Log masuk selamat" "Akses staf mengikut peranan" "Halaman log masuk ringkas tanpa mendedahkan maklumat operasi atau data dalaman syarikat." @(
  "Login staf, AM, OM, HQ dan pentadbir utama",
  "Sesi kerja dilindungi dan laluan sensitif tidak dicache",
  "Paparan mobile kemas untuk kiosk dan HQ"
)
New-PhoneScreenshot "02-pos-counter.png" "POS kiosk" "Jualan harian lebih terkawal" "Staf boleh buka syif, sahkan stok permulaan, rekod jualan, dan tutup syif mengikut SOP sebenar." @(
  "Kiraan stok roti, kaya, butter dan packaging",
  "Pengesahan penghantaran driver sebelum jualan",
  "Ringkasan tunai, QR manual dan transaksi syif"
)
New-PhoneScreenshot "03-branch-operations.png" "Cawangan" "Profil kiosk sebagai pusat rujukan" "Maklumat cawangan, dokumen, staf, stok, maintenance dan operasi disusun dalam satu tempat." @(
  "Profil setiap kiosk dan cawangan",
  "Dokumen boleh view dan download",
  "AM/OM pantau isu, staf dan stok kawasan"
)
New-PhoneScreenshot "04-hr-payroll.png" "HR dan gaji" "Pengurusan staf mengikut syarikat" "Pentadbir boleh mengurus staf, tahap akses, jadual kerja, kadar gaji dan rekod tugasan." @(
  "Asingkan RKJ Manufacturing, RKJ Distributor dan RKJ",
  "Kadar gaji dan peranan ikut syarikat",
  "Access dashboard ditentukan semasa daftar staf"
)
New-PhoneScreenshot "05-logistics-agent.png" "Logistik dan ejen" "Route driver, agent dan pickup point" "RKJ Distributor boleh mengurus pemandu, laluan, ejen, pickup point dan penghantaran harian." @(
  "Driver berdasarkan cawangan dan drop point agent",
  "Ejen khas dan ejen biasa dengan tahap akses berbeza",
  "Pengesahan penghantaran lengkap untuk audit"
)

@(
  "01-secure-login.png",
  "02-pos-counter.png",
  "03-branch-operations.png",
  "04-hr-payroll.png",
  "05-logistics-agent.png"
) | ForEach-Object { New-AppStoreScreenshot $_ }

$logo.Dispose()
