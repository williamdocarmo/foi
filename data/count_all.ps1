$curiositiesPath = "C:\Users\wdocarmo\OneDrive - Amgen\Documents\repository\sabia\foi\data\curiosities"
$quizPath = "C:\Users\wdocarmo\OneDrive - Amgen\Documents\repository\sabia\foi\data\quiz-questions"

Write-Host "=== CURIOSIDADES ===" -ForegroundColor Green
$totalCuriosities = 0
Get-ChildItem "$curiositiesPath\*.json" | Sort-Object Name | ForEach-Object {
    try {
        $content = Get-Content $_.FullName -Raw | ConvertFrom-Json
        $count = $content.Length
        $totalCuriosities += $count
        Write-Host "$($_.BaseName): $count"
    } catch {
        Write-Host "$($_.BaseName): ERRO" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== QUIZ QUESTIONS ===" -ForegroundColor Green
$totalQuiz = 0
Get-ChildItem "$quizPath\*.json" | Sort-Object Name | ForEach-Object {
    try {
        $content = Get-Content $_.FullName -Raw | ConvertFrom-Json
        $count = $content.Length
        $totalQuiz += $count
        Write-Host "$($_.BaseName): $count"
    } catch {
        Write-Host "$($_.BaseName): ERRO" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== TOTAIS ===" -ForegroundColor Yellow
Write-Host "Total Curiosidades: $totalCuriosities"
Write-Host "Total Quiz Questions: $totalQuiz"
Write-Host "GRAND TOTAL: $($totalCuriosities + $totalQuiz)"