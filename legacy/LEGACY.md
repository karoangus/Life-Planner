# Legacy / unused files

These files are **not used by the app** and are kept here only for reference.

## Old script files (script_0.js … script_3.js)
Older versions of the app's code. The live code now lives in `js/` (core.js,
enhancements.js, sw-register.js, pomodoro.js) and was inlined in `index.html`
before v7.2. Nothing references these files.

## Unused audio variants (city_*_1.ogg, city_*_2.ogg)
Alternate city-ambience loops. The app only plays `audio/city_day.ogg`,
`audio/city_night.ogg` and `audio/city_rain.ogg`.

If you are sure you do not need them, the whole `legacy/` folder can be
deleted — git history still contains them.
