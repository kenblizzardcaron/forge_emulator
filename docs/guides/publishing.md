# Publishing to the Forge App Store

The Forge App Store lets other Ollee Watch owners find and install your face.
This guide covers what makes a face ready for the store, how to submit it from
the emulator, and what happens between submitting and publishing.

- [Before you submit: best practices](#before-you-submit-best-practices)
- [Submitting from the emulator](#submitting-from-the-emulator)
- [Review](#review)
- [Publishing and updates](#publishing-and-updates)

## Before you submit: best practices

Reviewers check every app against the points below. Most changes requested
come from one of these points, so check them first.

### Let events drive your face, not timers

The watch lasts a long time on a small battery because it sleeps between
events. Every wake-up costs energy, so a good face wakes only when something
it shows has changed. See [Power](../concepts/power.md) for the details.

- **Update clocks and dates with `clock_minute()` and `clock_hour()`.** They
  run on the watch's low-power RTC scheduler and need no timer. A face showing
  `HH:MM` should redraw in `clock_minute()`, not on a timer.
- **Use `clock_second()` for a display that changes every second.** It also
  runs on the RTC scheduler, uses none of the 4 timer slots, and stops by itself
  when the face leaves the screen.
- **Keep `Ollee.setInterval` and `Ollee.setTimeout` to a minimum.** A pending
  timer of up to 60 s keeps the watch's high-power 1 ms timer running for as
  long as it exists, so even `Ollee.setInterval(fn, 1000)` costs far more than
  `clock_second()`. Start fast timers when the user starts something (a
  stopwatch, an animation) and clear them when it ends.
- **Don't use timers for background work.** The watch cancels all of a face's
  timers when it leaves the screen, and they don't come back on their own.
  Restart what you need in `enter()`. To react while another face is showing,
  `Ollee.subscribe` to one of the background events (`E_CLOCK_MINUTE`,
  `E_CLOCK_HOUR`, `E_BLE_RX`, `E_BLE_CONNECT`, `E_BLE_DISCONNECT`) instead. See
  [Lifecycle](../concepts/lifecycle.md#background-events).
- **Subscribe in the background only when the feature needs it.** A background
  subscription wakes your script all day, on every face. If it's optional,
  give the user a way to turn it off.
- **Compute from the time, don't count ticks.** Store a start time from
  `new Date().getTime()` and subtract, as
  [examples/countdown.js](../../examples/countdown.js) does. Then a late or
  skipped update doesn't lose time. Don't time anything with the `millis`
  argument of `button()`: it stops while the watch sleeps.
- **Keep the LED, buzzer and Bluetooth short.** Pair `Ollee.led_on()` with a
  timeout that turns it off, turn it off in `exit()` too, and batch data into
  few `Ollee.send` calls.

```js
// Good: wakes once a minute
const subscribe = E_CLOCK_MINUTE;
function enter() { draw(); }
function clock_minute() { draw(); }

// Avoid: keeps a high-power timer running all the time the face is shown,
// to change the display once a minute
function enter() { Ollee.setInterval(draw, 1000); }
```

### Make every feature work with the buttons

Wrist tilt (`tilt()`) and triple tap (`tap()`) are handy shortcuts, but don't
make them the only way to do something:

- The user can turn gestures off on their watch.
- Gesture detection isn't reliable: a tilt or tap can be missed, or set off by
  ordinary movement.

Every core feature must be reachable with **A** and **L** (short press, long
press, or `button()` for presses and releases). Use a gesture for a second
way to reach something the buttons already do. Remember that a long press
always comes after the short press of the same push. See
[Input](../concepts/input.md#short-and-long-press).

### Be robust

- **No uncaught errors.** An error in any hook or timer callback disables the
  face on the watch until it's reloaded. Watch the emulator's log for
  `Uncaught error, face would be disabled on watch`.
- **Leave and come back.** Press **M** several times. `exit()` should stop
  timers and reset stored timer ids to `-1`, and `enter()` should redraw the
  whole screen.
- **Draw only while on screen.** In background hooks, check `Ollee.active()`
  before drawing. Draw calls are ignored otherwise, but the work to prepare
  them isn't free.
- **Stay within 8158 bytes** of minified script. The size bar under the editor
  shows how much you're using.
- **Test on a real watch.** The watch runs Espruino, which doesn't support
  everything a browser does. Upload it to your own watch first (see
  [Deploying to your watch](deploying-to-watch.md)), and rewrite newer syntax
  in ES5 style if something fails there.

## Submitting from the emulator

You submit from the same **Upload** dialog you use to send a face to your own
watch. The emulator has to be served over HTTP (`python -m http.server 8000`,
then http://localhost:8000/), and you need an Ollee Watch app account. See
[Deploying to your watch](deploying-to-watch.md#uploading).

1. Open your face in the editor and click **Upload**. Sign in if you're asked to.
2. Choose the **Submit to App Store** tab.
3. Fill in the listing:

   | Field | Rules |
   | --- | --- |
   | App name | Up to 20 characters of plain ASCII. It's shown in the store and must be unique: once an app is approved, its name belongs to its developer. |
   | Version | Major and minor, each 0-99. Every submission needs a new version. |
   | Developer name | Up to 40 characters, shown publicly with your apps. |
   | Contact email | Private. Ollee emails you here about your submissions. |
   | Category | Daily, Tools, Game, Fitness or Other. |
   | Tags | Optional. Up to 5, separated by commas, each up to 20 characters. |
   | Summary | One line, up to 120 characters, shown in store listings. |
   | Description | Up to 2000 characters. See [Writing the description](#writing-the-description). |
   | Icon | A 512 × 512 pixel PNG or JPG of up to 200 KB. The Forge logo is filled in until you choose your own. |

4. Tick the box to confirm that you wrote the app or have the right to share
   it, and that Ollee Watch may review it and distribute it for free in the
   Forge App Store.
5. Click **Submit for review**.

The emulator sends two things: the **minified script**, which is what the store
gives to watches, and your **original source**. Only Ollee Watch reviewers see
the source. It's never published. Reviewers check that the minified script
comes from that source, so submit straight from the emulator, without editing
the minified output by hand.

### Writing the description

The description is how users decide whether to install your face, and the
reviewer tests your app against it. It should cover:

- **What the face does**, in a sentence or two.
- **What each button does**: short and long press of **A** and **L**, and any
  gestures (with the buttons that do the same thing).
- **What the display shows**: what's on the clock and day digits in each mode,
  including messages or abbreviations, and what the indicators (colon, LAP, PM,
  HR) mean.
- **Anything else it does**: beeps, the LED, background events (for example
  an hourly beep on every face), or a phone app it talks to over Bluetooth.

For example:

```
A countdown timer for cooking and workouts.

Buttons:
- A: start or pause the countdown.
- A (hold): reset to the last time set.
- L: add 1 minute. L (hold): add 10 minutes.
- Triple tap: start or pause (same as A).

Display:
- The main digits show minutes and seconds left (MM SS), with the colon
  blinking while it runs. The day digits show "go" while running and "PA"
  when paused.
- At zero the watch beeps three times and shows "donE" until you press a
  button.

It doesn't run in the background: leaving the face pauses the countdown.
```

## Review

```
 Submit ─► Waiting for review ─┬─► Approved ─► in the store
              │                ├─► Changes requested ─► fix, submit a new version
              ▼                └─► Rejected
          Withdrawn ─► Delete (frees the version number)
```

Under **Upload > Submit to App Store > My submissions** you can see each
version you've submitted and its status. Ollee also emails your contact
address when a submission has been reviewed.

> **Note:** A review typically takes about a week from submission.

| Status | What it means | What you can do |
| --- | --- | --- |
| Waiting for review | In the queue | **Withdraw** it, for example to submit a fix instead |
| Withdrawn | You withdrew it before review | **Delete** it to use its version number again |
| Changes requested | The reviewer's notes say what to fix | Fix it and submit a higher version |
| Rejected | It can't go in the store as it is. The notes say why | Address the notes if you can, and submit a higher version |
| Approved | It's published | Submit a higher version to update it |

- **One version of an app waits for review at a time.** To submit another
  version, withdraw the waiting one first.
- **A reviewed version is never changed.** A fix is always a new, higher
  version. Reviewed submissions stay in My submissions as a history.
- **Open** loads that version's source into the editor and runs the submitted
  script, so you can see what the reviewer saw. The Submit form fills in from
  that version, with the next version number, so a resubmission only needs
  your fixes.

### What reviewers check

A reviewer reads your source, runs the submitted script in the emulator, and
checks that:

- The minified script is within 8158 bytes and matches a fresh minify of the
  source.
- The name is plain ASCII and not another developer's published app, and the
  version is newer than the one in the store.
- The icon is 512 × 512, a PNG or JPG, and up to 200 KB.
- The face works as the description says, including every button and display
  state it lists.
- It follows the [best practices](#before-you-submit-best-practices): events
  rather than timers where they would do, timers stopped when not needed,
  every core feature reachable with the buttons, and no uncaught errors.
- The name, description, icon and anything the face displays are appropriate
  for everyone, don't copy or impersonate someone else's work or brand, and
  don't mislead users about what the face does.

## Publishing and updates

When a version is approved, it's published in the Forge App Store with its
name, summary, description, category, tags, icon and minified script. Your
developer name is shown with it. Your source and contact email are not.

<!-- TODO: where users find the store in the Ollee Watch app, and how they
     install a face from it, once the store screen ships. -->

- **Your app name is reserved for you.** Nobody else can submit an app with
  that name.
- **To update an app**, submit a higher version with the same name. It goes
  through review like the first one, and when it's approved it replaces the
  published version. Until then, users keep getting the current one.
- **Ollee can unlist an app**, which hides it from the store, for example if a
  problem turns up after publishing.

## Sharing outside the store

You can also share a face, or a work in progress, in the repo's
[Discussions](https://github.com/olleewatch/forge_emulator/discussions) or in
the Forge channel on the [Ollee Watch Discord](https://discord.gg/BsTnx7YcKm),
which is also a good place to ask questions and get feedback. Post:

- the script, in a ```` ```js ```` code block or as an attached `.js` file,
- what it does and what each button does,
- a photo or screenshot if you have one,
- whether you've tested it on a real watch.
