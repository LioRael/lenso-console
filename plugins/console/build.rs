use std::{
    env,
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
};
fn main() {
    println!("cargo:rerun-if-env-changed=LENSO_CONSOLE_SHELL_ROOT");
    let mut files = Vec::new();
    if env::var_os("CARGO_FEATURE_EMBEDDED_SHELL").is_some() {
        let root = env::var_os("LENSO_CONSOLE_SHELL_ROOT").map_or_else(
            || PathBuf::from("../../apps/shell/dist/client"),
            |value| {
                let root = PathBuf::from(value);
                assert!(
                    root.is_absolute(),
                    "LENSO_CONSOLE_SHELL_ROOT must be an absolute path"
                );
                root
            },
        );
        println!("cargo:rerun-if-changed={}", root.display());
        assert!(
            root.join("index.html").is_file(),
            "build Console Shell before building embedded-shell; set LENSO_CONSOLE_SHELL_ROOT to its absolute dist/client directory when consuming the Git package"
        );
        collect(&root, &root, &mut files);
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
        format!(
            "const EMBEDDED_SHELL: &[(&str, &[u8])] = &[{entries}];\n{}",
            shell_routes()
        ),
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

// The frontend's generated route table remains the only owner of built-in URLs.
// Its splat belongs to the admitted workspace catalog, not a blanket HTML fallback.
fn shell_routes() -> String {
    let source = Path::new("../../apps/shell/src/routeTree.gen.ts");
    println!("cargo:rerun-if-changed={}", source.display());
    // Compile the tracked frontend manifest with this build script. Cargo
    // consumers may execute it from another directory with external assets.
    let tree = include_str!("../../apps/shell/src/routeTree.gen.ts");
    let routes = tree
        .split_once("export interface FileRoutesByFullPath {")
        .and_then(|(_, routes)| routes.split_once('}'))
        .expect("Console route table must expose FileRoutesByFullPath")
        .0;
    let mut entries = String::new();
    for line in routes.lines() {
        let Some((route, _)) = line
            .trim()
            .strip_prefix('\'')
            .and_then(|line| line.split_once('\''))
        else {
            continue;
        };
        if route == "/$" {
            continue;
        }
        assert!(route.starts_with('/'), "Console route must be absolute");
        let segments = route
            .split('/')
            .filter(|part| !part.is_empty())
            .map(|part| {
                part.strip_prefix('$')
                    .map_or_else(|| part.to_owned(), |name| format!("[{name}]"))
            })
            .collect::<Vec<_>>();
        write!(&mut entries, "&{segments:?},").unwrap();
    }
    assert!(
        !entries.is_empty(),
        "Console must register its built-in routes"
    );
    format!("const SHELL_PAGE_ROUTES: &[&[&str]] = &[{entries}];")
}
