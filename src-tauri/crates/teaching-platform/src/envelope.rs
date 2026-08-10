use crate::error::{ApiError, PlatformError, Result};
use serde::de::DeserializeOwned;
use serde::Deserialize;

/// 后端所有 HTTP 响应共用的外层结构。
#[derive(Debug, Deserialize)]
pub struct Envelope<T> {
    #[serde(default)]
    pub code: i32,
    #[serde(default)]
    pub message: String,
    pub data: Option<T>,
    #[serde(default)]
    pub request_id: Option<String>,
}

impl<T> Envelope<T> {
    fn check(&self) -> Result<()> {
        if self.code == 0 {
            return Ok(());
        }
        Err(PlatformError::Api(ApiError {
            code: self.code,
            message: self.message.clone(),
        }))
    }

    pub fn into_data(self) -> Result<T> {
        self.check()?;
        self.data
            .ok_or_else(|| PlatformError::Decode("响应缺少 data 字段".into()))
    }

    pub fn into_unit(self) -> Result<()> {
        self.check()
    }
}

/// 先按 HTTP 状态码分流，再用业务码区分原因——顺序与 HTTP 对接文档 §3 的建议一致。
async fn read_body(response: reqwest::Response) -> Result<(u16, String)> {
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| PlatformError::Http(e.to_string()))?;
    Ok((status, body))
}

pub async fn read_envelope<T: DeserializeOwned>(response: reqwest::Response) -> Result<T> {
    let (status, body) = read_body(response).await?;
    match serde_json::from_str::<Envelope<T>>(&body) {
        Ok(envelope) => envelope.into_data(),
        Err(_) if !(200..300).contains(&status) => Err(PlatformError::Status {
            status,
            message: body,
        }),
        Err(e) => Err(PlatformError::Decode(format!("响应不是标准信封：{e}"))),
    }
}

pub async fn read_envelope_unit(response: reqwest::Response) -> Result<()> {
    let (status, body) = read_body(response).await?;
    match serde_json::from_str::<Envelope<serde_json::Value>>(&body) {
        Ok(envelope) => envelope.into_unit(),
        Err(_) if !(200..300).contains(&status) => Err(PlatformError::Status {
            status,
            message: body,
        }),
        Err(e) => Err(PlatformError::Decode(format!("响应不是标准信封：{e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Debug, Deserialize, PartialEq)]
    struct Payload {
        name: String,
    }

    fn parse(raw: &str) -> Result<Payload> {
        serde_json::from_str::<Envelope<Payload>>(raw)
            .map_err(|e| PlatformError::Decode(e.to_string()))?
            .into_data()
    }

    #[test]
    fn code_为_0_时取出_data() {
        let parsed = parse(r#"{"code":0,"message":"ok","data":{"name":"甲"}}"#).unwrap();
        assert_eq!(parsed, Payload { name: "甲".into() });
    }

    #[test]
    fn code_非_0_时转成_api_错误并保留中文文案() {
        let error = parse(r#"{"code":40101,"message":"凭证无效","data":null}"#).unwrap_err();
        match error {
            PlatformError::Api(api) => {
                assert_eq!(api.code, 40101);
                assert_eq!(api.message, "凭证无效");
            }
            other => panic!("应为 Api 错误，实际是 {other:?}"),
        }
    }

    #[test]
    fn code_为_0_但_data_缺失时报解析错误() {
        let error = parse(r#"{"code":0,"message":"ok"}"#).unwrap_err();
        assert!(matches!(error, PlatformError::Decode(_)));
    }

    #[test]
    fn 缺少_code_字段时按成功处理() {
        // 少数接口省略 code，文档约定等价于 0
        let parsed = parse(r#"{"data":{"name":"乙"}}"#).unwrap();
        assert_eq!(parsed.name, "乙");
    }

    #[test]
    fn into_unit_忽略_data_只看_code() {
        let ok: Envelope<serde_json::Value> =
            serde_json::from_str(r#"{"code":0,"message":"ok","data":null}"#).unwrap();
        assert!(ok.into_unit().is_ok());

        let bad: Envelope<serde_json::Value> =
            serde_json::from_str(r#"{"code":50001,"message":"服务异常"}"#).unwrap();
        assert!(matches!(bad.into_unit(), Err(PlatformError::Api(_))));
    }
}
