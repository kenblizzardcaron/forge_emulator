<picture>
  <source media="(prefers-color-scheme: dark)" srcset="ollee-forge-logo-dark.png">
  <img src="ollee-forge-logo-light.png" alt="Ollee Watch Forge" width="300">
</picture>

# Ollee Watch Forge (Beta 2)

Build custom watchfaces for the Ollee Watch ([www.olleewatch.com](https://www.olleewatch.com)) in plain JavaScript. The watch runs a
JavaScript interpreter, so your script runs on it as-is: no compiling, no SDK, no
toolchain to install. Write a short script against the simple `Ollee` API (by hand
or with an AI agent), test it in this browser emulator, then upload it to your watch.

Status:
- **Beta 2**: Emulator, plus uploading faces to the watch through the Ollee Watch app, and submitting them to the Forge App Store.

<!-- TODO: screenshot or GIF of the emulator running a watchface -->

## Quickstart
1. Clone the repository `git clone https://github.com/olleewatch/forge_emulator` or download the .zip package.
2. Host it locally. In the `forge_emulator` folder, start a local web server
   (needs [Python](https://www.python.org/downloads/)):
   ```
   python -m http.server 8000
   ```
   Then open [http://localhost:8000/](http://localhost:8000/) in your browser.
   You can also just open `index.html` directly, but uploading to the watch
   only works from the local server.
3. Click **Run**. The template face loads by default. Edit it in the browser,
   or use **Load file** to open one of the [examples](examples/).
4. Upload it to your watch. Click **Upload**, sign in with your Ollee Watch app
   account, then send it to the watch from the Ollee Watch app. See
   [Deploying to your watch](docs/guides/deploying-to-watch.md).

## Documentation
- 🚀 [Your first watchface](docs/getting-started/first-watchface.md)
- 🤖 [Building with AI agents](docs/getting-started/using-ai-agents.md)
- 📐 [How watchfaces work](docs/concepts/architecture.md)
- 📚 [API reference](docs/api/README.md)
- 🏪 [Publishing to the Forge App Store](docs/guides/publishing.md)
- 💡 [Examples](examples/)
- 📖 [All docs](docs/index.md)

## Community
Feedback, questions, bugs, and share your examples: [Discussions](../../discussions)

Join the discussion in the Forge channel on the [Ollee Watch Discord](https://discord.gg/BsTnx7YcKm).

## License

<!-- TODO: choose a license and add a LICENSE file. -->

Minification uses [Terser](https://github.com/terser/terser), vendored in
`js/vendor/` under its own license (`js/vendor/terser.LICENSE.txt`).
