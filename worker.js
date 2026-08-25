// ================== إعدادات ==================
const SYSTEM_ROUTES = {
  'sys1': 'الخدمات_العاجله_والحوكمه_محدث.html',
  'sys2': 'نظام_الموارد_البشرية_محدث.html',
  'sys3': 'نظام_النوبتجيات_محدث.html',
  'sys4': 'الحوكمة_الادارية_والاكلينيكية.html',
  'sys5': 'الترددات_والاشغال_محدث.html',
};

const COOKIE_NAME = 'gw_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 ساعات

// ================== أدوات تشفير ==================
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64url(bytes) {
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

async function signSession(payloadObj, secret) {
  const payload = JSON.stringify(payloadObj);
  const payloadB64 = b64url(new TextEncoder().encode(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = b64url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

async function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.');
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC', key, b64urlDecode(sigB64), new TextEncoder().encode(payloadB64)
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) { return null; }
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// ================== صفحة تسجيل الدخول (بوابة الروابط المباشرة) ==================
function loginPageHtml(nextPath, errorMsg) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تسجيل الدخول</title>
<style>
  body{background:#0a2e1a;color:#fff;font-family:Tajawal,Cairo,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .box{background:#123322;border:1px solid #2a6b45;border-radius:16px;padding:28px;max-width:360px;width:100%}
  h1{font-size:1.2rem;color:#e6b800;text-align:center;margin-top:0}
  label{display:block;margin:14px 0 6px;font-size:.95rem}
  input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:none;font-size:1rem}
  button{width:100%;margin-top:20px;padding:12px;border:none;border-radius:30px;background:#e6b800;color:#111;font-weight:900;font-size:1rem;cursor:pointer}
  .err{background:#5c1b1b;color:#ffdada;padding:10px;border-radius:8px;margin-top:14px;text-align:center;display:${errorMsg ? 'block' : 'none'}}
</style>
</head>
<body>
  <form class="box" method="POST" action="${'/gw-login?next=' + encodeURIComponent(nextPath)}">
    <h1>🔒 تسجيل الدخول للنظام</h1>
    <label>اسم المستخدم</label>
    <input type="text" name="name" required autofocus>
    <label>كلمة المرور</label>
    <input type="password" name="password" required>
    <div class="err">${errorMsg || ''}</div>
    <button type="submit">دخول</button>
  </form>
</body>
</html>`;
}

// ================== المنطق الرئيسي ==================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ----- معالجة تسجيل الدخول -----
    if (url.pathname === '/gw-login' && request.method === 'POST') {
      const nextPath = url.searchParams.get('next') || '/';
      const form = await request.formData();
      const name = (form.get('name') || '').toString().trim();
      const password = (form.get('password') || '').toString();

      const row = await env.DB.prepare(
        'SELECT name, password_hash, type, active FROM users WHERE name = ?'
      ).bind(name).first();

      const hash = password ? await sha256Hex(password) : '';
      if (!row || row.active !== 1 || row.password_hash !== hash) {
        return new Response(loginPageHtml(nextPath, '⛔ اسم المستخدم أو كلمة المرور غير صحيحة'), {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=UTF-8' }
        });
      }

      const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
      const token = await signSession({ name: row.name, type: row.type, exp }, env.AUTH_SECRET);

      const headers = new Headers({ 'Location': nextPath });
      headers.append('Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`
      );
      return new Response(null, { status: 302, headers });
    }

    // ----- تسجيل الخروج -----
    if (url.pathname === '/gw-logout') {
      const headers = new Headers({ 'Location': '/' });
      headers.append('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
      return new Response(null, { status: 302, headers });
    }

    // ----- روابط الأنظمة المباشرة: /open/sys1 .. /open/sys5 (محمية بتسجيل دخول) -----
    const m = url.pathname.match(/^\/open\/(sys[1-5])\/?$/);
    if (m) {
      const cookieToken = getCookie(request, COOKIE_NAME);
      const session = await verifySession(cookieToken, env.AUTH_SECRET);

      if (!session) {
        return new Response(loginPageHtml(url.pathname, null), {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=UTF-8' }
        });
      }

      const filename = SYSTEM_ROUTES[m[1]];
      if (!filename) return new Response('غير موجود', { status: 404 });
      const assetUrl = new URL('/' + encodeURIComponent(filename), url.origin);
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }

    // ----- باقي الطلبات (index.html والبوابة المجمعة) زي ما هي -----
    return env.ASSETS.fetch(request);
  }
};



