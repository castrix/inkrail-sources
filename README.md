# Inkrail sources

[Inkrail Open application](https://github.com/castrix/inkrail-open) · [Installable source packages](https://github.com/castrix/inkrail-sources)

Independent source packages for Inkrail protocol v1. Website code lives here, not in the core application. Each package can be released, installed, and updated independently while Inkrail is running.

Public adapters: TWKAN (novels) and MangaDex (multilingual chapter-based manga). The two `example-*` packages contain explicitly synthetic content for authoring and integration tests. None of these packages contains a downloaded library, user database, sessions, or private configuration. MangaDex retains its mixed-catalog content rating and visibility settings.

See [MangaDex settings and behavior](packages/mangadex/README.md) for language selection, content visibility, stable chapter-page locators, and network requirements.

## Test and build

Requires Node.js 24 or newer.

```sh
npm ci
npm test
```

Generate your own persistent Ed25519 signing key outside Git. Set `INKRAIL_SIGNING_KEY` to its PEM path and `INKRAIL_RELEASE_BASE_URL` to the HTTPS directory where you will publish releases. Then:

```sh
npm run build
```

Publish only the contents of `dist/public/` to that directory. `public-packages.json` explicitly selects the public packages; ignored local adapters are never automatically discovered or bundled. Do not upload older files from the parent `dist/` folder. Build prints the SHA-256 fingerprint of the public key. Publish that fingerprint where users can independently verify it. Users add your `index.json` URL and fingerprint in Inkrail's Extensions page, trust the publisher, and install sources. There is no preconfigured public catalog in this checkout.

For development, use a disposable key in ignored `work/`, set the release base to `http://127.0.0.1:4101/`, build, and run `npm run serve`. Do not use the local development key for public releases.

## Package structure

`packages/<id>/manifest.json` declares identity, version, capabilities, filters, and settings. `index.ts` exports a default source object. `src/` contains parser and transport helpers; esbuild includes only needed code in each prebuilt `index.mjs`. Playwright and impit remain runner-provided dependencies in protocol v1. No npm install/build scripts execute when a user installs a package.

Use an `example-*` package to implement a new source. Copy `extensions/sdk.ts` from the Inkrail core repository for the TypeScript contract and read its `docs/extensions.md`. Sources must not import Prisma or Inkrail application modules. Return metadata/content; let core own persistence and job state. Source-specific secrets are passed through `context.config`; `DATA_DIR` points to a private source state directory.

Publish a new numeric semver version to update. Do not change IDs or overwrite old releases. Key rotation requires an explicit ownership migration; users cannot silently switch publishers for an existing source ID.

Sources execute as trusted code under the host user's permissions. Separate processes provide crash isolation, not a security sandbox. Website changes, rate limits, browser challenges, and authentication can still prevent a source from working. Parser tests use synthetic fixtures and are not live availability guarantees.

## License

MIT for original source code. Bundled/upstream dependencies retain their licenses; see `THIRD_PARTY.md` and the lockfile. Preserve bundle legal comments and notices when distributing packages.
