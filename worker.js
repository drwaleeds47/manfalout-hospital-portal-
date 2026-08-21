export default {
  async fetch(request, env, ctx) {
    // بيخدم أي ملف موجود في الريبو (index.html وكل الصفحات التانية) زي ما هو
    // لو حبيت تضيف أي منطق سيرفر لاحقًا (يستخدم env.DB) حطه هنا قبل السطر ده
    return env.ASSETS.fetch(request);
  }
};
