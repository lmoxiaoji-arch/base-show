Get-Process Antigravity -ErrorAction SilentlyContinue | Select-Object Id, StartTime, MainWindowTitle | Sort-Object StartTime -Descending | ForEach-Object {
    Write-Host "ID: $($_.Id) | Started: $($_.StartTime) | Title: $($_.MainWindowTitle)"
}
