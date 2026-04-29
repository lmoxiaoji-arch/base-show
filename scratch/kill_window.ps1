Get-Process | ForEach-Object {
    if ($_.MainWindowTitle -like "*TechSun*") {
        Write-Host "Closing window: $($_.MainWindowTitle) (ID: $($_.Id))"
        Stop-Process $_.Id -Force
    }
}
