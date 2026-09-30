# RC-144 sandbox profile source

This folder contains a candidate source artifact. It is not the GitHub organization profile.
The files can be visible in this public repository. They do not change the native profile.
The candidate does not grant hosted sandbox access or a free evaluation.
Use only fictitious data for any later product test.

The approved contact is [contacto@ripscloud.com](mailto:contacto@ripscloud.com).
The candidate keeps the mandatory PahFacturar Pro base separate from the proposed
RipsCloud component. It does not approve combined prices or production access.

## Local verification

Use Node.js 24. Source checks need no dependencies or credentials.

```sh
node scripts/verify-profile.mjs
node --test tests/*.test.mjs
git diff --check
```

These checks cover the sandbox source, known content rules, and the published-file baseline.
The workflow uses pinned actions, read-only permissions and fail-fast commands.
It has no secrets, deployment, publication, release or copy-to-profile step.
The guard is not a separate approval control. A PR can change its own checker;
independent review must compare its pins with the accepted baseline.
Source and render checks do not run the RC-120 native engine.
They do not prove hosted availability, official validation, CUV issuance or legal compliance.

## Local render

The optional renderer uses Marked 17.0.5 from an external tools directory.
It renders only the checked repository candidate, not arbitrary Markdown.
It embeds the existing icon. It uses local CSS and no page script or remote asset.
Keep new tools and generated files outside this and all other source checkouts.
Existing installed tools can be read without changing them.

Set `PROFILE_RENDER_MODULES` to an external `node_modules` directory with Marked 17.0.5.
Then run:

```sh
node scripts/render-profile.mjs /tmp/rc144-profile-preview
```

Open the generated `profile.html` locally. The renderer rejects output inside this checkout.
The output directory must be empty. All generated files use exclusive creation.
It does not overwrite an existing preview. Use a new external output directory for each run.
This is a neutral local Markdown preview, not an exact copy of GitHub's UI.

For automated local browser checks, also set `PROFILE_BROWSER_MODULES` to an external
directory with Playwright and `PROFILE_AXE_MODULES` to one with axe-core.
Use the existing installed browser. The check does not install a browser or start a server.

```sh
node scripts/test-profile-render.mjs /tmp/rc144-profile-browser-proof
```

The browser check keeps all assertions active at 320, 390 and 1280 pixels.
It checks accessibility, overflow, icon loading, heading structure, keyboard focus,
page and console errors, and external requests. Proof and screenshots stay outside source.
This optional render check is local only. CI checks source and regression tests only.

## Published baseline and future boundary

Accepted baseline: `651adec8d69b8419e0dc3e4f3c280a86c16aa48d`.
`README.md`, `profile/README.md` and both existing profile icons keep their exact bytes.
Keeping this baseline is a scope boundary, not approval of its existing product claims.
The source validator checks their byte lengths and SHA-256 values. It rejects missing files,
symlinks and executable source files. Both README pins are recorded here for review:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `README.md` | 455 | `6b0210ec8eac03e2f65e0e3be0e948b2515fac74e3fbfb54216dbffc29a7f308` |
| `profile/README.md` | 3922 | `fe78ab81dfef858460e2b1caa4390b56b5d7296f04f9d6f39202ac2add6dd09a` |

GitHub selects `profile/README.md` in the public `.github` repository as the organization
profile. It does not select `sandbox/profile/README.md`.
See [GitHub's profile documentation](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile).

A later copy into `profile/README.md` needs separate publication approval and a reviewed
baseline update. The sidebar contact, organization settings, DNS and hosted product state stay unchanged.
The historical RC-142 and RC-144 public criteria remain in the coordination record.
The coordinator owns ticket reconciliation, independent acceptance and merge.
This artifact does not claim live-profile or public-product acceptance.
