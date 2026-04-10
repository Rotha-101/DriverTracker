$ErrorActionPreference = 'Stop'

$workDir = "c:\Users\USER\PROJECT ESS FOR 2026\0. Team_Work\App_PA\Driver Tracker"
$toolsDir = Join-Path $workDir "AndroidBuildTools"
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

$androidSdkDir = Join-Path $toolsDir "android-sdk"
$cmdlineToolsDir = Join-Path $androidSdkDir "cmdline-tools\latest"

# 1. Download and extract Microsoft JDK 17
$actualJdkPath = Join-Path $toolsDir "jdk"
if (-not (Test-Path $actualJdkPath)) {
    $existingJdk = Get-ChildItem -Path $toolsDir -Directory | Where-Object { $_.Name -like "jdk-21*" } | Select-Object -First 1
    if ($null -eq $existingJdk) {
        Write-Host "Downloading Microsoft JDK 21..."
        $jdkUrl = "https://aka.ms/download-jdk/microsoft-jdk-21.0.2-windows-x64.zip"
        $jdkZip = Join-Path $toolsDir "jdk.zip"
        Invoke-WebRequest -Uri $jdkUrl -OutFile $jdkZip
        Write-Host "Extracting JDK..."
        Expand-Archive -Path $jdkZip -DestinationPath $toolsDir -Force
        Remove-Item $jdkZip
        $existingJdk = Get-ChildItem -Path $toolsDir -Directory | Where-Object { $_.Name -like "jdk-21*" } | Select-Object -First 1
    }
    
    if ($null -ne $existingJdk -and $existingJdk.Name -ne "jdk") {
        Write-Host "Setting JDK path to $($existingJdk.FullName)"
        $actualJdkPath = $existingJdk.FullName
    }
}
$env:JAVA_HOME = $actualJdkPath

if (-not (Test-Path (Join-Path $cmdlineToolsDir "bin\sdkmanager.bat"))) {
    Write-Host "Downloading Android Command Line Tools..."
    $cmdlineUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
    $cmdlineZip = Join-Path $toolsDir "cmdline-tools.zip"
    Invoke-WebRequest -Uri $cmdlineUrl -OutFile $cmdlineZip
    Write-Host "Extracting Android CMDLine Tools..."
    $cmdlineParent = Join-Path $androidSdkDir "cmdline-tools"
    if (-not (Test-Path $cmdlineParent)) { New-Item -ItemType Directory -Force -Path $cmdlineParent | Out-Null }
    Expand-Archive -Path $cmdlineZip -DestinationPath $cmdlineParent -Force
    
    $extractedDir = Join-Path $cmdlineParent "cmdline-tools"
    if (Test-Path $extractedDir) {
        if (Test-Path $cmdlineToolsDir) { Remove-Item $cmdlineToolsDir -Recurse -Force }
        Move-Item -Path $extractedDir -Destination $cmdlineToolsDir -Force
    }
    Remove-Item $cmdlineZip
}

$env:JAVA_HOME = $actualJdkPath
$env:ANDROID_HOME = $androidSdkDir
$env:Path = "$($env:JAVA_HOME)\bin;" + (Join-Path $cmdlineToolsDir "bin") + ";" + $env:Path

Write-Host "Java Version:"
java -version

Write-Host "Accepting SDK Licenses and downloading platforms..."
cmd.exe /c "echo y| sdkmanager `"platforms;android-34`" `"build-tools;34.0.0`""
cmd.exe /c "echo y| sdkmanager --licenses"

Set-Location $workDir
Write-Host "Installing Capacitor dependencies..."
# npm install @capacitor/core
# npm install -D @capacitor/cli @capacitor/android

Write-Host "Initializing Capacitor..."
if (-not (Test-Path "capacitor.config.json")) {
    npx cap init "Driver Tracker" "com.ess.drivertracker" --web-dir dist
}

if (-not (Test-Path "android")) {
    npx cap add android
}

Write-Host "Syncing Android project..."
npx @capacitor/cli@7 sync android

Write-Host "Building APK via Gradle..."
Set-Location (Join-Path $workDir "android")
.\gradlew assembleDebug

Write-Host "APK Compilation Complete!"
$apkPath = Join-Path $workDir "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    Copy-Item $apkPath -Destination (Join-Path $workDir "DriverTracker.apk") -Force
    Write-Host "Successfully copied built APK to DriverTracker.apk"
}
