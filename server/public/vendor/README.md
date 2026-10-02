# Bundled renderer dependencies

- dompurify 3.4.16: `purify.min.js` / SHA-256 `2c90a9b46d6463f26038a29b686e82bc91de01fdac9d5229e7cfe3b360134ea2`
- showdown 2.1.0: `showdown.min.js` / SHA-256 `88eb6fbbe0c270ddf3384aee0c9620d070e090a26e07c67421ae36c903b5d649`

Sources: https://github.com/cure53/DOMPurify and https://github.com/showdownjs/showdown.
Downloaded from the npm registry, bundled locally; no runtime CDN requests.
Full upstream licenses are included alongside the JavaScript files.
0.3.1 uses DOMPurify only for final-screen HTML. Showdown is retained as an unused 0.3.0 dependency; it is not loaded by the reader. Untrusted HTML is isolated in a script-disabled iframe.
