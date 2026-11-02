// Upload: sends the script in the editor to the user's Ollee account in
// Firestore, where the Ollee Watch app's Forge Apps screen (My Apps) picks
// it up and sends it to a Forge slot. The dialog's second tab submits it for
// review for the Forge App Store (see "App Store submission" below). Loaded
// after app.js and uses its globals (editor, editorMinified, ensureMinified,
// getFileName, log, logError, FORGE_SCRIPT_BYTE_LIMIT).
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
// App Store submission (rules.txt, "Forge App Store submission proposal.md"):
//   developers/{uid}: developerName (public, <= 40), contactEmail (private,
//     <= 254), createdAt, updatedAt. Prefills the form; written on submit.
//   storeSubmissions/{uid}_{forgeAppDocId(name)}_{major}_{minor}: one per
//     version, never overwritten. name, versionMajor/Minor, content,
//     contentBytes, source as above, plus appSlug, developerName and
//     contactEmail (copied from the profile), summary (<= 120), description
//     (<= 2000), category (STORE_CATEGORIES), tags (<= 5 of <= 20),
//     termsVersion, status ('pending', then
//     'withdrawn' by the developer or 'approved' / 'changes_requested' /
//     'rejected' by an admin, with reviewNotes), createdAt, updatedAt.
//   storeApps/{slug}: the approved catalogue, written only by admins. If it
//     exists, only its ownerUid can submit under that name.
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

// App Store submission limits; rules.txt enforces the same ones
const STORE_CATEGORIES = { daily: 'Daily', tools: 'Tools', game: 'Game', fitness: 'Fitness', other: 'Other' };
const STORE_DEVELOPER_NAME_LEN = 40;
const STORE_CONTACT_EMAIL_LEN = 254;
const STORE_SUMMARY_LEN = 120;
const STORE_DESCRIPTION_LEN = 2000;
const STORE_TAGS_MAX = 5;
const STORE_TAG_LEN = 20;
// Which wording of the submission checkbox the developer agreed to. Bump it
// when the wording (or a linked terms page) changes.
const STORE_TERMS_VERSION = '2026-11-beta2';
const STORE_STATUS_LABELS = {
  pending: 'Waiting for review',
  withdrawn: 'Withdrawn',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
  approved: 'Approved',
};

const uploadBtn = document.getElementById('upload-btn');
const uploadDialog = document.getElementById('upload-dialog');
const uploadMsg = document.getElementById('upload-msg');
const uploadIntro = document.getElementById('upload-intro');
const uploadSignedIn = document.getElementById('upload-signed-in');
const uploadTabWatch = document.getElementById('upload-tab-watch');
const uploadTabStore = document.getElementById('upload-tab-store');
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
const uploadDone = document.getElementById('upload-done');
const uploadDoneMsg = document.getElementById('upload-done-msg');
const uploadDoneNote = document.getElementById('upload-done-note');
const storeForm = document.getElementById('upload-store');
const storeName = document.getElementById('store-name');
const storeNameCount = document.getElementById('store-name-count');
const storeMajor = document.getElementById('store-major');
const storeMinor = document.getElementById('store-minor');
const storeDeveloper = document.getElementById('store-developer');
const storeDeveloperCount = document.getElementById('store-developer-count');
const storeContact = document.getElementById('store-contact');
const storeCategory = document.getElementById('store-category');
const storeTags = document.getElementById('store-tags');
const storeSummary = document.getElementById('store-summary');
const storeSummaryCount = document.getElementById('store-summary-count');
const storeDescription = document.getElementById('store-description');
const storeDescriptionCount = document.getElementById('store-description-count');
const storeContentSize = document.getElementById('store-content-size');
const storeSourceSize = document.getElementById('store-source-size');
const storeTerms = document.getElementById('store-terms');
const storeSubmitBtn = document.getElementById('store-submit-btn');
const storeSubsNote = document.getElementById('store-subs-note');
const storeSubsList = document.getElementById('store-subs');
const uploadDoneBtn = document.getElementById('upload-done-btn');

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

const UPLOAD_INTROS = {
  details: 'Saves this face to your Ollee account. Then open Settings > Forge Apps in the Ollee Watch app to send it to your watch.',
  store: 'Upload your app to Ollee Watch to be published publicly. Once approved, it\'s listed in the Forge App Store for anyone to install.',
};

// view: 'loading', 'signin', 'details' (Send to my watch tab), 'store'
// (Submit to App Store tab), 'done', or null (only the message shows)
function showUploadView(view) {
  uploadLoading.hidden = view !== 'loading';
  uploadSigninForm.hidden = view !== 'signin';
  uploadSignedIn.hidden = view !== 'details' && view !== 'store';
  uploadDetailsForm.hidden = view !== 'details';
  storeForm.hidden = view !== 'store';
  uploadTabWatch.setAttribute('aria-selected', String(view === 'details'));
  uploadTabStore.setAttribute('aria-selected', String(view === 'store'));
  uploadDone.hidden = view !== 'done';
  if (UPLOAD_INTROS[view]) uploadIntro.textContent = UPLOAD_INTROS[view];
}

function setBusy(busy) {
  for (const el of uploadDialog.querySelectorAll('input, button, select, textarea')) el.disabled = busy;
  if (!busy) { updateDetailsState(); updateStoreState(); }
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

// Problems with the script itself, which can't be fixed in the dialog.
function scriptProblem() {
  if (!uploadSource.trim()) return 'The script is empty.';
  if (uploadContent.includes('\0') || uploadSource.includes('\0')) return 'The script contains a NUL character, which ends it early on the watch.';
  const contentBytes = utf8Length(uploadContent);
  if (contentBytes > FORGE_SCRIPT_BYTE_LIMIT) return `The minified script is ${contentBytes} bytes, over the watch's ${FORGE_SCRIPT_BYTE_LIMIT}-byte limit.`;
  const sourceBytes = utf8Length(uploadSource);
  if (sourceBytes > FORGE_APP_SOURCE_BYTE_LIMIT) return `The source is ${sourceBytes} bytes, over the ${FORGE_APP_SOURCE_BYTE_LIMIT}-byte limit for uploads.`;
  return null;
}

function nameVersionProblem(nameInput, majorInput, minorInput) {
  const name = nameInput.value;
  if (!name.trim()) return 'Enter a name.';
  if (/[^\x20-\x7E]/.test(name)) return 'The name can only use ASCII letters, digits, spaces and symbols: the watch can\'t show other characters.';
  if (parseVersionPart(majorInput.value) === null || parseVersionPart(minorInput.value) === null) {
    return `Enter a major and minor version, each 0-${FORGE_APP_VERSION_PART_MAX}.`;
  }
  return null;
}

// Returns the first problem with the upload, or null if it can go.
function uploadProblem() {
  return scriptProblem() || nameVersionProblem(uploadName, uploadMajor, uploadMinor);
}

function showSizes(contentEl, sourceEl) {
  const contentBytes = utf8Length(uploadContent);
  const sourceBytes = utf8Length(uploadSource);
  contentEl.textContent = sizeText(contentBytes, FORGE_SCRIPT_BYTE_LIMIT);
  contentEl.classList.toggle('over', contentBytes > FORGE_SCRIPT_BYTE_LIMIT);
  sourceEl.textContent = sizeText(sourceBytes, FORGE_APP_SOURCE_BYTE_LIMIT);
  sourceEl.classList.toggle('over', sourceBytes > FORGE_APP_SOURCE_BYTE_LIMIT);
}

function updateDetailsState() {
  uploadNameCount.textContent = `${uploadName.value.length}/${FORGE_APP_NAME_LEN}`;
  const replacing = confirmedReplaceId !== null && confirmedReplaceId === forgeAppDocId(uploadName.value.trim());
  uploadSubmitBtn.textContent = replacing ? 'Replace' : 'Upload';
}

function fillDetails() {
  const fileName = getFileName();
  const prefs = loadUploadPrefs()[fileName] || {};
  uploadName.value = prefs.name || asciiAppName(fileName.replace(/\.js$/i, '')) || 'My Forge App';
  uploadMajor.value = prefs.major ?? 1;
  uploadMinor.value = prefs.minor ?? 0;
  showSizes(uploadContentSize, uploadSourceSize);
  confirmedReplaceId = null;
  updateDetailsState();
}

// The tab shown when the dialog opens: the last one used this session
let uploadTab = 'details';

function showUploadTab(tab) {
  uploadTab = tab;
  showUploadMessage('');
  showUploadView(tab);
  // Size problems can't be fixed in the dialog: say so up front
  const problem = tab === 'store' ? scriptProblem() : uploadProblem();
  if (problem) showUploadMessage(problem, 'error');
  (tab === 'store' ? storeName : uploadName).focus();
}

function showSignedInState() {
  const user = firebase.auth().currentUser;
  if (user) {
    uploadAccount.textContent = user.email || user.uid;
    fillDetails();
    fillStore(user);
    showUploadTab(uploadTab);
  } else {
    showUploadView('signin');
    uploadEmail.focus();
  }
}

uploadTabWatch.addEventListener('click', () => showUploadTab('details'));
uploadTabStore.addEventListener('click', () => showUploadTab('store'));

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
    // Confirmation stays up until the user clicks OK (or closes the dialog)
    uploadDoneMsg.textContent = `${replaced ? 'Replaced' : 'Uploaded'} "${name}" v${major}.${minor} (${contentBytes} bytes) ${replaced ? 'in' : 'to'} your Ollee account.`;
    uploadDoneNote.textContent = 'In the Ollee Watch app, open Settings > Forge Apps > My Apps, pick it and send it to your watch.';
    showUploadView('done');
    uploadDoneBtn.focus();
    log(`Upload: ${replaced ? 'replaced' : 'added'} "${name}" v${major}.${minor} (${contentBytes} bytes) in your Ollee account. In the Ollee Watch app, open Settings > Forge Apps > My Apps to send it to your watch.`);
  } catch (err) {
    setBusy(false);
    showUploadMessage(describeFirebaseError(err), 'error');
  }
});

// --- App Store submission ---

// Store listing fields last used per file name, so submitting a new version
// of the same file starts from the previous text.
const STORE_PREFS_KEY = 'forgeStorePrefs';
function loadStorePrefs() {
  try { return JSON.parse(localStorage.getItem(STORE_PREFS_KEY)) || {}; } catch (e) { return {}; }
}
function saveStorePrefs(fileName, prefs) {
  try {
    const all = loadStorePrefs();
    all[fileName] = prefs;
    localStorage.setItem(STORE_PREFS_KEY, JSON.stringify(all));
  } catch (e) { /* storage unavailable: defaults next time */ }
}

// uid whose profile and submissions the variables below hold
let storeUser = null;
// developers/{uid}, or null if it doesn't exist (yet)
let storeProfile = null;
// The user's storeSubmissions, newest first; null until loaded
let storeSubs = null;
let storeSubsError = null;
// Set once the developer types in the name or email, so a profile that
// loads late doesn't overwrite what they typed
let storeProfileTouched = false;

const STORE_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function storeSubmissionId(uid, slug, major, minor) {
  return `${uid}_${slug}_${major}_${minor}`;
}

function parseTags(value) {
  const tags = [];
  for (const part of value.split(',')) {
    const tag = part.trim().toLowerCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function createEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function storeSubTime(sub) {
  return sub.createdAt && sub.createdAt.toMillis ? sub.createdAt.toMillis() : 0;
}

// Returns the first problem with the submission, or null if it can go.
function storeProblem() {
  const problem = scriptProblem() || nameVersionProblem(storeName, storeMajor, storeMinor);
  if (problem) return problem;
  const name = storeName.value.trim();
  const slug = forgeAppDocId(name);
  const major = parseVersionPart(storeMajor.value);
  const minor = parseVersionPart(storeMinor.value);
  if (storeSubs) {
    const same = storeSubs.find((s) => s.appSlug === slug && s.versionMajor === major && s.versionMinor === minor);
    if (same) {
      return same.status === 'withdrawn'
        ? `You already submitted v${major}.${minor} of "${name}" and withdrew it. Delete it under My submissions to reuse this version, or raise the version.`
        : `You already submitted v${major}.${minor} of "${name}". Raise the version to submit again.`;
    }
    const pending = storeSubs.find((s) => s.appSlug === slug && s.status === 'pending');
    if (pending) {
      return `v${pending.versionMajor}.${pending.versionMinor} of "${pending.name}" is still waiting for review. Withdraw it under My submissions to submit a new version.`;
    }
  }
  if (!storeDeveloper.value.trim()) return 'Enter a developer name.';
  if (!STORE_EMAIL_RE.test(storeContact.value.trim())) return 'Enter a contact email address.';
  if (!STORE_CATEGORIES[storeCategory.value]) return 'Choose a category.';
  const tags = parseTags(storeTags.value);
  if (tags.length > STORE_TAGS_MAX) return `Use at most ${STORE_TAGS_MAX} tags.`;
  const longTag = tags.find((t) => t.length > STORE_TAG_LEN);
  if (longTag) return `Tags can be at most ${STORE_TAG_LEN} characters: "${longTag}".`;
  if (!storeSummary.value.trim()) return 'Enter a one-line summary.';
  if (!storeDescription.value.trim()) return 'Enter a description.';
  if (!storeTerms.checked) return 'Tick the box to confirm you can share this app.';
  return null;
}

function updateStoreState() {
  storeNameCount.textContent = `${storeName.value.length}/${FORGE_APP_NAME_LEN}`;
  storeDeveloperCount.textContent = `${storeDeveloper.value.length}/${STORE_DEVELOPER_NAME_LEN}`;
  storeSummaryCount.textContent = `${storeSummary.value.length}/${STORE_SUMMARY_LEN}`;
  storeDescriptionCount.textContent = `${storeDescription.value.length}/${STORE_DESCRIPTION_LEN}`;
}

function fillStoreProfile(user) {
  storeDeveloper.value = (storeProfile && storeProfile.developerName) || '';
  storeContact.value = (storeProfile && storeProfile.contactEmail) || user.email || '';
}

function fillStore(user) {
  if (storeUser !== user.uid) {
    storeUser = user.uid;
    storeProfile = null;
    storeSubs = null;
    storeSubsList.replaceChildren();
  }
  const fileName = getFileName();
  const prefs = loadStorePrefs()[fileName] || {};
  const uploadPrefs = loadUploadPrefs()[fileName] || {};
  storeName.value = prefs.name || uploadPrefs.name || asciiAppName(fileName.replace(/\.js$/i, '')) || 'My Forge App';
  storeMajor.value = prefs.major ?? uploadPrefs.major ?? 1;
  storeMinor.value = prefs.minor ?? uploadPrefs.minor ?? 0;
  storeCategory.value = STORE_CATEGORIES[prefs.category] ? prefs.category : '';
  storeTags.value = (prefs.tags || []).join(', ');
  storeSummary.value = prefs.summary || '';
  storeDescription.value = prefs.description || '';
  storeTerms.checked = false;
  storeProfileTouched = false;
  fillStoreProfile(user);
  showSizes(storeContentSize, storeSourceSize);
  updateStoreState();
  if (storeSubs) renderStoreSubs();
  loadStoreAccount(user);
}

// Fetches the developer profile and submissions (on every dialog open, so
// review results show up without a reload).
async function loadStoreAccount(user) {
  const db = firebase.firestore();
  storeSubsError = null;
  if (!storeSubs) storeSubsNote.textContent = 'Loading…';
  try {
    const profileSnap = await db.collection('developers').doc(user.uid).get();
    const subsSnap = await db.collection('storeSubmissions').where('uid', '==', user.uid).get();
    if (storeUser !== user.uid) return;  // signed in as someone else meanwhile
    storeProfile = profileSnap.exists ? profileSnap.data() : null;
    if (!storeProfileTouched) fillStoreProfile(user);
    storeSubs = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    storeSubs.sort((a, b) => storeSubTime(b) - storeSubTime(a));
    prefillFromLastSubmission();
    renderStoreSubs();
  } catch (err) {
    if (storeUser !== user.uid) return;
    storeSubsError = describeFirebaseError(err);
    storeSubsNote.textContent = `Couldn't load your submissions: ${storeSubsError}`;
  }
}

// A new version of an app already submitted (from another browser, or with
// local storage cleared) starts from that submission's listing text.
function prefillFromLastSubmission() {
  if (storeSummary.value || storeDescription.value || storeCategory.value || storeTags.value) return;
  const slug = forgeAppDocId(storeName.value.trim());
  const last = storeSubs.find((s) => s.appSlug === slug);
  if (!last) return;
  storeCategory.value = STORE_CATEGORIES[last.category] ? last.category : '';
  storeTags.value = (last.tags || []).join(', ');
  storeSummary.value = last.summary || '';
  storeDescription.value = last.description || '';
  updateStoreState();
}

// Apps whose older versions are expanded, kept across re-renders (e.g.
// after a delete inside the list)
const storeOpenApps = new Set();

// One entry per app, newest version first; older versions fold under it.
// storeSubs is sorted newest first, so each app's first entry is its newest.
function renderStoreSubs() {
  storeSubsList.replaceChildren();
  storeSubsNote.textContent = storeSubs.length ? '' : 'Nothing submitted yet.';
  const apps = new Map();
  for (const sub of storeSubs) {
    if (!apps.has(sub.appSlug)) apps.set(sub.appSlug, []);
    apps.get(sub.appSlug).push(sub);
  }
  for (const [slug, subs] of apps) {
    const item = createEl('li', 'store-app');
    item.append(storeSubItem(subs[0]));
    if (subs.length > 1) {
      const older = createEl('details', 'store-app-older');
      older.open = storeOpenApps.has(slug);
      older.addEventListener('toggle', () => {
        if (older.open) storeOpenApps.add(slug); else storeOpenApps.delete(slug);
      });
      const count = subs.length - 1;
      older.append(createEl('summary', null, `${count} older version${count === 1 ? '' : 's'}`));
      const list = createEl('div', 'store-app-older-list');
      for (const sub of subs.slice(1)) list.append(storeSubItem(sub));
      older.append(list);
      item.append(older);
    }
    storeSubsList.append(item);
  }
}

function storeSubItem(sub) {
  const item = createEl('div', 'store-sub');
  const head = createEl('div', 'store-sub-head');
  head.append(
    createEl('span', 'store-sub-name', `${sub.name} v${sub.versionMajor}.${sub.versionMinor}`),
    createEl('span', `store-status store-status-${sub.status}`, STORE_STATUS_LABELS[sub.status] || sub.status),
  );
  item.append(head);
  const meta = [];
  if (sub.createdAt && sub.createdAt.toDate) {
    meta.push(`Submitted ${sub.createdAt.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`);
  }
  if (STORE_CATEGORIES[sub.category]) meta.push(STORE_CATEGORIES[sub.category]);
  item.append(createEl('div', 'store-sub-meta', meta.join(' · ')));
  if (sub.reviewNotes) item.append(createEl('p', 'store-sub-notes', `Reviewer: ${sub.reviewNotes}`));
  if (sub.status === 'pending') {
    const withdraw = createEl('button', 'upload-link-btn', 'Withdraw');
    withdraw.type = 'button';
    withdraw.addEventListener('click', () => withdrawSubmission(sub));
    item.append(withdraw);
  } else if (sub.status === 'withdrawn') {
    // Only withdrawn submissions can be deleted: reviewed ones keep the
    // review history and back the live store entry (rules.txt)
    const del = createEl('button', 'upload-link-btn', 'Delete');
    del.type = 'button';
    del.addEventListener('click', () => deleteSubmission(sub));
    item.append(del);
  }
  return item;
}

async function deleteSubmission(sub) {
  const label = `"${sub.name}" v${sub.versionMajor}.${sub.versionMinor}`;
  if (!confirm(`Delete ${label}? It was withdrawn before review, so nothing is lost, and its version number can be used again.`)) return;
  showUploadMessage('');
  setBusy(true);
  try {
    await firebase.firestore().collection('storeSubmissions').doc(sub.id).delete();
    storeSubs = storeSubs.filter((s) => s !== sub);
    renderStoreSubs();
    showUploadMessage(`Deleted ${label}.`, 'info');
    log(`App Store: deleted withdrawn submission ${label}.`);
  } catch (err) {
    showUploadMessage(describeFirebaseError(err), 'error');
  }
  setBusy(false);
}

async function withdrawSubmission(sub) {
  const label = `"${sub.name}" v${sub.versionMajor}.${sub.versionMinor}`;
  if (!confirm(`Withdraw ${label} from review? You can delete it afterwards to use its version number again.`)) return;
  showUploadMessage('');
  setBusy(true);
  try {
    await firebase.firestore().collection('storeSubmissions').doc(sub.id).update({
      status: 'withdrawn',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    sub.status = 'withdrawn';
    renderStoreSubs();
    showUploadMessage(`Withdrew ${label}.`, 'info');
    log(`App Store: withdrew ${label} from review.`);
  } catch (err) {
    showUploadMessage(describeFirebaseError(err), 'error');
  }
  setBusy(false);
}

for (const input of [storeName, storeMajor, storeMinor, storeDeveloper, storeContact, storeCategory,
  storeTags, storeSummary, storeDescription, storeTerms]) {
  input.addEventListener('input', () => { showUploadMessage(''); updateStoreState(); });
}
for (const input of [storeDeveloper, storeContact]) {
  input.addEventListener('input', () => { storeProfileTouched = true; });
}

// A message thrown inside the transaction, shown as is
function storeError(message) {
  const err = new Error(message);
  err.storeMessage = true;
  return err;
}

storeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = firebase.auth().currentUser;
  if (!user) { showSignedInState(); return; }
  if (!storeSubs) {
    // The pending/duplicate checks need the list
    showUploadMessage(storeSubsError
      ? `Couldn't load your submissions: ${storeSubsError} Close the dialog and open it again to retry.`
      : 'Still loading your submissions. Try again in a moment.', storeSubsError ? 'error' : 'info');
    return;
  }
  const problem = storeProblem();
  if (problem) { showUploadMessage(problem, 'error'); return; }

  const name = storeName.value.trim();
  const major = parseVersionPart(storeMajor.value);
  const minor = parseVersionPart(storeMinor.value);
  const slug = forgeAppDocId(name);
  const id = storeSubmissionId(user.uid, slug, major, minor);
  const developerName = storeDeveloper.value.trim();
  const contactEmail = storeContact.value.trim();
  const category = storeCategory.value;
  const tags = parseTags(storeTags.value);
  const summary = storeSummary.value.trim();
  const description = storeDescription.value.trim();
  const contentBytes = utf8Length(uploadContent);
  const db = firebase.firestore();
  const subRef = db.collection('storeSubmissions').doc(id);
  const devRef = db.collection('developers').doc(user.uid);
  const appRef = db.collection('storeApps').doc(slug);

  showUploadMessage('');
  setBusy(true);
  try {
    await db.runTransaction(async (tx) => {
      const subSnap = await tx.get(subRef);
      if (subSnap.exists) throw storeError(`You already submitted v${major}.${minor} of "${name}". Raise the version to submit again.`);
      const appSnap = await tx.get(appRef);
      if (appSnap.exists && appSnap.data().ownerUid !== user.uid) {
        throw storeError(`"${name}" is already in the App Store from another developer. Choose a different name.`);
      }
      const devSnap = await tx.get(devRef);
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const profile = { developerName, contactEmail, updatedAt: now };
      if (!devSnap.exists) profile.createdAt = now;
      tx.set(devRef, profile, { merge: true });
      tx.set(subRef, {
        uid: user.uid,
        appSlug: slug,
        name,
        versionMajor: major,
        versionMinor: minor,
        content: uploadContent,
        contentBytes,
        source: uploadSource,
        developerName,
        contactEmail,
        summary,
        description,
        category,
        tags,
        termsVersion: STORE_TERMS_VERSION,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    });
    storeProfile = { developerName, contactEmail };
    const createdAt = firebase.firestore.Timestamp.now();
    storeSubs.unshift({
      id, uid: user.uid, appSlug: slug, name, versionMajor: major, versionMinor: minor,
      category, tags, summary, description, status: 'pending', createdAt, updatedAt: createdAt,
    });
    renderStoreSubs();
    saveStorePrefs(getFileName(), { name, major, minor, category, tags, summary, description });
    setBusy(false);
    uploadDoneMsg.textContent = `Submitted "${name}" v${major}.${minor} for review.`;
    uploadDoneNote.textContent = `Ollee Watch will email ${contactEmail} once it's been reviewed. Open Upload > Submit to App Store to check its status or withdraw it.`;
    showUploadView('done');
    uploadDoneBtn.focus();
    log(`App Store: submitted "${name}" v${major}.${minor} (${contentBytes} bytes) for review. Ollee will email ${contactEmail} with the result.`);
  } catch (err) {
    setBusy(false);
    if (err && err.storeMessage) showUploadMessage(err.message, 'error');
    else if (err && err.code === 'permission-denied') showUploadMessage('The App Store didn\'t accept this submission. Check the fields and try again, or contact Ollee if it keeps happening.', 'error');
    else showUploadMessage(describeFirebaseError(err), 'error');
  }
});

// The watch's L/M/A/T/P keys (app.js) shouldn't fire while the dialog is
// open, e.g. with focus on one of its buttons. This capture listener runs
// before app.js's. keyup still goes through so a held key isn't left stuck.
window.addEventListener('keydown', (e) => {
  if (uploadDialog.open) e.stopImmediatePropagation();
}, true);
