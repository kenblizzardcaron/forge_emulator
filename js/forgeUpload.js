// Upload: sends the script in the editor to the user's Ollee account in
// Firestore, where the Ollee Watch app's Forge Apps screen (My Apps) picks
// it up and sends it to a Forge slot. Loaded after app.js and uses its
// globals (editor, editorMinified, ensureMinified, getFileName, log,
// FORGE_SCRIPT_BYTE_LIMIT).
//
// Document: users/{uid}/forgeApps/{forgeAppDocId(name)}
//   name          string, printable ASCII, trimmed, 1-20 chars (forgeScriptNameLen)
//   versionMajor  int 0-99 (the app's _versionPartMax)
//   versionMinor  int 0-99
//   content       string, the minified script sent to the watch, <= 8158 UTF-8 bytes
//   contentBytes  int, UTF-8 length of content
//   source        string, the original script, <= 64 KB UTF-8
//   createdAt     timestamp, set on the first upload of this name
//   updatedAt     timestamp, set on every upload
// Uploading the same name again replaces the entry. The write merges, so
// fields added later (sharing, ratings) survive a re-upload.
//
// Access is enforced by the Firestore rules (users/{uid}/** is owner-only),
// not by this key: a Firebase web config is public by design. The key is
// restricted to http://localhost and http://127.0.0.1 referrers, so uploading
// needs the page served over HTTP (python -m http.server), not file://.

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyANj1now86uvqK_9it2K3mod8fpNXmMHLU',
  authDomain: 'ollee-watch-beta.firebaseapp.com',
  projectId: 'ollee-watch-beta',
  storageBucket: 'ollee-watch-beta.firebasestorage.app',
  messagingSenderId: '505005912146',
  appId: '1:505005912146:web:cd72a420a6184a03796f8b',
};
// Compat builds work from classic <script> tags, so no build step is needed.
// They're only fetched when Upload is clicked: the emulator still starts
// offline.
const FIREBASE_SDK_URL = 'https://www.gstatic.com/firebasejs/10.14.1/';

const FORGE_APP_NAME_LEN = 20;          // forgeScriptNameLen in the app's oap.dart
const FORGE_APP_VERSION_PART_MAX = 99;  // _versionPartMax in settingsForgeApps.dart
const FORGE_APP_SOURCE_BYTE_LIMIT = 64 * 1024;

const uploadBtn = document.getElementById('upload-btn');
const uploadDialog = document.getElementById('upload-dialog');
const uploadMsg = document.getElementById('upload-msg');
const uploadLoading = document.getElementById('upload-loading');
const uploadSigninForm = document.getElementById('upload-signin');
const uploadEmail = document.getElementById('upload-email');
const uploadPassword = document.getElementById('upload-password');
const uploadSigninBtn = document.getElementById('upload-signin-btn');
const uploadResetBtn = document.getElementById('upload-reset-btn');
const uploadDetailsForm = document.getElementById('upload-details');
const uploadAccount = document.getElementById('upload-account');
const uploadSignoutBtn = document.getElementById('upload-signout-btn');
const uploadName = document.getElementById('upload-name');
const uploadNameCount = document.getElementById('upload-name-count');
const uploadMajor = document.getElementById('upload-major');
const uploadMinor = document.getElementById('upload-minor');
const uploadContentSize = document.getElementById('upload-content-size');
const uploadSourceSize = document.getElementById('upload-source-size');
const uploadSubmitBtn = document.getElementById('upload-submit-btn');

const utf8Length = (text) => new TextEncoder().encode(text).length;

// The watch shows names in printable ASCII only (the app's _asciiName).
function asciiAppName(value) {
  const ascii = value.replace(/[^\x20-\x7E]/g, '').trim();
  return ascii.slice(0, FORGE_APP_NAME_LEN).trim();
}

// Document ID for a name, so the same name maps to the same document.
// encodeURIComponent removes '/', and encoding '.' and '_' as well rules out
// the IDs Firestore reserves ('.', '..', '__*__').
function forgeAppDocId(name) {
  return encodeURIComponent(name).replace(/\./g, '%2E').replace(/_/g, '%5F');
}

// --- Firebase SDK, loaded on first use ---

let firebaseReady = null;

function loadScript(file) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = FIREBASE_SDK_URL + file;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error(`Could not load ${file}`)); };
    document.head.appendChild(s);
  });
}

function loadFirebase() {
  if (!firebaseReady) {
    firebaseReady = loadScript('firebase-app-compat.js')
      .then(() => Promise.all([loadScript('firebase-auth-compat.js'), loadScript('firebase-firestore-compat.js')]))
      .then(() => {
        firebase.initializeApp(FIREBASE_CONFIG);
        // Wait for a sign-in remembered from an earlier visit to be restored
        return new Promise((resolve) => {
          const unsubscribe = firebase.auth().onAuthStateChanged(() => { unsubscribe(); resolve(); });
        });
      })
      .catch((e) => { firebaseReady = null; throw e; });
  }
  return firebaseReady;
}

function describeFirebaseError(e) {
  const code = (e && e.code) || '';
  const message = (e && e.message) || String(e);
  if (/referr?er/i.test(code + message)) {
    return 'This page\'s address isn\'t allowed to use the Ollee account service. Open the emulator from http://localhost or http://127.0.0.1.';
  }
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/invalid-email': return 'Enter a valid email address.';
    case 'auth/user-disabled': return 'This account has been disabled.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Can\'t reach the Ollee account service. Check your internet connection.';
    case 'permission-denied': return 'Your account doesn\'t have permission to save this app.';
    default: return message;
  }
}

// --- Dialog states ---

function showUploadMessage(text, kind) {
  uploadMsg.textContent = text || '';
  uploadMsg.className = `upload-msg${kind ? ` upload-msg-${kind}` : ''}`;
  uploadMsg.hidden = !text;
}

function showUploadView(view) {
  uploadLoading.hidden = view !== 'loading';
  uploadSigninForm.hidden = view !== 'signin';
  uploadDetailsForm.hidden = view !== 'details';
}

function setBusy(busy) {
  for (const el of uploadDialog.querySelectorAll('input, button')) el.disabled = busy;
  if (!busy) updateDetailsState();
}

// --- Details: what gets uploaded ---

let uploadContent = '';
let uploadSource = '';
// The doc ID the user was warned already exists. A second Upload with the
// same name replaces it.
let confirmedReplaceId = null;

// Name and version last used per file name, so uploading the same file
// again defaults to replacing the same entry.
const UPLOAD_PREFS_KEY = 'forgeUploadPrefs';
function loadUploadPrefs() {
  try { return JSON.parse(localStorage.getItem(UPLOAD_PREFS_KEY)) || {}; } catch (e) { return {}; }
}
function saveUploadPrefs(fileName, prefs) {
  try {
    const all = loadUploadPrefs();
    all[fileName] = prefs;
    localStorage.setItem(UPLOAD_PREFS_KEY, JSON.stringify(all));
  } catch (e) { /* storage unavailable: defaults next time */ }
}

function sizeText(bytes, limit) {
  return `${bytes} / ${limit} bytes`;
}

function parseVersionPart(value) {
  return /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : null;
}

// Returns the first problem with the upload, or null if it can go.
function uploadProblem() {
  if (!uploadSource.trim()) return 'The script is empty.';
  if (uploadContent.includes('\0') || uploadSource.includes('\0')) return 'The script contains a NUL character, which ends it early on the watch.';
  const contentBytes = utf8Length(uploadContent);
  if (contentBytes > FORGE_SCRIPT_BYTE_LIMIT) return `The minified script is ${contentBytes} bytes, over the watch's ${FORGE_SCRIPT_BYTE_LIMIT}-byte limit.`;
  const sourceBytes = utf8Length(uploadSource);
  if (sourceBytes > FORGE_APP_SOURCE_BYTE_LIMIT) return `The source is ${sourceBytes} bytes, over the ${FORGE_APP_SOURCE_BYTE_LIMIT}-byte limit for uploads.`;
  const name = uploadName.value;
  if (!name.trim()) return 'Enter a name.';
  if (/[^\x20-\x7E]/.test(name)) return 'The name can only use ASCII letters, digits, spaces and symbols: the watch can\'t show other characters.';
  if (parseVersionPart(uploadMajor.value) === null || parseVersionPart(uploadMinor.value) === null) {
    return `Enter a major and minor version, each 0-${FORGE_APP_VERSION_PART_MAX}.`;
  }
  return null;
}

function updateDetailsState() {
  uploadNameCount.textContent = `${uploadName.value.length}/${FORGE_APP_NAME_LEN}`;
  const replacing = confirmedReplaceId !== null && confirmedReplaceId === forgeAppDocId(uploadName.value.trim());
  uploadSubmitBtn.textContent = replacing ? 'Replace' : 'Upload';
}

function fillDetails(user) {
  uploadAccount.textContent = user.email || user.uid;
  const fileName = getFileName();
  const prefs = loadUploadPrefs()[fileName] || {};
  uploadName.value = prefs.name || asciiAppName(fileName.replace(/\.js$/i, '')) || 'My Forge App';
  uploadMajor.value = prefs.major ?? 1;
  uploadMinor.value = prefs.minor ?? 0;
  const contentBytes = utf8Length(uploadContent);
  const sourceBytes = utf8Length(uploadSource);
  uploadContentSize.textContent = sizeText(contentBytes, FORGE_SCRIPT_BYTE_LIMIT);
  uploadContentSize.classList.toggle('over', contentBytes > FORGE_SCRIPT_BYTE_LIMIT);
  uploadSourceSize.textContent = sizeText(sourceBytes, FORGE_APP_SOURCE_BYTE_LIMIT);
  uploadSourceSize.classList.toggle('over', sourceBytes > FORGE_APP_SOURCE_BYTE_LIMIT);
  confirmedReplaceId = null;
  updateDetailsState();
  showUploadView('details');
  // Size problems can't be fixed in the dialog: say so up front
  const problem = uploadProblem();
  if (problem) showUploadMessage(problem, 'error');
}

function showSignedInState() {
  const user = firebase.auth().currentUser;
  if (user) {
    fillDetails(user);
    uploadName.focus();
  } else {
    showUploadView('signin');
    uploadEmail.focus();
  }
}

// --- Open ---

async function openUploadDialog() {
  showUploadMessage('');
  if (location.protocol === 'file:') {
    showUploadView(null);
    showUploadMessage('Uploading needs the emulator served over HTTP, not opened as a file. In this folder run "python -m http.server 8000", then open http://localhost:8000/', 'error');
    uploadDialog.showModal();
    return;
  }
  // Minify first: a syntax error stops the upload before signing in
  if (!(await ensureMinified())) {
    logError('Upload: fix the script so it minifies, then try again.');
    return;
  }
  uploadSource = editor.value;
  uploadContent = editorMinified.value;
  showUploadView('loading');
  uploadDialog.showModal();
  try {
    await loadFirebase();
  } catch (e) {
    showUploadView(null);
    showUploadMessage('Couldn\'t load the Firebase library. Check your internet connection.', 'error');
    return;
  }
  showSignedInState();
}

uploadBtn.addEventListener('click', openUploadDialog);

for (const btn of uploadDialog.querySelectorAll('.upload-cancel-btn')) {
  btn.addEventListener('click', () => uploadDialog.close());
}

// --- Sign in / out ---

uploadSigninForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showUploadMessage('');
  setBusy(true);
  try {
    await firebase.auth().signInWithEmailAndPassword(uploadEmail.value.trim(), uploadPassword.value);
    uploadPassword.value = '';
    setBusy(false);
    showSignedInState();
  } catch (err) {
    setBusy(false);
    showUploadMessage(describeFirebaseError(err), 'error');
  }
});

uploadResetBtn.addEventListener('click', async () => {
  const email = uploadEmail.value.trim();
  if (!email) { showUploadMessage('Enter your email address first.', 'error'); return; }
  setBusy(true);
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    showUploadMessage(`If ${email} has an Ollee account, a password reset email is on its way.`, 'info');
  } catch (err) {
    showUploadMessage(describeFirebaseError(err), 'error');
  }
  setBusy(false);
});

uploadSignoutBtn.addEventListener('click', async () => {
  showUploadMessage('');
  await firebase.auth().signOut();
  log('Upload: signed out');
  showSignedInState();
});

// --- Upload ---

for (const input of [uploadName, uploadMajor, uploadMinor]) {
  input.addEventListener('input', () => { showUploadMessage(''); updateDetailsState(); });
}

uploadDetailsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const problem = uploadProblem();
  if (problem) { showUploadMessage(problem, 'error'); return; }

  const user = firebase.auth().currentUser;
  if (!user) { showSignedInState(); return; }
  const name = uploadName.value.trim();
  const major = parseVersionPart(uploadMajor.value);
  const minor = parseVersionPart(uploadMinor.value);
  const id = forgeAppDocId(name);
  const db = firebase.firestore();
  const ref = db.collection('users').doc(user.uid).collection('forgeApps').doc(id);

  showUploadMessage('');
  setBusy(true);
  try {
    // Warn once before replacing an app already in the account
    if (confirmedReplaceId !== id) {
      const existing = await ref.get();
      if (existing.exists) {
        const d = existing.data();
        confirmedReplaceId = id;
        setBusy(false);
        showUploadMessage(`"${d.name}" (v${d.versionMajor}.${d.versionMinor}) is already in your account. Click Replace to overwrite it.`, 'warn');
        return;
      }
    }
    const contentBytes = utf8Length(uploadContent);
    let replaced = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      replaced = snap.exists;
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const data = {
        name,
        versionMajor: major,
        versionMinor: minor,
        content: uploadContent,
        contentBytes,
        source: uploadSource,
        updatedAt: now,
      };
      if (!snap.exists) data.createdAt = now;
      tx.set(ref, data, { merge: true });
    });
    saveUploadPrefs(getFileName(), { name, major, minor });
    setBusy(false);
    uploadDialog.close();
    log(`Upload: ${replaced ? 'replaced' : 'added'} "${name}" v${major}.${minor} (${contentBytes} bytes) in your Ollee account. In the Ollee Watch app, open Forge Apps > My Apps to send it to your watch.`);
  } catch (err) {
    setBusy(false);
    showUploadMessage(describeFirebaseError(err), 'error');
  }
});

// The watch's L/M/A/T/P keys (app.js) shouldn't fire while the dialog is
// open, e.g. with focus on one of its buttons. This capture listener runs
// before app.js's. keyup still goes through so a held key isn't left stuck.
window.addEventListener('keydown', (e) => {
  if (uploadDialog.open) e.stopImmediatePropagation();
}, true);
