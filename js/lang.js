/* ============================================================
   Life Planner — language layer (v15).

   Persian (fa) stays the DEFAULT language. Settings -> "🌐 زبان برنامه"
   lets the user switch the whole interface to English (en).

   HOW IT WORKS — deliberately additive and non-invasive:
   The app's logic, IDs, classes and handlers are untouched. This file
   only *translates what is already on screen*: it watches the DOM with a
   MutationObserver and swaps Persian UI text for English using a fixed
   dictionary. Text the user typed (task titles, notes, habits, goals,
   categories, events) is never translated because it never appears in
   the dictionary.

   Load order: after core.js / pomodoro.js / enhancements.js.
   ============================================================ */
(function(){
  'use strict';

  var LANG_KEY = 'lifePlannerLang_v1';
  var DEFAULT_LANG = 'fa';

  function getLang(){
    try{ var v = localStorage.getItem(LANG_KEY); return v === 'en' ? 'en' : DEFAULT_LANG; }
    catch(_){ return DEFAULT_LANG; }
  }
  function isEnglish(){ return getLang() === 'en'; }
  window.lpGetLang = getLang;

  var EXACT = {
    /* ---- v21.3: section guides (Dashboard / Tasks / Calendar), the one-time
       hints and «سه قدم اول», the three-step card for a brand-new account.
       Icons in front of a Persian core ("📖 راهنمای داشبورد", "🚀 سه قدم اول")
       are handled by compose(), so only the core is listed here. ---- */
    "راهنمای داشبورد": "Dashboard guide",
    "راهنمای تسک‌ها": "Tasks guide",
    "راهنمای بخش‌ها": "Section guides",
    "❓ راهنمای بخش‌ها": "❓ Section guides",
    "❓ راهنما": "❓ Guide",
    "بستن راهنما": "Close the guide",
    "بخش‌های راهنما": "Guide sections",
    "راهنمای کوتاهِ هر ده بخشِ برنامه. داخل خود هر بخش هم با دکمه‌ی ❓ باز می‌شود.": "A short guide for each of the app's ten sections. Inside every section the same guide opens with its ❓ button.",
    "↩️ نمایش دوباره‌ی راهنمای خودکار": "↩️ Show the automatic guides again",
    "↩️ راهنمای خودکار بخش‌ها دوباره فعال شد": "↩️ The automatic section guides are on again",
    "⚠️ این بخش در دسترس نیست": "⚠️ This section is not available",
    /* the one-time hints */
    "داشبورد یعنی «امروز چه‌کار داری؟» — یک بار راهنما را بخوان تا همه‌چیز روشن شود.": "The dashboard answers “what do I have to do today?” — read the guide once and everything becomes clear.",
    "فقط یک عنوان بنویس و «ذخیره» را بزن؛ بقیه‌ی گزینه‌ها اختیاری‌اند.": "Just write a title and tap “Save”; every other option is optional.",
    /* «سه قدم اول» — the new-user card */
    "سه قدم اول": "the first three steps",
    "تازه اینجایی؟ فقط همین سه قدم — بقیه‌ی برنامه را کم‌کم یاد می‌گیری.": "New here? Just these three steps — you will learn the rest of the app as you go.",
    "بستن راهنمای شروع سریع": "Close the quick start guide",
    "یه کار بنویس": "Write down one task",
    "تیکش بزن": "Tick it off",
    "تو تقویم جاش بده": "Give it a place in the calendar",
    "✅ انجام شد": "✅ Done",
    "✅ برو به تسک‌ها": "✅ Go to Tasks",
    "🎉 سه قدم اول تمام شد — حالا برنامه مال توست!": "🎉 The first three steps are done — the app is yours now!",
    /* the guide itself: dashboard */
    "داشبورد یعنی «امروز چه‌کار داری؟» — همین سه کارت، نه چیز دیگر.": "The dashboard answers “what do I have to do today?” — these three cards, nothing else.",
    "سلام و جمله‌ی امروز": "Greeting and today's line",
    "تاریخ امروز و یک جمله‌ی انگیزشی؛ با «تغییر حال‌وهوا» فقط لحن جمله عوض می‌شود.": "Today's date and one motivational line; “change mood” only changes the tone of that line.",
    "مأموریت روزانه": "Daily quest",
    "یک کار کوچک با جایزه‌ی XP: «انجامش دادم» جایزه می‌دهد و «ردش کن» کمی XP کم می‌کند. با تیک «مرخصی» هیچ مأموریتی نمی‌آید.": "One small task with an XP reward: “I did it” pays out, “Skip it” costs a little XP. Tick “Time off” and no quest arrives at all.",
    "برنامه‌ی امروز": "Today's plan",
    "تسک‌هایی که امروز پیش رو داری. دایره‌ی کنار هر کدام را بزن تا انجام شود و XP بگیری.": "The tasks in front of you today. Tap the circle beside one to complete it and earn XP.",
    "اینباکس سریع": "Quick inbox",
    "📥 اینباکس سریع": "📥 Quick Inbox",
    "دکمه‌ی 📥 بالا برای فکرهای یکهویی است: فقط بنویس، بعداً در بخش تسک‌ها مرتبش کن.": "The 📥 button above is for sudden thoughts: just write it down and sort it out later in Tasks.",
    /* the guide itself: tasks */
    "یک لیست از همه‌ی کارها با چهار تب. هیچ گزینه‌ی اجباری‌ای وجود ندارد.": "One list of everything you have to do, with four tabs. Nothing here is mandatory.",
    "تسک جدید": "New task",
    "فقط عنوان را بنویس و «ذخیره» را بزن؛ دسته، ددلاین، اولویت و بقیه همه اختیاری‌اند.": "Just write the title and tap “Save”; the category, the deadline, the priority and everything else are optional.",
    "چهار تب": "Four tabs",
    "همه، شروع نشده، Inbox و تکمیل‌شده. شمارنده‌ی قرمز یعنی چند کار در Inbox منتظر مرتب شدن است.": "All, Not started, Inbox and Completed. The red counter is how many Inbox items are still waiting to be sorted.",
    "تیک یعنی XP": "Ticking means XP",
    "با تیک زدن، تسک به تب «تکمیل‌شده» می‌رود و XP می‌گیری؛ از همان‌جا هم برمی‌گردد.": "Tick a task and it moves to the “Completed” tab and pays XP; untick it there to bring it back.",
    "جزئیات بیشتر": "More details",
    "روی عنوان تسک بزن تا وضعیت، زیرتسک، ددلاین اضافه، ویرایش و حذف را یک‌جا ببینی.": "Tap a task's title to see its status, subtasks, extra deadlines, editing and deleting in one place.",
    /* the guide itself: calendar */
    "یک هفته، ساعت‌به‌ساعت از ۶ صبح تا ۳ بامداد. همه‌چیز با کشیدن انگشت انجام می‌شود.": "One week, hour by hour from 6 AM to 3 AM. Everything is done by dragging.",
    "رویداد جدید": "New event",
    "بالا «رویداد جدید» را بزن؛ عنوان، روز و ساعت کافی است.": "Tap “New event” above; a title, a day and a time are enough.",
    "جابه‌جایی و تغییر مدت": "Moving and changing the length",
    "«الان» و «امروز»": "“Now” and “Today”",
    "«🕒 الان» شبکه را به ساعت فعلی می‌برد و «امروز» به هفته‌ی جاری برمی‌گرداند.": "“🕒 Now” scrolls the grid to the current hour, and “Today” brings you back to the current week.",
    "دسته‌ها و رنگ‌ها": "Categories and colors",
    "با 🏷️ برای رویدادها دسته و رنگ بساز تا یک هفته‌ی شلوغ خوانا بماند.": "Use 🏷️ to give events a category and a color, so a busy week stays readable.",
    "🌙 ساعت‌های بعد از نیمه‌شب، پایینِ ستونِ همان شب می‌نشینند.": "🌙 The hours after midnight sit at the bottom of that same night's column.",
    /* the calendar's intro is one quiet line now — the long version is in the guide */
    "رویداد را بکش تا جابه‌جا شود؛ لبه‌اش را نگه دار تا مدتش عوض شود.": "Drag an event to move it; hold its edge to change how long it lasts.",
    /* ---- v19: Redmi 120Hz + per-view +1 feature ---- */
    "چی تو ذهنته؟ سریع بنویس...": "What's on your mind? Jot it fast...",
    "➕ افزودن": "➕ Add",
    "🎯 فوکوس امروز": "🎯 Today's focus",
    "فوری": "Urgent",
    "مهم": "Important",
    "فوری+مهم": "Urgent+Important",
    "✅ تکمیل دسته‌ای": "✅ Complete batch",
    "📤 خروجی لیست": "📤 Export list",
    "چیزی با این فیلتر پیدا نشد — فیلتر رو عوض کن": "Nothing matches this filter — change it",
    "رویداد را بکش تا جابه‌جا شود؛ روی خانه‌ی خالی بزن تا رویداد جدید بسازی.": "Drag an event to move it; tap an empty slot to create a new one.",
    "هفته قبل": "Prev week",
    "هفته بعد": "Next week",
    "این هفته": "This week",
    "امروز": "Today",
    "▦ گرید": "▦ Grid",
    "☰ لیست": "☰ List",
    "قالب سریع:": "Quick templates:",
    "🗓️ نقشه حرارتی ۳۰ روز اخیر": "🗓️ 30-day heatmap",
    "هر مربع = یک روز": "Each square = a day",
    "عادت فعال": "active habits",
    "بهترین استریک": "best streak",
    "روز با عادت این هفته": "days with habits this week",
    "🏁 گام‌های پیشنهادی": "🏁 Suggested steps",
    "اهداف بزرگ → قدم‌های کوچک": "Big goals → small steps",
    "هر هدف رو به ۴ گام ۲۵٪ بشکن — هر گام +۵ XP": "Break each goal into 4 steps of 25% — +5 XP per step",
    "هنوز هدفی نساختی — بالا «➕ هدف جدید» رو بزن": "No goals yet — hit “➕ New goal” above",
    "📤 خروجی متن": "📤 Export text",
    "🖨️ چاپ": "🖨️ Print",
    "کارت دستاورد": "Achievement card",
    "سطح و XP امروزت رو به اشتراک بذار": "Share today's level and XP",
    "📤 اشتراک": "📤 Share",
    "🔍 جزئیات شهر": "🔍 City details",
    "⚡ کاهش جلوه‌ها": "⚡ Reduce effects",
    "جلوه‌ها کم شد — روان‌تر": "Effects reduced — smoother",
    "جلوه‌ها برگشت": "Effects restored",
    "📜 آرشیو باس‌ها": "📜 Boss archive",
    "📅 این ماه vs ماه قبل": "📅 This month vs last month",
    "ماهانه: تسک‌های انجام‌شده": "Monthly: tasks completed",
    "ماه قبل": "Last month",
    "این ماه": "This month",
    "بدون تغییر": "No change",
    "📳 بازخورد لمسی": "📳 Haptic feedback",
    "فعال": "On",
    "غیرفعال": "Off",
    "👋 تست لرزش": "👋 Test vibration",
    "روی گوشی‌های شیائومی عالی کار می‌کنه": "Works great on Xiaomi phones",
    "📊 خلاصه داده‌ها": "📊 Data summary",
    "🔄 به‌روزرسانی": "🔄 Refresh",
    "🚨 اول بحرانی‌ها رو جمع کن — بعد سراغ بقیه برو": "🚨 Clear critical tasks first — then the rest",
    "🎉 امروز سبکی — یه تسک جدید بساز": "🎉 Light day — create a new task",
    "💪 یه قدم کوچیک بردار، همین الان": "💪 Take one small step, right now",
    "🚀 شروع خودکار جلسه بعد": "🚀 Auto-start next session",
    "بدون مکث اضافه": "No extra pause",
    "🔥 رگبار هفتگی": "🔥 Weekly streak",
    "هر روز = یک جلسه کامل": "Each day = one full session",
    "۷ روز اخیر — پررنگ = تمرکز داشتی": "Last 7 days — bold = you focused",
    "♻️ بازتنظیم مهارت‌ها": "♻️ Reset skills",
    "همه امتیازها برمی‌گردن — هزینه: ۱۰۰ XP": "All points return — cost: 100 XP",
    "♻️ بازتنظیم": "♻️ Reset",
    "چیزی برای بازتنظیم نیست": "Nothing to reset",
    "⚠️ XP کافی نداری (۱۰۰ لازم)": "⚠️ Not enough XP (need 100)",
    "♻️ مهارت‌ها بازتنظیم شد": "♻️ Skills reset",
    "هنوز باسی شکست ندادی — اولین باس رو بساز 💪": "No boss beaten yet — create your first boss 💪",
    "📋 تسک‌ها:": "📋 Tasks:",
    "🔥 عادت‌ها:": "🔥 Habits:",
    "⚡ XP کل:": "⚡ Total XP:",
    "🎯 اهداف:": "🎯 Goals:",
    "📝 یادداشت‌ها:": "📝 Notes:",
    "📳 بازخورد فعال شد": "📳 Haptics on",
    "📳 بازخورد خاموش شد": "📳 Haptics off",
    "👋 ویبره تست شد": "👋 Vibration tested",
    "🛒 پیشنهاد امروز فعاله — از فروشگاه بخر": "🛒 Today's deal is live — buy from the shop",
    "🔥 پیشنهاد امروز": "🔥 Today's deal",
    "فقط تا پایان امروز": "Only today",
    "🛒 برو فروشگاه": "🛒 Go to shop",
    "— رویدادی نیست —": "— No events —",
    "📍 برگشت به امروز": "📍 Back to today",
    "◀ هفته قبل": "◀ Prev week",
    "چیزی با این جستجو پیدا نشد": "Nothing matched this search",
    /* ---- v18.3: safer edge resizing + smart quick-add in free calendar gaps ---- */
    "هر روز از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ رویداد را نگه دار و بکش تا جابه‌جا شود، لبه‌ی بالا یا پایینش را بکش تا ساعتش عوض شود. روی خانه‌ی خالی هر ساعت بزن تا رویداد از ابتدای ساعت یا اولین دقیقه‌ی آزاد شروع شود و مدت آن با فاصله تا رویداد بعدی (حداکثر یک ساعت) هماهنگ شود.": "Every day is blocked out from 6 AM to 3 AM; hold and drag an event to move it, or drag its top or bottom edge to change its time. Tap an empty hour to start at the hour's beginning or the first free minute; its duration then fits the gap before the next block, up to one hour.",
    "⚠️ این ساعت زمان خالی ندارد": "⚠️ There is no free time left in this hour",
    /* ---- v18.1: «برنامه روز» — the calendar's own per-day plan ---- */
    "برنامه این روز": "Plan for this day",
    "خالی": "empty",
    "کار مانده": "left to do",
    "از": "of",
    "انجام شد": "done",
    "هنوز کاری ننوشتی": "Nothing written yet",
    "چه کاری برای این روز؟ (مثال: ۱۴:۳۰ تمرین پیانو)": "What's on for this day? (e.g. 14:30 piano practice)",
    "زمان را اول بنویس و «!» بگذار برای مهم‌ها — بعد Enter بزن.": "Write the time first, add “!” for important ones, then hit Enter.",
    "این روز هنوز برنامه‌ای نداره": "This day has no plan yet",
    "بنویس «۱۴:۳۰ تمرین پیانو» یا «!خرید نان» — ساعت و علامت ! خودکار تشخیص داده می‌شن.": "Write “14:30 piano practice” or “!buy bread” — the time and the ! are picked up automatically.",
    "همه‌ی کارهای این روز انجام شد": "Everything on this day is done",
    "👁️ نمایش انجام‌شده‌ها": "👁️ Show completed",
    "نمایش یا پنهان کردن انجام‌شده‌ها": "Show or hide completed items",
    "بستن برنامه این روز": "Close this day's plan",
    "🧹 حذف انجام‌شده‌ها": "🧹 Clear completed",
    "👀 ددلاین‌های تسک‌های اصلی": "👀 Main-task deadlines",
    "فقط برای اطلاع — این‌ها تسک‌های اصلی‌اند و جدا از برنامه این روز می‌مانند.": "For information only — these are main tasks and stay apart from this day's plan.",
    "هیچ تسک اصلی‌ای برای این روز ددلاین نداره.": "No main task is due on this day.",
    "📝 یادداشت این روز": "📝 Note for this day",
    "هر چیزی که باید درباره‌ی این روز به خاطر بسپری...": "Anything you need to remember about this day...",
    "مانده‌های": "Leftovers from",
    "کپی از برنامه‌ی": "Copy the plan from",
    "مهم": "Important",
    "★ مهم": "★ Important",
    "برای ویرایش بزن": "Tap to edit",
    "ویرایش عنوان این کار": "Edit this item's title",
    "جابه‌جایی این کار": "Move this item",
    "نگه‌دار و بکش — یا با فلش بالا/پایین جابه‌جا کن": "Hold and drag — or use the up/down arrows to move it",
    "انجام‌شده — برای برگرداندن بزن": "Done — tap to undo",
    "انجام‌نشده — برای انجام‌شده کردن بزن": "Not done — tap to mark it done",
    "انتقال به فردا": "Move to tomorrow",
    "افزودن کار به برنامه این روز": "Add an item to this day's plan",
    "افزودن به برنامه این روز": "Add to this day's plan",
    "برنامه روز خالی است": "The day plan is empty",
    "⚠️ اول بنویس چه کاری مدنظرت هست": "⚠️ Write what you have in mind first",
    "⚠️ این روز پر شده — اول چند کار انجام‌شده را پاک کن": "⚠️ This day is full — clear a few completed items first",
    "🎉 برنامه این روز کامل شد": "🎉 This day's plan is complete",
    "🗑️ حذف شد": "🗑️ Deleted",
    "↩️ برگرداندن": "↩️ Undo",
    "↩️ برگردانده شد": "↩️ Restored",
    "✅ انجام‌شده‌ای برای پاک کردن نیست": "✅ There is nothing completed to clear",
    "✅ از دیروز کار ناتمامی نمونده": "✅ Nothing unfinished was left from yesterday",
    "⚠️ اون روز برنامه‌ای نداره که کپی بشه": "⚠️ That day has no plan to copy",
    "برای نوشتن کارهای هر روز، روی نام آن روز بزن — «برنامه روز» جدا از تسک‌های اصلی است.": "To write a day's tasks, tap that day's name — “Day plan” is separate from the main tasks.",
    "دیروز": "yesterday",
    "فردا": "tomorrow",
    "ردیف اصلی را از ۲ تا ۴ دکمه بچین؛ «۲» یعنی دو میان‌بر به‌علاوه‌ی «بیشتر». دکمه‌های اضافی اختیاری‌اند (حداکثر ۵ تا).": "Choose 2–4 buttons for the main row; “2” means two shortcuts plus More. Extra buttons are optional (up to 5).",
    "ردیف اصلی نوار پایین را از حداقل ۲ تا حداکثر ۴ دکمه انتخاب و مرتب کن؛ حتی می‌توانی فقط ۲ میان‌بر کنار «بیشتر» داشته باشی. دکمه‌های اضافی اختیاری‌اند و تا ۵ مورد می‌توانی اضافه کنی.": "Choose and arrange 2–4 buttons in the bottom bar's main row; you can keep just 2 shortcuts beside More. Extra buttons are optional, with up to 5 available.",
    "تعداد دکمه‌های ردیف اصلی:": "Main row button count:",
    "تعداد دکمه‌های نوار پایین": "Bottom bar button count",
    /* ---- v18.2: drag an event's edge to resize it on the grid ---- */
    "هر روز ساعت‌به‌ساعت از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ رویداد را نگه دار و بکش تا روز یا ساعتش عوض شود، لبه‌ی بالا یا پایینش را بکش تا ساعتش کم‌وزیاد شود — بدون رفتن توی تنظیمات. برای افزودن سریع رویداد، روی خانه‌ی خالی بزن.": "Every day is blocked out hour by hour from 6 AM to 3 AM; hold and drag an event to move it, drag its top or bottom edge to make it shorter or longer — no settings needed, or tap an empty time slot to quickly add one.",
    "لبه بالا را بکش تا ساعت شروع عوض شود": "Drag the top edge to change the start time",
    "لبه پایین را بکش تا ساعت پایان عوض شود": "Drag the bottom edge to change the end time",
    "· لبه بالا یا پایین را بکش تا ساعت شروع یا پایان عوض شود": "· drag the top or bottom edge to change the start or end time",
    /* ---- v21.2: an edge never steals a move; hold it to resize, drag it to move ----
       The block tooltip is composite (title — day time · hint), so the translator
       splits it on its separators and looks each island up on its own. */
    "لبه را نگه دار و بکش تا زمانش عوض شود": "hold an edge and drag to change its time",
    "وسط را بکش تا جابه‌جا شود": "drag the middle to move it",
    "لبهٔ بالا یا پایینش را یک لحظه نگه دار و بعد بکش تا مدتش کم‌وزیاد شود": "hold its top or bottom edge for a moment, then drag to make it shorter or longer",
    "رویداد را بکش تا جابه‌جا شود؛ لبهٔ بالا یا پایینش را یک لحظه نگه دار و بعد بکش تا مدتش کم‌وزیاد شود. روی خانه‌ی خالی بزن تا رویداد جدید بسازی.": "Drag an event to move it; hold its top or bottom edge for a moment, then drag to make it shorter or longer. Tap an empty slot to create a new one.",
    "⚠️ چیزی برای بازگرداندن نیست": "⚠️ There is nothing to undo",
    "⚠️ مهلت بازگرداندن تمام شد": "⚠️ The undo window has closed",
    "⚠️ این رویداد دیگر وجود ندارد؛ بازگردانده نشد": "⚠️ That event no longer exists; nothing was restored",
    /* ---- v17.2: minute-accurate calendar and quick-add slots ---- */
    "🕒 الان": "🕒 Now",
    "زمان فعلی": "Current time",
    "هر روز ساعت‌به‌ساعت از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ رویداد را نگه دار و بکش تا روز یا ساعتش عوض شود. برای افزودن سریع رویداد، روی خانه‌ی خالی بزن.": "Every day is blocked out hour by hour from 6 AM to 3 AM; hold and drag an event to move it, or tap an empty time slot to quickly add one.",
    /* ---- v17.1: the weekly grid runs 06:00 → 03:00 ---- */
    "🌙 هر روزِ تقویم از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ ساعت‌های بعد از نیمه‌شب در انتهای ستونِ شبِ قبلش می‌نشینند.": "🌙 Every calendar day is blocked out from 6 AM to 3 AM; hours after midnight sit at the bottom of the previous night's column.",
    "هر روز ساعت‌به‌ساعت از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ رویداد را نگه دار و بکش تا روز یا ساعتش عوض شود.": "Every day is blocked out hour by hour from 6 AM to 3 AM; hold and drag an event to change its day or time.",
    "بلوک‌بندی ساعتی از ۶ صبح تا ۳ بامداد": "Hourly blocks from 6 AM to 3 AM",
    "بیرون از بازهٔ نمایش تقویم": "Outside the calendar's visible range",
    "و چند مورد دیگر": "and a few more",
    "بامداد": "After midnight",
    /* ---- v17: «مرخصی» — the tick that pauses the quests ---- */
    "کوئست‌ها متوقف شدن — هر وقت خواستی تیک «مرخصی» رو بردار تا دوباره شروع بشن.": "Quests are paused — untick “Time off” whenever you want them back.",
    "🌴 مرخصی فعال شد — تا تیکش رو برنداری کوئستی نمیاد": "🌴 Time off is on — no quest arrives until you untick it",
    "🎯 مرخصی تموم شد — کوئست بعدی تا ۵ دقیقه دیگه میاد": "🎯 Time off is over — the next quest arrives in 5 minutes",
    "🍃 توی مرخصی هیچ XP ای کم نمی‌شه": "🍃 Nothing is deducted from your XP while you are off",
    "تیک بزنی، دیگه کوئست نمیاد": "Tick it and no more quests arrive",
    "🌴 مرخصی": "🌴 Time off",
    "مرخصی": "Time off",
    /* ---- v16.6: optional description for calendar blocks ---- */
    "توضیحات (اختیاری) — با زدن روی بلوک در تقویم نمایش داده می‌شود": "Description (optional) — shown when you tap the block in the calendar",
    "مثلاً: فصل ۳ کتاب، مرور لغت‌ها و ۲۰ دقیقه لیسنینگ": "e.g. Chapter 3 of the book, review vocabulary and 20 minutes of listening",
    /* ---- v16.3: quest timers & streak shield ---- */
    /* ---- v16.4: quest decline button & punishment system removed ---- */
    /* ---- v16.5: quest expiry punished exactly like a deliberate skip ----
       The expiry toast reuses the v16.3 wording ("⏰ مهلت انجام مأموریت تمام شد
       — X XP کسر شد"), whose PATTERNS entry below already translates it, so
       no new dictionary entry is needed. The v16.4 "بدون کسر XP" entry stays
       as a harmless fallback. */
    "🚫 شرایط انجامش رو ندارم": "🚫 I can't do this quest",
    "⏭️ ردش کن (با جریمه)": "⏭️ Skip it (with penalty)",
    "🍃 بدون جریمه — اگه شرایطش رو نداری راحت رد کن": "🍃 No penalty — decline it freely if you can't do it",
    "🚫 اشکالی نداره — این مأموریت بدون کسر XP رد شد": "🚫 No problem — this quest was declined with no XP lost",
    "⏰ زمان این مأموریت تموم شد — بدون کسر XP": "⏰ This quest's time ran out — no XP lost",
    "⏳ مهلت انجام:": "⏳ Time left:",
    "⏳ مهلت انجام": "⏳ Time left",
    "⏳ مهلت:": "⏳ Deadline:",
    "آماده شروع": "Ready to start",
    "فعال‌سازی محافظت خودکار از استریک عادت‌ها": "Enable automatic habit streak protection",
    "🛡️ محافظت Streak Shield فعال شد": "🛡️ Streak Shield protection enabled",
    "🛡️ محافظت Streak Shield غیرفعال شد": "🛡️ Streak Shield protection disabled",
    "⏰ زمان مأموریت تمام شد": "⏰ Quest time expired",
    /* ---- v16.2: notes workspace ---- */
    "🗂️ همه": "🗂️ All",
    "🧹 پاک کردن فیلتر": "🧹 Clear filters",
    "➕ اولین یادداشت رو بنویس": "➕ Write your first note",
    "🆕 جدیدترین": "🆕 Newest",
    "🕓 قدیمی‌ترین": "🕓 Oldest",
    "🔤 عنوان (الف‌با)": "🔤 Title (A–Z)",
    "📄 طولانی‌ترین": "📄 Longest",
    "📄 کپی": "📄 Duplicate",
    "📋 متن": "📋 Copy text",
    "📄 کپی یادداشت ساخته شد": "📄 Note duplicated",
    "📋 متن یادداشت کپی شد": "📋 Note text copied",
    "⚠️ کپی خودکار نشد؛ متن را دستی انتخاب کن": "⚠️ Automatic copy failed; select the text manually",
    "رنگ یادداشت (اختیاری)": "Note colour (optional)",
    "بدون رنگ": "No colour",
    "تغییر حالت نمایش": "Change layout",
    "ترتیب نمایش یادداشت‌ها": "Note order",
    /* ---- v16.2: performance mode ---- */
    "⚡ پرفورمنس": "⚡ Performance",
    "⚡ حالت پرفورمنس (خاموش کردن انیمیشن‌ها)": "⚡ Performance mode (animations off)",
    "⚡ حالت پرفورمنس فعال شد": "⚡ Performance mode on",
    "✨ حالت پرفورمنس غیرفعال شد": "✨ Performance mode off",
    "⛔ غیرفعال": "⛔ Off",
    "مخصوص گوشی‌های ضعیف: با فعال کردن این گزینه، همه‌ی انیمیشن‌ها، جلوه‌های حرکتی و افکت‌های شیشه‌ایِ برنامه خاموش می‌شوند تا اسکرول و جابه‌جایی بین بخش‌ها روان‌تر شود. پنجره‌ها و منوهای بازشو هم به‌جای شیشه‌ی بلوردار، پس‌زمینه‌ی مات و پشتشان تاریک‌تر می‌شود تا نوشته‌ها روی محتوای پشت، خوانا بمانند؛ ظاهر، رنگ‌ها، تم‌ها و همه‌ی دکمه‌ها همچنان بدون تغییر می‌مانند.": "Made for weaker phones: turning this on switches off every animation, motion effect and frosted-glass layer so scrolling and moving between sections feels smoother. Popups and menus get a solid background and a darker page behind them instead of the frosted glass, so their text stays readable over whatever is underneath; the look, the colours, the themes and every button still stay the same.",

    "محافظت Streak Shield": "Streak Shield protection",
    "انتخاب کن این Shield از کدام عادت‌ها محافظت کند.": "Choose which habits this Shield protects.",
    "اول یک عادت بساز.": "Create a habit first.",

    "همه‌ی داده‌هات فقط روی همین گوشی ذخیره می‌شن. اگه گوشی ریست بشه یا اپ پاک بشه، یه فایل که همین‌جا دانلود بشه هم از بین می‌ره — پس بهتره یه نسخه رو بفرستی بیرون از گوشی (گوگل‌درایو، ایمیل و...).": "All of your data is stored only on this phone. If the phone is reset or the app is deleted, a file downloaded here is gone too — so send a copy off your phone (Google Drive, email and so on).",
    "چهار دکمه پایین برنامه رو خودت انتخاب کن؛ چیزهایی که بیشتر استفاده می‌کنی همیشه دم دستت باشن. می‌تونی تا ۵ دکمه اضافه هم اضافه کنی تا نوار پایین به دو ردیف وسط‌چین تبدیل بشه.": "Choose the four buttons at the bottom yourself; keep what you use most within reach. You can also add up to 5 extra buttons to turn the bottom bar into two centered rows.",
    "شانس‌ها بر اساس وزن پایه‌ی هر جایزه محاسبه شده‌اند. مهارت «شانس بلند» فقط شانس جعبه‌ی رایگان را بیشتر می‌کند.": "The odds are based on each reward's base weight. The “Lucky Streak” skill only improves your free-box chance.",
    "پشتیبان شامل داده‌های اصلی برنامه مثل تسک‌ها، عادت‌ها، اهداف، XP، پومودورو، تم‌ها و تنظیمات ذخیره‌شده است.": "The backup includes the app's main data such as tasks, habits, goals, XP, Pomodoro, themes and saved settings.",
    "⏰ ۱۴ روز فرصت داری تا باس رو شکست بدی؛ وگرنه باس از دست می‌ره و باید یک هفته صبر کنی تا باس جدید بیاد.": "⏰ You have 14 days to beat the boss; otherwise the boss gets away and you have to wait a week for a new one.",
    "هنوز دسته‌ای نساخته‌ای. با فرم پایین، اولین دسته را با رنگ دلخواهش بساز — مثلاً «درس» با رنگ سبز.": "You have not created a category yet. Use the form below to create your first one with its own color — for example “Study” in green.",
    "📥 این تسک در Inbox ذخیره شده — فقط عنوان دارد. با «ویرایش و تکمیل» آن را به برنامه اصلی اضافه کن.": "📥 This task is saved in the Inbox — it only has a title. Use “Edit and complete” to bring it into your main plan.",
    "مدت فوکوس و استراحت دلخواهت را وارد کن؛ از این به بعد این پریست همیشه بین پریست‌ها در دسترس است.": "Enter your own focus and break lengths; from now on this preset stays available among the presets.",
    "این مرورگر اشتراک‌گذاری مستقیم رو پشتیبانی نمی‌کنه — فایل دانلود شد، خودت بفرستش به فضای ابری 📤": "This browser does not support direct sharing — the file was downloaded, send it to the cloud yourself 📤",
    "بیشتر از ۳ تا تسک بحرانی روی زمین مونده. باید هرچه سریع‌تر یکی از تسک‌های بحرانی رو تموم کنیم.": "More than 3 critical tasks are still open. We need to finish one of them as soon as possible.",
    "اگر بیرون از تایمر پومودورو مطالعه یا استراحت کردی، اینجا ثبتش کن تا آمار روزت از قلم نیفته.": "If you studied or rested outside the Pomodoro timer, log it here so your daily stats stay complete.",
    "آینده‌ات با تصمیم‌های بزرگ ساخته نمی‌شه؛ با کارهای کوچیکی ساخته می‌شه که هر روز انجام میدی.": "Your future is not built by big decisions; it is built by the small things you do every day.",
    "فقط عنوان رو بنویس، سریع ذخیره می‌شه. بعداً از بخش تسک‌ها کاملش کن و وارد برنامه اصلی کن.": "Just write the title, it saves fast. Complete it later from Tasks and bring it into your main plan.",
    "اگر امروز فقط یک کار مهم انجام بدی، بذار همون کاری باشه که بیشتر از همه ازش فرار کردی. 😈": "If you do only one important thing today, make it the one you have been avoiding most. 😈",
    "با دکمه‌های اضافه، نوار پایین به دو ردیف تبدیل می‌شود و دکمه‌های اضافه وسط‌چین می‌مانند.": "With extra buttons the bottom bar becomes two rows and the extra buttons stay centered.",
    "اعلانِ شروع و پایانِ هر جلسه و پایانِ هر دور — حتی بیرون از تب. اعلانِ دائمیِ شمارش معکوس حذف شده تا مزاحم نباشد.": "A notification for the start and the end of every session and for the end of a round — even outside the tab. The permanent countdown notification is gone, so it does not get in the way.",
    "اندازه نوشته‌ها و متن‌های رابط را از داخل خود برنامه تغییر بده؛ مستقل از فونت گوشی.": "Change the size of the app's text from inside the app, independent of your phone's font.",
    "قرار نیست همیشه انگیزه داشته باشی؛ قرارِ تو اینه که حتی بدون انگیزه هم ادامه بدی. 🔥": "You will not always feel motivated; your deal is to keep going even without it. 🔥",
    "رویداد را نگه دار و بکش تا روز یا ساعتش عوض شود؛ رنگ و دسته‌بندی هم دست خودت است.": "Hold and drag an event to change its day or time; the color and category are up to you.",
    "قبل از اینکه Quest بعدی بیاد، یک دقیقه هیچ کاری نکن و فقط به محیط اطرافت توجه کن.": "Before the next Quest arrives, do nothing for one minute and just notice what is around you.",
    "تو دنبال یک روز بی‌نقص نیستی؛ دنبال روزیه که شبش بگی «امروز واقعاً تلاش کردم.» 🌙": "You are not after a flawless day; you are after a day you can end by saying “I really tried today.” 🌙",
    "اون حس خوبی که بعد از تمام کردن کار میاد، ارزش چند دقیقه شروع سخت رو داره. برو.": "That good feeling after finishing is worth a few hard minutes of starting. Go.",
    "اون کاری که داری عقب می‌اندازی؟ دقیقاً همون کاریه که باید همین الان انجامش بدی.": "That thing you keep putting off? That is exactly what you should do right now.",
    "با خودت مثل کسی رفتار کن که واقعاً می‌خواد رشدت رو ببینه: صادق، صبور و پیگیر. 💎": "Treat yourself like someone who truly wants to see you grow: honest, patient and consistent. 💎",
    "بلند شو. برنامه‌ات منتظرته. هدفت منتظرته. نسخه بهتر خودت هم منتظرته. شروع کن. 🚀": "Get up. Your plan is waiting. Your goal is waiting. A better you is waiting too. Start. 🚀",
    "کاری که امروز عقب می‌اندازی، فردا سبک‌تر نمی‌شه؛ فقط تبدیل به بار بیشتری می‌شه.": "What you postpone today does not get lighter tomorrow; it just becomes a heavier load.",
    "اگر امروز سخت بود، معنیش این نیست که شکست خوردی؛ معنیش اینه که امروز سخت بود.": "If today was hard, it does not mean you failed; it means today was hard.",
    "اندازه‌ی کلی چیدمان و فاصله‌های رابط را جدا از فونت، جمع‌وجور یا بزرگ‌تر کن.": "Make the overall layout and spacing tighter or larger, separately from the font.",
    "⏰ مهلت ۱۴ روزه باس تموم شد — باس از دست رفت! یک هفته صبر کن تا باس جدید بیاد": "⏰ The boss's 14-day deadline is over — the boss got away! Wait a week for a new one",
    "⚠️ سقف خرید هفتگی Streak Shield (۳ عدد) پر شده — هفته‌ی بعد دوباره امتحان کن": "⚠️ The weekly Streak Shield limit (3) is full — try again next week",
    "یک ساعت تمرکز امروز می‌تونه از ده ساعت «فردا انجامش میدم» باارزش‌تر باشه.": "One hour of focus today can be worth more than ten hours of “I will do it tomorrow”.",
    "به خودت ثابت کن وقتی گفتی «انجامش میدم»، واقعاً منظورت انجام دادنش بوده.": "Prove to yourself that when you said “I will do it”, you really meant it.",
    "یه هدف بزرگ این هفته داری؟ بذار به یه باس تبدیلش کنیم و باهم شکستش بدیم.": "Got a big goal this week? Let's turn it into a boss and beat it together.",
    "۱۰ دقیقه یک سرگرمی غیرموبایلی انجام بده؛ مثل کتاب، نقاشی یا بازی رومیزی.": "Spend 10 minutes on a non-phone hobby; like a book, drawing or a board game.",
    "آروم جلو رفتن با عقب موندن فرق داره؛ تا وقتی جلو می‌ری، هنوز توی مسیری.": "Moving slowly is not the same as falling behind; as long as you keep moving, you are still on the path.",
    "انضباط یعنی وقتی حوصله نداری هم به چیزی که برای خودت مهمه احترام بذاری.": "Discipline means respecting what matters to you even when you do not feel like it.",
    "🛡️ یه Streak Shield خریدی! یه روز از‌دست‌رفته‌ی عادت‌ها رو جبران می‌کنه": "🛡️ You bought a Streak Shield! It makes up for one lost habit day",
    "حواست رو از نتیجه بردار و بذار روی همین ده دقیقه‌ای که جلوت قرار داره.": "Take your mind off the result and put it on the ten minutes in front of you.",
    "هر تیر ۱ دقیقه از زمان انتظار کوئست بعدی کم می‌کنه (از ۲۰ به ۱۵ دقیقه)": "Each tier cuts 1 minute off the wait for the next quest (from 20 to 15 minutes)",
    "به جای اینکه منتظر نسخه بهتر خودت باشی، امروز مثل همون نسخه رفتار کن.": "Instead of waiting for a better version of yourself, act like that version today.",
    "هر بار که بهانه‌ات رو شکست میدی، داری نسخه قوی‌تری از خودت می‌سازی. 💪": "Every time you beat your excuse, you build a stronger version of yourself. 💪",
    "برای شروع بزن، یا چند ثانیه روی تایمر نگه‌دار برای فوکوس بی‌نهایت ♾️": "Tap to start, or hold the timer for a few seconds for infinite focus ♾️",
    "تو برای کامل بودن شروع نکردی؛ برای بهتر شدن شروع کردی. پس ادامه بده.": "You did not start to be perfect; you started to get better. So keep going.",
    "یک کار، یک بازه زمانی، بدون حواس‌پرتی. همین فرمول ساده رو اجرا کن. 🎯": "One task, one time block, no distractions. Just run that simple formula. 🎯",
    "🔥 یک Streak Shield گرفتی — جلوی از دست رفتن یه روز استریک رو می‌گیره": "🔥 You got a Streak Shield — it stops you from losing a streak day",
    "هیچ‌کس قرار نیست بیاد زندگیت رو برات بسازه. خودت بلند شو و بسازش. ⚡": "Nobody is coming to build your life for you. Get up and build it. ⚡",
    "۵ دقیقه فعالیت ورزشی سبک انجام بده؛ مثل اسکات، کشش یا راه رفتن تند.": "Do 5 minutes of light exercise; like squats, stretching or brisk walking.",
    "اگه شروعش سخته، فقط پنج دقیقه انجامش بده. پنج دقیقه هم حساب می‌شه.": "If starting is hard, just do five minutes. Five minutes counts too.",
    "دسته‌بندی (اختیاری) — با انتخاب دسته، رنگ پیش‌فرض همان دسته می‌شود": "Category (optional) — picking a category sets its color as the default",
    "فایل پشتیبان — این رو یه‌جای امن (گوگل‌درایو، ایمیل و...) نگه‌دار.": "Backup file — keep this somewhere safe (Google Drive, email and so on).",
    "هر بار که حواست رو برمی‌گردونی، داری عضله تمرکزت رو قوی‌تر می‌کنی.": "Every time you bring your attention back, you make your focus muscle stronger.",
    "یه جایزه‌ی رندوم — از XP کوچیک تا جکپات ۲۰۰ تایی و آیتم Life City!": "A random reward — from small XP to a 200 jackpot and a Life City item!",
    "😔 از دستش دادیم! اینم جریمه‌ات که دفعه‌ی بعد بهتر عمل کنی (-۱۰ XP)": "😔 We lost it! Here is your penalty so you do better next time (-10 XP)",
    "اگر فقط وقتی حال داشتی کار کنی، نصف رؤیاهات هیچ‌وقت ساخته نمی‌شن.": "If you only work when you feel like it, half of your dreams will never be built.",
    "رنگ تسک (اختیاری) — اگر انتخاب نکنی، رنگ دسته‌بندی استفاده می‌شود": "Task color (optional) — if you do not pick one, the category color is used",
    "شروع ناقص، از برنامه‌ریزی بی‌پایان بهتره. همین الان یک قدم بردار.": "An imperfect start beats endless planning. Take one step right now.",
    "یه روز عادتی رو یادت رفت؟ این جلوی از دست رفتن استریکت رو می‌گیره": "Missed a habit day? This stops your streak from breaking",
    "امروزت رو هدر نده و فردای خودت رو مجبور نکن حسرت امروز رو بخوره.": "Do not waste today and force tomorrow's you to regret it.",
    "اگر هدفت برات مهمه، امروز حداقل یک قدم براش بردار. حتی یک قدم. 🎯": "If your goal matters to you, take at least one step for it today. Even one step. 🎯",
    "به مدت ۳۰ دقیقه، هر XP که از هر جای برنامه می‌گیری دوبرابر می‌شه": "For 30 minutes every XP you earn anywhere in the app is doubled",
    "لازم نیست امروز همه‌چیز عالی پیش بره تا ارزش تلاش کردنت حفظ بشه.": "Not everything has to go perfectly today for your effort to be worth it.",
    "پنج دقیقه اول رو شروع کن. لازم نیست کل کوه رو امروز جابه‌جا کنی.": "Start with the first five minutes. You do not have to move the whole mountain today.",
    "امروز قرار نیست فوق‌العاده باشی؛ فقط قرار نیست تسلیم تنبلی بشی.": "Today is not about being amazing; it is just about not giving in to laziness.",
    "گوشی رو بذار کنار. هدفت هنوز همونجاست که گذاشتیش. برو سراغش. 📱❌": "Put the phone down. Your goal is still where you left it. Go get it. 📱❌",
    "یک فایل، عکس یا برنامه‌ای که دیگه لازم نداری رو مرتب یا حذف کن.": "Tidy or delete a file, photo or app you no longer need.",
    "یک قدم کوچک هم هنوز یک قدم به جلوئه. خودت رو با سرعت بقیه نسنج.": "A small step is still a step forward. Do not measure yourself by other people's speed.",
    "یک Quest ویژه از جعبه‌ی شانس! همین الان یه کار مهم رو تموم کن.": "A special Quest from the lucky box! Finish one important thing right now.",
    "♾️ فوکوس بی‌نهایت فعال شد — هروقت خواستی «پایان و ثبت» رو بزن": "♾️ Infinite focus is on — hit “End and save” whenever you want",
    "⚡ XP Boost ×۲ فعال شد! تا ۳۰ دقیقه همه‌ی XP هات دوبرابر می‌شه": "⚡ XP Boost ×2 is on! For 30 minutes all of your XP is doubled",
    "🎲 توی این فیلتر تسک بازی وجود نداره — یک فیلتر دیگه انتخاب کن": "🎲 There is no open task in this filter — pick another one",
    "به یک گیاه رسیدگی کن یا اگر نداری، چند دقیقه کنار پنجره باش.": "Take care of a plant, or if you do not have one, spend a few minutes by a window.",
    "یک مدل انتخاب کن تا زمان فوکوس و استراحت طبق ریتم تنظیم بشه.": "Pick a model so focus and break times follow that rhythm.",
    "امروز یک برد کوچک بساز. بردهای کوچک، روزهای بزرگ می‌سازن. 🏆": "Score one small win today. Small wins build big days. 🏆",
    "این تسک هنوز در صندوق ورودیه — ویرایش کن تا وارد برنامه بشه": "This task is still in the Inbox — edit it to bring it into your plan",
    "تغییر سریع بین تم‌های بازشده یا انتخاب مستقیم از همه تم‌ها.": "Quickly switch between unlocked themes or pick one directly from all themes.",
    "را عوض می‌کند؛ بقیه‌ی روزهای این رویداد سر جایشان می‌مانند.": "; the other days of this event stay where they are.",
    "شروع کن و اجازه بده تمرکزت بعد از چند دقیقه خودش شکل بگیره.": "Start, and let your focus build itself after a few minutes.",
    "فقط قدم اول رو بردار؛ لازم نیست کل مسیر رو همین الان ببینی.": "Just take the first step; you do not have to see the whole path right now.",
    "لازم نیست امروز همه‌چیز رو درست کنی؛ فقط یک چیز رو بهتر کن.": "You do not have to fix everything today; just make one thing better.",
    "کوچک‌ترین کاری که امروز عقب انداختی رو همین الان انجام بده.": "Do the smallest thing you postponed today, right now.",
    "یک کار رو انتخاب کن، نفس بکش و فقط همون یکی رو انجام بده. 🌱": "Pick one task, take a breath and do only that one. 🌱",
    "📥 Inbox — بعداً با ویرایش، جزئیات، تاریخ و زیرتسک اضافه کن.": "📥 Inbox — add details, date and subtasks later by editing it.",
    "🔔 استراحت تموم شد! هروقت آماده بودی فوکوس بعدی رو شروع کن 💪": "🔔 Break is over! Start the next focus whenever you are ready 💪",
    "🛡️ الان یه Streak Shield داری — اول مصرفش کن بعد دوباره بخر": "🛡️ You already have a Streak Shield — use it first, then buy another",
    "برای شروع بزن، یا چند ثانیه نگه‌دار برای فوکوس بی‌نهایت ♾️": "Tap to start, or hold for a few seconds for infinite focus ♾️",
    "تسک مورد نظرت رو انتخاب کن و با صدای محیط در آرامش کار کن.": "Pick the task you want and work calmly with ambient sound.",
    "نذار چند دقیقه سخت، کل روزت رو تعریف کنه. برگرد به مسیر. ⚡": "Do not let a few hard minutes define your whole day. Get back on track. ⚡",
    "هنوز دکمه‌ای اضافه نکرده‌ای — نوار پایین یک ردیفه می‌ماند.": "You have not added any extra button — the bottom bar stays one row.",
    "یک ساعت خوب امروز، می‌تونه حس کل روزت رو عوض کنه. شروع کن.": "One good hour today can change how the whole day feels. Start.",
    "وقته از حالت «باید انجامش بدم» بری به حالت «انجامش دادم».": "Time to move from “I have to do it” to “I did it”.",
    "⛔ اعلان‌ها مسدود شده‌اند؛ از تنظیمات سایت/گوشی اجازه بده.": "⛔ Notifications are blocked; allow them in your site/phone settings.",
    "(اختیاری — با تیک زدن همه، تسک اصلی خودکار انجام می‌شود)": "(optional — ticking them all completes the main task automatically)",
    "روزهای ضعیف هم جزئی از مسیرن؛ مهم اینه که دوباره برگردی.": "Weak days are part of the path too; what matters is that you come back.",
    "🎉 هفته‌ی قبل فعالیتی نداشتی، این هفته شروع کردی — عالیه!": "🎉 You had no activity last week and started this week — that is great!",
    "🧩 زیرتسکی ندارد — از «ویرایش» می‌توانی چند زیرتسک بسازی.": "🧩 It has no subtasks — use “Edit” to create some.",
    "استراحت تموم شد! هروقت آماده بودی فوکوس بعدی رو شروع کن": "Break is over! Start the next focus whenever you are ready",
    "✏️ فقط این روز ذخیره شد؛ بقیه‌ی روزها دست‌نخورده ماندند": "✏️ Only this day was saved; the other days stayed untouched",
    "اگر امکانش هست ۲ دقیقه کنار پنجره یا در هوای آزاد باش.": "If you can, spend 2 minutes by a window or outdoors.",
    "اگر در دسترسه، ۱۰ دقیقه با کنسول یا کامپیوتر سرگرم شو.": "If it is available, spend 10 minutes with a console or computer game.",
    "۲۰ ثانیه به نقطه‌ای دور نگاه کن و به چشمت استراحت بده.": "Look at something far away for 20 seconds and rest your eyes.",
    "🔔 فوکوس تموم شد! هروقت آماده بودی استراحت رو شروع کن ☕": "🔔 Focus is over! Start your break whenever you are ready ☕",
    "این کارها رو امروز انجام بدی، یه Perfect Day می‌گیری:": "Do these today and you get a Perfect Day:",
    "برای یکی از ویدیوهای آینده‌ات یک سناریوی کوتاه بنویس.": "Write a short script for one of your future videos.",
    "تو لازم نیست سریع‌ترین باشی؛ فقط لازم نیست متوقف بشی.": "You do not have to be the fastest; you just must not stop.",
    "هر تیر شانس جعبه‌ی رایگان توی Mystery Box بیشتر می‌شه": "Each tier improves your free-box chance in the Mystery Box",
    "هفته‌ی قبل یکم بهتر بود — هفته‌ی بعد دوباره تلاش کن 💪": "Last week was a little better — try again next week 💪",
    "۵ دقیقه یک معما، پازل، سودوکو یا بازی فکری انجام بده.": "Spend 5 minutes on a riddle, puzzle, sudoku or brain game.",
    "⛔ اول اجازه نوتیفیکیشن را بده، بعد رویداد را ذخیره کن": "⛔ Allow notifications first, then save the event",
    "از این به بعد اعلان‌های مهم Life Planner رو می‌گیری.": "From now on you will get the important Life Planner alerts.",
    "حوصله داشتن شرط شروع نیست؛ شروع کن، حوصله خودش میاد.": "Being in the mood is not a requirement to start; start, and the mood will follow.",
    "شخصی‌سازی Life Planner بدون دست‌زدن به داده‌های قبلی": "Personalize Life Planner without touching any of your existing data",
    "چهار میانبر پایین برنامه را هر طور که می‌خواهی بچین.": "Arrange the four bottom shortcuts however you like.",
    "یک چیز جدید که امروز یاد گرفتی رو در یک جمله ثبت کن.": "Write down one new thing you learned today in a single sentence.",
    "تمام تسک‌های امروزت را تا قبل از ساعت ۸ شب کامل کن.": "Finish all of today's tasks before 8 PM.",
    "۱۰ دقیقه نوتیفیکیشن‌های غیرضروری گوشیت رو خاموش کن.": "Turn off unnecessary phone notifications for 10 minutes.",
    "⏱️ یک جلسه در حال اجراست؛ اول تمومش کن یا متوقفش کن": "⏱️ A session is already running; finish it or stop it first",
    "⚠️ نوتیفیکیشن فقط روی نسخه نصب‌شده/HTTPS کار می‌کنه": "⚠️ Notifications only work on the installed/HTTPS version",
    "فوکوس تموم شد! هروقت آماده بودی استراحت رو شروع کن": "Focus is over! Start your break whenever you are ready",
    "📥 به Inbox اضافه شد — بعداً از بخش تسک‌ها کاملش کن": "📥 Added to the Inbox — complete it later from Tasks",
    "امروز هیچ تسک بحرانی رو نادیده نذار و انجامش بده.": "Do not ignore any critical task today — get it done.",
    "صورتت را با آب بشور یا کمی آب به دست و صورتت بزن.": "Splash some water on your face or hands.",
    "🎉 همهی زیرتسکها تکمیل شدن — تسک اصلی هم انجام شد!": "🎉 All subtasks are complete — the main task is done too!",
    "بدون هیچ وقفه‌ای ۲۵ دقیقه رو یه کار مشخص کار کن.": "Work on one specific thing for 25 minutes with no interruptions.",
    "یک ایده‌ای که مدت‌ها تو ذهنت بوده رو یادداشت کن.": "Write down an idea that has been on your mind for a while.",
    "🎉 عالی! تسک بحرانی رو به‌موقع تموم کردی! +۱۰۰ XP": "🎉 Great! You finished the critical task in time! +100 XP",
    "🔥 Streak Shield ازت محافظت کرد و استریکت حفظ شد!": "🔥 A Streak Shield protected you and your streak survived!",
    "هر تیر همون لحظه ۱ Streak Shield رایگان می‌گیری": "Each tier instantly gives you 1 free Streak Shield",
    "یک کار کمتر از ۲ دقیقه‌ای را همین الان کامل کن.": "Finish one task that takes less than 2 minutes, right now.",
    "یک کار کوچک که مدت‌ها عقب انداختی را انجام بده.": "Do one small thing you have been postponing for a long time.",
    "۱۰ تا شنا یا ۱۵ تا اسکوات (هرکدام که راحت‌تری).": "10 push-ups or 15 squats (whichever is easier for you).",
    "⚔️ یکی از تسک‌های باس پاک شد — HP باس به‌روز شد": "⚔️ One of the boss's tasks was deleted — boss HP updated",
    "🔒 این تم هنوز باز نشده؛ از XP Shop آن را باز کن": "🔒 This theme is not unlocked yet; unlock it from the XP Shop",
    "🗑️ دسته حذف شد؛ رویدادها با رنگ خودشان می‌مانند": "🗑️ Category deleted; the events keep their own colors",
    "استراحت واقعی بخشی از مسیر پیشرفته، نه دشمنشه.": "A real break is part of your progress, not the enemy of it.",
    "هر تیر +۵ XP برای هر تسک بحرانی که تموم می‌کنی": "Each tier: +5 XP for every critical task you finish",
    "هروقت خواستی تمومش کن، همون مدت برات ثبت می‌شه": "End it whenever you want; that exact time gets logged for you",
    "بزن ببین امروز چقدر تا Perfect Day فاصله داری": "Tap to see how far you are from a Perfect Day",
    "مثلاً: ایده ویدیو جدید، خرید کتاب، تماس با...": "e.g. New video idea, buy a book, call...",
    "⚔️ چون همه‌ی تسک‌های باس پاک شدن، نبرد لغو شد": "⚔️ The battle was cancelled because all of the boss's tasks were deleted",
    "تسک انجام‌نشده‌ای نداری — اول چندتا تسک بساز": "You have no unfinished tasks — create a few first",
    "هر بار لول‌آپ می‌شی، یه امتیاز مهارت می‌گیری": "Every time you level up you get one skill point",
    "یه هدف بزرگ داری؟ بذار به یه باس تبدیلش کنیم": "Got a big goal? Let's turn it into a boss",
    "امروز همه‌ی مأموریت‌های اصلیت رو کامل کردی.": "You finished all of your main missions today.",
    "چندتا تسک انتخاب کن که هرکدوم بهش ضربه بزنه": "Pick a few tasks that each land a hit on it",
    "یک میان‌وعده سالم بخور (مثل میوه یا مغزها).": "Have a healthy snack (like fruit or nuts).",
    "یک وسیله یا زباله اضافه را از اتاقت جمع کن.": "Pick up one item or piece of rubbish from your room.",
    "۵ دقیقه استراحت واقعی داشته باش؛ بدون گوشی.": "Take a real 5-minute break; no phone.",
    "⏱️ در حال اجرای تایمر امکان تغییر حالت نیست": "⏱️ You cannot change mode while the timer is running",
    "⚠️ هر چهار دکمه باید بخش متفاوتی داشته باشن": "⚠️ All four buttons must point to different sections",
    "⚠️ فایل نامعتبر است — بک‌آپ لایف پلنر نیست": "⚠️ Invalid file — this is not a Life Planner backup",
    "برگرد به برنامه و فوکوس بعدی رو شروع کن 💪": "Come back to the app and start the next focus 💪",
    "حداقل یه هدف بساز و امروز ۱۰٪ پیشرفتش بده": "Create at least one goal and move it forward 10% today",
    "هر روزی که تیک بزنی، استریکت قوی‌تر می‌شه": "Every day you tick, your streak gets stronger",
    "هنوز هدف روزانه‌ای توی تنظیمات مشخص نکردی": "You have not set a daily goal in the settings yet",
    "یک قسمت کوتاه یا چند دقیقه تلویزیون ببین.": "Watch a short episode or a few minutes of TV.",
    "🎲 تسک انجام‌نشده‌ای در این فیلتر پیدا نشد": "🎲 No unfinished task found in this filter",
    "🎲 پیام‌های انگیزشی رندوم دوباره فعال شدند": "🎲 Random motivational messages are on again",
    "حداقل یکی از اهدافت رو امروز ۱۰٪ پیش ببر": "Move at least one of your goals forward 10% today",
    "همه‌ی کارها، اولویت‌ها و ددلاین‌ها یک‌جا": "All of your tasks, priorities and deadlines in one place",
    "یک تسک با اولویت بحرانی رو امروز تموم کن": "Finish one critical-priority task today",
    "یک کشو یا بخش کوچیک از اتاقت رو مرتب کن.": "Tidy one drawer or a small part of your room.",
    "⚠️ صدای محیط در این مرورگر در دسترس نیست": "⚠️ Ambient sound is not available in this browser",
    "به یک اتفاق خوب امروز فکر کن و ثبتش کن.": "Think of one good thing that happened today and write it down.",
    "۲ دقیقه مدیتیشن یا آرام‌سازی انجام بده.": "Do 2 minutes of meditation or relaxation.",
    "⛔ بدون اجازه اعلان، یادآوری فعال نمی‌شه": "⛔ Without notification permission the reminder cannot be enabled",
    "🎧 برای پخش صدا، یک‌بار روی دکمه صدا بزن": "🎧 Tap the sound button once to play audio",
    "برگرد به برنامه و استراحت رو شروع کن ☕": "Come back to the app and start your break ☕",
    "حداقل یکی از عادت‌هات رو امروز تیک بزن": "Tick at least one of your habits today",
    "روزهای هفته (می‌تونی چندتا انتخاب کنی)": "Days of the week (you can pick several)",
    "شهرت رو ببین — الان چادر توی جنگل داری": "See your city — right now you have a tent in the forest",
    "👍 همون سطح خوب هفته‌ی قبل رو حفظ کردی!": "👍 You kept the same good level as last week!",
    "این تسک انجام شده و پاداشش دریافت شده": "This task is done and its reward has been collected",
    "بلوک‌بندی زمانی برای رویدادها و کارها": "Time blocking for events and tasks",
    "هر تیر ۱۰٪ تخفیف روی قیمت‌های XP Shop": "Each tier: 10% off XP Shop prices",
    "⚙️ تنظیمات پومودورو (مدل Focus To-Do)": "⚙️ Pomodoro settings (Focus To-Do style)",
    "⚠️ شخصی‌سازی نوار پایین در دسترس نیست": "⚠️ Customizing the bottom bar is not available",
    "⚠️ قابلیت ارسال پشتیبان در دسترس نیست": "⚠️ Sending the backup is not available",
    "⚠️ مدت را بین ۱ تا ۱۴۴۰ دقیقه وارد کن": "⚠️ Enter a duration between 1 and 1440 minutes",
    "🎯 یک Quest ویژه با XP بیشتر برات اومد": "🎯 A special Quest with extra XP arrived for you",
    "🛡️ الان یک Shield داری — اول مصرفش کن": "🛡️ You already have a Shield — use it first",
    "☕ استراحت تموم شد! وقت فوکوس بعدیه 💪": "☕ Break is over! Time for the next focus 💪",
    "🏙️ یه آیتم جدید برای Life City گرفتی": "🏙️ You got a new item for Life City",
    "🔄 دور پومودورو به جلسه ۱ بازنشانی شد": "🔄 Pomodoro round reset to session 1",
    "اسم باس (مثلاً: مطالعه فصل ۳ ریاضی)": "Boss name (e.g. Study math chapter 3)",
    "شهر تو، همراه با پیشرفتت رشد می‌کنه": "Your city grows together with your progress",
    "۵ دقیقه روی مهم‌ترین کارت تمرکز کن.": "Focus on your most important task for 5 minutes.",
    "↩️ نوار پایین به حالت پیش‌فرض برگشت": "↩️ Bottom bar reset to default",
    "⚠️ اعلان روی این محیط در دسترس نیست": "⚠️ Notifications are not available in this environment",
    "⚡ XP Boost ×۲ برای ۳۰ دقیقه فعال شد": "⚡ XP Boost ×2 enabled for 30 minutes",
    "باشه، هفته‌ی بعد دوباره می‌پرسیم ⏳": "Fine, we will ask again next week ⏳",
    "کیف یا میزت رو برای فردا آماده کن.": "Get your bag or desk ready for tomorrow.",
    "یه هدف بزرگ رو به یه نبرد تبدیل کن": "Turn one big goal into a battle",
    "با XP هایی که جمع کردی، وسیله بخر": "Spend the XP you have collected on something good",
    "مثلاً: مطالعه، ورزش، خواب به‌موقع": "e.g. Reading, exercise, sleeping on time",
    "✏️ ویرایش کل رویداد (همه‌ی روزها)": "✏️ Edit the whole event (all days)",
    "🔎 جستجو در عنوان، متن یا برچسب...": "🔎 Search in title, text or tag...",
    "از هدف بزرگ زندگی تا اکشن روزانه": "From your big life goal down to daily action",
    "یک جمله درباره هدفت امروز بنویس.": "Write one sentence about your goal today.",
    "۱۵ دقیقه کامل بدون گوشی سپری کن.": "Spend a full 15 minutes without your phone.",
    "⚠️ دسته‌ای با این اسم از قبل هست": "⚠️ A category with this name already exists",
    "✅ هدف امروز رو کامل کردی، آفرین!": "✅ You completed today's goal, well done!",
    "📅 رویداد اضافه شد؛ یادآورش فعاله": "📅 Event added; its reminder is on",
    "امروز تسکی نداری، یکی اضافه کن!": "No tasks for today — add one!",
    "پشتیبان برنامه‌ریز هوشمند زندگی": "Smart Life Planner backup",
    "↩️ برگردوندن به حالت انجام‌نشده": "↩️ Mark as not done again",
    "⚠️ فعال‌سازی یادآوری ناموفق بود": "⚠️ Enabling the reminder failed",
    "✅ حال‌وهوای پیام انگیزشی عوض شد": "✅ Motivation mood changed",
    "📈 جمع‌بندی فوکوس": "📈 Focus summary",
    "📍 یادداشت از حالت سنجاق خارج شد": "📍 Note unpinned",
    "انتخاب تصادفی یک تسک برای شروع": "Pick a random task to start",
    "مثلاً: امروز فقط یک قدم جلوتر.": "e.g. Just one step further today.",
    "محتویات و شانس‌های Mystery Box": "Mystery Box contents and odds",
    "هر تیر +۱۰٪ XP کوئست‌های رندوم": "Each tier: +10% XP from random quests",
    "یه دور کوتاه توی خونه راه برو.": "Take a short walk around the house.",
    "یک هفته همه‌ی تسک‌ها انجام بشه": "Complete every task for a whole week",
    "⚠️ همه بخش‌ها همین پایین هستند": "⚠️ All sections are right below",
    "⭐⭐⭐⭐ +۱۰۰ XP — جایزه‌ی بی‌نظیر": "⭐⭐⭐⭐ +100 XP — an outstanding reward",
    "🎯 امروز در برابر بهترین رکوردت": "🎯 Today versus your best record",
    "👑 یه جعبه‌ی شانس دیگه، رایگان!": "👑 Another lucky box, free!",
    "📊 این هفته در برابر هفته‌ی قبل": "📊 This week versus last week",
    "🗑️ حذف کل رویداد (همه‌ی روزها)": "🗑️ Delete the whole event (all days)",
    "☁️ ارسال پشتیبان به فضای ابری": "☁️ Send backup to the cloud",
    "⚠️ فعال‌سازی اعلان ناموفق بود": "⚠️ Enabling notifications failed",
    "🧩 اندازه رابط کاربری ذخیره شد": "🧩 UI size saved",
    "امروز می‌تونی ازش بهتر باشی؟": "Can you beat it today?",
    "میز کارت را ۲ دقیقه مرتب کن.": "Tidy your desk for 2 minutes.",
    "⚠️ حداقل یک روز رو انتخاب کن": "⚠️ Pick at least one day",
    "📤 ارسال پشتیبان به فضای ابری": "📤 Send backup to the cloud",
    "مثلاً: یادگیری زبان انگلیسی": "e.g. Learning English",
    "۵ دقیقه گوشی را کنار بگذار.": "Put the phone away for 5 minutes.",
    "✅ تنظیمات پومودورو ذخیره شد": "✅ Pomodoro settings saved",
    "✅ نوار دسترسی سریع ذخیره شد": "✅ Quick access bar saved",
    "📝 ثبت داده خارج از پومودورو": "📝 Log data outside Pomodoro",
    "تمرکز کن، تا آخرش کنارتم 🎯": "Stay focused, I am with you to the end 🎯",
    "فوکوس متمرکز، با ریتم درست": "Deep focus, with the right rhythm",
    "مدت استراحت طولانی (دقیقه)": "Long break length (min)",
    "همه‌جا هماهنگ با نسخه فعلی": "In sync with the current version everywhere",
    "چیزی با این جستجو پیدا نشد": "Nothing matched this search",
    "یک آهنگ آرامش‌بخش گوش بده.": "Listen to one relaxing song.",
    "⚠️ امتیاز مهارت کافی نداری": "⚠️ Not enough skill points",
    "✅ یادآوری این رویداد فعاله": "✅ The reminder for this event is on",
    "🎲 پیام‌های رندوم فعال شدند": "🎲 Random messages are on",
    "🛡️ +۱ Streak Shield گرفتی!": "🛡️ +1 Streak Shield received!",
    "آمار روزانه و Perfect Day": "Daily stats and Perfect Day",
    "این مهارت به حداکثر رسیده": "This skill is already maxed out",
    "رقابت با نسخه‌ی قبلی خودت": "Compete with your former self",
    "مثلاً ریاضی — فصل معادلات": "e.g. Math — equations chapter",
    "مثلاً: مطالعه فصل ۳ ریاضی": "e.g. Study math chapter 3",
    "مدت استراحت کوتاه (دقیقه)": "Short break length (min)",
    "هنوز جلسه کاملی ثبت نشده.": "No complete session has been logged yet.",
    "۵ دقیقه اتاقت رو مرتب کن.": "Tidy your room for 5 minutes.",
    "⚠️ حداقل یک تسک انتخاب کن": "⚠️ Pick at least one task",
    "⚠️ عنوان یادداشت رو بنویس": "⚠️ Write the note title",
    "✅ تسک با موفقیت انجام شد!": "✅ Task completed successfully!",
    "⬇️ فایل پشتیبان دانلود شد": "⬇️ Backup file downloaded",
    "⭐ +۱۰ XP — جایزه‌ی معمولی": "⭐ +10 XP — an ordinary reward",
    "⭐⭐⭐ +۵۰ XP — جایزه‌ی عالی": "⭐⭐⭐ +50 XP — a great reward",
    "🏖️ استراحت طولانی شروع شد": "🏖️ Long break started",
    "مثلاً: درس، کار، ورزش...": "e.g. Study, work, exercise...",
    "هر چی دوست داری بنویس...": "Write whatever you like...",
    "⚠️ عنوان رویداد رو بنویس": "⚠️ Write the event title",
    "🆕 نسخه جدید Life Planner": "🆕 New Life Planner version",
    "🏷️ دسته‌بندی‌ها و رنگ‌ها": "🏷️ Categories and colors",
    "برنامه‌ریز هوشمند زندگی": "Smart Life Planner",
    "هر تیر +۱۰٪ XP پومودورو": "Each tier: +10% Pomodoro XP",
    "پیشرفت کلی و دستاوردهات": "Your overall progress and achievements",
    "۱۰ حرکت کششی انجام بده.": "Do 10 stretches.",
    "☕ استراحت کوتاه شروع شد": "☕ Short break started",
    "⚔️ باس این هفته رو بساز": "⚔️ Create this week's boss",
    "⚔️ بزن بریم شکستش بدیم!": "⚔️ Let's go beat it!",
    "⚠️ اول اسم باس رو بنویس": "⚠️ Write the boss name first",
    "⚠️ ساعت را درست وارد کن": "⚠️ Enter the time correctly",
    "⭐⭐ +۲۵ XP — جایزه‌ی خوب": "⭐⭐ +25 XP — a good reward",
    "🎉 دور پومودورو کامل شد!": "🎉 Pomodoro round complete!",
    "🎯 فوکوس آزاد (بدون تسک)": "🎯 Free focus (no task)",
    "🎯 یه مأموریت جدید رسید!": "🎯 A new mission just arrived!",
    "💎 +۲۰۰ XP — Jackpot!! 🎉": "💎 +200 XP — Jackpot!! 🎉",
    "🔕 اجازه اعلان داده نشد.": "🔕 Notification permission was not granted.",
    "🛠️ شخصی‌سازی نوار پایین": "🛠️ Customize the bottom bar",
    "بیشترین استریک ۱۰۰ روز": "A 100-day best streak",
    "یادآوری روزانه پشتیبان": "Daily backup reminder",
    "۵ نفس عمیق و آرام بکش.": "Take 5 deep, slow breaths.",
    "⚠️ بازه زمانی نامعتبره": "⚠️ Invalid time range",
    "⚡ حالت‌های آماده فوکوس": "⚡ Ready-made focus modes",
    "⛔ اعلان فعال نیست": "⛔ Notifications are off",
    "✅ پیام سفارشی اعمال شد": "✅ Custom message applied",
    "✏️ ویرایش پریست سفارشی": "✏️ Edit custom preset",
    "⬇️ فقط دانلود روی گوشی": "⬇️ Just download to the phone",
    "🏖️ شروع استراحت طولانی": "🏖️ Start long break",
    "🔔 فعال‌سازی اعلان": "🔔 Enable notifications",
    "🔔 یادآوری Life Planner": "🔔 Life Planner reminder",
    "🔤 اندازه فونت ذخیره شد": "🔤 Font size saved",
    "🚶 یک دور کوتاه راه برو": "🚶 Take a short walk",
    "🧠 حالت تمرکز تمام‌صفحه": "🧠 Fullscreen focus mode",
    "· امتیاز تمرکز ثبت شد": "· focus score saved",
    "از مهارت 🌳 قاتل بحران": "From the 🌳 Crisis Slayer skill",
    "استراحت ثبت‌شده امروز": "Break logged today",
    "امتیاز بهره‌وری امروز": "Productivity score today",
    "امتیاز مهارت در دسترس": "Skill points available",
    "این تم رو قبلاً خریدی": "You already own this theme",
    "بریم برای مرحله بعد 🚀": "On to the next step 🚀",
    "فعلاً باس مشخصی ندارم": "I do not have a boss right now",
    "مثلاً: جمع‌آوری منابع": "e.g. Gather the resources",
    "مثلاً: کار، ایده، درس": "e.g. Work, idea, study",
    "هفته‌ات را یک‌جا ببین": "See your whole week at a glance",
    "هنوز هدفی تعریف نکردی": "You have not defined a goal yet",
    "⏭️ رد کردن و جلسه بعد": "⏭️ Skip and go to next session",
    "⚠️ عنوان تسک رو بنویس": "⚠️ Write the task title",
    "⚠️ عنوان هدف رو بنویس": "⚠️ Write the goal title",
    "⚠️ فایل نامعتبر است —": "⚠️ Invalid file —",
    "✏️ ویرایش فقط این روز": "✏️ Edit only this day",
    "✏️ ویرایش و تکمیل تسک": "✏️ Edit and complete task",
    "🍅 دور ۱ • جلسه ۱ از ۴": "🍅 Round 1 • Session 1 of 4",
    "🎁 محتویات Mystery Box": "🎁 Mystery Box contents",
    "🏖️ وقت استراحت طولانی": "🏖️ Time for a long break",
    "🏷️ دسته جدید ساخته شد": "🏷️ New category created",
    "الان بوستی فعال نیست": "No boost is active right now",
    "این یادداشت حذف بشه؟": "Delete this note?",
    "بلندترین استریک فعال": "Longest active streak",
    "رنگ رویداد (اختیاری)": "Event color (optional)",
    "مطالعه ثبت‌شده امروز": "Study logged today",
    "میانگین فوکوس روزانه": "Average daily focus",
    "میانگین پیشرفت اهداف": "Average goal progress",
    "هنوز تسکی کامل نکردی": "You have not completed any task yet",
    "هنوز ثبت دستی نداری.": "No manual entries yet.",
    "هنوز عادتی ثبت نکردی": "You have not added a habit yet",
    "☁️ پشتیبان و بازیابی": "☁️ Backup and restore",
    "⚠️ اسم دسته رو بنویس": "⚠️ Write the category name",
    "⚠️ اسم عادت رو بنویس": "⚠️ Write the habit name",
    "✏️ یادداشت ویرایش شد": "✏️ Note updated",
    "🎉 جلسه فوکوس کامل شد": "🎉 Focus session complete",
    "🎯 مأموریت جدید رسید!": "🎯 A new mission arrived!",
    "📌 سنجاق کردن یادداشت": "📌 Pin note",
    "🔔 یادآوری این رویداد": "🔔 Remind me about this event",
    "🔥 طولانی‌ترین استریک": "🔥 Longest streak",
    "🕘 تاریخچه‌ی جلسات اخیر": "🕘 Recent session history",
    "🗂️ ثبت‌های دستی اخیر": "🗂️ Recent manual entries",
    "🧩 اندازه رابط کاربری": "🧩 UI size",
    "تا از دست دادن فرصت": "until you lose the chance",
    "تسک انجام‌شده امروز": "Tasks done today",
    "تسک مرتبط (اختیاری)": "Linked task (optional)",
    "رقیب تو دیروزت بود.": "Your rival was yesterday's you.",
    "زمان تخمینی (دقیقه)": "Estimated time (min)",
    "پایگاه دانش شخصی تو": "Your personal knowledge base",
    "کوئست‌های انجام‌شده": "Completed quests",
    "۱۰ دقیقه مطالعه کن.": "Read for 10 minutes.",
    "۱۰۰۰ XP در طول مسیر": "1000 XP along the way",
    "☕ وقت استراحت کوتاه": "☕ Time for a short break",
    "✅ بازیابی کامل شد —": "✅ Restore complete —",
    "✏️ رویداد ویرایش شد": "✏️ Event updated",
    "✏️ ویرایش کل رویداد": "✏️ Edit the whole event",
    "➕ اضافه کردن ددلاین": "➕ Add a deadline",
    "➕ افزودن دکمه اضافی": "➕ Add extra button",
    "🌧️ باران و رعد آرام": "🌧️ Calm rain and thunder",
    "👀 به دوردست نگاه کن": "👀 Look into the distance",
    "🔔 نوتیفیکیشن فعاله!": "🔔 Notifications are on!",
    "🗑️ کل رویداد حذف شد": "🗑️ The whole event was deleted",
    "آماده‌ی شروع فوکوس": "Ready to start focusing",
    "تعداد جلسات هر دور": "Sessions per round",
    "هنوز هدفی ثبت نشده": "No goal recorded yet",
    "پیش‌فرض (رنگ دسته)": "Default (category color)",
    "۲ صفحه کتاب بخوان.": "Read 2 pages of a book.",
    "⏱ بدون زمان تخمینی": "⏱ No estimated time",
    "✅ اعلان‌های شروع و پایان جلسه روشن است": "✅ Start and end of session notifications are on",
    "🎯 تسک و محیط فوکوس": "🎯 Focus task and environment",
    "💧 یک لیوان آب بخور": "💧 Drink a glass of water",
    "📌 نوار دسترسی سریع": "📌 Quick access bar",
    "📌 یادداشت سنجاق شد": "📌 Note pinned",
    "📝 یادداشت ذخیره شد": "📝 Note saved",
    "📥 تسک سریع — Inbox": "📥 Quick task — Inbox",
    "🔔 استراحت تموم شد!": "🔔 Break is over!",
    "🗑️ حذف فقط این روز": "🗑️ Delete only this day",
    "انتخاب رنگ دلخواه": "Pick a custom color",
    "باس رو شکست دادی!": "You beat the boss!",
    "برنامه‌ریز هوشمند": "Smart Planner",
    "تسک بازگردانده شد": "tasks restored",
    "تسک‌های انجام‌شده": "Completed tasks",
    "خودکار (رنگ دسته)": "Automatic (category color)",
    "خونه + باغچه و سگ": "House + garden and a dog",
    "درس، کار، شخصی...": "Study, work, personal...",
    "محتویات و شانس‌ها": "Contents and odds",
    "مدت فوکوس (دقیقه)": "Focus length (min)",
    "یک لیوان آب بنوش.": "Drink a glass of water.",
    "☕ استراحت کامل شد": "☕ Break complete",
    "♾️ فوکوس بی‌نهایت": "♾️ Infinite focus",
    "✏️ دسته به‌روز شد": "✏️ Category updated",
    "✏️ ویرایش یادداشت": "✏️ Edit note",
    "➕ افزودن به Inbox": "➕ Add to Inbox",
    "🌌 فضای تمرکز عمیق": "🌌 Deep focus space",
    "🎒 دارایی‌های ویژه": "🎒 Special items",
    "🏖️ استراحت طولانی": "🏖️ Long break",
    "💾 ذخیره و فعال کن": "💾 Save and enable",
    "📅 رویداد اضافه شد": "📅 Event added",
    "🗑️ یادداشت حذف شد": "🗑️ Note deleted",
    "+۱ تسک انجام‌شده": "+1 task completed",
    "HP باس کم می‌شود": "Boss HP goes down",
    "· تغییر حال‌وهوا": "· change the mood",
    "اسم هدف بزرگت...": "Your big goal...",
    "این تسک حذف بشه؟": "Delete this task?",
    "بونوس قاتل بحران": "Crisis Slayer bonus",
    "تا باس فایت بعدی": "until the next boss fight",
    "تا مأموریت بعدی:": "Next mission in:",
    "ددلاین‌های اضافه": "Extra deadlines",
    "رنگ پیش‌فرض دسته": "Default category color",
    "مثلاً: کلاس زبان": "e.g. Language class",
    "هنوز عادتی نداری": "No habits yet",
    "هنوز چیزی نخریدی": "You have not bought anything yet",
    "۳ دقیقه راه برو.": "Walk for 3 minutes.",
    "⏱️ دقیقه ۱ از ۲۵": "⏱️ Minute 1 of 25",
    "⚠️ XP کافی نداری": "⚠️ Not enough XP",
    "✏️ باس ویرایش شد": "✏️ Boss updated",
    "✓ در حال استفاده": "✓ In use",
    "🌲 جنگل و پرندگان": "🌲 Forest and birds",
    "🎯 اهداف در جریان": "🎯 Goals in progress",
    "🎲 برگشت به رندوم": "🎲 Back to random",
    "🏆 دستاوردهای شهر": "🏆 City achievements",
    "📋 برنامه‌ی امروز": "📋 Today's plan",
    "🔔 فوکوس تموم شد!": "🔔 Focus is over!",
    "🔥 استریک عادت‌ها": "🔥 Habit streaks",
    "🚨 وضعیت بحرانیه!": "🚨 Critical situation!",
    "🧘 نفس عمیق و کشش": "🧘 Deep breathing and stretching",
    "استراحت (دقیقه)": "Break (min)",
    "بلندی صدای محیط": "Ambient volume",
    "توضیح (اختیاری)": "Note (optional)",
    "رسیدن به سطح ۲۰": "Reach level 20",
    "سقف خرید هفتگی:": "Weekly purchase limit:",
    "شروع فوکوس بعدی": "Start next focus",
    "شکوفه‌های باغچه": "Garden blossoms",
    "طلایی افسانه‌ای": "Legendary Gold",
    "هنوز هدفی نداری": "No goals yet",
    "پیشرفت فعلی (٪)": "Current progress (%)",
    "کوچک و جمع‌وجور": "Small and compact",
    "یادآور فعال است": "Reminder is on",
    "⏰ مهلت ۱۴ روزه:": "⏰ 14-day deadline:",
    "▶️ در حال انجام": "▶️ In progress",
    "☕ استراحت کوتاه": "☕ Short break",
    "⚙️ پریست سفارشی": "⚙️ Custom preset",
    "⚠️ تسک یافت نشد": "⚠️ Task not found",
    "🌓 تغییر سریع تم": "🌓 Quick theme switch",
    "🍅 فوکوس شروع شد": "🍅 Focus started",
    "🏅 رکوردهای شخصی": "🏅 Personal records",
    "💾 ذخیره تغییرات": "💾 Save changes",
    "💾 ذخیره تنظیمات": "💾 Save settings",
    "📍 برداشتن سنجاق": "📍 Unpin",
    "🔄 شروع مجدد دور": "🔄 Restart round",
    "🔥 عادت اضافه شد": "🔥 Habit added",
    "بیشترین استریک": "Best streak",
    "تعداد پومودورو": "Pomodoro count",
    "موجودی XP Shop": "XP Shop balance",
    "وضعیت بحرانیه!": "Critical situation!",
    "وقت باس فایته!": "Boss fight time!",
    "یادداشتی نداری": "No notes yet",
    "⏰ تیک‌تاک ساعت": "⏰ Ticking clock",
    "⏹️ پایان و ثبت": "⏹️ End and save",
    "☕ شروع استراحت": "☕ Start break",
    "✅ تسک ذخیره شد": "✅ Task saved",
    "➕ یادداشت جدید": "➕ New note",
    "🎯 مأموریت بعدی": "🎯 Next mission",
    "🎯 هدف اضافه شد": "🎯 Goal added",
    "🏷️ نسخه برنامه": "🏷️ App version",
    "📅 هفت روز اخیر": "📅 Last seven days",
    "📝 یادداشت جدید": "📝 New note",
    "🔥 آتش و شومینه": "🔥 Fire and fireplace",
    "🗓️ بدون ددلاین": "🗓️ No deadline",
    "(تسک حذف شده)": "(deleted task)",
    "استراحت امروز": "Break today",
    "استریک روزانه": "Daily streak",
    "انتخاب ددلاین": "Pick a deadline",
    "باز کردن جعبه": "Open the box",
    "تسکی پیدا نشد": "No task found",
    "تغییر سریع تم": "Quick theme switch",
    "جایزه‌ت اینه!": "Here is your reward!",
    "راهنمای تقویم": "Calendar help",
    "ردیاب عادت‌ها": "Habit tracker",
    "ساختمان کوچیک": "Small building",
    "شروع باس فایت": "Start boss fight",
    "عنوان یادداشت": "Note title",
    "فوکوس (دقیقه)": "Focus (min)",
    "مدیریت تسک‌ها": "Task management",
    "میانگین کیفیت": "Average quality",
    "چادر توی جنگل": "Tent in the forest",
    "یکم نفس بکش ☕": "Take a breath ☕",
    "⏱️ مدت مطالعه": "⏱️ Study time",
    "⏹️ پایان جلسه": "⏹️ End session",
    "▶️ شروع فوکوس": "▶️ Start focus",
    "✅ انجامش دادم": "✅ I did it",
    "✅ جلسه ثبت شد": "✅ Session saved",
    "✏️ ویرایش باس": "✏️ Edit boss",
    "➕ افزودن دسته": "➕ Add category",
    "➕ رویداد جدید": "➕ New event",
    "🎁 پاداش تکمیل": "🎁 Completion reward",
    "🎨 تم‌های ویژه": "🎨 Special themes",
    "💬 پیام سفارشی": "💬 Custom message",
    "📁 همه پوشه‌ها": "📁 All folders",
    "📅 رویداد جدید": "📅 New event",
    "📌 این تغییرات": "📌 These changes",
    "🔤 اندازه فونت": "🔤 Font size",
    "🗑️ تسک حذف شد": "🗑️ Task deleted",
    "🧩 زیرتسک‌ها —": "🧩 Subtasks —",
    "انتخاب تاریخ": "Pick a date",
    "خونه + ماشین": "House + car",
    "خونه‌ی واقعی": "A real house",
    "داده‌ای نیست": "No data",
    "در حال انجام": "In progress",
    "شروع استراحت": "Start break",
    "شکارچی کوئست": "Quest Hunter",
    "عنوان زیرتسک": "Subtask title",
    "فوکوس موفق 🎯": "Focus complete 🎯",
    "محافظ استریک": "Streak Shield",
    "مدیریت اهداف": "Goal management",
    "⏭️ جلسه بعدی": "⏭️ Next session",
    "⏳ روند فوکوس": "⏳ Focus trend",
    "⚔️ باس هفتگی": "⚔️ Weekly boss",
    "✅ اعمال پیام": "✅ Apply message",
    "🌅 طلوع آفتاب": "🌅 Sunrise",
    "🌇 غروب آفتاب": "🌇 Sunset",
    "🌊 امواج دریا": "🌊 Sea waves",
    "🌌 قبل از سحر": "🌌 Before dawn",
    "🌳 درخت مهارت": "🌳 Skill tree",
    "🎧 صدای محیط:": "🎧 Ambient sound:",
    "🎯 هدف روزانه": "🎯 Daily goal",
    "📱 نوار پایین": "📱 Bottom bar",
    "🔔 اعلان‌ها": "🔔 Notifications",
    "🗺️ مسیر ترقی": "🗺️ Progress path",
    "0 / 0 دقیقه": "0 / 0 min",
    "استاد زندگی": "Life Master",
    "استاد فوکوس": "Focus Master",
    "به‌روزرسانی": "Update",
    "تقویم هفتگی": "Weekly calendar",
    "دسته‌ی جدید": "New category",
    "صبح‌بخیر ☀️": "Good morning ☀️",
    "ظهر‌بخیر 🌤️": "Good afternoon 🌤️",
    "عالی بود! 🎉": "That was great! 🎉",
    "فوکوس امروز": "Focus today",
    "مدت (دقیقه)": "Duration (min)",
    "ویرایش دسته": "Edit category",
    "پیشرفت کل ·": "Overall progress ·",
    "کلبه‌ی چوبی": "Wooden cabin",
    "⏸️ روی مکثه": "⏸️ Paused",
    "⚡ شارژکننده": "⚡ Energizing",
    "✅ انجام شد!": "✅ Done!",
    "✅ تکمیل‌شده": "✅ Completed",
    "✓ انجام شده": "✓ Done",
    "➕ دسته جدید": "➕ New category",
    "➕ عادت جدید": "➕ New habit",
    "⬜ شروع نشده": "⬜ Not started",
    "🌄 نزدیک سحر": "🌄 Near dawn",
    "🌓 تم برنامه": "🌓 App theme",
    "📊 آمار پومو": "📊 Pomo stats",
    "📌 سنجاق‌شده": "📌 Pinned",
    "🔄 وضعیت تسک": "🔄 Task status",
    "🔥 عادت جدید": "🔥 New habit",
    "🧱 مرحله شهر": "🧱 City stage",
    "Inbox سریع": "Quick Inbox",
    "استفاده کن": "Use it",
    "بدون عنوان": "Untitled",
    "بدون محتوا": "No content",
    "جلسات کامل": "Completed sessions",
    "ددلاین اول": "First deadline",
    "درخت مهارت": "Skill tree",
    "رنگ دلخواه": "Custom color",
    "ساعت پایان": "End time",
    "شروع نبرد!": "Start the battle!",
    "عصر‌بخیر 🌆": "Good evening 🌆",
    "غروب آتشین": "Fire Sunset",
    "فوکوس آزاد": "Free focus",
    "قاتل بحران": "Crisis Slayer",
    "مدت مطالعه": "Study time",
    "نوع فعالیت": "Activity type",
    "هدف روزانه": "Daily goal",
    "پاداش اصلی": "Main reward",
    "کوئست سریع": "Quick quest",
    "یادداشت‌ها": "Notes",
    "↩️ پیش‌فرض": "↩️ Default",
    "☕ کافه دنج": "☕ Cozy cafe",
    "⚙️ تنظیمات": "⚙️ Settings",
    "✅ ارسال شد": "✅ Sent",
    "✅ تسک جدید": "✅ New task",
    "➕ تسک جدید": "➕ New task",
    "➕ ثبت داده": "➕ Log data",
    "➕ هدف جدید": "➕ New goal",
    "🌆 طلوع ماه": "🌆 Moonrise",
    "🌱 تازه‌کار": "🌱 Beginner",
    "🍅 پومودورو": "🍅 Pomodoro",
    "🎯 هدف جدید": "🎯 New goal",
    "🎯 کوئست‌ها": "🎯 Quests",
    "🏷️ دسته‌ها": "🏷️ Categories",
    "📝 ثبت داده": "📝 Log data",
    "(اختیاری)": "(optional)",
    "XP روزانه": "Daily XP",
    "استاد نظم": "Discipline Master",
    "استراحت ☕": "Break ☕",
    "انجام شده": "Done",
    "باس هفتگی": "Weekly boss",
    "بلندی صدا": "Volume",
    "بنفش نئون": "Neon Purple",
    "تمام‌صفحه": "Fullscreen",
    "خیلی بزرگ": "Extra large",
    "دسته‌بندی": "Category",
    "دیپ فوکوس": "Deep focus",
    "زیرتسک‌ها": "Subtasks",
    "ساعت شروع": "Start time",
    "شارژکننده": "Energizing",
    "شانس بلند": "Lucky Streak",
    "شب‌بخیر 🌙": "Good night 🌙",
    "شروع نشده": "Not started",
    "شهر آینده": "Future city",
    "شهر کوچیک": "Small town",
    "عنوان تسک": "Task title",
    "عنوان هدف": "Goal title",
    "ماه بعد ▶": "Next month ▶",
    "⏭️ ردش کن": "⏭️ Skip it",
    "◀ ماه قبل": "◀ Previous month",
    "☕ استراحت": "☕ Break",
    "✏️ ویرایش": "✏️ Edit",
    "🔥 سخت‌گیر": "🔥 Tough",
    "اردیبهشت": "Ordibehesht",
    "بدون تسک": "No task",
    "تازه‌کار": "Beginner",
    "تم تاریک": "Dark theme",
    "حذف دکمه": "Remove button",
    "صدای شهر": "City sound",
    "عالیه! 🙌": "Awesome! 🙌",
    "مثلاً 45": "e.g. 45",
    "نام عادت": "Habit name",
    "پاک کردن": "Clear",
    "پومودورو": "Pomodoro",
    "چهارشنبه": "Wednesday",
    "⏱️ فوکوس": "⏱️ Focus",
    "⏸️ متوقف": "⏸️ Paused",
    "▶️ ادامه": "▶️ Resume",
    "✅ تسک‌ها": "✅ Tasks",
    "🎯 تمرکزی": "🎯 Focused",
    "💪 حمایتی": "💪 Supportive",
    "💬 سفارشی": "💬 Custom",
    "📅 رویداد": "📅 Event",
    "📚 مطالعه": "📚 Study",
    "📱 بخش‌ها": "📱 Sections",
    "(۰ تسک)": "(0 tasks)",
    "اختیاری": "Optional",
    "استراحت": "Break",
    "باشه! 🎉": "OK! 🎉",
    "تم روشن": "Light theme",
    "تنظیمات": "Settings",
    "داشبورد": "Dashboard",
    "رنگ تسک": "Task color",
    "رودخانه": "River",
    "سخت‌گیر": "Tough",
    "سطح هدف": "Goal level",
    "سه‌شنبه": "Tuesday",
    "عادت‌ها": "Habits",
    "فرمانده": "Commander",
    "فروردین": "Farvardin",
    "پروفایل": "Profile",
    "پنجشنبه": "Thursday",
    "چانه‌زن": "Negotiator",
    "یادداشت": "Note",
    "۰ دقیقه": "0 min",
    "▶️ شروع": "▶️ Start",
    "➕ اضافه": "➕ Add",
    "🎯 فوکوس": "🎯 Focus",
    "🎲 رندوم": "🎲 Random",
    "💾 ذخیره": "💾 Save",
    "📌 سنجاق": "📌 Pin",
    "📥 در صف": "📥 Queued",
    "🔇 خاموش": "🔇 Off",
    "افسانه": "Legend",
    "انتخاب": "Select",
    "انصراف": "Cancel",
    "اولویت": "Priority",
    "ایموجی": "Emoji",
    "بازگشت": "Back",
    "بحرانی": "Critical",
    "تسک‌ها": "Tasks",
    "تمرکزی": "Focused",
    "حمایتی": "Supportive",
    "دوشنبه": "Monday",
    "روزانه": "Daily",
    "رویداد": "Event",
    "سالانه": "Yearly",
    "سفارشی": "Custom",
    "سلام 👋": "Hi 👋",
    "شهریور": "Shahrivar",
    "ماهانه": "Monthly",
    "مطالعه": "Study",
    "پیشرفت": "Progress",
    "کلاسیک": "Classic",
    "یکشنبه": "Sunday",
    "⏸️ مکث": "⏸️ Pause",
    "☀️ ظهر": "☀️ Noon",
    "✅ فعال": "✅ Active",
    "🗑️ حذف": "🗑️ Delete",
    "🧘 آرام": "🧘 Calm",
    "(مکث)": "(paused)",
    "آبشار": "Waterfall",
    "اسفند": "Esfand",
    "امروز": "Today",
    "اهداف": "Goals",
    "باران": "Rain",
    "برچسب": "Tag",
    "بعداً": "Later",
    "بیشتر": "More",
    "تاریخ": "Date",
    "تقویم": "Calendar",
    "تمرکز": "Focus",
    "جنگجو": "Warrior",
    "خرداد": "Khordad",
    "در صف": "Queued",
    "دقیقه": "min",
    "ذخیره": "Save",
    "زندگی": "Life",
    "عنوان": "Title",
    "فواره": "Fountain",
    "فوکوس": "Focus",
    "متوسط": "Medium",
    "متوقف": "Paused",
    "مجسمه": "Statue",
    "محتوا": "Content",
    "مرداد": "Mordad",
    "نیمکت": "Bench",
    "هفتگی": "Weekly",
    "همه ›": "All ›",
    "وضعیت": "Status",
    "پایین": "Low",
    "کوئست": "Quest",
    "کوتاه": "Short",
    "۰ تسک": "0 tasks",
    "۶۰:۰۰": "60:00",
    "✅ تسک": "✅ Task",
    "📁 همه": "📁 All",
    "🔒 قفل": "🔒 Locked",
    "+۱۰٪": "+10%",
    "-۱۰٪": "-10%",
    "آبان": "Aban",
    "آرام": "Calm",
    "باشه": "OK",
    "بالا": "High",
    "بزرگ": "Large",
    "بستن": "Close",
    "بهمن": "Bahman",
    "جمعه": "Friday",
    "خروج": "Exit",
    "خرید": "Buy",
    "درخت": "Tree",
    "ساعت": "h",
    "شروع": "Start",
    "شنبه": "Saturday",
    "منظم": "Consistent",
    "چراغ": "Lamp",
    "کوچک": "Small",
    "🌙 شب": "🌙 Night",
    "آذر": "Azar",
    "تسک": "Task",
    "تیر": "Tir",
    "سطح": "Level",
    "عدد": "pcs",
    "مهر": "Mehr",
    "0٪": "0%",
    "از": "of",
    "دی": "Dey",
    "پل": "Bridge",
    "۳۰": "30",
    "ج": "F",
    "د": "M",
    "س": "T",
    "ش": "S",
    "٪": "%",
    "پ": "T",
    "چ": "W",
    "ی": "S",
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
  };  var PATTERNS = [
    /* v18.1: «برنامه روز» — messages that carry a live number or a title */
    [new RegExp("^➡️\\ «([\\s\\S]*?)»\\ به\\ فردا\\ منتقل شد$"), "➡️ “$1” moved to tomorrow"],
    [new RegExp("^➡️\\ «([\\s\\S]*?)»\\ به\\ دیروز\\ منتقل شد$"), "➡️ “$1” moved to yesterday"],
    [new RegExp("^➡️\\ «([\\s\\S]*?)»\\ به\\ ([\\s\\S]*)\\ منتقل شد$"), "➡️ “$1” moved to $2"],
    [new RegExp("^🧹\\ ([\\s\\S]*)\\ کار\\ انجام‌شده\\ پاک شد$"), "🧹 $1 completed items cleared"],
    [new RegExp("^📥\\ ([\\s\\S]*)\\ کارِ\\ ناتمامِ\\ دیروز\\ به\\ این\\ روز\\ اومد$"), "📥 $1 unfinished items from yesterday moved to this day"],
    [new RegExp("^📋\\ ([\\s\\S]*)\\ کار\\ کپی شد$"), "📋 $1 items copied"],
    [new RegExp("^برنامه\\ روز:\\ ([\\s\\S]*)\\ از\\ ([\\s\\S]*)\\ انجام‌شده$"), "Day plan: $1 of $2 done"],
    /* v18.2: live resize bubble, resize result and resize conflict */
    [new RegExp("^⚠️\\ «([\\s\\S]*?)»\\ مانع\\ این\\ تغییر\\ است؛\\ ساعت‌ها\\ تداخل\\ دارند$"), "⚠️ “$1” blocks this change; the times overlap"],
    [new RegExp("^📌\\ این\\ روز\\ جدا\\ شد\\ —\\ ⏱️\\ «([\\s\\S]*?)»\\ شد\\ ([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ \\((\\d+)\\ ساعت\\ و\\ (\\d+)\\ دقیقه\\)\\s*$"), "📌 This day was split off — ⏱️ “$1” is now $2 to $3 ($4 h $5 min)"],
    [new RegExp("^📌\\ این\\ روز\\ جدا\\ شد\\ —\\ ⏱️\\ «([\\s\\S]*?)»\\ شد\\ ([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ \\((\\d+)\\ ساعت\\)\\s*$"), "📌 This day was split off — ⏱️ “$1” is now $2 to $3 ($4 h)"],
    [new RegExp("^📌\\ این\\ روز\\ جدا\\ شد\\ —\\ ⏱️\\ «([\\s\\S]*?)»\\ شد\\ ([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ \\((\\d+)\\ دقیقه\\)\\s*$"), "📌 This day was split off — ⏱️ “$1” is now $2 to $3 ($4 min)"],
    [new RegExp("^⏱️\\ «([\\s\\S]*?)»\\ شد\\ ([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ \\((\\d+)\\ ساعت\\ و\\ (\\d+)\\ دقیقه\\)\\s*$"), "⏱️ “$1” is now $2 to $3 ($4 h $5 min)"],
    [new RegExp("^⏱️\\ «([\\s\\S]*?)»\\ شد\\ ([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ \\((\\d+)\\ ساعت\\)\\s*$"), "⏱️ “$1” is now $2 to $3 ($4 h)"],
    [new RegExp("^⏱️\\ «([\\s\\S]*?)»\\ شد\\ ([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ \\((\\d+)\\ دقیقه\\)\\s*$"), "⏱️ “$1” is now $2 to $3 ($4 min)"],
    [new RegExp("^([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ ·\\ (\\d+)\\ ساعت\\ و\\ (\\d+)\\ دقیقه\\ ·\\ ⚠️\\ تداخل\\ دارد$"), "$1 to $2 · $3 h $4 min · ⚠️ overlaps another event"],
    [new RegExp("^([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ ·\\ (\\d+)\\ ساعت\\ ·\\ ⚠️\\ تداخل\\ دارد$"), "$1 to $2 · $3 h · ⚠️ overlaps another event"],
    [new RegExp("^([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ ·\\ (\\d+)\\ دقیقه\\ ·\\ ⚠️\\ تداخل\\ دارد$"), "$1 to $2 · $3 min · ⚠️ overlaps another event"],
    [new RegExp("^([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ ·\\ (\\d+)\\ ساعت\\ و\\ (\\d+)\\ دقیقه$"), "$1 to $2 · $3 h $4 min"],
    [new RegExp("^([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ ·\\ (\\d+)\\ ساعت$"), "$1 to $2 · $3 h"],
    [new RegExp("^([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ ·\\ (\\d+)\\ دقیقه$"), "$1 to $2 · $3 min"],
    /* v17.2: hover text on empty calendar slots */
    [new RegExp("^برای\\ افزودن\\ رویداد\\ در\\ ([\\s\\S]*)$"), "Tap to add an event at $1"],
    /* v16.2: "۳ از ۱۰ یادداشت" (notes counter while a filter is on) */
    [new RegExp("^([\\s\\S]*?) از ([\\s\\S]*?) یادداشت$"), "$1 of $2 notes"],
    /* v16.2: "📄 ۱۲ کلمه · ۶۴ کاراکتر" (live counter under the note editor) */
    [new RegExp("^📄 ([\\s\\S]*?) کلمه · ([\\s\\S]*?) کاراکتر$"), "📄 $1 words · $2 characters"],
    [new RegExp("^تبریک!\\ یک\\ دور\\ کامل\\ از\\ جلسات\\ فوکوس\\ رو\\ با\\ موفقیت\\ پشت\\ سر\\ گذاشتی\\.\\ حالا\\ ([\\s\\S]*?)\\ دقیقه\\ با\\ خیال\\ راحت\\ استراحت\\ کن\\ تا\\ کاملاً\\ شارژ\\ بشی\\.$"), "Congratulations! You made it through a full round of focus sessions. Now take $1 minutes to rest and fully recharge."],
    [new RegExp("^([\\s\\S]*?)\\ دقیقه\\ استراحت\\ یعنی\\ واقعاً\\ چند\\ دقیقه\\ ذهنت\\ رو\\ از\\ کار\\ جدا\\ کنی؛\\ یک\\ دور\\ کوتاه\\ راه\\ برو\\ یا\\ آب\\ بخور\\.$"), "A $1-minute break means really taking your mind off work for a few minutes; take a short walk or drink some water."],
    [new RegExp("^⚠️\\ دکمه‌های\\ اضافی\\ باید\\ متفاوت\\ باشن\\ و\\ با\\ چهار\\ دکمهٔ\\ اصلی\\ تکرار\\ نشون\\ \\(حداکثر\\ ([\\s\\S]*?)\\ عدد\\)$"), "⚠️ Extra buttons must be different and must not repeat the four main ones (max $1)"],
    [new RegExp("^جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*?)\\ به\\ پایان\\ رسید\\ ·\\ استراحت\\ ([\\s\\S]*?)\\ دقیقه‌ای\\ آماده\\ است$"), "Session $1 of $2 is over · a $3-minute break is ready"],
    [new RegExp("^⚠️\\ «([\\s\\S]*?)»\\ مانع\\ ثبت\\ این\\ رویداد\\ است؛\\ ساعت‌ها\\ تداخل\\ دارند$"), "⚠️ “$1” blocks saving this event; the times overlap"],
    [new RegExp("^⚠️\\ «([\\s\\S]*?)»\\ مانع\\ این\\ جابه‌جایی\\ است؛\\ ساعت‌ها\\ تداخل\\ دارند$"), "⚠️ “$1” blocks this move; the times overlap"],
    [new RegExp("^⚡\\ XP\\ Boost\\ فعاله\\ —\\ تا\\ ([\\s\\S]*?)\\ دیگه\\ همه‌ی\\ XP\\ هات\\ دوبرابره$"), "⚡ XP Boost is on — for the next $1 all of your XP is doubled"],
    [new RegExp("^امروز\\ حداقل\\ ۳۰\\ دقیقه\\ فوکوس\\ پومودورو\\ ثبت\\ کن\\ \\(([\\s\\S]*?)/30\\)$"), "Log at least 30 minutes of Pomodoro focus today ($1/30)"],
    [new RegExp("^هنوز\\ رکوردی\\ برای\\ ([\\s\\S]*?)\\ نداری\\ —\\ امروز\\ اولینش\\ رو\\ بساز!$"), "No record for $1 yet — set the first one today!"],
    [new RegExp("^🎉\\ تبریک!\\ رسیدی\\ به\\ سطح\\ ([\\s\\S]*?)\\ —\\ ([\\s\\S]*?)\\ ([\\s\\S]*?)\\ ·\\ \\+۱\\ امتیاز\\ مهارت\\ 🌳$"), "🎉 Congratulations! You reached level $1 — $2 $3 · +1 skill point 🌳"],
    [new RegExp("^✅\\ پریست\\ سفارشی:\\ ([\\s\\S]*?)\\ دقیقه\\ فوکوس\\ /\\ ([\\s\\S]*?)\\ دقیقه\\ استراحت$"), "✅ Custom preset: $1 min focus / $2 min break"],
    [new RegExp("^🎨\\ رنگ\\ دسته\\ «([\\s\\S]*?)»\\ برای\\ این\\ رویداد\\ استفاده\\ می‌شود$"), "🎨 The “$1” category color is used for this event"],
    [new RegExp("^۳\\ تا\\ مأموریت\\ رندوم\\ امروز\\ انجام\\ بده\\ \\(([\\s\\S]*?)/3\\)$"), "Do 3 random missions today ($1/3)"],
    [new RegExp("^🎯🎉\\ هدف\\ روزانه‌ی\\ پومودورو\\ کامل\\ شد!\\ \\+([\\s\\S]*?)\\ XP$"), "🎯🎉 Your daily Pomodoro goal is complete! +$1 XP"],
    [new RegExp("^⏭️\\ مرحله\\ بعد:\\ استراحت\\ طولانی\\ \\(([\\s\\S]*?)\\ دقیقه\\)$"), "⏭️ Next up: long break ($1 min)"],
    [new RegExp("^🎉\\ این\\ هفته\\ ([\\s\\S]*?)٪\\ بهتر\\ از\\ هفته‌ی\\ قبل\\ بودی!$"), "🎉 You were $1% better than last week!"],
    [new RegExp("^✅\\ نوار\\ پایین\\ با\\ ([\\s\\S]*?)\\ دکمه\\ اضافه\\ ذخیره\\ شد$"), "✅ Bottom bar saved with $1 extra buttons"],
    [new RegExp("^⏱️\\ دقیقه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*?)\\ \\(([\\s\\S]*?)\\ دقیقه\\ باقی‌مانده\\)$"), "⏱️ Minute $1 of $2 ($3 min left)"],
    [new RegExp("^✅\\ ([\\s\\S]*?):\\ ([\\s\\S]*?)\\ دقیقه\\ فوکوس\\ /\\ ([\\s\\S]*?)\\ دقیقه\\ استراحت$"), "✅ $1: $2 min focus / $3 min break"],
    [new RegExp("^📌\\ این\\ روز\\ از\\ «([\\s\\S]*?)»\\ جدا\\ شد\\ و\\ به\\ ([\\s\\S]*?)\\ ([\\s\\S]*?)\\ رفت$"), "📌 This day was split from “$1” and moved to $2 $3"],
    [new RegExp("^⏭️\\ مرحله\\ بعد:\\ جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*?)\\ \\(فوکوس\\)$"), "⏭️ Next up: session $1 of $2 (focus)"],
    [new RegExp("^⏭️\\ مرحله\\ بعد:\\ استراحت\\ \\(([\\s\\S]*?)\\ دقیقه\\)$"), "⏭️ Next up: break ($1 min)"],
    [new RegExp("^⚠️\\ حداکثر\\ ([\\s\\S]*?)\\ دکمه\\ اضافی\\ مجاز\\ است$"), "⚠️ At most $1 extra buttons are allowed"],
    [new RegExp("^([\\s\\S]*?)\\ تا\\ رسیدن\\ به\\ هدف\\ امروز\\ مونده$"), "$1 left to reach today's goal"],
    [new RegExp("^✅\\ ([\\s\\S]*?)\\ دقیقه\\ فوکوس\\ ثبت\\ شد\\ ·\\ \\+([\\s\\S]*?)\\ XP$"), "✅ $1 min of focus saved · +$2 XP"],
    [new RegExp("^([\\s\\S]*?)\\ ([\\s\\S]*?)\\ تا\\ شکستن\\ رکوردت\\ \\(([\\s\\S]*?)\\ ([\\s\\S]*?)\\)\\ مونده$"), "$1 $2 to beat your record ($3 $4)"],
    [new RegExp("^([\\s\\S]*?)\\ تمرکز\\ ثبت\\ شد\\ ·\\ امتیاز\\ ([\\s\\S]*?)/100$"), "$1 focus saved · score $2/100"],
    [new RegExp("^☕\\ دور\\ ([\\s\\S]*?)\\ •\\ استراحت\\ جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*)$"), "☕ Round $1 • break after session $2 of $3"],
    [new RegExp("^➕\\ دکمه‌های\\ اضافی\\ \\(تا\\ ([\\s\\S]*?)\\ عدد\\)$"), "➕ Extra buttons (up to $1)"],
    [new RegExp("^شهرت\\ رو\\ ببین\\ —\\ الان\\ ([\\s\\S]*?)\\ داری$"), "See your city — right now you have $1"],
    [new RegExp("^به\\ مدت\\ ([\\s\\S]*?)\\ دقیقه\\ استراحت\\ کن$"), "Take a $1-minute break"],
    [new RegExp("^وقت\\ شروع\\ جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*?)\\ است\\ 💪$"), "Time to start session $1 of $2 💪"],
    [new RegExp("^🏖️\\ دور\\ ([\\s\\S]*?)\\ •\\ استراحت\\ طولانی$"), "🏖️ Round $1 • long break"],
    [new RegExp("^📅\\ «([\\s\\S]*?)»\\ به\\ ([\\s\\S]*?)\\ منتقل\\ شد\\ —\\ ([\\s\\S]*?)\\ تا\\ ([\\s\\S]*)$"), "📅 “$1” moved to $2 — $3 to $4"],
    [new RegExp("^تیر\\ بعدی\\ \\(([\\s\\S]*?)/([\\s\\S]*?)\\)\\ —\\ ۱\\ امتیاز$"), "Next tier ($1/$2) — 1 point"],
    [new RegExp("^✅\\ ([\\s\\S]*?)\\ دقیقه\\ ([\\s\\S]*?)\\ ثبت\\ شد\\ ·\\ \\+([\\s\\S]*?)\\ XP$"), "✅ $1 min of $2 saved · +$3 XP"],
    [new RegExp("^🏆\\ رکورد\\ شخصی\\ جدید!\\ ([\\s\\S]*?)\\ ([\\s\\S]*?):\\ ([\\s\\S]*?)\\ ([\\s\\S]*)$"), "🏆 New personal record! $1 $2: $3 $4"],
    [new RegExp("^⚔️\\ ضربه\\ زدی!\\ HP\\ باس:\\ ([\\s\\S]*?)%$"), "⚔️ Direct hit! Boss HP: $1%"],
    [new RegExp("^⚔️\\ نبرد\\ با\\ «([\\s\\S]*?)»\\ شروع\\ شد!$"), "⚔️ The battle with “$1” has started!"],
    [new RegExp("^🍅\\ جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*?)\\ آماده\\ شروع$"), "🍅 Session $1 of $2 ready to start"],
    [new RegExp("^🎉\\ رکورد\\ شخصی\\ جدید\\ در\\ ([\\s\\S]*?)!$"), "🎉 New personal record in $1!"],
    [new RegExp("^«([\\s\\S]*?)»\\ شکست\\ خورد!\\ \\+۱۰۰\\ XP$"), "“$1” was defeated! +100 XP"],
    [new RegExp("^🕒\\ «([\\s\\S]*?)»\\ به\\ ([\\s\\S]*?)\\ تا\\ ([\\s\\S]*?)\\ منتقل\\ شد$"), "🕒 “$1” moved to $2 to $3"],
    [new RegExp("^×۲\\ بوست\\ فعال\\ \\(پایه\\ ([\\s\\S]*?)\\)$"), "×2 boost active (base $1)"],
    [new RegExp("^⏰\\ مهلت\\ انجام\\ مأموریت\\ تمام\\ شد\\ —\\ ([\\s\\S]*?)\\ XP\\ کسر\\ شد$"), "⏰ Quest time expired — $1 XP deducted"],
    [new RegExp("^⏰\\ زمان\\ مأموریت\\ تمام\\ شد\\ —\\ ([\\s\\S]*?)\\ XP\\ کسر\\ شد$"), "⏰ Quest time expired — $1 XP deducted"],
    [new RegExp("^⏭️\\ رد\\ شد\\ —\\ ([\\s\\S]*?)\\ XP\\ کم\\ شد$"), "⏭️ Skipped — $1 XP deducted"],
    [new RegExp("^☕\\ دقیقه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*?)\\ استراحت$"), "☕ Minute $1 of $2 of the break"],
    [new RegExp("^♾️\\ دقیقه\\ ([\\s\\S]*?)\\ فوکوس\\ آزاد$"), "♾️ Minute $1 of free focus"],
    [new RegExp("^·\\ امتیاز\\ تمرکز\\ ([\\s\\S]*?)/100$"), "· focus score $1/100"],
    [new RegExp("^جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*?)\\ شروع\\ شد\\ 💪$"), "Session $1 of $2 started 💪"],
    [new RegExp("^✅\\ آفرین!\\ \\+([\\s\\S]*?)\\ XP\\ گرفتی$"), "✅ Well done! You got +$1 XP"],
    [new RegExp("^🎯\\ جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*?)\\ •\\ فوکوس$"), "🎯 Session $1 of $2 • focus"],
    [new RegExp("^—\\ ([\\s\\S]*?)\\ خرید\\ باقی‌مانده$"), "— $1 purchases left"],
    [new RegExp("^♾️\\ ([\\s\\S]*?)\\ فوکوس\\ بی‌نهایت$"), "♾️ $1 of infinite focus"],
    [new RegExp("^🍅\\ دور\\ ([\\s\\S]*?)\\ •\\ جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*)$"), "🍅 Round $1 • session $2 of $3"],
    [new RegExp("^✅\\ ثبت\\ انجام\\ تسک:\\ ([\\s\\S]*)$"), "✅ Task marked done: $1"],
    [new RegExp("^🎉\\ پایان\\ جلسه\\ ([\\s\\S]*?)\\ از\\ ([\\s\\S]*)$"), "🎉 End of session $1 of $2"],
    [new RegExp("^([\\s\\S]*?)\\ توی\\ Life\\ City\\ ·$"), "$1 in Life City ·"],
    [new RegExp("^نسخه\\ ([\\s\\S]*?)\\ آماده\\ است\\.$"), "Version $1 is ready."],
    [new RegExp("^✅\\ ([\\s\\S]*?)\\ دقیقه\\ ([\\s\\S]*?)\\ ثبت\\ شد([\\s\\S]*)$"), "✅ $1 min of $2 saved$3"],
    [new RegExp("^🌳\\ ([\\s\\S]*?)\\ به\\ تیر\\ ([\\s\\S]*?)\\ رسید!$"), "🌳 $1 reached tier $2!"],
    [new RegExp("^🎲\\ تسک\\ تصادفی:\\ «([\\s\\S]*?)»$"), "🎲 Random task: “$1”"],
    [new RegExp("^\\+\\ ([\\s\\S]*?)\\ بونوس\\ بحرانی$"), "+ $1 critical bonus"],
    [new RegExp("^✓\\ تکمیل\\ شده\\ \\(([\\s\\S]*?)/([\\s\\S]*?)\\)$"), "✓ Completed ($1/$2)"],
    [new RegExp("^([\\s\\S]*?)\\ \\(([\\s\\S]*?)m\\)\\ ·\\ ([\\s\\S]*?)\\ ·\\ ([\\s\\S]*?)\\ مکث$"), "$1 ($2m) · $3 · $4 paused"],
    [new RegExp("^([\\s\\S]*?)\\ ساعت\\ و\\ ([\\s\\S]*?)\\ دقیقه$"), "$1 h $2 min"],
    [new RegExp("^جلسه\\ ([\\s\\S]*?)\\ کامل\\ شده$"), "Session $1 complete"],
    [new RegExp("^🎉\\ تم\\ ([\\s\\S]*?)\\ باز\\ شد!$"), "🎉 The $1 theme is unlocked!"],
    [new RegExp("^🎨\\ تم\\ ([\\s\\S]*?)\\ فعال\\ شد$"), "🎨 The $1 theme is now active"],
    [new RegExp("^🕓\\ ساخته‌شده:\\ ([\\s\\S]*)$"), "🕓 Created: $1"],
    [new RegExp("^([\\s\\S]*?)\\ روز\\ و\\ ([\\s\\S]*?)\\ ساعت$"), "$1 days and $2 hours"],
    [new RegExp("^([\\s\\S]*?)\\ وضعیت\\ تسک:\\ ([\\s\\S]*)$"), "$1 Task status: $2"],
    [new RegExp("^🔥\\ ([\\s\\S]*?)\\ روز\\ پیاپی$"), "🔥 $1 days in a row"],
    [new RegExp("^جلسه\\ کنونی\\ ([\\s\\S]*)$"), "Current session $1"],
    [new RegExp("^([\\s\\S]*?)\\ —\\ شروع\\ شد$"), "$1 — started"],
    [new RegExp("^ضربه\\ به\\ «([\\s\\S]*?)»$"), "Hit on “$1”"],
    [new RegExp("^و\\ ([\\s\\S]*?)\\ دقیقه$"), "and $1 min"],
    [new RegExp("^پایه\\ ([\\s\\S]*?)\\ XP([\\s\\S]*)$"), "Base $1 XP$2"],
    [new RegExp("^⏱\\ ([\\s\\S]*?)\\ دقیقه$"), "⏱ $1 min"],
    [new RegExp("^([\\s\\S]*?)\\ رویداد$"), "$1 events"],
    [new RegExp("^([\\s\\S]*?)/([\\s\\S]*?)\\ دقیقه$"), "$1/$2 min"],
    [new RegExp("^\\(قبل:\\ ([\\s\\S]*?)\\)$"), "(before: $1)"],
    [new RegExp("^([\\s\\S]*?)\\ دقیقه$"), "$1 min"],
    [new RegExp("^\\(([\\s\\S]*?)\\ تسک\\)$"), "($1 tasks)"],
    [new RegExp("^([\\s\\S]*?)\\ ساعت$"), "$1 h"],
    [new RegExp("^([\\s\\S]*?)\\ ساعت([\\s\\S]*)$"), "$1 h$2"],
    [new RegExp("^([\\s\\S]*?)/([\\s\\S]*?)\\ ·\\ ([\\s\\S]*?)٪$"), "$1/$2 · $3%"],
    [new RegExp("^جلسه\\ ([\\s\\S]*)$"), "Session $1"],
    [new RegExp("^هفته\\ ([\\s\\S]*)$"), "Week $1"],
    [new RegExp("^([\\s\\S]*?)\\ از\\ ([\\s\\S]*)$"), "$1 of $2"],
    [new RegExp("^([\\s\\S]*?)\\ روز$"), "$1 days"],
    [new RegExp("^فقط\\ ([\\s\\S]*)$"), "only $1"],
    [new RegExp("^([\\s\\S]*?)٪$"), "$1%"],
  ];
  /* Strings introduced by v15 itself (the language card in Settings). */
  var EXTRA = {
    '🌐 زبان برنامه': '🌐 App language',
    'زبان پیش‌فرض برنامه فارسی است؛ اگر بخواهی می‌توانی کل برنامه را انگلیسی کنی. داده‌های خودت (تسک‌ها، یادداشت‌ها و...) دست‌نخورده می‌مانند.':
      'Persian is the default language. If you want, you can switch the whole app to English. Your own data (tasks, notes and so on) stays untouched.',
    'فارسی (پیش‌فرض)': 'Persian (default)'
  };
  /* Strings introduced by v16 (tasks tabs, habit/goal editing). */
  var EXTRA_V16 = {
    '✏️ ویرایش عادت': '✏️ Edit habit',
    '✏️ ویرایش هدف': '✏️ Edit goal',
    'ویرایش عادت': 'Edit habit',
    'ویرایش هدف': 'Edit goal',
    '✏️ عادت ویرایش شد': '✏️ Habit updated',
    '✏️ هدف ویرایش شد': '✏️ Goal updated'
  };
  for(var _k in EXTRA){ if(Object.prototype.hasOwnProperty.call(EXTRA, _k)) EXACT[_k] = EXTRA[_k]; }
  /* v21.4: Habits, Goals and Notes joined the section guides. Icon-prefixed
     cores ("📖 راهنمای عادت‌ها", "🔥 عادت‌ها") are still handled by compose();
     a paragraph that *starts* with an icon is listed in full instead. */
  var EXTRA_V214 = {
    /* the ❓ button and the modal title of each new section */
    "راهنمای عادت‌ها": "Habits guide",
    "راهنمای اهداف": "Goals guide",
    "راهنمای یادداشت‌ها": "Notes guide",
    /* the guide panels — one lead, four rows and (where useful) a closing note */
    "عادت یعنی کاری که هر روز تکرارش می‌کنی — تنها کار تو تیک زدن خانه‌ی امروز است.": "A habit is something you repeat every day — all you have to do is tick today’s box.",
    "عادت جدید": "New habit",
    "یک نام و یک ایموجی از هشت ایموجی آماده؛ فقط همین دو تا. با ✏️ هر وقت خواستی عوضشان می‌کنی، بدون این‌که تیک‌ها و استریکت بپرند.": "A name and one emoji out of eight ready-made ones; that is all. With ✏️ you can change both whenever you like, without losing your ticks or your streak.",
    "خانه‌ی امروز": "Today’s box",
    "روی هر کارت هفت خانه‌ی شنبه تا جمعه است، ولی فقط خانه‌ی امروز (که روشن‌تر است) تیک می‌خورد؛ بقیه برای دیدنِ هفته‌اند و همیشه هفته‌ی جاری می‌مانند.": "Each card shows seven boxes, Saturday to Friday, but only today’s box (the brighter one) can be ticked; the rest are there to read the week and always stay on the current week.",
    "استریک و XP": "Streak and XP",
    "«N روز پیاپی» یعنی چند روز پشت‌سرهم تیک زده‌ای. هر تیک ۶ XP می‌دهد — برای هر عادت روزی یک بار — و رکورد بهترین استریک را در پروفایل بالا می‌برد.": "“N days in a row” is how many days you have ticked without a gap. Each tick gives 6 XP — once a day per habit — and lifts your best-streak record in the profile.",
    "کلید بالای لیست را روشن نگه دار؛ اگر سپر داشته باشی و یک روز را جا بیندازی، برنامه خودش دیروز را تیک می‌زند تا زنجیره نشکند (با یک سپر، همه‌ی عادت‌های جا‌مانده نجات پیدا می‌کنند).": "Keep the switch above the list on; if you own a shield and miss a day, the app ticks yesterday for you so the chain does not break (one shield saves every habit that was missed).",
    "🛍️ سپر را از XP Shop (۵۰۰ XP)، از درخت مهارت «محافظ استریک» یا از جعبه‌ی شانسی می‌گیری — حداکثر ۱ سپر در دست و ۳ خرید در هفته.": "🛍️ You get a shield from the XP Shop (500 XP), from the “Streak Guard” skill or from a mystery box — at most 1 shield held and 3 purchases a week.",
    "هدف یعنی یک درصد که کم‌کم به ۱۰۰ می‌رسد — با چهار دکمه، بدون فرم و بدون عدد نوشتن.": "A goal is a percentage that slowly reaches 100 — with four buttons, no form and no typing numbers.",
    "هدف جدید": "New goal",
    "عنوان + یک افق زمانی (روزانه، هفتگی، ماهانه، سالانه، زندگی) + درصد شروع. پیش‌فرض هفتگی است و جز عنوان هیچ‌کدام اجباری نیست.": "A title + a time frame (daily, weekly, monthly, yearly, life) + a starting percentage. Weekly is the default, and nothing but the title is required.",
    "چهار دکمه روی کارت": "The four buttons on the card",
    "-۱۰٪ / -۲٪ / +۲٪ / +۱۰٪ — با یک کلیک درصد عوض می‌شود و لازم نیست مودال را باز کنی. مقدار همیشه بین ۰ و ۱۰۰ می‌ماند.": "-10% / -2% / +2% / +10% — one click changes the percentage, no need to open the sheet. The value always stays between 0 and 100.",
    "پیشرفتِ امروز جدا ثبت می‌شود": "Today’s progress is kept separately",
    "هر درصدی که امروز اضافه کنی برای همان روز نگه داشته می‌شود، پس «امروز چقدر جلو رفتم» با درصدِ کلیِ هدف قاطی نمی‌شود.": "Every percentage you add today is stored for that day, so “how far did I get today” never mixes with the goal’s overall percentage.",
    "پاداش و روز عالی": "Rewards and the perfect day",
    "رسیدن به ۱۰۰٪ یعنی ۴۰ XP. یکی از شرط‌های «روز عالی» هم این است که حداقل یک هدف را امروز ۱۰٪ جلو ببری.": "Reaching 100% means 40 XP. One of the “perfect day” conditions is also moving at least one goal forward by 10% today.",
    "دفترچه‌ی شخصی تو: بنویس، برچسب بزن و هر وقت خواستی پیدایش کن.": "Your personal notebook: write it, tag it and find it whenever you need it.",
    "یادداشت جدید": "New note",
    "فقط عنوان اجباری است؛ متن، برچسب، رنگ و سنجاق اختیاری‌اند. زیر متن هم تعداد کلمه و کاراکتر زنده نوشته می‌شود.": "Only the title is required; the body, tag, colour and pin are all optional. The word and character count is written live under the body.",
    "جست‌وجو و برچسب": "Search and tags",
    "جست‌وجو هم‌زمان در عنوان، متن و برچسب می‌گردد و هر جا پیدا کند هایلایت می‌کند. چیپسِ هر برچسب تعداد یادداشت‌هایش را هم نشان می‌دهد.": "Search looks through the title, the body and the tag at once and highlights every hit. Each tag chip also shows how many notes it has.",
    "سنجاق و ترتیب": "Pins and order",
    "سنجاق‌شده‌ها همیشه اول می‌آیند، هر ترتیبی که انتخاب کرده باشی. ترتیب هم چهار حالت دارد: جدیدترین، قدیمی‌ترین، عنوان، طولانی‌ترین.": "Pinned notes always come first, whatever order you pick. The order itself has four modes: newest, oldest, title, longest.",
    "کارت‌ها": "The cards",
    "روی کارت بزن تا کامل باز شود. ▦ نمای شبکه‌ای/لیستی را عوض می‌کند و پنج دکمه‌ی پایین کارت کارهای سریع‌اند: ویرایش، سنجاق، کپی، گرفتن متن و حذف.": "Tap a card to open it in full. ▦ switches between the grid and the list view, and the five buttons at the bottom are shortcuts: edit, pin, duplicate, copy the text and delete.",
    "🧹 «پاک کردن فیلتر» فقط وقتی جست‌وجو یا برچسب فعال باشد ظاهر می‌شود؛ حذف یادداشت هم تأیید می‌خواهد.": "🧹 “Clear the filter” only appears while a search or a tag is active; deleting a note asks for confirmation too.",
    /* the one-time hints of the three new sections */
    "فقط خانه‌ی امروز را تیک بزن؛ استریک و XP خودش می‌آید.": "Just tick today’s box; the streak and the XP take care of themselves.",
    "یک هدف بساز و هر روز با +۲٪ یا +۱۰٪ جلویش ببر — همین.": "Create a goal and move it forward with +2% or +10% each day — that is all.",
    "یک عنوان بنویس و ذخیره کن؛ برچسب و رنگ و سنجاق همه اختیاری‌اند.": "Write a title and save it; the tag, the colour and the pin are all optional.",
    /* core.js: the two deletes that now ask, and the notes layout toggle */
    "🗑️ عادت حذف شد": "🗑️ Habit deleted",
    "🗑️ هدف حذف شد": "🗑️ Goal deleted",
    "تغییر به نمای لیستی": "Switch to the list view",
    "تغییر به نمای شبکه‌ای": "Switch to the grid view",
    "نمای لیستی": "the list view",
    "نمای شبکه‌ای": "the grid view"
  };
  for(var _k16 in EXTRA_V16){ if(Object.prototype.hasOwnProperty.call(EXTRA_V16, _k16)) EXACT[_k16] = EXTRA_V16[_k16]; }
  for(var _k214 in EXTRA_V214){ if(Object.prototype.hasOwnProperty.call(EXTRA_V214, _k214)) EXACT[_k214] = EXTRA_V214[_k214]; }
  /* v21.7: the Pomodoro, the XP Shop, the skill tree and the weekly boss joined
     the section guides, so every section of the app is explainable from inside
     itself. Icon-prefixed cores ("📖 راهنمای پومودورو", "⚔️ ساخت باس") are still
     handled by compose(); a paragraph that *starts* with an icon is listed whole.
     Also here: the boss task that can be written inside the picker, the honest
     notification switch of the Pomodoro, and the strings whose wording changed
     while the four sections were tidied up. */
  var EXTRA_V215 = {
    /* the ❓ button and the modal title of each new section */
    "راهنمای پومودورو": "Pomodoro guide",
    "راهنمای XP Shop": "XP Shop guide",
    "راهنمای درخت مهارت": "Skill tree guide",
    "راهنمای باس هفتگی": "Weekly boss guide",
    /* the four leads */
    "تایمر فوکوس با ریتمِ دور و جلسه — فقط «▶️ شروع» را بزن، بقیه خودش می‌آید.": "A focus timer with a rhythm of rounds and sessions — just tap “▶️ Start” and the rest takes care of itself.",
    "XPهایی که جمع کرده‌ای را خرج کن — بدون این‌که سطح و لولت پایین بیاید.": "Spend the XP you have collected — without your level or your bar ever going down.",
    "هر بار لول‌آپ می‌شوی یک امتیاز مهارت می‌گیری؛ یک تیر بخر و اثرش دائمی است.": "Every level-up gives you one skill point; buy a tier and its effect is permanent.",
    "یک هدف بزرگ را به نبرد تبدیل کن: هر تسکی که تیک بخورد، یک ضربه به باس است.": "Turn one big goal into a fight: every task you tick is a hit on the boss.",
    /* Pomodoro guide */
    "تایمر و جلسه‌ها": "Timer and sessions",
    "دایره را بزن تا جلسه شروع شود؛ یک لحظه نگه‌داشتنش «♾️ فوکوس بی‌نهایت» است. «⏹️ پایان و ثبت» همان‌قدر که واقعاً کار کرده‌ای ثبت می‌کند و بعدش امتیاز جلسه (از ۱۰۰) را نشان می‌دهد.": "Tap the circle to start a session; holding it for a moment starts “♾️ infinite focus”. “⏹️ End and log” records exactly as much as you really worked, and then shows the session score (out of 100).",
    "دور و استراحت": "Rounds and breaks",
    "بالای تایمر «دور ۱ • جلسه ۱ از ۴» و نقطه‌ها هستند. بعد از هر فوکوس نوبت استراحت است و بعد از آخرین جلسه‌ی دور، استراحت طولانی — «⏭️ جلسه بعدی» مرحله را دستی جلو می‌برد.": "Above the timer you get “round 1 • session 1 of 4” and the dots. Every focus is followed by a break, and the last session of a round by a long break — “⏭️ Next session” steps forward by hand.",
    "حالت‌ها، تسک و صدا": "Modes, task and sound",
    "پنج حالت آماده (کلاسیک، کوتاه، دیپ فوکوس، مطالعه و سفارشیِ ساختنی)، انتخاب تسک برای جلسه، هشت صدای محیط با اسلایدر بلندی، و «🧠 حالت تمرکز تمام‌صفحه» برای وقتی که فقط تایمر را می‌خواهی.": "Five ready modes (classic, short, deep focus, study and a buildable custom one), a task picker for the session, eight ambient sounds with a volume slider, and “🧠 full-screen focus mode” for when you only want the timer.",
    "آمار و XP": "Stats and XP",
    "تب «📊 آمار پومو» فوکوس امروز، هدف روزانه، هفت روز اخیر، نمودار روند، جمع‌بندی کلی و ۱۰ جلسه‌ی آخر را نشان می‌دهد. هر دقیقه (فوکوس یا استراحت) ۲ XP می‌دهد و پر کردن هدف روزانه ۳۰ XP.": "The “📊 Stats” tab shows today's focus, the daily goal, the last seven days, the trend chart, the overall summary and the last 10 sessions. Every minute (focus or break) gives 2 XP, and reaching the daily goal gives 30 XP.",
    "🔔 اعلان‌ها فقط سه‌جا می‌آیند: شروع جلسه، پایان جلسه و پایان دور — کلید روشن/خاموششان در تب «⚙️ تنظیمات» است.": "🔔 Notifications only arrive in three places: the start of a session, the end of a session and the end of a round — their on/off switch is in the “⚙️ Settings” tab.",
    /* XP Shop guide */
    "موجودیِ جدا": "A separate balance",
    "«موجودی XP Shop» یک کیف پولِ جدا از نوار XPِ سطح است: هر XP که از هر جای برنامه بگیری اینجا جمع می‌شود و خرج کردنش نه لولت را کم می‌کند و نه نوار پیشرفت را.": "“XP Shop balance” is a wallet of its own, separate from the level XP bar: every XP you earn anywhere in the app collects here, and spending it lowers neither your level nor the progress bar.",
    "بوست و جعبه‌ی شانس": "Boost and mystery box",
    "«⚡ XP Boost» سی دقیقه هر XP را دوبرابر می‌کند. «Mystery Box» یک جایزه‌ی تصادفیِ وزنی می‌دهد — از ۱۰ XP تا جکپات ۲۰۰، سپر، کوئست ویژه، آیتم شهر و جعبه‌ی رایگان — و دکمه‌ی ⓘ شانسِ دقیقِ هر ده جایزه را می‌گوید.": "“⚡ XP Boost” doubles every XP for thirty minutes. “Mystery Box” gives one weighted random reward — from 10 XP up to the 200 jackpot, a shield, a special quest, a city item and a free box — and the ⓘ button tells you the exact odds of all ten.",
    "سپر استریک": "Streak shield",
    "۵۰۰ XP برای روزی که عادتی را جا انداختی. دو قانون ضدِ زیاده‌روی دارد: حداکثر ۱ سپر در دست و ۳ خرید در هفته — شمارِ باقی‌مانده زیر همان کارت نوشته می‌شود.": "500 XP for the day you missed a habit. It has two anti-overuse rules: at most 1 shield held and 3 purchases a week — the number left is written under the same card.",
    "تم‌ها و دارایی‌ها": "Themes and items",
    "چهار تمِ ویژه با XP باز می‌شوند (تاریک و روشن رایگان‌اند)؛ آخری و گرون‌ترینشون «🌌 شفق منشوری» با ۲۰۰۰ XP ـه، با آسمانِ شفقِ زنده و نورهای شناور. «🎒 دارایی‌های ویژه» هم هرچه خریده‌ای را با تعداد نشان می‌دهد: سپرها و آیتم‌های Life City.": "Four special themes unlock with XP (dark and light are free); the last and priciest, “🌌 Aurora Prism” at 2,000 XP, brings a living aurora sky with floating lights. “🎒 Special items” shows everything you have bought with its count: shields and Life City items.",
    "💰 مهارت «چانه‌زن» در درخت مهارت هر تیر ۱۰٪ از همه‌ی قیمت‌های همین فروشگاه کم می‌کند.": "💰 The “Bargainer” skill in the skill tree takes 10% off every price in this shop, per tier.",
    /* skill tree guide */
    "امتیاز از کجا می‌آید": "Where the points come from",
    "هر لول‌آپ دقیقاً ۱ امتیاز مهارت می‌دهد و عددِ بالای صفحه همان امتیازهای خرج‌نشده است. راهِ دیگری برای گرفتنش نیست، پس خرج کردنش با فکر است.": "Every level-up gives exactly 1 skill point, and the number at the top is the points you have not spent. There is no other way to earn one, so it is worth spending thoughtfully.",
    "هفت مهارت": "Seven skills",
    "استاد فوکوس، شکارچی کوئست، چانه‌زن، شانس بلند، قاتل بحران، محافظ استریک و کوئست سریع. زیرِ اسم هرکدام نوشته شده هر تیر دقیقاً چه‌کار می‌کند.": "Focus Master, Quest Hunter, Bargainer, Lucky Streak, Crisis Slayer, Streak Guard and Quick Quest. Under each name it says exactly what one tier does.",
    "تیرها": "Tiers",
    "هزینه‌ی هر تیر ۱ امتیاز است و گران‌تر نمی‌شود. نقطه‌های زیر هر مهارت تیرهای گرفته‌شده را نشان می‌دهند و وقتی به سقف برسد «✓ تکمیل شده» جای دکمه می‌نشیند.": "Every tier costs 1 point and never gets more expensive. The dots under a skill show the tiers you have taken, and at the ceiling “✓ Completed” replaces the button.",
    "اثرِ فوری": "Immediate effect",
    "«محافظ استریک» همان لحظه ۱ سپر رایگان می‌دهد، «چانه‌زن» قیمت‌های فروشگاه را جلوِ چشمت کم می‌کند و «کوئست سریع» تا ۵ تیر انتظارِ کوئست بعدی را از ۲۰ به ۱۵ دقیقه می‌رساند.": "“Streak Guard” hands you 1 free shield right away, “Bargainer” lowers the shop prices in front of your eyes, and “Quick Quest” cuts the wait for the next quest from 20 down to 15 minutes over 5 tiers.",
    /* weekly boss guide */
    "ساختِ باس": "Building the boss",
    "یک اسم بنویس و چند تسکِ انجام‌نشده را انتخاب کن. اگر تسکِ مناسبی نداری، همان‌جا پایینِ لیست تسکِ جدید بساز — ساخته و خودش برای باس انتخاب می‌شود و بعداً در بخش تسک‌ها هم هست.": "Write a name and pick a few open tasks. If you do not have the right tasks, build a new one right there under the list — it is created, selected for the boss automatically, and it is still in the tasks section afterwards.",
    "HP و ضربه": "HP and hits",
    "باس همیشه ۱۰۰ HP دارد و بین تسک‌هایش تقسیم می‌شود: با ۴ تسک، هر تیک ۲۵ HP کم می‌کند. هر تسک فقط یک بار ضربه می‌زند و تسک‌های ضربه‌خورده با ⚔️ و خط‌خورده نشان داده می‌شوند.": "A boss always has 100 HP and it is shared between its tasks: with 4 tasks, every tick takes 25 HP. Each task hits only once, and the tasks that already hit are shown with ⚔️ and struck through.",
    "مهلتِ ۱۴ روزه": "The 14-day deadline",
    "چهارده روز فرصت داری. اگر مهلت تمام شود باس از دست می‌رود و یک هفته صبر می‌کنی تا باس بعدی؛ «فعلاً باس مشخصی ندارم» هم همین یک هفته را عقب می‌اندازد. شکستِ باس ۱۰۰ XP می‌دهد.": "You have fourteen days. If the deadline passes the boss gets away and you wait a week for the next one; “I do not have a boss right now” postpones it by the same week. Beating a boss gives 100 XP.",
    "ویرایش و حذفِ تسک": "Editing and deleting tasks",
    "با «✏️ ویرایش» اسم و تسک‌ها عوض می‌شوند و HP بر اساسِ همان ضربه‌های خورده دوباره حساب می‌شود. اگر یکی از تسک‌های باس را پاک کنی HP به‌روز می‌شود و اگر همه‌شان پاک شوند، نبرد بدون انتظارِ هفتگی لغو می‌شود.": "With “✏️ Edit” the name and the tasks change and the HP is recomputed from the very hits already landed. Delete one of the boss's tasks and the HP updates; delete all of them and the fight is cancelled without a week of waiting.",
    /* the four one-time hints */
    "فقط «▶️ شروع» را بزن؛ دور، استراحت و XP خودش می‌آید.": "Just tap “▶️ Start”; the rounds, the breaks and the XP take care of themselves.",
    "موجودی XP Shop از نوارِ سطح جداست — خرج کردنش لولت را کم نمی‌کند.": "The XP Shop balance is separate from the level bar — spending it never lowers your level.",
    "هر لول‌آپ ۱ امتیاز مهارت می‌دهد؛ یک تیر بخر و اثرش را همان لحظه ببین.": "Every level-up gives 1 skill point; buy a tier and see its effect right away.",
    "یک اسم بنویس و چند تسک انتخاب کن؛ هر تیک یک ضربه به باس است.": "Write a name and pick a few tasks; every tick is one hit on the boss.",
    /* the action button at the bottom of each new guide */
    "▶️ شروع جلسه‌ی فوکوس": "▶️ Start a focus session",
    "🎁 شانس‌های جعبه": "🎁 The box odds",
    "🛍️ برو به XP Shop": "🛍️ Go to the XP Shop",
    "⚔️ ساخت باس": "⚔️ Build a boss",
    /* boss: a task can be born inside the picker */
    "➕ ساخت تسک": "➕ Create task",
    "تسک جدید… (مثلاً: فصل ۳ رو بخون)": "New task… (e.g. read chapter 3)",
    "تسک تازه همون‌جا ساخته و خودش برای باس انتخاب می‌شه؛ بعداً توی بخش تسک‌ها هم هست.": "The new task is created right there and selected for the boss automatically; it is in the tasks section afterwards too.",
    "تسک انجام‌نشده‌ای نداری — همین پایین یکی بساز": "You have no open tasks — build one right below",
    "⚠️ اول اسم تسک جدید رو بنویس": "⚠️ Write the new task's name first",
    /* pomodoro: the notification card became a real control */
    "اعلان‌های پومودورو": "Pomodoro notifications",
    "🔕 اعلان‌های جلسه خاموش است": "🔕 Session notifications are off",
    "⛔ اجازه‌ی اعلان داده نشده — از تنظیمات سایت/گوشی اجازه بده": "⛔ Notifications are not allowed — allow them in the site/phone settings",
    "🔔 اعلان‌های شروع و پایان جلسه روشن شد": "🔔 Start and end of session notifications are on",
    "🔕 اعلان‌های جلسه خاموش شد": "🔕 Session notifications are off",
    /* pomodoro: the stats tab now speaks with one voice */
    "از روی جلسات واقعی": "from the real sessions",
    "۱۰ جلسه‌ی آخر": "the last 10 sessions",
    "مجموع فوکوس": "Total focus"
  };
  for(var _k215 in EXTRA_V215){ if(Object.prototype.hasOwnProperty.call(EXTRA_V215, _k215)) EXACT[_k215] = EXTRA_V215[_k215]; }

  /* v23.1: the calendar's bite-only picker and its shared color hint. */
  var EXTRA_V231 = {
    "اندازهٔ لقمه (اختیاری)": "Bite size (optional)",
    "اندازه لقمه": "Bite size",
    "بدون انتخاب": "No selection",
    "لقمه سنگین": "Heavy bite",
    "لقمه معمولی": "Normal bite",
    "لقمه باقلوا": "Baklava bite",
    "🍲 لقمه سنگین": "🍲 Heavy bite",
    "🍽️ لقمه معمولی": "🍽️ Normal bite",
    "🧆 لقمه باقلوا": "🧆 Baklava bite",
    "رنگ رویداد با لقمهٔ انتخاب‌شده هماهنگ می‌شود.": "The event color matches the selected bite."
  };
  for(var _k231 in EXTRA_V231){ if(Object.prototype.hasOwnProperty.call(EXTRA_V231, _k231)) EXACT[_k231] = EXTRA_V231[_k231]; }

  /* v22: «🌌 شفق منشوری» (the 2,000 XP theme) and the «💧 لیکویید گلس»
     switch. Icon-prefixed cores are handled by compose(), so plain cores
     are listed; whole sentences that start with an icon are listed whole. */
  var EXTRA_V22 = {
    "شفق منشوری": "Aurora Prism",
    "تم نهایی · ULTRA": "ULTRA · the final theme",
    "آسمانِ شفقِ زنده روی کل برنامه؛ گرون‌ترین و ظریف‌ترین تم Life Planner": "A living aurora sky over the whole app; Life Planner's priciest, most delicate theme",
    "نور شفقِ شناور": "floating aurora light",
    "برق منشوریِ ظریف": "a delicate prismatic sheen",
    "درخشش زنده‌ی کارت‌ها": "living card glow",
    "خرید تم نهایی": "Buy the final theme",
    "💧 لیکویید گلس": "💧 Liquid Glass",
    "💧 لیکویید گلس (رابط کاربری شیشه‌ای)": "💧 Liquid Glass (a glass interface)",
    "با فعال کردنش، همه‌ی کارت‌ها، پنجره‌ها و نوار پایین به شیشه‌ی مایع تبدیل می‌شن: نور از لبه‌ی بالاشون رد می‌شه، هرچی پشتشونه به‌نرمی بلور می‌خوره و هر سطح یه برقِ ظریفِ شیشه‌ای می‌گیره؛ تمیز و یکدست، روی همه‌ی تم‌ها. روی تم «🌌 شفق منشوری» شیشه‌ها ته‌رنگِ شفق می‌گیرن و قشنگ‌تر هم می‌شن. اگه «⚡ حالت پرفورمنس» روشن باشه، پرفورمنس اولویت داره و بلورها خاموش می‌مونن تا برنامه روان بمونه.": "Turn it on and every card, window and the bottom bar become liquid glass: light passes over their top edge, whatever is behind them blurs softly and every surface gains a delicate glass sheen — clean and uniform, on every theme. On the “🌌 Aurora Prism” theme the glass takes an aurora tint and looks even better. If “⚡ Performance mode” is on, performance wins and the blurs stay off so the app stays smooth.",
    "🃏 کارت شیشه‌ای": "🃏 Glass card",
    "🪟 پنجره شیشه‌ای": "🪟 Glass window",
    "🧭 نوار پایین شیشه‌ای": "🧭 Glass bottom bar",
    "پیش‌نمایش بالایی زنده‌ست؛ همین حالا روشنش کن تا فرقش رو روی همین سه‌تا ببینی.": "The preview above is live; switch it on now and see the difference on these three.",
    "💧 لیکویید گلس فعال شد — رابط کاربری شیشه‌ای شد": "💧 Liquid Glass on — the interface is glass now",
    "💧 لیکویید گلس خاموش شد": "💧 Liquid Glass off"
  };
  for(var _k22 in EXTRA_V22){ if(Object.prototype.hasOwnProperty.call(EXTRA_V22, _k22)) EXACT[_k22] = EXTRA_V22[_k22]; }

  /* ---------- digits ---------- */
  var FA_D = '۰۱۲۳۴۵۶۷۸۹';
  function latinDigits(s){
    return s.replace(/[۰-۹]/g, function(ch){ return String(FA_D.indexOf(ch)); });
  }
  function plural(nRaw, one, many){
    var n = latinDigits(String(nRaw)).trim();
    return (n === '1') ? one : many;
  }

  /* Counted units: "3 تسک" -> "3 tasks". Checked before the generated
     patterns so English plurals read correctly. */
  var COUNT_UNITS = [
    [/^([\d۰-۹][\d۰-۹\s\/٪%.,-]*?)\s*تسک$/,       'task',     'tasks'],
    [/^([\d۰-۹][\d۰-۹\s\/٪%.,-]*?)\s*پومودورو$/,  'Pomodoro', 'Pomodoros'],
    [/^([\d۰-۹][\d۰-۹\s\/٪%.,-]*?)\s*کوئست$/,     'quest',    'quests'],
    [/^([\d۰-۹][\d۰-۹\s\/٪%.,-]*?)\s*رویداد$/,    'event',    'events'],
    [/^([\d۰-۹][\d۰-۹\s\/٪%.,-]*?)\s*روز$/,       'day',      'days'],
    /* v16.2: notes counter ("۱۰ یادداشت") and word count ("📄 ۱۲ کلمه") */
    [/^([\d۰-۹][\d۰-۹\s\/٪%.,-]*?)\s*یادداشت$/,   'note',     'notes'],
    [/^([\d۰-۹][\d۰-۹\s\/٪%.,-]*?)\s*کلمه$/,      'word',     'words']
  ];
  function countUnit(s){
    for(var i = 0; i < COUNT_UNITS.length; i++){
      var m = s.match(COUNT_UNITS[i][0]);
      if(m) return latinDigits(m[1]).trim() + ' ' + plural(m[1], COUNT_UNITS[i][1], COUNT_UNITS[i][2]);
    }
    return null;
  }

  var FA_RE = /[\u0600-\u06FF]/;

  /* Jalali month names: the app formats dates with toLocaleDateString('fa-IR'),
     so in English mode we transliterate the month name and keep the very same
     Persian (Jalali) date the user is used to. */
  var JALALI_MONTHS_EN = {
    'فروردین':'Farvardin', 'اردیبهشت':'Ordibehesht', 'خرداد':'Khordad',
    'تیر':'Tir', 'مرداد':'Mordad', 'شهریور':'Shahrivar',
    'مهر':'Mehr', 'آبان':'Aban', 'آذر':'Azar',
    'دی':'Dey', 'بهمن':'Bahman', 'اسفند':'Esfand'
  };
  var WEEKDAYS_EN = {
    'شنبه':'Saturday', 'یکشنبه':'Sunday', 'دوشنبه':'Monday', 'سه‌شنبه':'Tuesday',
    'چهارشنبه':'Wednesday', 'پنجشنبه':'Thursday', 'جمعه':'Friday'
  };
  /* "۱۴۰۵ شهریور ۱۸, چهارشنبه" -> "Wednesday, 18 Shahrivar 1405" */
  function translateJalaliDate(s){
    var m = s.match(/^([\d۰-۹]{4})\s+([\u0600-\u06FF]+)\s+([\d۰-۹]{1,2})،?,?\s*([\u0600-\u06FF‌]+)?$/);
    if(!m) return null;
    var month = JALALI_MONTHS_EN[m[2]];
    if(!month) return null;
    var wd = m[4] ? WEEKDAYS_EN[m[4].trim()] : null;
    if(m[4] && !wd) return null;
    var core = latinDigits(m[3]) + ' ' + month + ' ' + latinDigits(m[1]);
    return wd ? (wd + ', ' + core) : core;
  }
  function translateJalaliMonthDay(s){
    var m=s.match(/^([\d۰-۹]{1,2})\s+([\u0600-\u06FF]+)$/);
    if(!m)return null;
    var month=JALALI_MONTHS_EN[m[2]];
    return month ? latinDigits(m[1])+' '+month : null;
  }

  /* ---------- core translate ---------- */
  var memo = Object.create(null);

  function lookupOne(s){
    if(Object.prototype.hasOwnProperty.call(EXACT, s)) return EXACT[s];
    var d = translateJalaliDate(s);
    if(d !== null) return d;
    var md = translateJalaliMonthDay(s);
    if(md !== null) return md;
    var c = countUnit(s);
    if(c !== null) return c;
    for(var i = 0; i < PATTERNS.length; i++){
      var rx = PATTERNS[i][0];
      rx.lastIndex = 0;
      if(rx.test(s)){
        rx.lastIndex = 0;
        return s.replace(rx, PATTERNS[i][1]);
      }
    }
    return null;
  }
  function lookupDirect(s){
    var hit = lookupOne(s);
    if(hit !== null) return hit;
    /* Markup often wraps a sentence across lines; collapse runs of
       whitespace and try once more before giving up. */
    var flat = s.replace(/\s+/g, ' ');
    if(flat !== s) return lookupOne(flat);
    return null;
  }

  /* Composite text (icon + label, "a · b", dates, values injected into an
     already-translated sentence) is handled by translating the Persian
     islands inside it and leaving everything else exactly as-is. */
  /* Strong separators first (they keep multi-word phrases intact), then a
     whitespace split as a fallback. */
  var SEP_STRONG = /([·•—–|:،؛,\/()\[\]«»]|\s-\s)/;

  function compose(s, depth){
    if(depth > 3) return null;

    /* 1) icon / number prefix + Persian core + trailing symbols */
    var m = s.match(/^([^\u0600-\u06FF]*?)([\u0600-\u06FF][\s\S]*[\u0600-\u06FF]|[\u0600-\u06FF])([^\u0600-\u06FF]*)$/);
    if(m && (m[1] || m[3])){
      var core = translate(m[2].trim(), depth + 1);
      if(core !== null){
        var lead = m[1], tail = m[3];
        return latinDigits(lead) + core + latinDigits(tail);
      }
    }

    /* 2) split on strong separators and translate each Persian island.
       Deliberately NOT splitting on plain spaces: translating single words
       out of context would mangle real sentences. */
    {
      var parts = s.split(SEP_STRONG);
      if(parts.length < 2) return null;
      var hit = false;
      var out = parts.map(function(p){
        if(!p || !FA_RE.test(p)) return latinDigits(p);
        var t = translate(p.trim(), depth + 1);
        if(t === null) return p;
        hit = true;
        return p.replace(p.trim(), t);
      }).join('');
      if(hit) return out;
    }
    return null;
  }

  function translate(raw, depth){
    if(raw === null || raw === undefined) return null;
    var s = String(raw).trim();
    if(!s || !FA_RE.test(s)) return null;
    depth = depth || 0;

    if(depth === 0 && memo[s] !== undefined) return memo[s];

    var out = lookupDirect(s);
    if(out === null) out = compose(s, depth);
    /* A pattern can re-insert a Persian label (e.g. a metric name); give
       whatever is left one more pass. */
    if(out !== null && FA_RE.test(out) && depth < 3){
      var fixed = compose(out, depth + 1);
      if(fixed !== null) out = fixed;
    }
    if(out !== null) out = latinDigits(out);

    if(depth === 0) memo[s] = out;
    return out;
  }
  window.lpTranslate = function(s){ return isEnglish() ? (translate(s, 0) || s) : s; };

  function translateKeepingSpace(raw){
    var t = translate(raw, 0);
    if(t === null) return null;
    return raw.match(/^\s*/)[0] + t + raw.match(/\s*$/)[0];
  }

  /* ---------- DOM ---------- */
  var SKIP_TAGS = { SCRIPT:1, STYLE:1, TEXTAREA:1, CANVAS:1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  /* Anything the user typed themselves is never touched. */
  /* v16.2: `.note-card p` is narrowed to the note's own body, so the built-in
     "بدون محتوا" hint inside an empty note is translated like any other UI
     string; the tag pill (`.note-tag`) is user text and is never touched. */
  var USER_CONTENT = '.task-title,.habit-name,.goal-title,.ev-title,.lp-ev-desc,.lp-cat-name,' +
                     '.subtask-item-title,.subtask-edit-title,.note-card h4,' +
                     '.note-card p.note-body,.note-card .note-tag';

  function isUserContent(node){
    var el = node.nodeType === 1 ? node : node.parentElement;
    if(!el || !el.closest) return false;
    if(el.closest(USER_CONTENT)) return true;
    /* The motivation line shows built-in quotes (translate) unless the user
       wrote their own custom message (leave exactly as typed). */
    if(el.closest('#motivationText')){
      try{
        if(typeof DB !== 'undefined' && DB && DB.motivation && DB.motivation.custom) return true;
      }catch(_){ }
    }
    return false;
  }

  function translateTextNode(node){
    var raw = node.nodeValue;
    if(!raw || !FA_RE.test(raw)) return;
    var parent = node.parentNode;
    if(parent && SKIP_TAGS[parent.nodeName]) return;
    if(isUserContent(node)) return;
    var t = translateKeepingSpace(raw);
    if(t !== null && t !== raw) node.nodeValue = t;
  }

  function translateAttrs(el){
    if(isUserContent(el)) return;
    for(var i = 0; i < ATTRS.length; i++){
      var name = ATTRS[i];
      if(!el.hasAttribute || !el.hasAttribute(name)) continue;
      var v = el.getAttribute(name);
      if(!v || !FA_RE.test(v)) continue;
      var t = translate(v, 0);
      if(t !== null && t !== v) el.setAttribute(name, t);
    }
    if(el.nodeName === 'INPUT' && el.value && FA_RE.test(el.value)){
      var type = (el.type || '').toLowerCase();
      if(type === 'button' || type === 'submit' || type === 'reset'){
        var tv = translate(el.value, 0);
        if(tv !== null && tv !== el.value) el.value = tv;
      }
    }
  }

  function walk(root){
    if(!root) return;
    if(root.nodeType === 3){ translateTextNode(root); return; }
    if(root.nodeType !== 1 || SKIP_TAGS[root.nodeName]) return;
    translateAttrs(root);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        var p = n.parentNode;
        if(p && SKIP_TAGS[p.nodeName]) return NodeFilter.FILTER_REJECT;
        return FA_RE.test(n.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var batch = [], n;
    while((n = tw.nextNode())) batch.push(n);
    for(var i = 0; i < batch.length; i++) translateTextNode(batch[i]);
    var els = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for(var j = 0; j < els.length; j++) translateAttrs(els[j]);
  }

  /* ---------- observer ---------- */
  var observer = null, pending = [], scheduled = false;

  function flush(){
    scheduled = false;
    var items = pending; pending = [];
    if(!isEnglish()) return;
    stop();
    try{ for(var i = 0; i < items.length; i++) walk(items[i]); }
    finally { start(); }
  }
  function schedule(node){
    pending.push(node);
    if(scheduled) return;
    scheduled = true;
    if(window.requestAnimationFrame) window.requestAnimationFrame(flush);
    else setTimeout(flush, 0);
  }
  function start(){
    if(observer || !document.body) return;
    observer = new MutationObserver(function(muts){
      for(var i = 0; i < muts.length; i++){
        var m = muts[i];
        if(m.type === 'characterData' || m.type === 'attributes'){ schedule(m.target); continue; }
        for(var j = 0; j < m.addedNodes.length; j++) schedule(m.addedNodes[j]);
      }
    });
    observer.observe(document.body, {
      childList:true, subtree:true, characterData:true,
      attributes:true, attributeFilter:ATTRS
    });
  }
  function stop(){ if(observer){ observer.disconnect(); observer = null; } }

  /* ---------- page level ---------- */
  function applyDocumentLang(){
    var en = isEnglish();
    var html = document.documentElement;
    html.setAttribute('lang', en ? 'en' : 'fa');
    html.setAttribute('dir', en ? 'ltr' : 'rtl');
    html.setAttribute('data-lang', en ? 'en' : 'fa');
    if(en){
      var title = document.querySelector('title');
      if(title) title.textContent = 'Smart Life Planner';
    }
  }
  function translateWholePage(){
    if(!isEnglish()) return;
    stop();
    try{ walk(document.body); } finally { start(); }
  }

  /* Notifications are created in JS, not in the DOM, so they get their own
     thin wrapper (core.js itself is untouched). */
  function wrapNotifications(){
    var orig = window.sendNotification;
    if(typeof orig !== 'function' || orig.__lpWrapped) return;
    var wrapped = function(title, body, options){
      if(isEnglish()){
        title = (title && translate(title, 0)) || title;
        body  = (body  && translate(body, 0))  || body;
      }
      return orig.call(this, title, body, options);
    };
    wrapped.__lpWrapped = true;
    window.sendNotification = wrapped;
  }

  /* ---------- public API ---------- */
  function setLang(lang){
    var next = lang === 'en' ? 'en' : 'fa';
    var current = getLang();
    try{ localStorage.setItem(LANG_KEY, next); }catch(_){ }
    if(next === current){ applyDocumentLang(); return; }
    /* Reload so every view, chart and timer is rebuilt in the new language. */
    location.reload();
  }
  window.lpSetLang = setLang;
  window.setSettingsLanguage = function(v){ setLang(v); };

  function syncSettingsSelect(){
    var sel = document.getElementById('settingsLanguage');
    if(sel && sel.value !== getLang()) sel.value = getLang();
  }
  window.lpSyncLanguageSelect = syncSettingsSelect;

  /* ---------- boot ---------- */
  applyDocumentLang();

  function boot(){
    applyDocumentLang();
    wrapNotifications();
    translateWholePage();
    syncSettingsSelect();
    start();
    [60, 300, 1200].forEach(function(ms){
      setTimeout(function(){ translateWholePage(); syncSettingsSelect(); }, ms);
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
