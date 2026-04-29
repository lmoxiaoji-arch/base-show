Get-Process | ForEach-Object {
    try {
        if ($_.MainWindowTitle -match "TechSun" -or $_.MainWindowTitle -match "Parallax") {
            $title = $_.MainWindowTitle
            $id = $_.Id
            Write-Host "Closing: $title (ID: $id)"
            Stop-Process -Id $id -Force
        }
    } catch {}
}
