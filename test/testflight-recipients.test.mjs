import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('TestFlight allows the authorized testers only, including Jay, in the appropriate groups',()=>{
 execFileSync('python3',['-c',`
from scripts.testflight_recipients import ALLOWED, EXTERNAL, OWNER, JAY, verify_recipient_hashes
internal, external = list(ALLOWED)
verify_recipient_hashes(internal, [OWNER])
verify_recipient_hashes(internal, [OWNER, JAY])
verify_recipient_hashes(external, list(EXTERNAL - {JAY}))
verify_recipient_hashes(external, list(EXTERNAL))
for group, hashes in [(external, [OWNER]), (internal, list(EXTERNAL - {JAY})), (external, ['unknown']), (external, list(EXTERNAL) + ['unknown']), ('unknown-group', [JAY]), (external, [])]:
    try: verify_recipient_hashes(group, hashes)
    except AssertionError: pass
    else: raise AssertionError('Unauthorized recipients were accepted')
`],{cwd:new URL('..',import.meta.url)});
});
