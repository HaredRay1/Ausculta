# Runs every check that does not need the physical device.
#
#   1. unit tests for the pure modules (pcm, wav_writer, filename)
#   2. an end-to-end WAV emitted by the real code and parsed by Python's
#      standard-library `wave` module
#   3. a syntax check of the Arduino-side sources against stub SDK headers
#
# Requires g++ (MinGW-w64 or similar) and python on PATH.
#
#   pwsh firmware/test/run_tests.ps1

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here '..\ausculta_recorder'
$stubs = Join-Path $here 'stubs'
$build = Join-Path $here 'build'

New-Item -ItemType Directory -Force -Path $build | Out-Null

$cxx = 'g++'
$flags = @('-std=c++17', '-Wall', '-Wextra', '-Werror', '-O1')
$failed = $false

function Invoke-Step($label, $block) {
    Write-Host ''
    Write-Host "== $label" -ForegroundColor Cyan
    & $block
    if ($LASTEXITCODE -ne 0) {
        $script:failed = $true
        Write-Host "   FAILED" -ForegroundColor Red
    }
}

# --- 1. unit tests -----------------------------------------------------------

$suites = @(
    @{ name = 'pcm';        sources = @('pcm.cpp') },
    @{ name = 'wav_writer'; sources = @('wav_writer.cpp') },
    @{ name = 'filename';   sources = @('filename.cpp') }
)

foreach ($suite in $suites) {
    $exe = Join-Path $build "test_$($suite.name).exe"
    $sources = @((Join-Path $here "test_$($suite.name).cpp"))
    foreach ($s in $suite.sources) { $sources += (Join-Path $src $s) }

    Invoke-Step "unit: $($suite.name)" {
        & $cxx @flags -o $exe @sources
        if ($LASTEXITCODE -ne 0) { return }
        & $exe
    }
}

# --- 2. end-to-end WAV -------------------------------------------------------

Invoke-Step 'end-to-end: emit and parse a real WAV' {
    $exe = Join-Path $build 'make_sample_wav.exe'
    & $cxx @flags -o $exe (Join-Path $here 'make_sample_wav.cpp') `
        (Join-Path $src 'pcm.cpp') (Join-Path $src 'wav_writer.cpp')
    if ($LASTEXITCODE -ne 0) { return }
    & $exe $build
    if ($LASTEXITCODE -ne 0) { return }
    & python (Join-Path $here 'verify_wav.py') $build
}

# --- 3. syntax check of the Arduino-side sources -----------------------------
#
# Compiles against the stubs in test/stubs, so this proves the firmware's own
# types and signatures agree. It canNOT validate calls into the real ESP32 SDK;
# only the Arduino IDE can do that.

Invoke-Step 'syntax: Arduino sources (core 3.x backend)' {
    $arduinoSources = @('audio_capture.cpp', 'storage.cpp', 'ui.cpp')
    foreach ($f in $arduinoSources) {
        & $cxx -std=gnu++17 -fsyntax-only "-I$stubs" "-I$src" (Join-Path $src $f)
        if ($LASTEXITCODE -ne 0) { return }
        Write-Host "   ok  $f"
    }
    & $cxx -std=gnu++17 -fsyntax-only -x c++ "-I$stubs" "-I$src" `
        (Join-Path $src 'ausculta_recorder.ino')
    if ($LASTEXITCODE -ne 0) { return }
    Write-Host '   ok  ausculta_recorder.ino'
}

Invoke-Step 'syntax: Arduino sources (core 2.x I2S backend)' {
    & $cxx -std=gnu++17 -fsyntax-only -DESP_ARDUINO_VERSION_MAJOR=2 `
        "-I$stubs" "-I$src" (Join-Path $src 'audio_capture.cpp')
    if ($LASTEXITCODE -ne 0) { return }
    Write-Host '   ok  audio_capture.cpp'
}

Write-Host ''
if ($failed) {
    Write-Host 'FAILED' -ForegroundColor Red
    exit 1
}
Write-Host 'All host checks passed.' -ForegroundColor Green
Write-Host 'Not covered here: ADC capture, SD card, LCD, button -- those need the board.'
exit 0
