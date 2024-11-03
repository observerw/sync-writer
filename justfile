publish semver="patch":
    pnpm package
    vsce publish {{semver}} --no-dependencies