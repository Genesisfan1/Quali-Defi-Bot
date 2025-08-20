$ErrorActionPreference = "Stop"

# Paths
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $root "..")

# Stop and remove container
docker rm -f quali-bot 2>$null | Out-Null

# Remove image to avoid stale layers and prune builder cache
docker rmi -f quali-bot:latest 2>$null | Out-Null
docker builder prune -f | Out-Null

# Rebuild without cache
docker build --no-cache -t quali-bot:latest .

# Ensure encryption volume exists
docker volume inspect quali-bot-encryption *> $null
if ($LASTEXITCODE -ne 0) { docker volume create quali-bot-encryption | Out-Null }

# Start container
docker run -d --name quali-bot --env-file ./.env -e BOT_ENCRYPTION_DIR=/app/encryption -v quali-bot-encryption:/app/encryption -p 8080:8080 quali-bot:latest | Out-Null

# Health check
Start-Sleep -s 3
$health = (Invoke-WebRequest -UseBasicParsing http://localhost:8080/health).Content
Write-Output $health


