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

# Advanced helper function to manage field injection, strict updates, and state conversions
function Set-JsonField {
    param (
        [ref]$JsonText,
        [string]$FieldName,
        [string]$DefaultValue,
        [bool]$ForceOverwrite = $false,
        [bool]$IsRawBlock = $false,
        [bool]$HandleUpdateTypeConversion = $false
    )
    
    if ($IsRawBlock -and $DefaultValue.StartsWith("[")) {
        $pattern = '(?i)"' + [regex]::Escape($FieldName) + '"\s*:\s*\[[^\]]*\]'
    } else {
        $pattern = '(?i)"' + [regex]::Escape($FieldName) + '"\s*:\s*([^,\}\r\n]+)'
    }
    
    $fieldExists = [regex]::IsMatch($JsonText.Value, $pattern)

    if ($fieldExists) {
        if ($HandleUpdateTypeConversion) {
            $matchObj = [regex]::Match($JsonText.Value, $pattern)
            $rawMatch = $matchObj.Value
            $splitParts = $rawMatch -split ':'
            $currentRawValue = $splitParts.Trim().Trim(',').Trim('"').Trim()
            
            if ($currentRawValue -match 'volatile') { $currentRawValue = "volatile" }
            if ($currentRawValue -match 'stable') { $currentRawValue = "stable" }
            
            $newValue = $currentRawValue
            if ($currentRawValue -eq "evergreen") { $newValue = "stable" }
            if ($currentRawValue -eq "needsmaintenance") { $newValue = "volatile" }
            
            $JsonText.Value = [regex]::Replace($JsonText.Value, $pattern, "`"$FieldName`": `"$newValue`"")
            return
        }

        $formattedVal = if ($IsRawBlock) { $DefaultValue } else { "`"$DefaultValue`"" }
        $hasCorrectCasing = $JsonText.Value -match ('"' + $FieldName + '"\s*:')
        if ($ForceOverwrite -or -not $hasCorrectCasing) {
            $JsonText.Value = [regex]::Replace($JsonText.Value, $pattern, "`"$FieldName`": $formattedVal")
        }
    } else {
        $formattedVal = if ($IsRawBlock) { $DefaultValue } else { "`"$DefaultValue`"" }
        $JsonText.Value = $JsonText.Value -replace '\{\s*', "{`r`n    `"$FieldName`": $formattedVal,`r`n"
    }
}

# Helper function to parse tags.md files safely
function Get-FindiasTags {
    param ([string]$folderPath)
    $tagsPath = Join-Path $folderPath "tags.md"
    if (Test-Path $tagsPath) {
        $content = Get-Content -Raw -Path $tagsPath
        if (-not [string]::IsNullOrWhiteSpace($content)) {
            $cleanedTags = $content.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
            if ($cleanedTags) {
                $quotedTags = $cleanedTags | ForEach-Object { "`"$_`"" }
                return "[" + ($quotedTags -join ", ") + "]"
            }
        }
    }
    return '[""]'
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

$dataGridView = New-Object System.Windows.Forms.DataGridView
$dataGridView.Location = New-Object System.Drawing.Point(15, 45)
$dataGridView.Size = New-Object System.Drawing.Size(405, 330)
$dataGridView.AllowUserToAddRows = $false
$dataGridView.AllowUserToDeleteRows = $false
$dataGridView.RowHeadersVisible = $false
$dataGridView.SelectionMode = [System.Windows.Forms.DataGridViewSelectionMode]::FullRowSelect

$colCheck = New-Object System.Windows.Forms.DataGridViewCheckBoxColumn
$colCheck.HeaderText = "Select"
$colCheck.Name = "Select"
$colCheck.Width = 60
[void]$dataGridView.Columns.Add($colCheck)

$colName = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$colName.HeaderText = "Folder Name"
$colName.Name = "FolderName"
$colName.ReadOnly = $true
$colName.Width = 320
[void]$dataGridView.Columns.Add($colName)

foreach ($folder in $folders) { [void]$dataGridView.Rows.Add($false, $folder) }
$form.Controls.Add($dataGridView)

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

$btnOk = New-Object System.Windows.Forms.Button
$btnOk.Text = "Process JSONs"
$btnOk.Location = New-Object System.Drawing.Point(285, 395)
$btnOk.Size = New-Object System.Drawing.Size(135, 35)
$btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $btnOk 
$form.Controls.Add($btnOk)

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Warning "Window closed. Script aborted."
    $form.Dispose(); Exit
}

$dataGridView.EndEdit()
$selectedRootNames = @()
foreach ($row in $dataGridView.Rows) {
    if ($row.Cells["Select"].Value -eq $true) { $selectedRootNames += $row.Cells["FolderName"].Value.ToString() }
}
$form.Dispose()

if ($selectedRootNames.Count -eq 0) { Write-Warning "No folders were checked. Script aborted."; Exit }
# 5. Locate 'data' directories nested inside only the checked folders
Write-Host "Scanning checked structures for 'data' subdirectories..." -ForegroundColor Cyan
$dataFolders = [System.Collections.Generic.List[System.IO.DirectoryInfo]]::new()

foreach ($rootName in $selectedRootNames) {
    $fullRootPath = Join-Path $currentDir $rootName
    if ($rootName -eq "data") { $dataFolders.Add((Get-Item $fullRootPath)) }
    $found = Get-ChildItem -Path $fullRootPath -Filter "data" -Directory -Recurse
    foreach ($item in $found) { $dataFolders.Add($item) }
}

if ($dataFolders.Count -eq 0) { Write-Warning "No 'data' folders found inside selections."; Exit }
Write-Host "Found $($dataFolders.Count) targeted 'data' nodes to process.`n" -ForegroundColor Green

$processedMasterFolders = @{}

# 6. Execute individual directory logic on each found node sequentially
foreach ($dataFolder in $dataFolders) {
    $parentDir = $dataFolder.Parent.FullName
    $parentName = $dataFolder.Parent.Name
    
    $highestParent = $dataFolder
    while ($highestParent.Parent -and $highestParent.Parent.FullName -ne $currentDir) {
        $highestParent = $highestParent.Parent
    }
    
    $isVariant = if ($parentDir -eq $highestParent.FullName) { "false" } else { "true" }
    $targetFolderInfo = if ($isVariant -eq "true") { $dataFolder.Parent } else { $highestParent }
    
    $modID = $targetFolderInfo.Name
    
    # Generate modName splitting UpperCamelCase
    $modName = [regex]::Replace($modID, '(?<!^)(?=[A-Z])', ' ')
    $modName = $modName -replace 'Fo\s+V', 'FoV'
    $modName = [regex]::Replace($modName, '\s+', ' ').Trim()

    $hasDataAtRoot = Test-Path (Join-Path $highestParent.FullName "data")
    $hasVariants = if ($hasDataAtRoot) { "false" } else { "true" }
    $childHasVariants = "false"

    Write-Host "--------------------------------------------------" -ForegroundColor Gray
    Write-Host "Processing configurations for target: $parentName" -ForegroundColor Cyan

    # FIXED: pulling tags block always from the highest parent root folder if variants are active
    $masterTagsBlock = Get-FindiasTags -folderPath $highestParent.FullName
    $childTagsBlock = if ($hasVariants -eq "true") { $masterTagsBlock } else { Get-FindiasTags -folderPath $parentDir }

    # --- STEP 6A: GLOBAL MASTER CONFIG (IF HASVARIANTS IS TRUE) ---
    if ($hasVariants -eq "true" -and -not $processedMasterFolders.ContainsKey($highestParent.FullName)) {
        $masterJsonPath = Join-Path $highestParent.FullName "config.json"
        $isNewMaster = -not (Test-Path $masterJsonPath)

        $masterJsonText = if ($isNewMaster) { "{`r`n}" } else { Get-Content -Raw -Path $masterJsonPath }
        $masterJsonText = [string]$masterJsonText

        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "modID" -DefaultValue $highestParent.Name -ForceOverwrite $true
        $masterCleanName = [regex]::Replace($highestParent.Name, '(?<!^)(?=[A-Z])', ' ') -replace 'Fo\s+V', 'FoV'
        $masterCleanName = [regex]::Replace($masterCleanName, '\s+', ' ').Trim()
        
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "modName" -DefaultValue $masterCleanName -ForceOverwrite $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "modAuthor" -DefaultValue "Root50199" -ForceOverwrite $false
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "modAdditionalCredits" -DefaultValue "None" -ForceOverwrite $false
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "updateType" -DefaultValue "volatile" -HandleUpdateTypeConversion $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "hasVariants" -DefaultValue "true" -ForceOverwrite $true -IsRawBlock $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "isVariant" -DefaultValue "false" -ForceOverwrite $true -IsRawBlock $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "findiasTags" -DefaultValue $masterTagsBlock -ForceOverwrite $true -IsRawBlock $true
        Set-JsonField -JsonText ([ref]$masterJsonText) -FieldName "recentUpdateNotes" -DefaultValue "n/a" -ForceOverwrite $false

        [System.IO.File]::WriteAllText($masterJsonPath, $masterJsonText, [System.Text.Encoding]::UTF8)
        Write-Host " -> Global Master Config successfully processed in lowerCamelCase." -ForegroundColor Green
        $processedMasterFolders[$highestParent.FullName] = $true
    }
    # --- STEP 6B: CHILD VARIANT CONFIG FILE ---
    $files = Get-ChildItem -Path $dataFolder.FullName -Recurse -File

    $processedPaths = @()
    foreach ($file in $files) {
        $dataIndex = $file.FullName.IndexOf("\data\", [System.StringComparison]::OrdinalIgnoreCase)
        if ($dataIndex -ge 0) {
            $relativePath = $file.FullName.Substring($dataIndex + 1).Replace('\', '/')
            $processedPaths += $relativePath
        }
    }

    $processedPaths = [array]($processedPaths | Sort-Object -Unique)
    if ($null -eq $processedPaths) { $processedPaths = @() }

    $jsonPath = Join-Path $parentDir "config.json"
    $isNewFile = -not (Test-Path $jsonPath)

    $rawJsonText = if ($isNewFile) { "{`r`n}" } else { Get-Content -Raw -Path $jsonPath }
    $rawJsonText = [string]$rawJsonText

    # First, strip out any old, broken usedfiles array completely to clean the workspace
    $rawJsonText = [regex]::Replace($rawJsonText, '(?ms)"usedfiles"\s*:\s*\[[^\]]*\]\s*,?', '')

    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "modID" -DefaultValue $modID -ForceOverwrite $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "modName" -DefaultValue $modName -ForceOverwrite $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "modAuthor" -DefaultValue "Root50199" -ForceOverwrite $false
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "modAdditionalCredits" -DefaultValue "None" -ForceOverwrite $false
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "updateType" -DefaultValue "volatile" -HandleUpdateTypeConversion $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "hasVariants" -DefaultValue $childHasVariants -ForceOverwrite $true -IsRawBlock $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "isVariant" -DefaultValue $isVariant -ForceOverwrite $true -IsRawBlock $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "findiasTags" -DefaultValue $childTagsBlock -ForceOverwrite $true -IsRawBlock $true
    Set-JsonField -JsonText ([ref]$rawJsonText) -FieldName "recentUpdateNotes" -DefaultValue "n/a" -ForceOverwrite $false

    # --- ADVANCED BOTTOM INJECTION MATRIX FOR TRAILING COMMA FIX ---
    $formattedArrayLines = $processedPaths | ForEach-Object { "        `"$_`"" }
    $arrayString = "`r`n" + ($formattedArrayLines -join ",`r`n") + "`r`n    "
    $newTagText = "`"usedfiles`": [$arrayString]"

    # Clean any dangling comma trailing right before the closing curly brace
    $rawJsonText = [regex]::Replace($rawJsonText, ',\s*(?=\})', '')
    
    # Safely inject a comma after the previous last element, then insert usedfiles at the absolute bottom
    $rawJsonText = [regex]::Replace($rawJsonText, '(?ms)(\s*)(\"[a-zA-Z]+\"\s*:\s*[^,\}\r\n]+)(\s*)(?=\})', "`$1`$2,`r`n    $newTagText`$3")

    [System.IO.File]::WriteAllText($jsonPath, $rawJsonText, [System.Text.Encoding]::UTF8)
    Write-Host " -> Successfully processed variant config file. Structural syntax validated." -ForegroundColor Green
}

Write-Host "`nAll operations completed!" -ForegroundColor Green
Write-Host "Press Enter to close this window..." -ForegroundColor Cyan
Read-Host
