$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3999'
$pass = 0; $fail = 0
function Check($name, $cond) {
  if ($cond) { Write-Host "PASS: $name"; $script:pass++ }
  else { Write-Host "FAIL: $name"; $script:fail++ }
}

# 1. Public pages serve
foreach ($p in @('/','/track','/tracking','/tracking/details','/customs','/services','/about','/contact','/admin/login')) {
  try { $r = Invoke-WebRequest "$base$p" -UseBasicParsing; Check "page $p" ($r.StatusCode -eq 200) }
  catch { Check "page $p" $false }
}

# 2. Invalid tracking returns error
try {
  $bad = Invoke-RestMethod "$base/api/track" -Method Post -Body '{"tracking":"SWN00000000000X"}' -ContentType 'application/json'
  Check "invalid tracking errors" $false
} catch {
  $msg = $_.ErrorDetails.Message
  Check "invalid tracking errors" ($msg -match 'No shipment found')
}

# 3. Login flow + CSRF (credentials come from .env)
$envVars = @{}
Get-Content "$PSScriptRoot\.env" -ErrorAction Stop | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_]+)=(.*)$') {
    $v = $Matches[2].Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    } else {
      $v = ($v -replace '\s+#.*$', '').Trim()
    }
    $envVars[$Matches[1]] = $v
  }
}
$loginBody = @{ email = $envVars['ADMIN_EMAIL']; password = $envVars['ADMIN_PASSWORD'] } | ConvertTo-Json
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest "$base/api/constants" -UseBasicParsing -WebSession $sess | Out-Null
$csrf = ($sess.Cookies.GetCookies($base) | Where-Object { $_.Name -eq 'csrf_token' }).Value
$h = @{ 'X-CSRF-Token' = $csrf }
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -Body $loginBody -ContentType 'application/json' -WebSession $sess -Headers $h
Check "admin login" ($login.ok -eq $true)

# 4. Wrong password rejected (must send the same session so CSRF passes and the
#    request actually reaches the auth handler -> 401, not a 403 CSRF error).
#    429 is also accepted: the login limiter allows 8 failed attempts per 15
#    minutes per email, and the counters live in Firestore, so they survive a
#    restart of the server. "npm run rate-limits:reset" clears them.
try {
  $wrongBody = @{ email = $envVars['ADMIN_EMAIL']; password = 'wrong' } | ConvertTo-Json
  Invoke-RestMethod "$base/api/auth/login" -Method Post -Body $wrongBody -ContentType 'application/json' -WebSession $sess -Headers $h | Out-Null
  Check "wrong password rejected" $false
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Check "wrong password rejected" ($code -eq 401 -or $code -eq 429)
  if ($code -eq 429) { Write-Host "      (login rate limit hit - 8 failed attempts per 15 min; run 'npm run rate-limits:reset' to clear it)" }
}

# 5. Dashboard stats
$dash = Invoke-RestMethod "$base/api/admin/dashboard" -WebSession $sess
Check "dashboard has shipments" ($dash.stats.total -ge 6)

# 6. Create shipment + track it publicly
$newShip = @{ sender_name='Smoke Test'; origin_city='Oslo'; origin_country='Norway'; recipient_name='Test User'; destination_city='Nairobi'; destination_country='Kenya'; description='Smoke test parcel'; estimated_delivery_date='2026-12-15'; estimated_delivery_time='12:00'; status='Registered'; notify_customer='false' } | ConvertTo-Json
$created = Invoke-RestMethod "$base/api/admin/shipments" -Method Post -Body $newShip -ContentType 'application/json' -WebSession $sess -Headers $h
Check "shipment created" ($created.tracking_number -match '^SWN')
$track = Invoke-RestMethod "$base/api/track/$($created.tracking_number)"
Check "public track works" ($track.shipment.status -eq 'Registered')
Check "track has timeline event" ($track.events.Count -ge 1)

# 7. Customs clearance status flows to the public tracker (drives the
#    "Customs Clearance in Progress" notice on the results page).
$customsBody = @{ status = 'Customs Clearance'; location = 'London Gateway'; description = 'Held for customs inspection.' } | ConvertTo-Json
Invoke-RestMethod "$base/api/admin/shipments/$($created.id)/status" -Method Patch -Body $customsBody -ContentType 'application/json' -WebSession $sess -Headers $h | Out-Null
$customsTrack = Invoke-RestMethod "$base/api/track/$($created.tracking_number)"
Check "customs status on public track" ($customsTrack.shipment.status -eq 'Customs Clearance')
Check "customs progress is 75%" ($customsTrack.meta.progress -eq 75)

# 8. Unauthorized access blocked
$sess2 = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try { Invoke-RestMethod "$base/api/admin/shipments" -WebSession $sess2 | Out-Null; Check "unauth blocked" $false }
catch { Check "unauth blocked" ($_.Exception.Response.StatusCode.value__ -eq 401) }

# 9. Clean up test shipment
Invoke-RestMethod "$base/api/admin/shipments/$($created.id)" -Method Delete -WebSession $sess -Headers $h | Out-Null

# 10. No inline scripts in the public HTML. The production CSP only allows
#     'self' scripts, so an inline <script> block is silently dropped by the
#     browser - that is how the track page lost its form handler and its
#     scroll-reveal animations.
$inlinePages = @()
Get-ChildItem "$PSScriptRoot\public" -Recurse -Filter *.html | ForEach-Object {
  $html = [System.IO.File]::ReadAllText($_.FullName)
  if ($html -match '(?s)<script(?![^>]*\bsrc=)[^>]*>') {
    $inlinePages += $_.Name
  }
}
Check "no inline scripts in public HTML" ($inlinePages.Count -eq 0)
if ($inlinePages.Count -gt 0) {
  Write-Host "      (inline <script> found in: $($inlinePages -join ', ') - move the code into /js/*.js)"
}

# 11. No inline event handlers (onclick=...). The production CSP sets
#     script-src-attr 'none', so those handlers never run either.
$handlerPages = @()
Get-ChildItem "$PSScriptRoot\public" -Recurse -Include *.html,*.js | ForEach-Object {
  $src = [System.IO.File]::ReadAllText($_.FullName)
  if ($src -match '\son(click|load|change|error|submit|input|mouseover)\s*=') {
    $handlerPages += $_.Name
  }
}
Check "no inline event handlers in public assets" ($handlerPages.Count -eq 0)
if ($handlerPages.Count -gt 0) {
  Write-Host "      (inline handler found in: $($handlerPages -join ', ') - use addEventListener instead)"
}

Write-Host ""
Write-Host "RESULT: $pass passed, $fail failed"
