# Makes the small Word, Excel and PowerPoint files in tests/fixtures/office/ that read_document is checked against
# (road-to-1.3.md C1). They have to be saved by Office itself, not by our own writers, so the reader meets real files.
# Run from the repository root on a machine with Office: powershell -ExecutionPolicy Bypass -File tools/make-office-fixtures.ps1
#
# Office may already be open with the user's own files. This script only quits an Office instance once nothing but its
# own file was in it, and never stops a process: PowerPoint in particular hands back the running instance.
$ErrorActionPreference = 'Stop'
$out = Join-Path (Get-Location) 'tests\fixtures\office'
New-Item -ItemType Directory -Force -Path $out | Out-Null

# One line of Chinese, built from code points so the script itself stays ASCII whatever encoding PowerShell reads it in.
$chinese = -join [char[]](0x8FD9, 0x662F, 0x4E00, 0x884C, 0x4E2D, 0x6587, 0x3002)

# Paths go to Office as [string]: handed a PowerShell-wrapped string, Word's SaveAs2 hangs instead of failing.
# Word's Quit takes its arguments by reference, so it is called with none.
function Release($com) { if ($com) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($com) } }

# Word: a Heading 1, a paragraph with bold, a bulleted list, a 2 x 3 table and the Chinese line.
$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0 # wdAlertsNone
  $doc = $word.Documents.Add()
  $sel = $word.Selection
  $sel.Style = $doc.Styles.Item(-2) # wdStyleHeading1
  $sel.TypeText('Quarterly report')
  $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item(-1) # wdStyleNormal
  $sel.TypeText('This paragraph has ')
  $sel.Font.Bold = 1
  $sel.TypeText('bold words')
  $sel.Font.Bold = 0
  $sel.TypeText(' in it.')
  $sel.TypeParagraph()
  $sel.Range.ListFormat.ApplyBulletDefault()
  $sel.TypeText('First point')
  $sel.TypeParagraph()
  $sel.TypeText('Second point')
  $sel.TypeParagraph()
  $sel.Range.ListFormat.RemoveNumbers()
  $sel.TypeText($chinese)
  $sel.TypeParagraph()
  $table = $doc.Tables.Add($sel.Range, 2, 3)
  $cells = @(@('Name', 'Count', 'Note'), @('Apples', '3', 'Fresh'))
  for ($r = 0; $r -lt 2; $r++) { for ($c = 0; $c -lt 3; $c++) { $table.Cell($r + 1, $c + 1).Range.Text = $cells[$r][$c] } }
  $doc.SaveAs2([string](Join-Path $out 'sample.docx'), 16) # wdFormatXMLDocument
} finally {
  # Our own file is closed even when something above failed, so the instance can go.
  if ($doc) { $doc.Close(0) }
  if ($word.Documents.Count -eq 0) { $word.Quit() }
  Release $word
}

# Excel: two sheets, numbers, text, a SUM formula and the Chinese line.
$excel = New-Object -ComObject Excel.Application
try {
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $book = $excel.Workbooks.Add()
  while ($book.Worksheets.Count -lt 2) { [void]$book.Worksheets.Add([Type]::Missing, $book.Worksheets.Item($book.Worksheets.Count)) }
  $sales = $book.Worksheets.Item(1)
  $sales.Name = 'Sales'
  # Each value typed by hand: one taken out of a PowerShell array reaches Excel wrapped, and Value2 refuses it.
  $names = @('Item', 'Tea', 'Cake', 'Jam, small')
  $amounts = @(12.5, 30, 4)
  for ($r = 0; $r -lt 4; $r++) { $sales.Cells.Item($r + 1, 1).Value2 = [string]$names[$r] }
  $sales.Cells.Item(1, 2).Value2 = 'Amount'
  for ($r = 0; $r -lt 3; $r++) { $sales.Cells.Item($r + 2, 2).Value2 = [double]$amounts[$r] }
  $sales.Cells.Item(5, 1).Value2 = 'Total'
  $sales.Cells.Item(5, 2).Formula = '=SUM(B2:B4)'
  $notes = $book.Worksheets.Item(2)
  $notes.Name = 'Notes'
  $notes.Cells.Item(1, 1).Value2 = $chinese
  $notes.Cells.Item(2, 1).Value2 = 'Open'
  $notes.Cells.Item(2, 2).Value2 = $true
  $book.SaveAs([string](Join-Path $out 'sample.xlsx'), 51) # xlOpenXMLWorkbook
} finally {
  if ($book) { $book.Close($false) }
  if ($excel.Workbooks.Count -eq 0) { $excel.Quit() }
  Release $excel
}

# PowerPoint: a title slide and a bullet slide with speaker notes. PowerPoint refuses to hide its window, so the
# presentation is made without one instead; its "no alerts" value is 1, not 0.
$ppt = New-Object -ComObject PowerPoint.Application
try {
  $ppt.DisplayAlerts = 1 # ppAlertsNone
  $pres = $ppt.Presentations.Add(0) # no window
  $title = $pres.Slides.Add(1, 1) # ppLayoutTitle
  $title.Shapes.Item(1).TextFrame.TextRange.Text = 'Spring menu'
  $title.Shapes.Item(2).TextFrame.TextRange.Text = 'Lamplight Nook'
  $bullets = $pres.Slides.Add(2, 2) # ppLayoutText
  $bullets.Shapes.Item(1).TextFrame.TextRange.Text = 'What is new'
  $bullets.Shapes.Item(2).TextFrame.TextRange.Text = "Lemon tart`rHot chocolate`r$chinese"
  $bullets.NotesPage.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = 'Mention the tart first.'
  $pres.SaveAs([string](Join-Path $out 'sample.pptx'), 24) # ppSaveAsOpenXMLPresentation
} finally {
  if ($pres) { $pres.Close() }
  if ($ppt.Presentations.Count -eq 0) { $ppt.Quit() }
  Release $ppt
}
Get-ChildItem $out | Select-Object Name, Length
