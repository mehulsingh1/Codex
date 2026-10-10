# Starts backend (port 8000) and frontend (port 5173). Ctrl+C stops both.
# The backend does not auto-reload (reloading re-loads Kokoro and was unreliable): restart this script after backend edits.
$root = $PSScriptRoot
# .venv312 (Python 3.12 + CUDA torch + Kokoro) is preferred; .venv (3.13) runs with Edge TTS only.
$py = Join-Path $root "backend\.venv312\python.exe"
if (-not (Test-Path $py)) { $py = Join-Path $root "backend\.venv\Scripts\python.exe" }
if (-not (Test-Path $py)) { $py = "python" }

$backend = Start-Process -PassThru -NoNewWindow -WorkingDirectory (Join-Path $root "backend") `
  -FilePath $py -ArgumentList "-m", "uvicorn", "app.main:app", "--port", "8000"
try {
  Set-Location (Join-Path $root "frontend")
  npm run dev
} finally {
  if (-not $backend.HasExited) { taskkill /PID $backend.Id /T /F | Out-Null }
}
