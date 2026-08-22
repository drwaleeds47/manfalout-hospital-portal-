const SYSTEM_ROUTES = {
  'sys1': 'الخدمات_العاجله_والحوكمه_محدث.html',
  'sys2': 'نظام_الموارد_البشرية_محدث.html',
  'sys3': 'نظام_النوبتجيات_محدث.html',
  'sys4': 'الخدمات_الصحيه.html',
  'sys5': 'الترددات_والاشغال_محدث.html',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // مسارات مباشرة لكل نظام لوحده: /open/sys1 .. /open/sys5
    const m = url.pathname.match(/^\/open\/(sys[1-5])\/?$/);
    if (m) {
      const filename = SYSTEM_ROUTES[m[1]];
      if (!filename) return new Response('غير موجود', { status: 404 });
      const assetUrl = new URL('/' + encodeURIComponent(filename), url.origin);
      return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
    }

    // باقي الطلبات (بما فيها index.html والبوابة المجمعة) زي ما هي
    return env.ASSETS.fetch(request);
  }
};
