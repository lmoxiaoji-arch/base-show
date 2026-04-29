Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id, ProcessName, MainWindowTitle | Out-File "e:\Abel\web\base\scratch\all_windows.txt"
