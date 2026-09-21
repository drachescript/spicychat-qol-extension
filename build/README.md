# Build profiles

This directory is the source-of-truth for the first stage of SpicyChat QoL's modular build system.

## Current state

- **Full** is the only buildable profile and remains the default/reference extension.
- **Recommended Lite** exists only as a draft recipe. The builder intentionally refuses to package it yet.
- Runtime bundle names match the bundle boundaries already understood by `content/runtime-kernel.js` and `content/runtime-plan.js`.
- The build system validates that every runtime/content-script file is assigned to at least one bundle.

This stage is intentionally conservative: it prepares Lite/custom builds without changing the public Full build's behavior.

## Commands

Windows:

```bat
python scripts/build_extension.py
python scripts/build_extension.py --dev
python scripts/build_extension.py --profile full
python scripts/build_extension.py --profile full --dev
python scripts/build_extension.py --list-profiles
python scripts/build_extension.py --verify-only
```

Linux/macOS:

```bash
python3 scripts/build_extension.py --profile full
```

## Next steps

1. Verify generated Full packages behave exactly like the current Full extension.
2. Refine bundle boundaries where smaller physical packages need more granularity.
3. Finalize the Recommended Lite recipe.
4. Reuse the same profile/recipe format for the website builder and later Android packaging.

## Windows helper builds

The builder can write packages directly to the repository `dev_build` folder:

```bat
python scripts\build_extension.py --profile full --output-dir dev_build
python scripts\build_extension.py --profile full --dev --output-dir dev_build
```

The BAT helpers in `dev_build\` use this option automatically. Draft profiles such as Recommended Lite stay blocked until their profile is explicitly marked buildable.
