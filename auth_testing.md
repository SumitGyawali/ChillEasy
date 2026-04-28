# VaxChain Auth Testing Playbook

(Saved per Emergent integration playbook requirement.)

## Auth modes
1. Email/password — JWT bearer in `localStorage.vxc_jwt`
2. Emergent Google OAuth — httpOnly `session_token` cookie, 7-day expiry

Both share the `users` collection via `user_id` (`user_<12hex>`) and unify behind `GET /api/auth/me`.

## 1. Seed a test session for browser/cookie tests
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  auth_provider: 'google',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('TOKEN: ' + sessionToken);
print('USER : ' + userId);
"
```

## 2. Curl flows

### a) Email/password (JWT bearer)
```bash
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s -X POST $API/api/auth/register -H "Content-Type: application/json" \
  -d '{"email":"qa@vaxchain.test","password":"Passw0rd!","name":"QA"}'
# → { access_token, token_type:"bearer", user:{...} }

JWT=$(curl -s -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"qa@vaxchain.test","password":"Passw0rd!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s $API/api/auth/me -H "Authorization: Bearer $JWT"
```

### b) Cookie session (Emergent Google)
```bash
curl -s $API/api/auth/me \
  -H "Cookie: session_token=YOUR_TEST_SESSION_TOKEN"
```

## 3. Browser test (Playwright)
```python
await page.context.add_cookies([{
    "name": "session_token", "value": "YOUR_TEST_SESSION_TOKEN",
    "domain": new URL(API).host, "path": "/",
    "httpOnly": True, "secure": True, "sameSite": "None"
}])
await page.goto(API.rstrip('/api') + "/")
```

For JWT bearer in browser tests:
```python
await page.add_init_script(f"localStorage.setItem('vxc_jwt', '{JWT}');")
await page.goto(...)
```

## 4. Checklist
- `/api/auth/me` returns user data with `user_id`, `email`, `name`, `auth_provider` (no `_id`)
- Dashboard `/` loads without redirect when authenticated, redirects to `/login` otherwise
- Hash callback `#session_id=…` is processed by `<AuthCallback>` BEFORE protected route checks
- Logout clears cookie + localStorage and redirects to `/login`
- `data-testid='user-menu-btn'` opens the dropdown; `data-testid='logout-btn'` logs out

## 5. Quick clean
```bash
mongosh --eval "
use('test_database');
db.users.deleteMany({email: /test\\./});
db.user_sessions.deleteMany({session_token: /test_session/});
db.users.deleteMany({email: /vaxchain\\.test/});
"
```
