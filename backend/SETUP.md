# Connect the Google Sheet (login + shared family data)

Until this is done, the app runs in **demo mode** (each phone keeps its own data).
It takes about 5 minutes and is free. Everything is stored in a Google Sheet in your own Google account.

1. Open https://script.google.com/create (signed in to your Google account).
2. Delete the sample code, then paste in everything from `backend/Code.gs`. Press **Ctrl+S** and name the project **Family Tasks Backend**.
3. In the function menu at the top choose **setup** and press **Run**.
   Google asks for permission: choose your account → **Advanced** → **Go to Family Tasks Backend (unsafe)** → **Allow**.
   (It says "unsafe" only because you wrote the script yourself; it is not reviewed by Google.)
   This creates a sheet called **Family Tasks Data** in your Drive.
4. Click **Deploy → New deployment** → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
5. Put that URL in `index.html` (`var API_URL = "…";`), or open the app with `#owner` at the end of the address and paste it there.

## Later changes to the script
Paste the new code, save, then **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## Good to know
- Passwords are never stored, only salted hashes.
- Wrong passwords: 6 tries per 15 minutes, then a short lockout.
- At most 40 new accounts per day (protects you from spam).
- Old notifications (14+ days) and expired logins are cleaned up every night.
- You hold your family's data, so turn on 2-Step Verification for your Google account.
