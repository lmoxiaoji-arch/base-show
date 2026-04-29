Get-CimInstance Win32_Process -Filter "Name = 'Antigravity.exe'" | Select-Object ProcessId, CommandLine | ForEach-Object {
    if ($_.CommandLine -like "*127.0.0.1:8080*") {
        Write-Host "Found zombie process! ID: $($_.ProcessId)"
        Stop-Process $_.ProcessId -Force
    }
}
