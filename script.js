/* ==========================
   FIREBASE CONFIG
========================== */

const firebaseConfig = {
    apiKey: "AIzaSyBlNeZI9js2_OAMDK_aAKZz2jiMxFY8rA0",
    authDomain: "synced-notepad-dcab5.firebaseapp.com",
    databaseURL: "https://synced-notepad-dcab5-default-rtdb.firebaseio.com/",
    projectId: "synced-notepad-dcab5",
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();


/* ==========================
   OWNED NOTES
   Only notes the user *created*
   in this browser are tracked.
   Shared links are NOT counted.
   Schema: [{ id, createdAt }]
========================== */

const MAX_NOTES = 3;
const OWNED_KEY = "notepad_owned_notes";

function getOwned() {
    try { return JSON.parse(localStorage.getItem(OWNED_KEY)) || []; }
    catch { return []; }
}

function saveOwned(list) {
    localStorage.setItem(OWNED_KEY, JSON.stringify(list));
}

function isOwned(id) {
    return getOwned().some(n => n.id === id);
}

function addOwned(id) {
    if (isOwned(id)) return;
    const list = getOwned();
    list.push({ id, createdAt: Date.now() });
    saveOwned(list);
}

function removeOwned(id) {
    saveOwned(getOwned().filter(n => n.id !== id));
}

function ownedCount() {
    return getOwned().length;
}

// Grab first line of local backup for panel preview text
function localPreview(id) {
    const raw   = localStorage.getItem(`notepad_backup_${id}`) || "";
    const first = raw.trim().split("\n")[0] || "";
    return first.length > 44 ? first.slice(0, 44) + "…" : first || "Empty note";
}

function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric"
    });
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


/* ==========================
   NOTE ID + URL HASH
========================== */

function generateId() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 8 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join("");
}

function getNoteId() {
    let hash = window.location.hash.replace("#", "").trim();

    if (!hash) {
        // No hash → fresh open → create a new note
        if (ownedCount() >= MAX_NOTES) {
            showLimitScreen();
            return null;
        }
        hash = generateId();
        window.location.hash = hash;
        addOwned(hash);
    }
    // Hash present → their own note or a shared link
    // Either way: open it. Not-owned notes don't count toward the limit.
    return hash;
}

function showLimitScreen() {
    document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                    height:100vh;font-family:'Domine',serif;color:#fff;text-align:center;
                    gap:16px;padding:40px;background:#000;">
            <div style="font-size:36px;">✦</div>
            <div style="font-size:22px;font-weight:300;">Note limit reached</div>
            <div style="font-size:14px;color:#777;max-width:340px;line-height:2;">
                You've created ${MAX_NOTES} notes from this browser.<br>
                Delete one via My Notes to free up a slot.
            </div>
        </div>`;
}

let noteId    = getNoteId();
if (!noteId) throw new Error("Limit screen shown.");

let noteRef   = database.ref(`notes/${noteId}`);
let LOCAL_KEY = `notepad_backup_${noteId}`;


/* ==========================
   ELEMENTS
========================== */

const notepad      = document.getElementById("notepad");
const clearBtn     = document.getElementById("clearBtn");
const shareBtn     = document.getElementById("shareBtn");
const newBtn       = document.getElementById("newBtn");
const myNotesBtn   = document.getElementById("myNotesBtn");
const toast        = document.getElementById("toast");
const panel        = document.getElementById("panel");
const panelOverlay = document.getElementById("panel-overlay");
const panelBody    = document.getElementById("panelBody");
const panelFooter  = document.getElementById("panelFooter");
const panelClose   = document.getElementById("panelClose");
const syncStatus   = document.getElementById("syncStatus");
const noteStats    = document.getElementById("noteStats");


/* ==========================
   TOAST
========================== */

let toastTimer = null;

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function setSyncStatus(status) {
    syncStatus.textContent = status;
    syncStatus.classList.remove("saving", "offline");
    if (status === "Saving…") syncStatus.classList.add("saving");
    if (status === "Offline") syncStatus.classList.add("offline");
}

function updateStats(text) {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = text.length;
    noteStats.textContent = `${words} words · ${chars} chars`;
}


/* ==========================
   STATE
========================== */

let isRemoteUpdate  = false;
let currentListener = null;


/* ==========================
   FIREBASE LISTENER
========================== */

function attachListener() {
    if (currentListener) noteRef.off("value", currentListener);

    currentListener = noteRef.on("value", snapshot => {
        const data = snapshot.val();

        if (data !== null && data !== notepad.value) {
            isRemoteUpdate = true;
            notepad.value  = data;
            localStorage.setItem(LOCAL_KEY, data);
            isRemoteUpdate = false;
            updateStats(data);
            setSyncStatus("Synced");
            console.log("[Cloud] Synced");
        }

        if (data === null) {
            const backup = localStorage.getItem(LOCAL_KEY);
            if (backup) {
                notepad.value = backup;
                noteRef.set(backup);
                updateStats(backup);
            }
        }
    });
}

attachListener();


/* ==========================
   AUTO SAVE
========================== */

let saveTimer = null;

notepad.addEventListener("input", () => {
    if (isRemoteUpdate) return;
    setSyncStatus("Saving…");
    updateStats(notepad.value);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        const text = notepad.value;
        noteRef.set(text);
        localStorage.setItem(LOCAL_KEY, text);
        setSyncStatus("Synced");
        console.log("[Cloud] Saved");
    }, 500);
});


/* ==========================
   SHARE BUTTON
========================== */

shareBtn.addEventListener("click", () => {
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => showToast("✓ Link copied to clipboard"))
            .catch(() => fallbackCopy(url));
    } else {
        fallbackCopy(url);
    }
});

function fallbackCopy(text) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;opacity:0;";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    showToast("✓ Link copied to clipboard");
}


/* ==========================
   NEW NOTE BUTTON
========================== */

function updateNewBtnState() {
    const full      = ownedCount() >= MAX_NOTES;
    newBtn.disabled = full;
    newBtn.title    = full ? `Limit of ${MAX_NOTES} notes reached — delete one first` : "";
}

updateNewBtnState();

newBtn.addEventListener("click", () => {
    if (ownedCount() >= MAX_NOTES) {
        showToast(`⚠️ Delete a note first — limit is ${MAX_NOTES}`);
        return;
    }

    if (!confirm("Open a brand-new note in this tab?")) return;

    if (currentListener) {
        noteRef.off("value", currentListener);
        currentListener = null;
    }

    noteId    = generateId();
    noteRef   = database.ref(`notes/${noteId}`);
    LOCAL_KEY = `notepad_backup_${noteId}`;
    notepad.value = "";

    window.location.hash = noteId;
    addOwned(noteId);
    updateNewBtnState();
    attachListener();

    notepad.focus();
    showToast("✦ New note created");
    console.log("[App] New note:", noteId);
});


/* ==========================
   CLEAR BUTTON
========================== */

clearBtn.addEventListener("click", () => {
    if (notepad.value.trim() === "") {
        showToast("Already empty 😐");
        return;
    }

    if (!confirm("Clear everything?")) return;

    notepad.value = "";
    noteRef.set("");
    localStorage.removeItem(LOCAL_KEY);
    updateStats("");
    setSyncStatus("Synced");

    notepad.focus();
    showToast("🗑 Note cleared");
    console.log("[Cloud] Cleared");
});


/* ==========================
   MY NOTES PANEL
========================== */

function openPanel() {
    renderPanel();
    panel.classList.add("open");
    panelOverlay.classList.add("open");
}

function closePanel() {
    panel.classList.remove("open");
    panelOverlay.classList.remove("open");
}

function renderPanel() {
    const owned = getOwned();
    const count = owned.length;

    panelFooter.textContent = `${count} / ${MAX_NOTES} notes used`;

    if (count === 0) {
        panelBody.innerHTML = `<div class="panel-empty">No notepads yet.<br>Hit New to create one.</div>`;
        return;
    }

    // Newest first
    const sorted  = [...owned].sort((a, b) => b.createdAt - a.createdAt);
    const baseUrl = window.location.href.split("#")[0];

    panelBody.innerHTML = sorted.map(note => {
        const isActive = note.id === noteId;
        const preview  = escapeHtml(localPreview(note.id));
        const date     = formatDate(note.createdAt);
        const noteUrl  = `${baseUrl}#${note.id}`;

        return `
        <div class="note-card ${isActive ? "active-note" : ""}">
            <div class="note-info">
                <div class="note-preview">${preview}</div>
                <div class="note-meta">
                    ${isActive ? "● current &nbsp;·&nbsp; " : ""}${date} &nbsp;·&nbsp; #${note.id}
                </div>
            </div>
            <div class="note-actions">
                <button class="note-btn open-btn"   data-url="${noteUrl}">↗ Open</button>
                <button class="note-btn delete-btn" data-id="${note.id}">✕</button>
            </div>
        </div>`;
    }).join("");

    // Open in new tab
    panelBody.querySelectorAll(".open-btn").forEach(btn => {
        btn.addEventListener("click", () => window.open(btn.dataset.url, "_blank"));
    });

    // Delete
    panelBody.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", () => deleteNote(btn.dataset.id));
    });
}

function deleteNote(id) {
    const isCurrent = id === noteId;
    const msg = isCurrent
        ? "Delete this note permanently? You'll be moved to another note."
        : "Delete this note permanently? This cannot be undone.";

    if (!confirm(msg)) return;

    // Wipe Firebase
    database.ref(`notes/${id}`).remove();

    // Wipe local backup
    localStorage.removeItem(`notepad_backup_${id}`);

    // Remove from owned list + refresh button state
    removeOwned(id);
    updateNewBtnState();

    showToast("🗑 Note deleted");
    console.log("[App] Deleted:", id);

    if (isCurrent) {
        closePanel();

        if (currentListener) {
            noteRef.off("value", currentListener);
            currentListener = null;
        }

        // Switch to most recent remaining note, or create a fresh one
        const remaining = getOwned().sort((a, b) => b.createdAt - a.createdAt);

        if (remaining.length > 0) {
            noteId    = remaining[0].id;
            noteRef   = database.ref(`notes/${noteId}`);
            LOCAL_KEY = `notepad_backup_${noteId}`;
            notepad.value = "";
            window.location.hash = noteId;
            attachListener();
            updateStats("");
            showToast("Switched to your last note");
        } else {
            // No owned notes left — create a fresh one
            noteId    = generateId();
            noteRef   = database.ref(`notes/${noteId}`);
            LOCAL_KEY = `notepad_backup_${noteId}`;
            notepad.value = "";
            window.location.hash = noteId;
            addOwned(noteId);
            updateNewBtnState();
            attachListener();
            updateStats("");
            showToast("✦ New note created");
        }

        notepad.focus();
    } else {
        renderPanel(); // just refresh the list
    }
}

myNotesBtn.addEventListener("click",   openPanel);
panelClose.addEventListener("click",   closePanel);
panelOverlay.addEventListener("click", closePanel);


/* ==========================
   HASH CHANGE
   (browser back / forward)
========================== */

window.addEventListener("hashchange", () => {
    const newId = window.location.hash.replace("#", "").trim();
    if (newId && newId !== noteId) {
        if (currentListener) {
            noteRef.off("value", currentListener);
            currentListener = null;
        }
        noteId    = newId;
        noteRef   = database.ref(`notes/${noteId}`);
        LOCAL_KEY = `notepad_backup_${noteId}`;
        notepad.value = "";
        attachListener();
        updateStats("");
        console.log("[App] Switched to note:", noteId);
    }
});


/* ==========================
   AUTO FOCUS
========================== */

window.onload = () => notepad.focus();
window.addEventListener("online", () => setSyncStatus("Synced"));
window.addEventListener("offline", () => setSyncStatus("Offline"));

updateStats(notepad.value || "");
setSyncStatus(navigator.onLine ? "Synced" : "Offline");
