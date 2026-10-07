"""Check the declared facility source and retain actual native runtime inputs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tomllib
from urllib.parse import parse_qs, urlsplit


def read_toml(path):
    return tomllib.loads(path.read_text())


def require_source(source, repository, revision, resolved):
    if not isinstance(source, str) or not source.startswith("git+"):
        raise ValueError("native framework must use the selected Git source")
    url = urlsplit(source[4:])
    if (url.scheme != "https" or url.netloc != "github.com"
            or url.path.strip("/").removesuffix(".git").lower() != repository.lower()
            or parse_qs(url.query).get("rev") != [revision]
            or (resolved and url.fragment != revision)):
        raise ValueError("native framework source differs from qualified Core")


def require_owner_versions(core_version):
    # Cargo patches select a source for a version; a broad normal dependency
    # may still choose a newer registry version and split public Rust types.
    expected = {name: "=" + core_version(name) for name in
                ["lenso", "lenso-kernel", "lenso-runtime-codec", "lenso-native-adapter-macros"]}
    manifests = [Path("plugins/console/Cargo.toml"),
                 *sorted(Path("contracts").glob("*/Cargo.toml"))]
    checked = {}
    for path in manifests:
        dependencies = read_toml(path).get("dependencies", {})
        selected = {name: value for name, value in dependencies.items() if name in expected}
        for name, value in selected.items():
            if value != expected[name]:
                raise ValueError(f"{path}: {name} must require {expected[name]} for the selected "
                                 f"development Host; available requirement {value!r}. "
                                 "Align the owner cohort before compiling; a Git producer pin "
                                 "does not constrain newer registry versions.")
        checked[str(path)] = selected
    return checked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["facility", "runtime"])
    parser.add_argument("--core", required=True, type=Path)
    parser.add_argument("--seed", type=Path)
    parser.add_argument("--kit", type=Path)
    parser.add_argument("--record", required=True, type=Path)
    args = parser.parse_args()
    if args.mode == "runtime" and args.seed is None:
        parser.error("runtime mode requires --seed")
    repository = os.environ["CORE_REPOSITORY"]
    revision = os.environ["CORE_REVISION"].lower()
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Core revision must be an immutable full SHA")
    core_version = lambda name: read_toml(args.core / "crates" / name / "Cargo.toml")["package"]["version"]
    record = {"schema": "lenso.console-native-runtime-source.v1", "scope": args.mode,
              "core_repository": repository, "core_revision": revision, "verified": False}
    args.record.parent.mkdir(parents=True, exist_ok=True)
    args.record.write_text(json.dumps(record, indent=2) + "\n")
    if args.mode == "facility":
        record["owner_runtime_requirements"] = require_owner_versions(core_version)
        manifest = read_toml(Path("packages/console-support/Cargo.toml"))
        anchor = manifest["dependencies"]["lenso"]
        require_source(f"git+{anchor['git']}?rev={anchor['rev']}", repository, revision, False)
        if anchor.get("optional") or anchor.get("version") != "=" + core_version("lenso"):
            raise ValueError("native facility must select the exact normal Core facade")
        packages = read_toml(Path("packages/console-support/Cargo.lock"))["package"]
        selected = [p for p in packages if p["name"] == "lenso"
                    and p["version"] == core_version("lenso") and p.get("source", "").startswith("git+")]
        if len(selected) != 1:
            raise ValueError("facility lock must resolve one selected Core facade")
        require_source(selected[0]["source"], repository, revision, True)
        record["declared_facade"] = selected[0]
    else:
        generated = args.seed / ".lenso/generated-host"
        packages = read_toml(generated / "Cargo.lock")["package"]
        record["packages"] = [{k: p.get(k) for k in ("name", "version", "source")} for p in packages]
        args.record.parent.mkdir(parents=True, exist_ok=True)
        args.record.write_text(json.dumps(record, indent=2) + "\n")
        required = ["lenso", "lenso-kernel", "lenso-bun-adapter", "lenso-runtime-codec",
                    "lenso-native-adapter", "lenso-native-adapter-macros", "lenso-app-plan",
                    "lenso-plugin-authoring", "lenso-runner"]
        runtime = []
        for name in required:
            # This Console Host uses Core's current runtime profile. Generator
            # versions may coexist, but none of these runtime identities may.
            matches = [p for p in packages if p["name"] == name]
            if len(matches) != 1:
                raise ValueError(f"generated Host must resolve one selected {name}")
            if matches[0]["version"] != core_version(name):
                raise ValueError(f"generated Host {name} version differs from qualified Core")
            try:
                require_source(matches[0].get("source"), repository, revision, True)
            except ValueError as error:
                raise ValueError(f"generated Host {name}: {error}") from error
            runtime.append({k: matches[0][k] for k in ("name", "version", "source")})
        record["runtime_framework_packages"] = runtime
        lock_path = args.seed / ".lenso/distribution.lock.json"
        lock = json.loads(lock_path.read_text())
        locked = {p["path"]: p["sha256"] for p in lock["files"]}
        inputs = {}
        for name in ["Cargo.lock", "Cargo.toml", "src/main.rs", "build.rs", "local-inputs.json"]:
            path = generated / name
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if locked.get(".lenso/generated-host/" + name) != "sha256:" + digest:
                raise ValueError(f"generated Host input failed distribution integrity: {name}")
            inputs[name] = digest
        record["generated_host_inputs_sha256"] = inputs
        record["distribution_lock_sha256"] = hashlib.sha256(lock_path.read_bytes()).hexdigest()
        if args.kit:
            destination = args.kit / "build-inputs/generated-host"
            destination.mkdir(parents=True, exist_ok=True)
            for name in inputs:
                output = destination / name
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(generated / name, output)
            shutil.copyfile(lock_path, args.kit / "build-inputs/distribution.lock.json")
    record["verified"] = True
    args.record.parent.mkdir(parents=True, exist_ok=True)
    args.record.write_text(json.dumps(record, indent=2) + "\n")
    if args.kit:
        shutil.copyfile(args.record, args.kit / "build-inputs/native-runtime-sources.json")
    print(f"Verified {args.mode} Core source {repository}@{revision}")


if __name__ == "__main__":
    main()
