use std::io::Read as _;

use axum::{
    body::{Body, Bytes, to_bytes},
    http::{HeaderMap, header},
};
use flate2::read::GzDecoder;

pub(super) const MAX_ENCODED_BYTES: usize = 4 * 1024 * 1024;
pub(super) const MAX_DECODED_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Copy, Debug)]
pub(super) enum BodyError {
    EncodedTooLarge,
    DecodedTooLarge,
    InvalidGzip,
    WorkerUnavailable,
}

pub(super) async fn decode(headers: &HeaderMap, body: Body) -> Result<Bytes, BodyError> {
    let gzip = headers
        .get(header::CONTENT_ENCODING)
        .is_some_and(|value| value == "gzip");
    let limit = if gzip {
        MAX_ENCODED_BYTES
    } else {
        MAX_DECODED_BYTES
    };
    let encoded = to_bytes(body, limit)
        .await
        .map_err(|_| BodyError::EncodedTooLarge)?;
    if !gzip {
        return Ok(encoded);
    }
    tokio::task::spawn_blocking(move || decompress(&encoded))
        .await
        .map_err(|_| BodyError::WorkerUnavailable)?
}

fn decompress(encoded: &[u8]) -> Result<Bytes, BodyError> {
    let mut decoded = Vec::new();
    GzDecoder::new(encoded)
        .take(u64::try_from(MAX_DECODED_BYTES).expect("decoded limit fits u64") + 1)
        .read_to_end(&mut decoded)
        .map_err(|_| BodyError::InvalidGzip)?;
    if decoded.len() > MAX_DECODED_BYTES {
        return Err(BodyError::DecodedTooLarge);
    }
    Ok(Bytes::from(decoded))
}
