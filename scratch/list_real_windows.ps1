Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Id, ProcessName, MainWindowTitle | Out-File "e:\Abel\web\base\scratch\all_real_windows.txt"
