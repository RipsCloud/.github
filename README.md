# RipsCloud GitHub Organization Profile

This repository powers the public GitHub organization profile for
[RipsCloud](https://ripscloud.com).

It is static and low-maintenance. RipsCloud is pre-production. The current
source describes local and sandbox development only. The canonical contact is
[contacto@ripscloud.com](mailto:contacto@ripscloud.com).

Do not place application source code, secrets, customer data, certificates,
generated builds, or operational runbooks in this repository.

## Source checks

Use Node.js 24. No dependencies or credentials are needed.

```sh
node scripts/verify-profile.mjs
node --test tests/profile.test.mjs
git diff --check
```

The PR workflow runs the profile check and regression tests. It has no deploy step or write
permission. These checks do not test a hosted product or official validation.

## Publication boundary

GitHub displays `profile/README.md` from the default branch on the public
organization profile. A merge into `main` is a publication action, not a sandbox
test. Do not merge this sandbox source change without separate publication
approval. See [GitHub's profile documentation](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile).

The organization sidebar email and description are separate settings. This
source change does not update them or the public website. RC-142 and RC-144
remain open until their applicable acceptance criteria are met.
