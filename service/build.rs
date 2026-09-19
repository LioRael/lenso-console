use std::{env, fmt::Write as _, fs, path::Path};
fn main() {
    println!("cargo:rerun-if-changed=../dist/client");
    let mut files = Vec::new();
    if env::var_os("CARGO_FEATURE_EMBEDDED_SHELL").is_some() {
        let root = Path::new("../dist/client");
        assert!(
            root.join("index.html").is_file(),
            "build Console Shell before building embedded-shell"
        );
        collect(root, root, &mut files);
    }
    files.sort();
    let mut entries = String::new();
    for (name, path) in files {
        write!(
            &mut entries,
            "({name:?}, include_bytes!({path:?}) as &[u8]),"
        )
        .unwrap();
    }
    fs::write(
        Path::new(&env::var("OUT_DIR").unwrap()).join("shell.rs"),
        format!("const EMBEDDED_SHELL: &[(&str, &[u8])] = &[{entries}];"),
    )
    .unwrap();
}
fn collect(root: &Path, directory: &Path, files: &mut Vec<(String, String)>) {
    for entry in fs::read_dir(directory).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        let kind = entry.file_type().unwrap();
        if kind.is_dir() {
            collect(root, &path, files);
        } else {
            assert!(kind.is_file(), "Shell assets must be regular files");
            files.push((
                path.strip_prefix(root)
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .replace('\\', "/"),
                fs::canonicalize(path).unwrap().to_str().unwrap().to_owned(),
            ));
        }
    }
}
