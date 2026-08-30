param()
$ErrorActionPreference = 'Stop'

$git = 'E:\Program Files (x86)\Git\cmd\git.exe'
Push-Location (Join-Path $PSScriptRoot '..')

$sec = Read-Host '请输入 GitHub Personal Access Token（需勾选 repo 权限）' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
$sec = $null

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host '未输入令牌，已取消。'
    Pop-Location
    exit 1
}

# 保存令牌到 Windows 凭据管理器（供后续免密推送）
& cmdkey /generic:git:https://github.com /user:sunny9714623 /pass:$token | Out-Null

$env:GIT_TERMINAL_PROMPT = '0'
& $git config credential.helper wincred
& $git push -u origin main
$code = $LASTEXITCODE
$token = $null

if ($code -eq 0) {
    Write-Host ''
    Write-Host '推送成功！后续修改代码只需：git add -A; git commit -m "说明"; git push'
} else {
    Write-Host ''
    Write-Host '推送失败：请确认令牌有效且勾选了 repo 权限，然后重试。'
}
Pop-Location
exit $code
