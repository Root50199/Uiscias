# Get the directory where the script is located
$currentDir = $PSScriptRoot
if (-not $currentDir) { $currentDir = Get-Location }

# Find all files inside any subfolder named "data"
$files = Get-ChildItem -Path $currentDir -Recurse -File | Where-Object { 
    $_.FullName -match '\\data\\' 
}

# Process paths to include "data/" and everything after it
$processedPaths = @()
foreach ($file in $files) {
    if ($file.FullName -match '(data\\.*)$') {
        # FIX: Explicitly target index 1 of the $Matches hashtable to get the raw text string
        $relativePath = $Matches[1].Replace('\', '/')
        $processedPaths += $relativePath
    }
}

# Sort and filter unique items from our directory sweep
$processedPaths = [array]($processedPaths | Sort-Object -Unique)
if ($null -eq $processedPaths) { $processedPaths = @() }

# Path to the config.json file
$jsonPath = Join-Path $currentDir "config.json"

# Read the file as raw text data
if (Test-Path $jsonPath) {
    $rawJsonText = Get-Content -Raw -Path $jsonPath
} else {
    $rawJsonText = "{`r`n}"
}

# Ensure the text is treated as a safe string
$rawJsonText = [string]$rawJsonText

# 1. Parse the existing array text block manually using safe regex matching
$oldFiles = @()
if ($rawJsonText -match '"usedfiles"\s*:\s*\[([^\]]*)\]') {
    # Extract individual string items inside the brackets
    $innerBlock = $Matches[1]
    $matchesInBlock = [regex]::Matches($innerBlock, '"([^"\r\n]+)"')
    foreach ($m in $matchesInBlock) {
        $oldFiles += $m.Groups[1].Value
    }
}
$oldFiles = [array]($oldFiles | Sort-Object -Unique)
if ($null -eq $oldFiles) { $oldFiles = @() }

# 2. Strict item verification step
$diff = Compare-Object $oldFiles $processedPaths
$tagExists = $rawJsonText -match '"usedfiles"\s*:'

# 3. Apply changes only if differences actually exist
if ($null -ne $diff -or -not $tagExists) {
    # Format the replacement data block neatly with indents and spacing
    $formattedArrayLines = $processedPaths | ForEach-Object { "        `"$_`"" }
    $arrayString = "`r`n" + ($formattedArrayLines -join ",`r`n") + "`r`n    "
    $newTagText = "`"usedfiles`": [$arrayString]"

    if ($tagExists) {
        # Update just the segment of text between the target brackets
        $updatedJsonText = $rawJsonText -replace '"usedfiles"\s*:\s*\[[^\]]*\]', $newTagText
    } else {
        # Inject carefully into the top of the file if it's missing entirely
        $updatedJsonText = $rawJsonText -replace '\{\s*', "{`r`n    $newTagText,`r`n"
    }

    # Write text out without object translations to prevent wiping other keys
    [System.IO.File]::WriteAllText($jsonPath, $updatedJsonText, [System.Text.Encoding]::UTF8)
    
    # Calculate exact addition counts
    $newCount = 0
    if ($null -ne $diff) {
        $newCount = ($diff | Where-Object { $_.SideIndicator -eq "=>" }).Count
    }
    if (-not $tagExists) { $newCount = $processedPaths.Count }
    
    Write-Host "Changes detected! Successfully updated 'usedfiles' tag text block with ($newCount) new items. All other keys preserved perfectly." -ForegroundColor Green
} else {
    Write-Host "0 changes reported. 'usedfiles' matches your local directories exactly. No write performed." -ForegroundColor Yellow
}

# Keep window open
Write-Host "`nPress Enter to close this window..." -ForegroundColor Cyan
Read-Host
