import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Monitor the OS window owner independently of Chromium's emulated DOM focus.
 * Only the browser PID obtained from the current CDP connection is activated. */
export async function monitorWindowsBrowserForeground(browserPid) {
  if (!Number.isSafeInteger(browserPid) || browserPid <= 0) throw new Error('Invalid owned browser PID.');
  const source = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class QaBrowserForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint first, uint second, bool attach);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  public static void Activate(int browserPid) {
    var window = System.Diagnostics.Process.GetProcessById(browserPid).MainWindowHandle;
    if (window == IntPtr.Zero) return;
    uint ignored;
    var current = GetCurrentThreadId();
    var foreground = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
    var joined = foreground != 0 && foreground != current && AttachThreadInput(current, foreground, true);
    try { SetForegroundWindow(window); }
    finally { if (joined) AttachThreadInput(current, foreground, false); }
  }
  public static uint ProcessId() {
    uint processId;
    GetWindowThreadProcessId(GetForegroundWindow(), out processId);
    return processId;
  }
  public static volatile bool StopRequested;
  public static void ListenForStop() {
    var listener = new Thread(() => { Console.ReadLine(); StopRequested = true; });
    listener.IsBackground = true;
    listener.Start();
  }
}
'@
$qaBrowserPid = ${browserPid}
$qaShell = New-Object -ComObject WScript.Shell
for ($attempt = 0; $attempt -lt 10; $attempt++) {
  $qaShell.AppActivate($qaBrowserPid) | Out-Null
  if ([QaBrowserForeground]::ProcessId() -ne $qaBrowserPid) { [QaBrowserForeground]::Activate($qaBrowserPid) }
  Start-Sleep -Milliseconds 100
  if ([QaBrowserForeground]::ProcessId() -eq $qaBrowserPid) { break }
}
$initial = [QaBrowserForeground]::ProcessId()
if ($initial -ne $qaBrowserPid) { throw 'Windows could not activate the owned benchmark browser.' }
[Console]::Out.WriteLine((@{ type='ready'; browserPid=$qaBrowserPid; initialForegroundPid=$initial } | ConvertTo-Json -Compress))
[QaBrowserForeground]::ListenForStop()
$clock = [Diagnostics.Stopwatch]::StartNew()
$events = New-Object 'Collections.Generic.List[Object]'
$lost = $false
$samples = 0
do {
  $observed = [QaBrowserForeground]::ProcessId()
  $samples++
  if ($observed -ne $qaBrowserPid) {
    $lost = $true
    if ($events.Count -lt 32) { $events.Add(@{ elapsedMs=$clock.ElapsedMilliseconds; foregroundPid=$observed }) }
  }
  Start-Sleep -Milliseconds 100
} while (-not [QaBrowserForeground]::StopRequested -and $clock.ElapsedMilliseconds -lt 1200000)
$final = [QaBrowserForeground]::ProcessId()
$focused = $final -eq $qaBrowserPid
[Console]::Out.WriteLine((@{ type='complete'; browserPid=$qaBrowserPid; initialForegroundPid=$initial;
  finalForegroundPid=$final; focusedAtEnd=$focused; lostFocus=$lost; samples=$samples;
  events=@($events.ToArray()); passed=($focused -and -not $lost -and [QaBrowserForeground]::StopRequested) } | ConvertTo-Json -Depth 4 -Compress))
`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(source, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let complete, ready, rejectReady, stderr = '';
  const initialized = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    try {
      const value = JSON.parse(line);
      if (value.type === 'ready') ready(value);
      if (value.type === 'complete') complete = value;
    } catch { /* PowerShell diagnostics are retained below if initialization fails. */ }
  });
  child.stderr.on('data', data => { if (stderr.length < 4096) stderr += data; });
  child.stdin.on('error', () => {});
  child.on('error', error => rejectReady(error));
  const closed = new Promise(resolve => child.once('close', code => {
    const result = complete ?? { passed: false, browserPid, error: stderr || `Foreground monitor exited ${code}.` };
    rejectReady(new Error(result.error ?? 'Foreground monitor closed before initialization.'));
    lines.close(); resolve(result);
  }));
  const timeout = setTimeout(() => { child.kill(); rejectReady(new Error('Windows foreground monitor timed out.')); }, 15000);
  try { await initialized; }
  catch (error) { child.kill(); await closed; throw error; }
  finally { clearTimeout(timeout); }
  let finishing;
  return () => finishing ??= (async () => {
    child.stdin.end('stop\n');
    return closed;
  })();
}
