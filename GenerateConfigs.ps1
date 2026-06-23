# 1. Setup root location context
$currentDir = $PSScriptRoot
if (-not $currentDir) { $currentDir = Get-Location }

# 2. Find all top-level mod subfolders to populate the GUI grid
$folders = Get-ChildItem -Path $currentDir -Directory | 
           Where-Object { $_.Name -ne "Mabi-pack2" } | 
           Select-Object -ExpandProperty Name

if (-not $folders) {
    Write-Warning "No subfolders found in $currentDir."
    Exit
}

# 3. Load GUI Assemblies
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 4. Construct the Form window
$form = New-Object System.Windows.Forms.Form
$form.Text = "Select Folders to Update/Create config.json"
$form.Size = New-Object System.Drawing.Size(450, 500)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "Check the root folders you want to scan and update:"
$label.Location = New-Object System.Drawing.Point(15, 15)
$label.Size = New-Object System.Drawing.Size(400, 20)
$label.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($label)

# Advanced DataGridView layout for scannable choices
$dataGridView = New-Object System.Windows.Forms.DataGridView
$dataGridView.Location = New-Object System.Drawing.Point(15, 45)
$dataGridView.Size = New-Object System.Drawing.Size(405, 330)
$dataGridView.AllowUserToAddRows = $false
$dataGridView.AllowUserToDeleteRows = $false
$dataGridView.RowHeadersVisible = $false
$dataGridView.SelectionMode = [System.Windows.Forms.DataGridViewSelectionMode]::FullRowSelect

# Grid Column 1: Checkbox
$colCheck = New-Object System.Windows.Forms.DataGridViewCheckBoxColumn
$colCheck.HeaderText = "Select"
$colCheck.Name = "Select"
$colCheck.Width = 60
[void]$dataGridView.Columns.Add($colCheck)

# Grid Column 2: Folder Name
$colName = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$colName.HeaderText = "Folder Name"
$colName.Name = "FolderName"
$colName.ReadOnly = $true
$colName.Width = 320
[void]$dataGridView.Columns.Add($colName)

# Populate choices
foreach ($folder in $folders) {
    [void]$dataGridView.Rows.Add($false, $folder)
}
$form.Controls.Add($dataGridView)

# Select All Button
$btnSelectAll = New-Object System.Windows.Forms.Button
$btnSelectAll.Text = "Select All"
$btnSelectAll.Location = New-Object System.Drawing.Point(15, 395)
$btnSelectAll.Size = New-Object System.Drawing.Size(120, 35)
$btnSelectAll.Add_Click({
    $dataGridView.EndEdit()
    if ($btnSelectAll.Text -eq "Select All") {
        foreach ($row in $dataGridView.Rows) { $row.Cells["Select"].Value = $true }
        $btnSelectAll.Text = "Deselect All"
    } else {
        foreach ($row in $dataGridView.Rows) { $row.Cells["Select"].Value = $false }
        $btnSelectAll.Text = "Select All"
    }
})
$form.Controls.Add($btnSelectAll)

# Action Trigger Confirm Button
$btnOk = New-Object System.Windows.Forms.Button
$btnOk.Text = "Process JSONs"
$btnOk.Location = New-Object System.Drawing.Point(285, 395)
$btnOk.Size = New-Object System.Drawing.Size(135, 35)
$btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $btnOk 
$form.Controls.Add($btnOk)

# 5. Display Form & Capture Selections
$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Warning "Window closed. Script aborted."
    $form.Dispose()
    Exit
}

$dataGridView.EndEdit()
$selectedRootNames = @()
foreach ($row in $dataGridView.Rows) {
    if ($row.Cells["Select"].Value -eq $true) {
        $selectedRootNames += $row.Cells["FolderName"].Value.ToString()
    }
}
$form.Dispose()

if ($selectedRootNames.Count -eq 0) {
    Write-Warning "No folders were checked. Script aborted."
    Exit
}

# Helper function to manage field injection, strict updates, and state conversions
function Set-JsonField {
    param (
        [ref]$JsonText,
        [string]$FieldName,
        [string]$DefaultValue,
        [bool]$ForceOverwrite = $false,
        [bool]$IsRawBlock = $false,
        [bool]$HandleUpdateTypeConversion = $false
    )
    
    $pattern = '"' + [regex]::Escape($FieldName) + '"\s*:\s*([^,\}\r\n]+)'
    $fieldExists = $JsonText.Value -match $pattern

    if ($fieldExists) {
        $currentRawValue = $Matches[1].Trim().Trim('"')

        if ($HandleUpdateTypeConversion) {
            $newValue = $currentRawValue
            if ($currentRawValue -eq "evergreen") {
                $newValue = "stable"
            } elseif ($currentRawValue -eq "needsmaintenance") {
                $newValue = "volatile"
            }
            $JsonText.Value = $JsonText.Value -replace $pattern, "`"$FieldName`": `"$newValue`""
            return
        }

        if ($ForceOverwrite) {
            $formattedVal = if ($IsRawBlock) { $DefaultValue } else { "`"$DefaultValue`"" }
            $JsonText.Value = $JsonText.Value -replace $pattern, "`"$FieldName`": $formattedVal"
        }
    } else {
        $formattedVal = if ($IsRawBlock) { $DefaultValue } else { "`"$DefaultValue`"" }
        $JsonText.Value = $JsonText.Value -replace '\{\s*', "{`r`n    `"$FieldName`": $formattedVal,`r`n"
    }
}

# 6. Locate 'data' directories nested inside only the checked folders
Write-Host "Scanning checked structures for 'data' subdirectories..." -ForegroundColor Cyan
$dataFolders = [System.Collections.Generic.List[System.IO.DirectoryInfo]]::new()

foreach ($rootName in $selectedRootNames) {
    $fullRootPath = Join-Path $currentDir $rootName
    
    if ($rootName -eq "data") {
        $dataFolders.Add((Get-Item $fullRootPath))
    }
    
    $found = Get-ChildItem -Path $fullRootPath -Filter "data" -Directory -Recurse
    foreach ($item in $found) { $dataFolders.Add($item) }
}

if ($dataFolders.Count -eq 0) {
    Write-Warning "No 'data' folders found inside the selected directories."
    Exit
}

Write-Host "Found $($dataFolders.Count) targeted 'data' nodes to process.`n" -ForegroundColor Green

# Track which master folders we have processed so we only build their parent config once
$processedMasterFolders = @{}

# 7. Execute individual directory logic on each found node sequentially
foreach ($dataFolder in $dataFolders) {
    $parentDir = $dataFolder.Parent.FullName
    $parentName = $dataFolder.Parent.Name
    
    # Track back up the tree to isolate the highest root folder layout directly underneath Uiscias
    $highestParent = $dataFolder
    while ($highestParent.Parent -and $highestParent.Parent.FullName -ne $currentDir) {
        $highestParent = $highestParent.Parent
    }
    $modID = $highestParent.Name
    $modName = [regex]::Replace($modID, '(?<!^)(?=[A-Z])', ' ')

    # Determine structural variant Boolean flags
    $hasDataAtRoot = Test-Path (Join-Path $highestParent.FullName "data")
    $hasVariants = if ($hasDataAtRoot) { "false" } else { "true" }
    
    # NEW RULE: Child configurations next to a data folder will ALWAYS be false for HasVariants
    $childHasVariants = "false"
    $isVariant = if ($parentDir -eq $highestParent.FullName) { "false" } else { "true" }

    Write-Host "--------------------------------------------------" -ForegroundColor Gray
    Write-Host "Processing configurations for target: $parentName" -ForegroundColor Cyan

    # --- STEP 7A: HANDLE THE PARENT FOLDER MASTER CONFIG (IF HASVARIANTS IS TRUE) ---
    if ($hasVariants -eq "true" -and -not $processedMasterFolders.ContainsKey($highestParent.FullName)) {
        $masterJsonPath = Join-Path $highestParent.FullName "config.json"
        $isNewMaster = -not (Test-Path $masterJsonPath)

        if ($isNewMaster) {
            Write-Host " -> Master config.json not found. Creating a brand new Master file at root..." -ForegroundColor Yellow
            $masterJsonText = "{`r`n}"
        } else {
            $masterJsonText = Get-Content -Raw -Path $masterJsonPath
        }
        $masterJsonText = [string]$masterJsonText

        # Apply root properties explicitly ensuring Master folder is flagged cleanly
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "modID" -DefaultValue $modID -ForceOverwrite $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "modName" -DefaultValue $modName -ForceOverwrite $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "modAuthor" -DefaultValue "Root50199" -ForceOverwrite $false
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "modAdditionalCredits" -DefaultValue "None" -ForceOverwrite $false
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "updateType" -DefaultValue "volatile" -HandleUpdateTypeConversion $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "HasVariants" -DefaultValue "true" -ForceOverwrite $true -IsRawBlock $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "IsVariant" -DefaultValue "false" -ForceOverwrite $true -IsRawBlock $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "FindiasTags" -DefaultValue '[""]' -ForceOverwrite $false -IsRawBlock $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "RecentUpdateNotes" -DefaultValue "n/a" -ForceOverwrite $false

        [System.IO.File]::WriteAllText($masterJsonPath, $masterJsonText, [System.Text.Encoding]::UTF8)
        Write-Host " -> Successfully updated Global Master Config at: $masterJsonPath" -ForegroundColor Green
        
        # Mark as completed so multiple variant sub-directories don't lock or overwrite it repeatedly
        $processedMasterFolders[$highestParent.FullName] = $true
    }

    # --- STEP 7B: HANDLE CHILD VARIANT CONFIG FILE ---
    # Find files *only* inside this specific data structure loop
    $files = Get-ChildItem -Path $dataFolder.FullName -Recurse -File

       $processedPaths = @()
    foreach ($file in $files) {
        if ($file.FullName -match '(data\\.*)$') {
            $relativePath = $Matches[1].Replace('\', '/')
            $processedPaths += $relativePath
        }
    }

    $processedPaths = [array]($processedPaths | Sort-Object -Unique)
    if ($null -eq $processedPaths) { $processedPaths = @() }

    # Define path for config file inside the parent directory containing "data"
    $jsonPath = Join-Path $parentDir "config.json"
    $isNewFile = -not (Test-Path $jsonPath)

    if ($isNewFile) {
        Write-Host " -> Variant config.json not found. Creating a brand new file..." -ForegroundColor Yellow
        $rawJsonText = "{`r`n}"
    } else {
        $rawJsonText = Get-Content -Raw -Path $jsonPath
    }
    $rawJsonText = [string]$rawJsonText

    # Set parameters for the Child Variant JSON file block
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "modID" -DefaultValue $modID -ForceOverwrite $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "modName" -DefaultValue $modName -ForceOverwrite $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "modAuthor" -DefaultValue "Root50199" -ForceOverwrite $false
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "modAdditionalCredits" -DefaultValue "None" -ForceOverwrite $false
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "updateType" -DefaultValue "volatile" -HandleUpdateTypeConversion $true
    
    # Overwrites child files explicitly to stay false for variables even if nested inside true variants
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "HasVariants" -DefaultValue $childHasVariants -ForceOverwrite $true -IsRawBlock $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "IsVariant" -DefaultValue $isVariant -ForceOverwrite $true -IsRawBlock $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "FindiasTags" -DefaultValue '[""]' -ForceOverwrite $false -IsRawBlock $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "RecentUpdateNotes" -DefaultValue "n/a" -ForceOverwrite $false

    # Extract old parsed files array block manually using safe regex matching
    $oldFiles = @()
    if ($rawJsonText -match '"usedfiles"\s*:\s*\[([^\]]*)\]') {
        $innerBlock = $Matches[1]
        $matchesInBlock = [regex]::Matches($innerBlock, '"([^"\r\n]+)"')
        foreach ($m in $matchesInBlock) {
            $oldFiles += $m.Groups[1].Value
        }
    }
    $oldFiles = [array]($oldFiles | Sort-Object -Unique)
    if ($null -eq $oldFiles) { $oldFiles = @() }

    # Compare configurations change states
    $diff = Compare-Object $oldFiles $processedPaths
    $tagExists = $rawJsonText -match '"usedfiles"\s*:'

    # Always rewrite if it's a completely brand new configuration template
    if ($null -ne $diff -or -not $tagExists -or $isNewFile) {
        $formattedArrayLines = $processedPaths | ForEach-Object { "        `"$_`"" }
        $arrayString = "`r`n" + ($formattedArrayLines -join ",`r`n") + "`r`n    "
        $newTagText = "`"usedfiles`": [$arrayString]"

        if ($tagExists) {
            $rawJsonText = $rawJsonText -replace '"usedfiles"\s*:\s*\[[^\]]*\]', $newTagText
        } else {
            $rawJsonText = $rawJsonText -replace '\{\s*', "{`r`n    $newTagText,`r`n"
        }
        $writeReason = "Directory contents changed or missing 'usedfiles' array tag text block."
    } else {
        $writeReason = "Synchronizing structural metadata headers (modID, modName, Variants flags)."
    }

    # Write text data cleanly back onto the drive array without breaking formatting blocks
    [System.IO.File]::WriteAllText($jsonPath, $rawJsonText, [System.Text.Encoding]::UTF8)
    Write-Host " -> Successfully processed variant config file. $writeReason" -ForegroundColor Green
}

Write-Host "`nAll operations completed!" -ForegroundColor Green
Write-Host "Press Enter to close this window..." -ForegroundColor Cyan
Read-Host
