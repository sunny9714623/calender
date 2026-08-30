param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$samples = Join-Path $PSScriptRoot '..\samples'

function New-Docx($entries, $destPath) {
    if (Test-Path $destPath) { Remove-Item -LiteralPath $destPath -Force }
    $fs = [System.IO.File]::Open($destPath, [System.IO.FileMode]::Create)
    $zip = [System.IO.Compression.ZipArchive]::new($fs, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($e in $entries) {
            $entry = $zip.CreateEntry($e.Name, [System.IO.Compression.CompressionLevel]::Optimal)
            $sw = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
            $sw.Write($e.Content)
            $sw.Dispose()
        }
    } finally {
        $zip.Dispose()
        $fs.Dispose()
    }
}

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
'@
$rels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@

function Add-P($sb, $text) {
    [void]$sb.Append('<w:p><w:r><w:t xml:space="preserve">')
    [void]$sb.Append($text)
    [void]$sb.Append('</w:t></w:r></w:p>')
}

# ---------- 表格版 ----------
$sb = [System.Text.StringBuilder]::new()
[void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
[void]$sb.Append('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>')
[void]$sb.Append('<w:p><w:r><w:t>2026 年 08 月 31 日 – 09 月 06 日 周行事例</w:t></w:r></w:p>')
[void]$sb.Append('<w:tbl>')
$table = @(
    @('日期','星期','开始时间','结束时间','事项','地点','负责人','备注'),
    @('2026-08-31','周一','09:00','10:30','部门周例会','3F会议室','张三','带电脑'),
    @('2026-08-31','周一','14:00','15:30','客户拜访','客户公司','李四',''),
    @('2026-09-01','周二','','','全天培训','大教室','王五',''),
    @('2026-09-02','周三','10:00','11:00','产品评审','线上会议','张三、李四',''),
    @('2026-09-03','周四','','','项目周报提交','','全员','下班前'),
    @('2026-09-04','周五','09:00','12:00','季度目标对齐','1F报告厅','管理层',''),
    @('2026-09-05','周六','22:00','02:00','系统发布窗口','运维室','赵六','跨天事件'),
    @('2026-09-06','周日','','','休息','','','')
)
foreach ($row in $table) {
    [void]$sb.Append('<w:tr>')
    foreach ($cell in $row) {
        [void]$sb.Append('<w:tc><w:p><w:r><w:t xml:space="preserve">')
        [void]$sb.Append($cell)
        [void]$sb.Append('</w:t></w:r></w:p></w:tc>')
    }
    [void]$sb.Append('</w:tr>')
}
[void]$sb.Append('</w:tbl><w:sectPr/></w:body></w:document>')
New-Docx @(
    @{ Name = '[Content_Types].xml'; Content = $contentTypes },
    @{ Name = '_rels/.rels'; Content = $rels },
    @{ Name = 'word/document.xml'; Content = $sb.ToString() }
) (Join-Path $samples 'sample-weekly.docx')

# ---------- 纯段落版 ----------
$sb2 = [System.Text.StringBuilder]::new()
[void]$sb2.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
[void]$sb2.Append('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>')
Add-P $sb2 '本周行事例（按行解析）'
Add-P $sb2 '2026-08-31 周一 09:00-10:30 部门周例会 @3F会议室 负责人:张三'
Add-P $sb2 '2026-08-31 周一 14:00-15:30 客户拜访 @客户公司 负责人:李四'
Add-P $sb2 '09-01 周二 全天培训 @大教室 负责人:王五'
Add-P $sb2 '2026-09-02 周三 10:00-11:00 产品评审 @线上会议'
Add-P $sb2 '2026-09-04 周五 09:00-12:00 季度目标对齐 @1F报告厅 负责人:管理层'
Add-P $sb2 '2026-09-05 周六 22:00-02:00 系统发布窗口 @运维室 负责人:赵六'
[void]$sb2.Append('<w:sectPr/></w:body></w:document>')
New-Docx @(
    @{ Name = '[Content_Types].xml'; Content = $contentTypes },
    @{ Name = '_rels/.rels'; Content = $rels },
    @{ Name = 'word/document.xml'; Content = $sb2.ToString() }
) (Join-Path $samples 'sample-text-weekly.docx')

Write-Host 'docx 示例已生成'
