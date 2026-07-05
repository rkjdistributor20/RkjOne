param(
  [ValidateSet("debug", "release")]
  [string] $Target = "release"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$portableJdk = Join-Path $env:LOCALAPPDATA "Programs\TemurinPortable\jdk-21"
$androidSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"

if (-not (Test-Path (Join-Path $portableJdk "bin\java.exe"))) {
  throw "JDK 21 tidak dijumpai di $portableJdk. Pasang JDK 21 sebelum build Android."
}

if (-not (Test-Path (Join-Path $androidSdk "platform-tools"))) {
  throw "Android SDK tidak dijumpai di $androidSdk. Pasang Android SDK sebelum build Android."
}

$env:JAVA_HOME = $portableJdk
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"

Push-Location $repoRoot
try {
  npm run mobile:sync

  Push-Location "android"
  try {
    if ($Target -eq "debug") {
      .\gradlew.bat :app:assembleDebug --no-daemon
      Write-Host "APK debug siap: android/app/build/outputs/apk/debug/app-debug.apk"
    } else {
      if (-not (Test-Path "keystore.properties")) {
        throw "android/keystore.properties tidak dijumpai. Release AAB perlukan signing key."
      }

      .\gradlew.bat :app:bundleRelease --no-daemon
      Write-Host "AAB release siap: android/app/build/outputs/bundle/release/app-release.aab"
    }
  } finally {
    Pop-Location
  }
} finally {
  Pop-Location
}
