"""Exercise source/integrity rejection with disposable inputs, without Cargo."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("check-development-host-source.py")
REVISION = "eaa5bc489e8f8d245fd30821b4a4fbe1a9e35551"
SOURCE = f"git+https://github.com/LioRael/lenso?rev={REVISION}#{REVISION}"
VERSIONS = {"lenso": "0.5.29", "lenso-kernel": "0.3.12", "lenso-bun-adapter": "0.1.17",
            "lenso-runtime-codec": "0.4.4", "lenso-native-adapter": "0.3.20",
            "lenso-native-adapter-macros": "0.2.9", "lenso-app-plan": "0.4.6",
            "lenso-plugin-authoring": "0.2.0", "lenso-runner": "0.2.20"}


class SourceGuard(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.core = self.root / "core"
        for name, version in VERSIONS.items():
            path = self.core / "crates" / name / "Cargo.toml"
            path.parent.mkdir(parents=True)
            path.write_text(f'[package]\nname = "{name}"\nversion = "{version}"\n')
        self.facility = self.root / "packages/console-support"
        self.facility.mkdir(parents=True)
        self.facility.joinpath("Cargo.toml").write_text(
            f'[dependencies]\nlenso = {{ version = "=0.5.29", git = "https://github.com/LioRael/lenso", rev = "{REVISION}" }}\n')
        self.facility.joinpath("Cargo.lock").write_text(self.package("lenso", "0.5.29", SOURCE))
        self.generated = self.root / "seed/.lenso/generated-host"
        self.generated.mkdir(parents=True)
        self.lock = "".join(self.package(n, v, SOURCE) for n, v in VERSIONS.items())
        for name, content in {"Cargo.lock": self.lock, "Cargo.toml": "[package]\nname = 'fixture'\n",
                              "src/main.rs": "fn main() {}\n", "build.rs": "fn main() {}\n",
                              "local-inputs.json": "{}\n"}.items():
            path = self.generated / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        self.seal()

    @staticmethod
    def package(name, version, source):
        return f'[[package]]\nname = "{name}"\nversion = "{version}"\nsource = "{source}"\n\n'

    def seal(self):
        files = [{"path": ".lenso/generated-host/" + p.relative_to(self.generated).as_posix(),
                  "sha256": "sha256:" + hashlib.sha256(p.read_bytes()).hexdigest()}
                 for p in self.generated.rglob("*") if p.is_file()]
        (self.generated.parent / "distribution.lock.json").write_text(json.dumps({"files": files}))

    def run_guard(self, mode="runtime", passed=False):
        record = self.root / "record.json"
        command = [sys.executable, str(SCRIPT), mode, "--core", str(self.core), "--record", str(record)]
        if mode == "runtime":
            command += ["--seed", str(self.root / "seed"), "--kit", str(self.root / "kit")]
        result = subprocess.run(command, cwd=self.root, capture_output=True, text=True,
                                env={**os.environ, "CORE_REPOSITORY": "LioRael/lenso", "CORE_REVISION": REVISION})
        self.assertEqual(result.returncode == 0, passed, result.stdout + result.stderr)
        self.assertEqual(json.loads(record.read_text())["verified"], passed)
        return result

    def test_selected_source_passes_and_inputs_are_retained(self):
        self.run_guard("facility", True)
        self.run_guard(passed=True)
        self.assertEqual((self.root / "kit/build-inputs/generated-host/Cargo.lock").read_bytes(),
                         (self.generated / "Cargo.lock").read_bytes())

    def test_auth_legacy_build_codegen_and_normal_codegen_can_coexist(self):
        # Exact Auth699 build-codegen identity/edge from the real fa6e908 kit.
        # This is a source-guard fixture, not a complete Cargo build graph.
        registry = "registry+https://github.com/rust-lang/crates.io-index"
        auth_revision = "699bd9621bc2e7f8581f6c0ff0bcbfcb6e3c2167"
        auth_source = f"git+https://github.com/LioRael/lenso-auth-plugin?rev={auth_revision}#{auth_revision}"
        auth = self.package("lenso-capability-auth", "0.2.0", auth_source)
        auth += 'dependencies = ["lenso-contract-codegen 0.9.0", "lenso-kernel", "lenso-plugin-authoring"]\n'
        lock = self.lock + auth
        for version in ["0.9.0", "0.10.2"]:
            lock += self.package("lenso-contract-codegen", version, registry)
        (self.generated / "Cargo.lock").write_text(lock)
        self.seal()
        self.run_guard(passed=True)

    def test_different_runtime_version_at_same_git_revision_fails(self):
        (self.generated / "Cargo.lock").write_text(self.lock + self.package("lenso-kernel", "0.3.11", SOURCE))
        self.seal()
        self.run_guard()

    def test_legacy_registry_runtime_codec_is_not_a_build_codegen_exception(self):
        legacy = self.package("lenso-runtime-codec", "0.3.4", "registry+https://github.com/rust-lang/crates.io-index")
        (self.generated / "Cargo.lock").write_text(self.lock + legacy)
        self.seal()
        self.run_guard()

    def test_only_wrong_runtime_version_fails(self):
        (self.generated / "Cargo.lock").write_text(self.lock.replace('version = "0.1.17"', 'version = "0.1.16"'))
        self.seal()
        self.run_guard()

    def test_missing_normal_anchor_fails_before_compile(self):
        self.facility.joinpath("Cargo.toml").write_text("[dependencies]\n")
        self.run_guard("facility")

    def test_optional_anchor_fails(self):
        path = self.facility / "Cargo.toml"
        path.write_text(path.read_text().replace('version = "=0.5.29",', 'optional = true, version = "=0.5.29",'))
        self.run_guard("facility")

    def test_registry_runtime_fails_even_when_version_matches(self):
        (self.generated / "Cargo.lock").write_text(self.lock.replace(SOURCE, "registry+https://github.com/rust-lang/crates.io-index", 1))
        self.seal()
        self.run_guard()

    def test_wrong_resolved_revision_fails(self):
        (self.generated / "Cargo.lock").write_text(self.lock.replace("#" + REVISION, "#" + "0" * 40, 1))
        self.seal()
        self.run_guard()

    def test_duplicate_selected_runtime_fails(self):
        (self.generated / "Cargo.lock").write_text(self.lock + self.package("lenso-bun-adapter", "0.1.17", SOURCE))
        self.seal()
        self.run_guard()

    def test_missing_runtime_package_fails(self):
        (self.generated / "Cargo.lock").write_text(self.lock.replace(self.package("lenso-kernel", "0.3.12", SOURCE), ""))
        self.seal()
        self.run_guard()

    def test_tampered_locked_input_fails(self):
        (self.generated / "src/main.rs").write_text("fn changed() {}\n")
        self.run_guard()


if __name__ == "__main__":
    unittest.main()
