Get-CimInstance Win32_Process | ForEach-Object {
    $cmd = $_.CommandLine
    if ($cmd -like "*127.0.0.1:8080*" -or $cmd -like "*TechSun*") {
        Write-Host "Killed process: $($_.Name) (ID: $($_.ProcessId))"
        Stop-Process $_.ProcessId -Force
    }
}

Get-Process | ForEach-Object {
    if ($_.MainWindowTitle -like "*TechSun*" -or $_.MainWindowTitle -like "*Parallax*") {
        Write-Host "Killed window: $($_.MainWindowTitle) (ID: $($_.Id))"
        Stop-Process $_.Id -Force
    }
}
