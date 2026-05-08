param(
    [ValidateSet("analysis", "release")]
    [string]$Mode = "analysis"
)

$ProjectName = Split-Path -Leaf (Get-Location)
$Date = Get-Date -Format "yyyy-MM-dd_HH-mm"
$OutputDir = "artifacts"
$Output = "$OutputDir/$ProjectName-$Mode-$Date.zip"

$AlwaysExcludedDirs = @(
    "node_modules",
    ".git",
    ".vscode",
    "coverage"
)

$SensitiveFiles = @(
    ".env",
    ".env.local",
    ".env.production",
    ".env.development"
)

if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

if (Test-Path $Output) {
    Remove-Item $Output -Force
}

$gitignorePatterns = @()

if ($Mode -eq "release" -and (Test-Path ".gitignore")) {
    $gitignorePatterns = Get-Content ".gitignore" |
        Where-Object {
            $_.Trim() -ne "" -and
            -not $_.Trim().StartsWith("#")
        }
}

$files = Get-ChildItem -Recurse -File | Where-Object {
    $relativePath = $_.FullName.Replace((Get-Location).Path + "\", "")
    $relativePathUnix = $relativePath -replace "\\", "/"

    $isAlwaysExcludedDir = $AlwaysExcludedDirs | Where-Object {
        $relativePath -match "(^|\\)$([regex]::Escape($_))(\\|$)"
    }

    $isSensitiveFile = $SensitiveFiles -contains $_.Name

    $isOutputZip = $relativePathUnix -like "$OutputDir/*"

    $isGitignored = $false

    if ($Mode -eq "release") {
        foreach ($pattern in $gitignorePatterns) {
            $cleanPattern = $pattern.Trim()

            if ($cleanPattern.EndsWith("/")) {
                $dirName = $cleanPattern.TrimEnd("/")
                if ($relativePathUnix -like "$dirName/*") {
                    $isGitignored = $true
                    break
                }
            }
            elseif ($relativePathUnix -like $cleanPattern -or $_.Name -like $cleanPattern) {
                $isGitignored = $true
                break
            }
        }
    }

    if ($Mode -eq "analysis") {
        -not $isAlwaysExcludedDir -and
        -not $isSensitiveFile -and
        -not $isOutputZip
    }
    else {
        -not $isAlwaysExcludedDir -and
        -not $isSensitiveFile -and
        -not $isOutputZip -and
        -not $isGitignored
    }
}

$TempDir = Join-Path $env:TEMP "$ProjectName-zip-temp"

Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $TempDir | Out-Null

foreach ($file in $files) {
    $relativePath = $file.FullName.Replace((Get-Location).Path + "\", "")
    $destination = Join-Path $TempDir $relativePath
    $destinationDir = Split-Path $destination -Parent

    if (!(Test-Path $destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }

    Copy-Item $file.FullName $destination -Force
}

Compress-Archive -Path "$TempDir\*" -DestinationPath $Output -Force

Remove-Item $TempDir -Recurse -Force