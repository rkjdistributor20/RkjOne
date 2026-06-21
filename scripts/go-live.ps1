# RKJ One — Skrip go-live (Windows PowerShell)
# Usage: .\scripts\go-live.ps1 -ProjectRef YOUR_REF
#        .\scripts\go-live.ps1 -SkipDb          # hanya verify + seed

param(
    [string]$ProjectRef = "",
    [switch]$SkipDb,
    [switch]$SkipSeed
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "`n=== RKJ One Go-Live ===" -ForegroundColor Cyan

if (-not (Test-Path ".env.local")) {
    Write-Host "Salin .env.example -> .env.local dan isi Supabase keys" -ForegroundColor Yellow
    if (-not (Test-Path ".env.local")) {
        Copy-Item ".env.example" ".env.local"
        Write-Host "  .env.local dicipta — sila edit sebelum teruskan." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "`n[1/4] Bundle migration 00019-00030..." -ForegroundColor Green
node scripts/bundle-migrations.mjs

if (-not $SkipDb) {
    Write-Host "`n[2/4] Push database..." -ForegroundColor Green
    if ($ProjectRef) {
        supabase link --project-ref $ProjectRef
        npx supabase db push --yes
    } else {
        Write-Host "  Tiada -ProjectRef — cuba npx supabase db push (projek mesti sudah link)" -ForegroundColor Yellow
        npx supabase db push --yes
    }
} else {
    Write-Host "`n[2/4] Skip database push (-SkipDb)" -ForegroundColor Yellow
}

if (-not $SkipSeed) {
    Write-Host "`n[3/4] Seed auth users..." -ForegroundColor Green
    npm run seed:users
} else {
    Write-Host "`n[3/4] Skip seed users (-SkipSeed)" -ForegroundColor Yellow
}

Write-Host "`n[4/4] Verify go-live..." -ForegroundColor Green
npm run verify:go-live

Write-Host "`nSeterusnya:" -ForegroundColor Cyan
Write-Host "  - npm run finish:go-live  (storage + verify + build)"
Write-Host "  - Deploy Vercel (docs/DEPLOYMENT.md)"
Write-Host "  - Jika db push gagal: paste docs/sql/00019_00030_manual_bundle.sql di SQL Editor"
Write-Host "  - Pilot: Gombak, Dengkil Utara, Simpang Pulai Utara"
Write-Host ""
