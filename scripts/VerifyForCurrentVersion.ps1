# 1. Setup root location context (repo root is parent of scripts/)
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Get-Location }
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path

# 2. Prompt for the Version ID
$versionID = Read-Host "Enter the Version ID (e.g., 1.20.4)"
if ([string]::IsNullOrWhiteSpace($versionID)) {
    Write-Error "Version ID cannot be empty. Script aborted."
    Exit
}

# 3. Get all mod subfolders in the repo root
$folders = Get-ChildItem -Path $repoRoot -Directory |
           Where-Object { $_.Name -ne "scripts" } |
           Select-Object -ExpandProperty Name
if (-not $folders) {
    Write-Warning "No subfolders found in $repoRoot."
    Exit
}

# 4. Load GUI Assemblies
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 5. Construct the Form window
$form = New-Object System.Windows.Forms.Form
$form.Text = "Select Folders for Version $versionID"
$form.Size = New-Object System.Drawing.Size(400, 480)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false

# Label instruction
$label = New-Object System.Windows.Forms.Label
$label.Text = "Check the folders you want to include:"
$label.Location = New-Object System.Drawing.Point(15, 15)
$label.Size = New-Object System.Drawing.Size(350, 20)
$label.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($label)

# The Checklist box with true clickable checkboxes
$checkedListBox = New-Object System.Windows.Forms.CheckedListBox
$checkedListBox.Location = New-Object System.Drawing.Point(15, 45)
$checkedListBox.Size = New-Object System.Drawing.Size(355, 320)
$checkedListBox.CheckOnClick = $true 
$checkedListBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($checkedListBox)

# Populate folders into the checklist
foreach ($folder in $folders) {
    [void]$checkedListBox.Items.Add($folder)
}

# Select / Deselect All Button
$btnSelectAll = New-Object System.Windows.Forms.Button
$btnSelectAll.Text = "Select All"
$btnSelectAll.Location = New-Object System.Drawing.Point(15, 385)
$btnSelectAll.Size = New-Object System.Drawing.Size(120, 35)

# Logic to toggle all checkboxes
$btnSelectAll.Add_Click({
    if ($btnSelectAll.Text -eq "Select All") {
        for ($i = 0; $i -lt $checkedListBox.Items.Count; $i++) {
            $checkedListBox.SetItemChecked($i, $true)
        }
        $btnSelectAll.Text = "Deselect All"
    } else {
        for ($i = 0; $i -lt $checkedListBox.Items.Count; $i++) {
            $checkedListBox.SetItemChecked($i, $false)
        }
        $btnSelectAll.Text = "Select All"
    }
})
$form.Controls.Add($btnSelectAll)

# Confirm Button
$btnOk = New-Object System.Windows.Forms.Button
$btnOk.Text = "Confirm Selection"
$btnOk.Location = New-Object System.Drawing.Point(235, 385)
$btnOk.Size = New-Object System.Drawing.Size(135, 35)
$btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $btnOk 
$form.Controls.Add($btnOk)

# 6. Display Form & Capture Results
$result = $form.ShowDialog()

if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Warning "Window closed. Script aborted."
    $form.Dispose()
    Exit
}

# Extract checked folder names
$folderNames = @($checkedListBox.CheckedItems)
$form.Dispose()

if ($folderNames.Count -eq 0) {
    Write-Warning "No folders were checked. Script aborted."
    Exit
}

# 7. JSON Reading and Writing Logic
$jsonPath = Join-Path -Path $repoRoot -ChildPath "VerifiedForGameVersion.json"

if (Test-Path -Path $jsonPath) {
    try {
        $jsonData = Get-Content -Path $jsonPath -Raw | ConvertFrom-Json
    } catch {
        Write-Warning "Existing JSON file was invalid. Overwriting with new data."
        $jsonData = [PSCustomObject]@{}
    }
} else {
    $jsonData = [PSCustomObject]@{}
}

# Add or update the specified version mapping
if ($jsonData.PSObject.Properties[$versionID]) {
    $jsonData.PSObject.Properties[$versionID].Value = $folderNames
} else {
    $jsonData | Add-Member -NotePropertyName $versionID -NotePropertyValue $folderNames
}

# Save formatted object data back to file
$jsonData | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonPath

Write-Host "Successfully updated: $jsonPath" -ForegroundColor Green
Write-Host "Tagged folders for version '$versionID':" -ForegroundColor Green
$folderNames | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
