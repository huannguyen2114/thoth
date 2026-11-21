//! Plain HTTP to the local server: the health poll and the PDF upload.

use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Matches `MAX_UPLOAD_BYTES` in `apps/web/src/features/library/limits.ts`.
pub const MAX_UPLOAD_BYTES: u64 = 50 * 1024 * 1024;

fn agent(timeout: Duration) -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(timeout))
        .build()
        .into()
}

/// True when `GET /api/health` answers 200.
pub fn healthy(port: u16) -> bool {
    agent(Duration::from_secs(5))
        .get(&format!("http://127.0.0.1:{port}/api/health"))
        .call()
        .map(|r| r.status().as_u16() == 200)
        .unwrap_or(false)
}

fn header_safe(name: &str) -> String {
    name.chars()
        .map(|c| if c == '"' || c == '\\' || c.is_control() { '_' } else { c })
        .collect()
}

/// POSTs a PDF to `/api/upload` (the same route the library's upload button uses) and returns
/// the new content id. Errors are messages for the owner.
pub fn upload_pdf(port: u16, path: &Path) -> Result<String, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("Could not read the file: {e}"))?;
    if meta.len() > MAX_UPLOAD_BYTES {
        return Err("This file is over 50 MB. Choose a smaller PDF, or split it first.".into());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("Could not read the file: {e}"))?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(header_safe)
        .unwrap_or_else(|| "Untitled.pdf".into());
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let boundary = format!("----thoth-desktop-{nanos:x}");

    let mut body = Vec::with_capacity(bytes.len() + 512);
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n").as_bytes(),
    );
    body.extend_from_slice(b"Content-Type: application/pdf\r\n\r\n");
    body.extend_from_slice(&bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let mut res = agent(Duration::from_secs(120))
        .post(&format!("http://127.0.0.1:{port}/api/upload"))
        .header("Content-Type", &format!("multipart/form-data; boundary={boundary}"))
        .send(&body[..])
        .map_err(|e| format!("Could not reach the Thoth server: {e}"))?;
    let status = res.status().as_u16();
    let text = res
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Could not read the server's answer: {e}"))?;
    let json: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    if status == 201 {
        if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
            return Ok(id.to_string());
        }
    }
    Err(json
        .get("error")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| format!("The upload failed (HTTP {status}).")))
}
