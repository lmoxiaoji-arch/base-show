$connections = Get-NetTCPConnection -RemotePort 8080 -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($c in $connections) {
        $pid = $c.OwningProcess
        $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "Found process connecting to 8080! Name: $($p.Name) (ID: $pid)"
            Stop-Process $pid -Force
        }
    }
} else {
    Write-Host "No processes found connecting to 8080."
}
