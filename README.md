# SyncPad ⚡

**Live:** [sync-pad.netlify.app](https://sync-pad.netlify.app)

A minimalist, real-time collaborative notepad. Share a link — anyone with it can read and write instantly. No accounts, no setup.

---

## Features

- **Link-based notes** — every note gets a unique URL (`#abc123`). Share it with anyone.
- **Real-time sync** — changes appear live across all devices on the same link.
- **My Notes panel** — view, open, and delete all notes you've created from this browser.
- **3-note limit** — up to 3 notes per browser to keep Firebase connections in check.
- **LocalStorage backup** — your note is cached locally so it survives page refreshes even without a connection.
- **No authentication** — zero sign-up, zero login.

---

## File Structure

```
├── index.html    # Markup and structure
├── styles.css    # All styling
├── script.js     # App logic, Firebase sync, panel behavior
```

---

## How It Works

1. When you open the app without a URL hash, a random 8-character ID is generated (e.g. `#a1b2c3d4`) and set as the hash.
2. The app reads and writes to `notes/{noteId}` in Firebase Realtime Database.
3. A Firebase `.on("value")` listener keeps all open tabs in sync in real time.
4. Typing is debounced by 500ms before saving to avoid excessive writes.
5. Note IDs you *created* are stored in `localStorage` under `notepad_owned_notes`. Notes opened via a shared link are not tracked as owned and don't count toward your limit.

---

## Firebase Setup

This project uses **Firebase Realtime Database**. No changes to the Firebase project are needed beyond setting the correct security rules.

### Recommended Rules

```json
{
  "rules": {
    "notes": {
      "$noteId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

This allows anyone to read and write any note by ID, while blocking access to anything outside the `notes/` path.

### Free Tier Limits (Spark Plan)

| Resource | Limit |
|---|---|
| Simultaneous connections | 100 |
| Storage | 1 GB |
| Downloads | 10 GB / month |

Each open browser tab counts as one persistent connection. The 3-note-per-browser cap helps reduce concurrent connections from a single user.

> **Note:** Notes are never automatically deleted. Every note ever created stays in the database. If storage becomes a concern, consider adding a `lastModified` timestamp to each note and running a Firebase Cloud Function on a schedule to remove notes older than a set number of days.

---

## Usage

### Opening a note
Just open `index.html` in a browser. A new note is created automatically if no URL hash is present.

### Sharing a note
Click **Share** — the current URL is copied to your clipboard. Send it to anyone.

### Creating a new note
Click **New**. You can have up to 3 notes per browser. The button disables itself when the limit is reached.

### Managing your notes
Click **My Space** to open the side panel. From there you can:
- See a preview of each note's content
- See when it was created
- **↗ Open** — open it in a new tab
- **✕** — permanently delete it from Firebase and free up a slot

### Clearing a note
Click **Clear** to wipe the content of the current note. This clears it for all users on that link.

---

## Local Development

No build tools or dependencies needed. Just open `index.html` directly in a browser or serve it with any static file server:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

---

## Deployment

Since this is a purely static project (HTML + CSS + JS), it can be hosted anywhere:

This project is deployed on **Netlify** at [fictionaltrain.netlify.app](https://fictionaltrain.netlify.app).

Other supported platforms:
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Vercel](https://vercel.com)
- [GitHub Pages](https://pages.github.com)

All three files (`index.html`, `styles.css`, `script.js`) must be in the same directory.

---

## Known Limitations

- The 3-note limit is enforced via `localStorage` and can be bypassed by clearing browser storage. It is a soft guardrail, not a hard security rule.
- There is no note ownership enforced at the database level — anyone with a link can edit or clear a note.
- Notes do not expire automatically.
