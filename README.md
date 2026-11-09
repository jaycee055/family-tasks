# Family Tasks

A free, private app for your family's daily goals, reminders and shared tasks.

- **Private family group** – join only with an invite code (e.g. `FAM-8K2Q`)
- **Nicknames** – Mama, Papa, Kuya, Ate, Bunso…
- **Delegate tasks** – give a task to anyone in the family, they see it in *My tasks*
- **Daily goals & reminders** – once, daily, weekdays or weekly, with a time
- **Phone notifications** – when you get a task, when someone finishes yours, and at reminder time
- **Add to Home Screen** – works like an app, also offline

## Get it
- **Website / iPhone / any phone:** https://jaycee055.github.io/family-tasks/ (then *Add to Home Screen*)
- **Android app:** [FamilyTasks.apk](https://github.com/jaycee055/family-tasks/releases/latest/download/FamilyTasks.apk)

## How it works
- `index.html` – the whole app (built from `src/` with `python3 build.py`)
- `backend/Code.gs` – Google Apps Script that keeps logins and family data in a Google Sheet. Setup: [backend/SETUP.md](backend/SETUP.md)
- `.github/workflows/android.yml` – GitHub builds the Android APK on every change
- `privacy.html` – privacy policy

Edit `src/app.html`, `src/core.js` or `src/gas.js`, then run `python3 build.py`. `src/core.js` is shared by the app's demo mode and the Google Sheets backend.

## Notifications – what to expect
| | Reminders at the set time | "New task for you" alerts |
|---|---|---|
| Android app (APK) | Yes, even when the app is closed | When the app is open or reopened |
| Website / Home Screen app | While the app is open | While the app is open |

Alerts that arrive while the app is fully closed would need a push service (e.g. Firebase); that can be added later.

## Signing key
`android-app/release.keystore` signs the APK so updates install over the old version. Its password is in the workflow as a fallback; for more safety add a repository secret `ANDROID_KEYSTORE_PASSWORD` with the same value and remove the fallback.
