"""Allow only owner-authorized existing tester identities; store no raw emails."""
OWNER = 'aa92365c37b108c164d9bfce81f0f7a1604b8c484a76d417fe793206dc90f217'
JAY = '8272434e8ad9d7fe1329c81a8f691110674adf77d5c213bd1a3e81d07064e358'
EXTERNAL = {
 '17e230d84b3dca6f051f91d3224d9efedbfd75b7d30236863d24e65bc17ebe51',
 'e0667a0526332be0b79c9ff0a04b292cdc3f9a218218b8beb6e857cd76966eef',
 '0422bcb07af374436ba31fb6abfcb1be03e171161a87ec29f3ef1cd8fabb81f2',
 '7a7e7964716121a5d7dbbf9760693694bccd80dd215163a8197506adde7be048',
 '9bd38a7f3ae1426fe8a16967f3eb96b7c57bfca839ee2410a15ddd930d13daf8',
 JAY,
}
ALLOWED = {
 '42956bd0-9f18-434c-b2e7-ea3417467f2a': {OWNER, JAY},
 '5d1d238d-95f0-4c94-9f0b-5b153f8508ee': EXTERNAL,
}
def verify_recipient_hashes(group_id, hashes):
    assert group_id in ALLOWED, 'Unexpected tester group; upload blocked'
    assert hashes and set(hashes).issubset(ALLOWED[group_id]), 'Unapproved tester identity; upload blocked'
