# 1. Setup root location context (repo root is parent of scripts/)
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Get-Location }
$currentDir = (Resolve-Path (Join-Path $scriptDir "..")).Path

# 2. Find all top-level mod subfolders to populate the GUI grid
$folders = Get-ChildItem -Path $currentDir -Directory | 
           Where-Object { $_.Name -ne "scripts" } | 
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
$form.Text = "Select Folders to Create ModDescription.md"
$form.Size = New-Object System.Drawing.Size(450, 500)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "Check the root folders you want to scan and process:"
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
$btnOk.Text = "Generate MDs"
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
# 5. Build an absolute execution queue using selected root mods as the baseline anchor
$executionQueue = [System.Collections.Generic.List[string]]::new()

foreach ($rootName in $selectedRootNames) {
    $fullRootPath = Join-Path $currentDir $rootName
    
    if (Test-Path $fullRootPath) {
        $executionQueue.Add($fullRootPath)
    }
    
    $variantDataDirs = Get-ChildItem -Path $fullRootPath -Filter "data" -Directory -Recurse
    foreach ($dataDir in $variantDataDirs) {
        $variantParent = $dataDir.Parent.FullName
        if ($variantParent -ne $fullRootPath -and -not $executionQueue.Contains($variantParent)) {
            $executionQueue.Add($variantParent)
        }
    }
}

Write-Host "Queued $($executionQueue.Count) description targets (Main Roots + Variant child paths).`n" -ForegroundColor Green
# 6. Process each folder inside our execution queue sequentially
foreach ($targetDir in $executionQueue) {
    $targetFolder = Get-Item $targetDir
    $mdPath = Join-Path $targetDir "ModDescription.md"
    
    # Track back up the tree to isolate the main root folder layout directly underneath Uiscias
    $highestParent = $targetFolder
    while ($highestParent.Parent -and $highestParent.Parent.FullName -ne $currentDir) {
        $highestParent = $highestParent.Parent
    }
    $masterMdPath = Join-Path $highestParent.FullName "ModDescription.md"
    $isVariant = $targetDir -ne $highestParent.FullName

    # Generate clean spaced title name from the folder's name property
    $cleanTitleName = [regex]::Replace($targetFolder.Name, '(?<=\D)(?=\d)|(?=\d)(?=\D)|(?<!^)(?=[A-Z])', ' ')
    $cleanTitleName = [regex]::Replace($cleanTitleName, '(?i)Fo\s+V', 'FoV')
    $cleanTitleName = [regex]::Replace($cleanTitleName, '\s+', ' ').Trim()

    Write-Host "--------------------------------------------------" -ForegroundColor Gray
    Write-Host "Processing Markdown file inside: $($targetDir.Replace($currentDir, ''))" -ForegroundColor Cyan

    # --- STEP 6A: HANDLE IMAGES FOLDER DETECTION ---
    $imagesDir = Join-Path $targetDir "images"
    $imageLines = [System.Collections.Generic.List[string]]::new()

    if (Test-Path $imagesDir) {
        $imageFiles = Get-ChildItem -Path $imagesDir -File
        foreach ($img in $imageFiles) {
            $cleanAlt = [regex]::Replace($img.BaseName, '[_-]', ' ')
            $cleanAlt = [regex]::Replace($cleanAlt, '(?i)Fo\s+V', 'FoV')
            $cleanAlt = [regex]::Replace($cleanAlt, '\s+', ' ').Trim()
            $cleanAlt = (Get-Culture).TextInfo.ToTitleCase($cleanAlt.ToLower())
            $cleanAlt = $cleanAlt -replace '\bFov\b', 'FoV'
            
            $imageLines.Add("![$cleanAlt](images/$($img.Name))")
        }
    }
    $mediaBlock = if ($imageLines.Count -gt 0) { $imageLines -join "`r`n" } else { "<Drop image reference or remove block>" }

    # --- STEP 6B: READ MASTER BACKUP SOURCE (IF EXTRACTING FOR A CHILD VARIANT) ---
    $masterWhatItDoes = "<space for manual text entry>"
    $masterHowItsMade = "<space for manual text entry>"
    
    if ($isVariant -and (Test-Path $masterMdPath)) {
        $masterRaw = [System.IO.File]::ReadAllText($masterMdPath)
        
        # Safely parse the What it does text from the master root file
        if ($masterRaw -match '(?ms)##\s+What\s+it\s+does:(.*?)(?=###\s+How|####\s+Example|\z)') {
            $extractedText = $Matches[1].Trim()
            if (-not [string]::IsNullOrWhiteSpace($extractedText) -and $extractedText -notmatch '<space for manual text entry>') {
                $masterWhatItDoes = $extractedText
            }
        }
        
        # Safely parse the How it's made text from the master root file
        if ($masterRaw -match '(?ms)###\s+How\s+it.*made:(.*?)(?=####\s+Example|\z)') {
            $extractedText = $Matches[1].Trim()
            if (-not [string]::IsNullOrWhiteSpace($extractedText) -and $extractedText -notmatch '<space for manual text entry>') {
                $masterHowItsMade = $extractedText
            }
        }
    }

    # --- STEP 6C: BUILD OR REPLACE MD BLOCKS PRESERVING USER ENTRIES ---
    if (-not (Test-Path $mdPath)) {
        Write-Host " -> ModDescription.md not found. Generating a brand new description file..." -ForegroundColor Yellow
        
        $mdText = "# $cleanTitleName`r`n`r`n" +
                  "## What it does:`r`n" + $masterWhatItDoes + "`r`n`r`n" +
                  "### How it's made:`r`n`r`n" + $masterHowItsMade + "`r`n`r`n" +
                  "#### Example Images and GIFs:`r`n" +
                  $mediaBlock + "`r`n"
    } else {
        Write-Host " -> Existing ModDescription.md detected. Synchronizing content with master fallbacks..." -ForegroundColor Green
        
        $fileLines = [System.IO.File]::ReadAllLines($mdPath)
        $cleanLines = [System.Collections.Generic.List[string]]::new()
        
        # Absolute wildcard shredder loop removes the old main header safely
        $skippedHeader = $false
        foreach ($line in $fileLines) {
            if (-not $skippedHeader -and $line -match '^\s*#.*Bri') {
                $skippedHeader = $true
                continue
            }
            $cleanLines.Add($line)
        }
        
        $mdText = $cleanLines -join "`r`n"

        # --- ARMED LAYER: SECTION SANITATION & INHERITANCE INJECTIONS ---
        # 1. Evaluate What It Does Section
        $hasWhatItDoes = $mdText -match '(?m)^[ \t]*##\s+What\s+it\s+does:'
        $isWhatItDoesEmpty = $false
        if ($hasWhatItDoes -and $mdText -match '(?ms)##\s+What\s+it\s+does:\s*(<space for manual text entry>)?\s*(?=###|####|\z)') {
            $isWhatItDoesEmpty = $true
        }

        if (-not $hasWhatItDoes) {
            $mdText = "## What it does:`r`n" + $masterWhatItDoes + "`r`n`r`n" + $mdText.TrimStart()
        } elseif ($isWhatItDoesEmpty -and $masterWhatItDoes -ne "<space for manual text entry>") {
            Write-Host "    -> Copying missing content block into [What it does] from Master root..." -ForegroundColor Yellow
            $mdText = [regex]::Replace($mdText, '(?ms)##\s+What\s+it\s+does:\s*(<space for manual text entry>)?\s*(?=###|####|\z)', "## What it does:`r`n" + $masterWhatItDoes + "`r`n`r`n")
        }

        # 2. Evaluate How It's Made Section
        $hasHowItsMade = $mdText -match '(?m)^[ \t]*###\s+How\s+it.*made:'
        $isHowItsMadeEmpty = $false
        if ($hasHowItsMade -and $mdText -match '(?ms)###\s+How\s+it.*made:\s*(<space for manual text entry>)?\s*(?=####|\z)') {
            $isHowItsMadeEmpty = $true
        }

        if (-not $hasHowItsMade) {
            if ($mdText -match '(?m)^[ \t]*####\s+Example\s+Images') {
                $mdText = [regex]::Replace($mdText, '(?m)^([ \t]*####\s+Example\s+Images)', "### How it's made:`r`n" + $masterHowItsMade + "`r`n`r`n`$1")
            } else {
                $mdText = $mdText.TrimEnd() + "`r`n`r`n### How it's made:`r`n" + $masterHowItsMade
            }
        } elseif ($isHowItsMadeEmpty -and $masterHowItsMade -ne "<space for manual text entry>") {
            Write-Host "    -> Copying missing content block into [How it's made] from Master root..." -ForegroundColor Yellow
            $mdText = [regex]::Replace($mdText, '(?ms)###\s+How\s+it.*made:\s*(<space for manual text entry>)?\s*(?=####|\z)', "### How it's made:`r`n" + $masterHowItsMade + "`r`n`r`n")
        }

        # Force prepend the clean main folder title to the top of the stream block safely
        $mdText = "# " + $cleanTitleName + "`r`n`r`n" + $mdText.TrimStart()

        # Overwrite or insert the example image media block safely at the absolute end
        $mediaPattern = "(?ms)#### Example Images and GIFs:.*"
        $newMediaSection = "#### Example Images and GIFs:`r`n" + $mediaBlock + "`r`n"
        
        if ($mdText -match "#### Example Images and GIFs:") {
            $mdText = [regex]::Replace($mdText, $mediaPattern, $newMediaSection)
        } else {
            $mdText = $mdText.TrimEnd() + "`r`n`r`n" + $newMediaSection
        }
    }

    # Write text out explicitly using UTF8 encoding blocks
    [System.IO.File]::WriteAllText($mdPath, $mdText, [System.Text.Encoding]::UTF8)
    Write-Host " -> Successfully processed: $mdPath" -ForegroundColor Green
}

Write-Host "`nAll operations completed!" -ForegroundColor Green
Write-Host "Press Enter to close this window..." -ForegroundColor Cyan
Read-Host
