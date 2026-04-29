$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class WindowManager {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public static List<IntPtr> FindWindows(string titlePart) {
        List<IntPtr> windows = new List<IntPtr>();
        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam) {
            if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, sb.Capacity);
                string title = sb.ToString();
                if (title.Contains(titlePart)) {
                    windows.Add(hWnd);
                }
            }
            return true;
        }, IntPtr.Zero);
        return windows;
    }
}
"@

# 检查类型是否已定义，避免重复定义报错
if (-not ([System.Management.Automation.PSTypeName]"WindowManager").Type) {
    Add-Type -TypeDefinition $code
}

$windows = [WindowManager]::FindWindows("TechSun")
if ($windows.Count -eq 0) {
    Write-Host "No TechSun windows found."
} else {
    foreach ($hw in $windows) {
        $targetPid = 0
        [WindowManager]::GetWindowThreadProcessId($hw, [ref]$targetPid)
        if ($targetPid -ne 0) {
            Write-Host "Found TechSun window! PID: $targetPid. Killing process..."
            Stop-Process -Id $targetPid -Force
        }
    }
}
