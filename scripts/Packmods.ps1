# 1. Configuration - repo root is parent of scripts/
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Get-Location }
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path

$packerDir = Join-Path $scriptDir "Mabi-pack2"
$packerExe = Join-Path $packerDir "mabi-pack2.exe"
$packKey   = "})wWb4?-sVGHNoPKpc"

# Ensure the packer exists in the relative folder before continuing
if (-not (Test-Path $packerExe)) {
    Write-Error "Could not find mabi-pack2.exe at $packerExe. Please verify the 'Mabi-pack2' folder is alongside this script in scripts/."
    Exit
}

# 2. Get all top-level mod subfolders in the repo root
$excludeFolders = @('scripts', 'node_modules')
$folders = Get-ChildItem -Path $repoRoot -Directory |
           Where-Object { $excludeFolders -notcontains $_.Name -and -not $_.Name.StartsWith('.') } |
           Select-Object -ExpandProperty Name

if (-not $folders) {
    Write-Warning "No subfolders found in $repoRoot."
    Exit
}

# 3. Load GUI Assemblies
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 4. Construct the Form window
$form = New-Object System.Windows.Forms.Form
$form.Text = "Select Folders & Override Suffixes"
$form.Size = New-Object System.Drawing.Size(500, 520)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "Select folders and optionally set a manual 5-digit number override per row:"
$label.Location = New-Object System.Drawing.Point(15, 15)
$label.Size = New-Object System.Drawing.Size(450, 20)
$label.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($label)

# --- ADVANCED DATAGRIDVIEW SETUP ---
$dataGridView = New-Object System.Windows.Forms.DataGridView
$dataGridView.Location = New-Object System.Drawing.Point(15, 45)
$dataGridView.Size = New-Object System.Drawing.Size(455, 330)
$dataGridView.AllowUserToAddRows = $false
$dataGridView.AllowUserToDeleteRows = $false
$dataGridView.RowHeadersVisible = $false
$dataGridView.SelectionMode = [System.Windows.Forms.DataGridViewSelectionMode]::CellSelect
$dataGridView.EditMode = [System.Windows.Forms.DataGridViewEditMode]::EditOnEnter

# Column 1: Checkbox
$colCheck = New-Object System.Windows.Forms.DataGridViewCheckBoxColumn
$colCheck.HeaderText = "Pack"
$colCheck.Name = "Pack"
$colCheck.Width = 50
[void]$dataGridView.Columns.Add($colCheck)

# Column 2: Folder Name (Read Only)
$colName = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$colName.HeaderText = "Folder Name"
$colName.Name = "FolderName"
$colName.ReadOnly = $true
$colName.Width = 260
[void]$dataGridView.Columns.Add($colName)

# Column 3: Manual Override Input
$colOverride = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$colOverride.HeaderText = "Override"
$colOverride.Name = "Override"
$colOverride.Width = 120
[void]$dataGridView.Columns.Add($colOverride)

# Populate rows
foreach ($folder in $folders) {
    [void]$dataGridView.Rows.Add($false, $folder, "")
}
$form.Controls.Add($dataGridView)
# -----------------------------------

# Select / Deselect All Button
$btnSelectAll = New-Object System.Windows.Forms.Button
$btnSelectAll.Text = "Select All"
$btnSelectAll.Location = New-Object System.Drawing.Point(15, 410)
$btnSelectAll.Size = New-Object System.Drawing.Size(120, 35)
$btnSelectAll.Add_Click({
    $dataGridView.EndEdit()
    if ($btnSelectAll.Text -eq "Select All") {
        foreach ($row in $dataGridView.Rows) { $row.Cells["Pack"].Value = $true }
        $btnSelectAll.Text = "Deselect All"
    } else {
        foreach ($row in $dataGridView.Rows) { $row.Cells["Pack"].Value = $false }
        $btnSelectAll.Text = "Select All"
    }
})
$form.Controls.Add($btnSelectAll)

# Start Packing Button
$btnOk = New-Object System.Windows.Forms.Button
$btnOk.Text = "Start Packing"
$btnOk.Location = New-Object System.Drawing.Point(335, 410)
$btnOk.Size = New-Object System.Drawing.Size(135, 35)
$btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $btnOk 
$form.Controls.Add($btnOk)

# 5. Display Form & Process Results
$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Warning "Window closed. Script aborted."
    $form.Dispose()
    Exit
}

$dataGridView.EndEdit()

# Extract selected roots and map their unique row override text properties
$selectedMappings = [System.Collections.Generic.Dictionary[string, string]]::new()
foreach ($row in $dataGridView.Rows) {
    if ($row.Cells["Pack"].Value -eq $true) {
        $fName = $row.Cells["FolderName"].Value.ToString()
        $rawOverride = if ($row.Cells["Override"].Value) { $row.Cells["Override"].Value.ToString().Trim() } else { "" }
        $selectedMappings.Add($fName, $rawOverride)
    }
}
$form.Dispose()

if ($selectedMappings.Count -eq 0) {
    Write-Warning "No folders were checked. Script aborted."
    Exit
}

# 6. Locate all 'data' folders recursively inside selected paths
Write-Host "Scanning for 'data' folders..." -ForegroundColor Cyan
$taskQueue = [System.Collections.Generic.List[PSCustomObject]]::new()

foreach ($rootName in $selectedMappings.Keys) {
    $fullRootPath = Join-Path $repoRoot $rootName
    $rootOverride = $selectedMappings[$rootName]
    
    if ($rootName -eq "data") {
        $taskQueue.Add([PSCustomObject]@{ Folder = (Get-Item $fullRootPath); Override = $rootOverride })
    }
    
    $found = Get-ChildItem -Path $fullRootPath -Filter "data" -Directory -Recurse
    foreach ($item in $found) {
        $taskQueue.Add([PSCustomObject]@{ Folder = $item; Override = $rootOverride })
    }
}

if ($taskQueue.Count -eq 0) {
    Write-Warning "No 'data' folders found inside the selections."
    Exit
}

Write-Host "Found $($taskQueue.Count) 'data' folders to pack.`n" -ForegroundColor Green

# 7. Core Packing Loop
foreach ($task in $taskQueue) {
    $dataFolder     = $task.Folder
    $manualOverride = $task.Override
    
    $parentDir   = $dataFolder.Parent.FullName  
    $parentName  = $dataFolder.Parent.Name      
    $tempDir     = Join-Path $packerDir "temp"
    $tempDataDir = Join-Path $tempDir "data"

    # Define output target to a "build" directory alongside the respective "data" folder
    $buildDir    = Join-Path $parentDir "build"

    Write-Host "--------------------------------------------------" -ForegroundColor Gray
    Write-Host "Processing folder containing 'data': $parentName" -ForegroundColor Cyan

    $formattedNumber = ""
    $escapedParentName = [regex]::Escape($parentName)
    $pattern = "^Uiscias" + $escapedParentName + "_(\d{5})\.it$"

    # Assess manual override value
    if (-not [string]::IsNullOrWhiteSpace($manualOverride)) {
        if ($manualOverride -match '^\d+$') {
            $formattedNumber = ([int]$manualOverride).ToString("D5")
            Write-Host " -> Using manual row override suffix: $formattedNumber" -ForegroundColor Magenta
        } else {
            Write-Warning "Override cell configuration '$manualOverride' is invalid. Falling back to auto-increment."
        }
    }

    # --- ENFORCED STEP: VERSION CHECK IN NEW LOCATION ---
    # Scans only the newly designated "build" folder for version history to determine the next increment number
    if ([string]::IsNullOrWhiteSpace($formattedNumber)) {
        $nextNumber = 1
        if (Test-Path $buildDir) {
            $allFiles = Get-ChildItem -Path $buildDir -File
            foreach ($file in $allFiles) {
                if ([regex]::IsMatch($file.Name, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
                    $matchObj = [regex]::Match($file.Name, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                    $currentNum = [int]$matchObj.Groups[1].Value
                    if ($currentNum -ge $nextNumber) {
                        $nextNumber = $currentNum + 1
                    }
                }
            }
        }
        $formattedNumber = $nextNumber.ToString("D5")
    }

    # Generate final filenames
    $outputItName = "Uiscias" + $parentName + "_" + $formattedNumber + ".it"
    Write-Host " -> Target Filename: $outputItName" -ForegroundColor Yellow

    $packedFileLocal  = Join-Path $packerDir $outputItName
    $packedFileTarget = Join-Path $buildDir $outputItName

    # Ensure the "build" subfolder exists before outputting files to it
    if (-not (Test-Path $buildDir)) {
        New-Item -Path $buildDir -ItemType Directory -Force | Out-Null
    }

    # Enforce clear-down protection for conflicting overrides inside the build folder
    if (Test-Path $packedFileTarget) {
        Write-Host " -> Found existing duplicate file in build folder. Overwriting: $outputItName" -ForegroundColor DarkYellow
        Remove-Item -Path $packedFileTarget -Force -Confirm:$false
    }

    # Cleanup leftover environments
    if (Test-Path $tempDir) { Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue }

    # Copy files
    Copy-Item -Path $dataFolder.FullName -Destination $tempDataDir -Recurse -Force

    # Run packer execution task
    $processArgs = @("pack", "-i", ".\temp\", "-o", ".\$outputItName", "-k", $packKey)
    $processStartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processStartInfo.FileName = $packerExe
    $processStartInfo.Arguments = $processArgs
    $processStartInfo.WorkingDirectory = $packerDir
    $processStartInfo.UseShellExecute = $false
    
    $process = [System.Diagnostics.Process]::Start($processStartInfo)
    $process.WaitForExit()

    if (Test-Path $tempDir) { Remove-Item -Path $tempDir -Recurse -Force }

     # Validate output and relocate file contents 
    if (Test-Path $packedFileLocal) {
        Move-Item -Path $packedFileLocal -Destination $packedFileTarget -Force
        Write-Host "Successfully created and moved to: $packedFileTarget" -ForegroundColor Green
        
        # --- FIXED VERSION ROTATION: Cleans oldest history directly inside the build directory ---
        Write-Host " -> Checking version history inside build directory..." -ForegroundColor Gray
        $trackedFiles = [System.Collections.Generic.List[PSCustomObject]]::new()
        
        $currentItFiles = Get-ChildItem -Path $buildDir -File
        foreach ($file in $currentItFiles) {
            if ([regex]::IsMatch($file.Name, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
                $matchObj = [regex]::Match($file.Name, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                $versionNum = [int]$matchObj.Groups[1].Value
                
                $trackedFiles.Add([PSCustomObject]@{
                    Version  = $versionNum
                    FullName = $file.FullName
                    Name     = $file.Name
                })
            }
        }
        
        if ($trackedFiles.Count -gt 3) {
            $sortedVersions = $trackedFiles | Sort-Object Version
            $deleteCount = $sortedVersions.Count - 3
            
            Write-Host " -> Found $($sortedVersions.Count) versions inside build. Removing the oldest $deleteCount..." -ForegroundColor DarkYellow
            for ($i = 0; $i -lt $deleteCount; $i++) {
                $oldFile = $sortedVersions[$i]
                Write-Host "    [DELETING OLD BUILD VERSION] $($oldFile.Name)" -ForegroundColor DarkGray
                Remove-Item -Path $oldFile.FullName -Force -Confirm:$false
            }
        } else {
            Write-Host " -> Total tracked versions in build folder is $($trackedFiles.Count) (<= 3). No cleanup required." -ForegroundColor Gray
        }
        # -----------------------------------------------------------
        
    } else {
        Write-Error "Packer failed to output $outputItName. Skipping step."
    }
}

Write-Host "`nAll packing sequences complete!" -ForegroundColor Green
