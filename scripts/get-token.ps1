# Signs in the owner test user and sets $token, $h (auth header) and $api for testing.
$secure = Read-Host "Password" -AsSecureString
$plain = [System.Net.NetworkCredential]::new("", $secure).Password
$global:token = aws cognito-idp admin-initiate-auth --user-pool-id us-west-2_LkeeH6ARZ --client-id 7glekpt9lqor67l3vho55fm5h5 --auth-flow ADMIN_USER_PASSWORD_AUTH --auth-parameters "USERNAME=interiano88.julio+owner@gmail.com,PASSWORD=$plain" --query "AuthenticationResult.IdToken" --output text
Remove-Variable plain, secure
$global:h = @{ Authorization = $global:token }
$global:api = "https://cxz9btwhvk.execute-api.us-west-2.amazonaws.com"
"Token length: $($global:token.Length)"