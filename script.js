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
========================== */

const MAX_NOTES = 3;
const OWNED_KEY = "notepad_owned_notes";
const PRESENCE_SESSION = `s_${Math.random().toString(36).slice(2, 10)}`;

function getOwned() {
    try {
        const raw = JSON.parse(localStorage.getItem(OWNED_KEY)) || [];
        return raw.map(item => ({
            id: item.id,
            createdAt: item.createdAt || Date.now(),
            updatedAt: item.updatedAt || item.createdAt || Date.now(),
        }));
    } catch {
        return [];
    }
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
    const now = Date.now();
    list.push({ id, createdAt: now, updatedAt: now });
    saveOwned(list);
}

function touchOwned(id) {
    const list = getOwned();
    const idx = list.findIndex(n => n.id === id);
    if (idx === -1) return;
    list[idx].updatedAt = Date.now();
    saveOwned(list);
}

function removeOwned(id) {
    saveOwned(getOwned().filter(n => n.id !== id));
}

function ownedCount() {
    return getOwned().length;
}

function localPreview(id) {
    const raw = localStorage.getItem(`notepad_backup_${id}`) || "";
    const first = raw.trim().split("\n")[0] || "";
    return first.length > 44 ? first.slice(0, 44) + "…" : first || "Empty note";
}

function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric"
    });
}

function formatDateTime(ts) {
    return new Date(ts).toLocaleString(undefined, {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
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

function parseHash() {
    const rawHash = window.location.hash.replace("#", "").trim();
    if (!rawHash) return { id: "", viewOnly: false };

    const [idPart, query = ""] = rawHash.split("?");
    const params = new URLSearchParams(query);
    return {
        id: idPart.trim(),
        viewOnly: params.get("view") === "1",
    };
}

function getNoteId() {
    const parsed = parseHash();
    let hash = parsed.id;

    if (!hash) {
        if (ownedCount() >= MAX_NOTES) {
            showLimitScreen();
            return null;
        }
        hash = generateId();
        window.location.hash = hash;
        addOwned(hash);
    }

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

let noteId = getNoteId();
if (!noteId) throw new Error("Limit screen shown.");

let isViewOnly = parseHash().viewOnly;
let noteRef = database.ref(`notes/${noteId}`);
let LOCAL_KEY = `notepad_backup_${noteId}`;


/* ==========================
   ELEMENTS
========================== */

const notepad = document.getElementById("notepad");
const clearBtn = document.getElementById("clearBtn");
const shareBtn = document.getElementById("shareBtn");
const newBtn = document.getElementById("newBtn");
const myNotesBtn = document.getElementById("myNotesBtn");
const toast = document.getElementById("toast");
const panel = document.getElementById("panel");
const panelOverlay = document.getElementById("panel-overlay");
const panelBody = document.getElementById("panelBody");
const panelFooter = document.getElementById("panelFooter");
const panelClose = document.getElementById("panelClose");
const syncStatus = document.getElementById("syncStatus");
const presenceStatus = document.getElementById("presenceStatus");
const noteStats = document.getElementById("noteStats");


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

function applyViewOnlyMode() {
    notepad.readOnly = isViewOnly;
    clearBtn.disabled = isViewOnly;
    setSyncStatus(isViewOnly ? "Read-only" : (navigator.onLine ? "Synced" : "Offline"));
}


/* ==========================
   STATE
========================== */

let isRemoteUpdate = false;
let currentListener = null;
let connectedListener = null;
let presenceListener = null;
let selfPresenceRef = null;
let presenceNoteId = null;


/* ==========================
   FIREBASE LISTENERS
========================== */

function attachListener() {
    if (currentListener) noteRef.off("value", currentListener);

    currentListener = noteRef.on("value", snapshot => {
        const data = snapshot.val();

        if (data !== null && data !== notepad.value) {
            isRemoteUpdate = true;
            notepad.value = data;
            localStorage.setItem(LOCAL_KEY, data);
            isRemoteUpdate = false;
            updateStats(data);
            if (isOwned(noteId)) touchOwned(noteId);
            setSyncStatus(isViewOnly ? "Read-only" : "Synced");
        }

        if (data === null && !isViewOnly) {
            const backup = localStorage.getItem(LOCAL_KEY);
            if (backup) {
                notepad.value = backup;
                noteRef.set(backup);
                updateStats(backup);
            }
        }
    });
}

function detachPresence() {
    if (connectedListener) {
        database.ref(".info/connected").off("value", connectedListener);
        connectedListener = null;
    }

    if (presenceListener && presenceNoteId) {
        database.ref(`presence/${presenceNoteId}`).off("value", presenceListener);
        presenceListener = null;
        presenceNoteId = null;
    }

    if (selfPresenceRef) {
        selfPresenceRef.onDisconnect().cancel();
        selfPresenceRef.remove();
        selfPresenceRef = null;
    }
}

function attachPresence() {
    detachPresence();

    const connectedRef = database.ref(".info/connected");
    const roomPresenceRef = database.ref(`presence/${noteId}`);
    presenceNoteId = noteId;
    selfPresenceRef = database.ref(`presence/${noteId}/${PRESENCE_SESSION}`);

    connectedListener = connectedRef.on("value", snap => {
        if (snap.val() !== true) return;

        selfPresenceRef.set({
            active: true,
            viewOnly: isViewOnly,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
        });
        selfPresenceRef.onDisconnect().remove();
    });

    presenceListener = roomPresenceRef.on("value", snap => {
        const people = snap.val() || {};
        const editors = Object.values(people).filter(person => !person.viewOnly).length;
        presenceStatus.textContent = `${editors} ${editors === 1 ? "person" : "people"} editing`;
    });
}

attachListener();
attachPresence();


/* ==========================
   AUTO SAVE
========================== */

let saveTimer = null;

notepad.addEventListener("input", () => {
    if (isRemoteUpdate || isViewOnly) return;

    setSyncStatus("Saving…");
    updateStats(notepad.value);

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        const text = notepad.value;
        noteRef.set(text);
        localStorage.setItem(LOCAL_KEY, text);
        if (isOwned(noteId)) touchOwned(noteId);
        setSyncStatus("Synced");
    }, 500);
});


/* ==========================
   SHARE BUTTON
========================== */

shareBtn.addEventListener("click", () => {
    const baseUrl = window.location.href.split("#")[0];
    const readOnly = confirm("Copy read-only link?\nOK = read-only, Cancel = editable");
    const shareHash = readOnly ? `${noteId}?view=1` : noteId;
    const url = `${baseUrl}#${shareHash}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => showToast(readOnly ? "✓ Read-only link copied" : "✓ Editable link copied"))
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
    const full = ownedCount() >= MAX_NOTES;
    newBtn.disabled = full;
    newBtn.title = full ? `Limit of ${MAX_NOTES} notes reached — delete one first` : "";
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

    noteId = generateId();
    noteRef = database.ref(`notes/${noteId}`);
    LOCAL_KEY = `notepad_backup_${noteId}`;
    isViewOnly = false;
    notepad.value = "";

    window.location.hash = noteId;
    addOwned(noteId);
    updateNewBtnState();
    attachListener();
    attachPresence();
    applyViewOnlyMode();

    notepad.focus();
    showToast("✦ New note created");
});


/* ==========================
   CLEAR BUTTON
========================== */

clearBtn.addEventListener("click", () => {
    if (isViewOnly) {
        showToast("Read-only note: editing disabled");
        return;
    }

    if (notepad.value.trim() === "") {
        showToast("Already empty 😐");
        return;
    }

    if (!confirm("Clear everything?")) return;

    notepad.value = "";
    noteRef.set("");
    localStorage.removeItem(LOCAL_KEY);
    if (isOwned(noteId)) touchOwned(noteId);

    updateStats("");
    setSyncStatus("Synced");
    notepad.focus();
    showToast("🗑 Note cleared");
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

    const sorted = [...owned].sort((a, b) => b.updatedAt - a.updatedAt);
    const baseUrl = window.location.href.split("#")[0];

    panelBody.innerHTML = sorted.map(note => {
        const isActive = note.id === noteId;
        const preview = escapeHtml(localPreview(note.id));
        const created = formatDate(note.createdAt);
        const updated = formatDateTime(note.updatedAt || note.createdAt);
        const noteUrl = `${baseUrl}#${note.id}`;

        return `
        <div class="note-card ${isActive ? "active-note" : ""}">
            <div class="note-info">
                <div class="note-preview">${preview}</div>
                <div class="note-meta">
                    ${isActive ? "● current &nbsp;·&nbsp; " : ""}Edited ${updated} &nbsp;·&nbsp; Created ${created} &nbsp;·&nbsp; #${note.id}
                </div>
            </div>
            <div class="note-actions">
                <button class="note-btn open-btn" data-url="${noteUrl}">↗ Open</button>
                <button class="note-btn delete-btn" data-id="${note.id}">✕</button>
            </div>
        </div>`;
    }).join("");

    panelBody.querySelectorAll(".open-btn").forEach(btn => {
        btn.addEventListener("click", () => window.open(btn.dataset.url, "_blank"));
    });

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

    database.ref(`notes/${id}`).remove();
    localStorage.removeItem(`notepad_backup_${id}`);

    removeOwned(id);
    updateNewBtnState();

    showToast("🗑 Note deleted");

    if (isCurrent) {
        closePanel();

        if (currentListener) {
            noteRef.off("value", currentListener);
            currentListener = null;
        }

        const remaining = getOwned().sort((a, b) => b.updatedAt - a.updatedAt);

        if (remaining.length > 0) {
            noteId = remaining[0].id;
            noteRef = database.ref(`notes/${noteId}`);
            LOCAL_KEY = `notepad_backup_${noteId}`;
            isViewOnly = false;
            notepad.value = "";
            window.location.hash = noteId;
            attachListener();
            attachPresence();
            applyViewOnlyMode();
            updateStats("");
            showToast("Switched to your last note");
        } else {
            noteId = generateId();
            noteRef = database.ref(`notes/${noteId}`);
            LOCAL_KEY = `notepad_backup_${noteId}`;
            isViewOnly = false;
            notepad.value = "";
            window.location.hash = noteId;
            addOwned(noteId);
            updateNewBtnState();
            attachListener();
            attachPresence();
            applyViewOnlyMode();
            updateStats("");
            showToast("✦ New note created");
        }

        notepad.focus();
    } else {
        renderPanel();
    }
}

myNotesBtn.addEventListener("click", openPanel);
panelClose.addEventListener("click", closePanel);
panelOverlay.addEventListener("click", closePanel);


/* ==========================
   HASH CHANGE
========================== */

window.addEventListener("hashchange", () => {
    const parsed = parseHash();
    const newId = parsed.id;

    if (!newId) return;

    const noteChanged = newId !== noteId;
    const viewChanged = parsed.viewOnly !== isViewOnly;

    if (noteChanged || viewChanged) {
        if (currentListener) {
            noteRef.off("value", currentListener);
            currentListener = null;
        }

        noteId = newId;
        isViewOnly = parsed.viewOnly;
        noteRef = database.ref(`notes/${noteId}`);
        LOCAL_KEY = `notepad_backup_${noteId}`;
        if (noteChanged) notepad.value = "";

        attachListener();
        attachPresence();
        applyViewOnlyMode();
        if (noteChanged) updateStats("");
    }
});


/* ==========================
   INIT
========================== */

window.onload = () => notepad.focus();
window.addEventListener("online", () => setSyncStatus(isViewOnly ? "Read-only" : "Synced"));
window.addEventListener("offline", () => setSyncStatus("Offline"));
window.addEventListener("beforeunload", () => detachPresence());

updateStats(notepad.value || "");
applyViewOnlyMode();
