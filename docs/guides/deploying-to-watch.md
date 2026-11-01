# Deploying to your watch

Once your face works in the emulator, you can load it onto your Ollee Watch.

<!-- TODO: step-by-step upload instructions (which app, where the Forge
     option is, firmware version required, screenshots). -->

## Before you upload

- **Check the size.** The size bar under the editor must stay at or under
  **8158 bytes**. If you're over, shorten comments and long names.
- **Run it once more from a fresh Run**, and press M twice to check that
  `exit()`/`enter()` leave the face in a good state.
- **Check the log for errors.** An uncaught error disables the face on the
  watch.
- **Watch for modern JS.** The watch runs Espruino, which doesn't support
  everything your browser does. If the face fails on the watch but works in
  the emulator, try rewriting newer syntax in ES5 style.

## Uploading

The **Upload** button saves your face to your Ollee account. From there the
Ollee Watch app sends it to one of the watch's Forge faces.

1. **Serve the emulator over HTTP.** Uploading doesn't work when
   `index.html` is opened as a file. In the emulator's folder, run
   `python -m http.server 8000` and open http://localhost:8000/ (or
   http://127.0.0.1:8000/).
2. **Click Upload** and sign in with your Ollee Watch app account (email and
   password). If you don't have an account, create one in the app first.
   The emulator remembers your sign-in until you click **Sign out**.
3. **Name and version.** The name defaults to the file name. It can be up
   to 20 characters of plain ASCII (letters, digits, spaces and symbols), since
   that's all the watch can show. The version is a major and a minor number,
   each 0-99.
4. **Click Upload.** The emulator minifies the script and uploads both the
   minified script (what the watch runs, up to 8158 bytes) and your original
   source (up to 64 KB). If an app with the same name is already in your
   account, you're asked to confirm, and **Replace** overwrites it.
5. **In the Ollee Watch app**, open **Forge Apps**, pick your app under
   **My Apps**, choose Forge A, B or C, and tap **Send to watch**.

You can also skip the account: save the script with **Save script**, and load
the file in the app's Forge Apps screen under **Load from file**.

## After you upload

- `init()` runs right away, and again each time the watch boots.
- The face shows its slot name (`FA`, `FB` or `FC`) on the weekday digits
  while it's on screen.
