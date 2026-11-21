//! What the shell does with things the OS hands it: `thoth:` links and PDF files.

use std::path::PathBuf;

/// Something to open once the server is ready.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Pending {
    /// An app path such as `/content/abc?at=p.3`.
    Navigate(String),
    /// A PDF to upload, then open.
    Pdf(PathBuf),
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Maps a `thoth:` link (format: `packages/core/src/domain/link.ts`) to an app path.
///
/// Accepts `thoth:c/<id>?at=p.3` and the `thoth://c/<id>?at=p.3` form that OS URL handlers use.
/// Only `at` and `q` survive, re-encoded, so a link cannot smuggle other parameters. Kinds with
/// no page of their own (`a/`, `s/`) open nothing.
pub fn link_to_path(uri: &str) -> Option<String> {
    let rest = uri.strip_prefix("thoth:")?;
    let rest = rest.trim_start_matches('/');
    let (path, query) = match rest.split_once('?') {
        Some((p, q)) => (p, q),
        None => (rest, ""),
    };
    let mut parts = path.trim_end_matches('/').split('/');
    let kind = parts.next()?;
    let id = parts.next()?;
    if parts.next().is_some() || !valid_id(id) {
        return None;
    }
    match kind {
        "c" => {
            let mut out = url::form_urlencoded::Serializer::new(String::new());
            let mut any = false;
            for (k, v) in url::form_urlencoded::parse(query.as_bytes()) {
                if (k == "at" || k == "q") && !v.is_empty() && v.len() <= 2000 {
                    out.append_pair(&k, &v);
                    any = true;
                }
            }
            let qs = out.finish();
            Some(if any {
                format!("/content/{id}?{qs}")
            } else {
                format!("/content/{id}")
            })
        }
        "space" => Some(format!("/spaces/{id}")),
        _ => None,
    }
}

/// Reads one OS-provided argument or URL: a `thoth:` link, a `file://` URL or a path to a PDF.
pub fn classify(arg: &str) -> Option<Pending> {
    if arg.starts_with("thoth:") {
        return link_to_path(arg).map(Pending::Navigate);
    }
    let path = if arg.starts_with("file://") {
        url::Url::parse(arg).ok()?.to_file_path().ok()?
    } else {
        PathBuf::from(arg)
    };
    let is_pdf = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"));
    (is_pdf && path.is_file()).then_some(Pending::Pdf(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_links() {
        assert_eq!(link_to_path("thoth:c/abc_1").as_deref(), Some("/content/abc_1"));
        assert_eq!(
            link_to_path("thoth:c/abc?at=p.3").as_deref(),
            Some("/content/abc?at=p.3")
        );
        assert_eq!(
            link_to_path("thoth://c/abc?at=t.201&q=hello%20world").as_deref(),
            Some("/content/abc?at=t.201&q=hello+world")
        );
    }

    #[test]
    fn drops_unknown_params_and_bad_ids() {
        assert_eq!(
            link_to_path("thoth:c/abc?at=p.3&next=//evil").as_deref(),
            Some("/content/abc?at=p.3")
        );
        assert_eq!(link_to_path("thoth:c/../settings"), None);
        assert_eq!(link_to_path("thoth:c/a/b"), None);
        assert_eq!(link_to_path("thoth:c/"), None);
        assert_eq!(link_to_path("https://example.com"), None);
    }

    #[test]
    fn other_kinds() {
        assert_eq!(link_to_path("thoth:space/s1").as_deref(), Some("/spaces/s1"));
        assert_eq!(link_to_path("thoth:a/ann1"), None);
        assert_eq!(link_to_path("thoth:s/set1?q=x"), None);
    }

    #[test]
    fn classify_args() {
        assert_eq!(
            classify("thoth://c/x"),
            Some(Pending::Navigate("/content/x".into()))
        );
        assert_eq!(classify("--some-flag"), None);
        assert_eq!(classify("/no/such/file.pdf"), None);
    }
}
