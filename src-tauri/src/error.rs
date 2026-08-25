use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("找不到 git，请安装并确保在 PATH 中")]
    GitNotFound,
    #[error("git 超时")]
    Timeout,
    #[error("git 失败 (code={code}): {stderr}")]
    GitFailed { code: i32, stderr: String },
    #[error("IO: {0}")]
    Io(String),
    #[error("{0}")]
    Message(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
