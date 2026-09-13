# Install source extensions in Inkrail Open

Open **Extensions** in your running Inkrail Open app. Under **Add repository**, enter:

**Repository index URL**

```text
https://raw.githubusercontent.com/castrix/inkrail-sources/main/repository/index.json
```

**Publisher SHA-256 fingerprint**

```text
cfc683ef1fc8e8504bbdb899ba839116eb6deb120b7aa07e18ca91bf1f624436
```

1. Compare the fingerprint with the one published in this repository, then check **I trust this publisher**. Extensions execute code on your computer.
2. Select **Add repository**. Its available packages appear below the Installed section.
3. Select **Install** beside **MangaDex** or **TWKAN**.
4. Under **Installed**, select **Browse**. No application rebuild or restart is needed.

The two `example-*` packages are synthetic demos, not website catalogs. The dedicated adult adapters are excluded from this public repository. MangaDex has a mixed catalog, so its manifest retains the ADULT classification; use its content visibility settings as desired. See [MangaDex configuration](../packages/mangadex/README.md).

Paste the **index.json URL**, not the GitHub repository homepage, a website URL such as mangadex.org, a package's source file, or a Tachiyomi APK link. The index provides signed metadata and download URLs for the compatible `.inkrail.json` packages.

For updates, select **Check for updates** beside the repository name, then **Update** on the package. Optional browser-based sources may require **Settings > Install browser support** in the Windows tray. An extension install does not download books automatically.

If adding the repository fails, check that the entire URL and fingerprint were copied, and that your computer can access `raw.githubusercontent.com`. If browsing MangaDex fails afterward, see its network troubleshooting notes; installing an extension does not bypass an ISP block.

## Maintainers: update the public catalog

Use the persistent publisher key in the ignored local `.keys/publisher.pem` (or your secure backup). Never commit this key. Keep a secure backup: replacing it changes the publisher fingerprint and breaks existing trust.

Set `INKRAIL_SIGNING_KEY` to that key and `INKRAIL_RELEASE_BASE_URL` to `https://raw.githubusercontent.com/castrix/inkrail-sources/main/repository/`, then run:

```sh
npm run build
node scripts/publish-catalog.mjs
```

Review and commit the public `repository/` files, then push. The preparation script verifies signatures, checksums, the public package list, and immutable package versions. Bump the package version before changing an already published bundle. Keep old versioned package files available. Only signed public artifacts belong in `repository/`; local adapters and private configuration stay excluded.
