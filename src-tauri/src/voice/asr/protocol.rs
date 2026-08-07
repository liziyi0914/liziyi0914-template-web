//! DashScope 实时语音识别的 WebSocket 帧编解码。纯函数，不碰网络。

use serde_json::{json, Value};

use crate::voice::error::{Result, VoiceError};

/// 服务端下行事件，尚未附加句子序号。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServerEvent {
    Started,
    Sentence {
        text: String,
        begin_time: i64,
        is_final: bool,
    },
    Finished,
    Failed {
        message: String,
    },
}

/// 官方文档要求 UUID 格式（带短横），示例形如 `2bf83b9a-baeb-4fda-8d9a-xxxxxxxxxxxx`。
pub fn new_task_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn run_task_frame(
    task_id: &str,
    model: &str,
    sample_rate: u32,
    vocabulary_id: Option<&str>,
) -> String {
    let mut parameters = json!({
        "sample_rate": sample_rate,
        "format": "pcm"
    });
    if let Some(id) = vocabulary_id {
        let id = id.trim();
        if !id.is_empty() {
            parameters["vocabulary_id"] = json!(id);
        }
    }
    json!({
        "header": {
            "action": "run-task",
            "task_id": task_id,
            "streaming": "duplex"
        },
        "payload": {
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": model,
            "parameters": parameters,
            "input": {}
        }
    })
    .to_string()
}

pub fn finish_task_frame(task_id: &str) -> String {
    json!({
        "header": {
            "action": "finish-task",
            "task_id": task_id,
            "streaming": "duplex"
        },
        "payload": { "input": {} }
    })
    .to_string()
}

/// 解析一条下行文本帧。无法识别的事件返回 `Ok(None)`，便于服务端将来加事件时不炸。
pub fn parse_event(raw: &str) -> Result<Option<ServerEvent>> {
    let frame: Value = serde_json::from_str(raw)
        .map_err(|e| VoiceError::Asr(format!("下行帧不是合法 JSON：{e}")))?;

    let Some(event) = frame["header"]["event"].as_str() else {
        return Ok(None);
    };

    let parsed = match event {
        "task-started" => Some(ServerEvent::Started),
        "task-finished" => Some(ServerEvent::Finished),
        "task-failed" => Some(ServerEvent::Failed {
            message: failure_message(&frame["header"]),
        }),
        "result-generated" => parse_sentence(&frame["payload"]["output"]["sentence"]),
        _ => None,
    };
    Ok(parsed)
}

fn parse_sentence(sentence: &Value) -> Option<ServerEvent> {
    // 只带用量、不带识别结果的 result-generated 帧要跳过
    let text = sentence["text"].as_str()?;
    Some(ServerEvent::Sentence {
        text: text.to_string(),
        begin_time: sentence["begin_time"].as_i64().unwrap_or(0),
        // 字段缺失按中间结果处理，宁可漏判一次也不要把半句当成整句触发命令
        is_final: sentence["sentence_end"].as_bool().unwrap_or(false),
    })
}

fn failure_message(header: &Value) -> String {
    let code = header["error_code"].as_str();
    let message = header["error_message"].as_str();
    match (code, message) {
        (Some(code), Some(message)) => format!("{code}: {message}"),
        (Some(code), None) => code.to_string(),
        (None, Some(message)) => message.to_string(),
        (None, None) => "服务端未说明失败原因".to_string(),
    }
}

/// 把服务端的 `begin_time` 换算成从 0 开始递增的句子序号。
///
/// 前端靠序号原地更新同一句的 partial 结果。`begin_time` 在一句话的多次
/// partial 之间稳定，但它是毫秒时刻而非连续序号，不能直接给前端当 key。
#[derive(Debug, Default)]
pub struct SentenceIndexer {
    last_begin_time: Option<i64>,
    index: u32,
}

impl SentenceIndexer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn index_for(&mut self, begin_time: i64) -> u32 {
        if self.last_begin_time.is_some_and(|last| last != begin_time) {
            self.index += 1;
        }
        self.last_begin_time = Some(begin_time);
        self.index
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(frame: &str) -> Value {
        serde_json::from_str(frame).expect("生成的帧应当是合法 JSON")
    }

    #[test]
    fn task_id_is_hyphenated_uuid() {
        let id = new_task_id();
        let parsed = uuid::Uuid::parse_str(&id).expect("应当是合法 UUID");
        assert_eq!(parsed.to_string(), id);
        assert_eq!(id.len(), 36);
    }

    #[test]
    fn task_ids_are_unique() {
        assert_ne!(new_task_id(), new_task_id());
    }

    #[test]
    fn run_task_frame_matches_protocol() {
        let frame = parsed(&run_task_frame("abc123", "fun-asr-realtime", 16000, None));
        assert_eq!(
            frame,
            json!({
                "header": {
                    "action": "run-task",
                    "task_id": "abc123",
                    "streaming": "duplex"
                },
                "payload": {
                    "task_group": "audio",
                    "task": "asr",
                    "function": "recognition",
                    "model": "fun-asr-realtime",
                    "parameters": {
                        "sample_rate": 16000,
                        "format": "pcm"
                    },
                    "input": {}
                }
            })
        );
    }

    #[test]
    fn run_task_frame_includes_vocabulary_id_when_present() {
        let frame = parsed(&run_task_frame(
            "abc123",
            "fun-asr-realtime",
            16000,
            Some("vocab-gdufe-xxxx"),
        ));
        assert_eq!(
            frame["payload"]["parameters"]["vocabulary_id"],
            json!("vocab-gdufe-xxxx")
        );
        assert_eq!(frame["payload"]["parameters"]["sample_rate"], json!(16000));
        assert_eq!(frame["payload"]["parameters"]["format"], json!("pcm"));
    }

    #[test]
    fn run_task_frame_omits_vocabulary_id_for_empty_string() {
        let frame = parsed(&run_task_frame(
            "abc123",
            "fun-asr-realtime",
            16000,
            Some(""),
        ));
        assert!(frame["payload"]["parameters"]
            .get("vocabulary_id")
            .is_none());
    }

    #[test]
    fn finish_task_frame_matches_protocol() {
        let frame = parsed(&finish_task_frame("abc123"));
        assert_eq!(
            frame,
            json!({
                "header": {
                    "action": "finish-task",
                    "task_id": "abc123",
                    "streaming": "duplex"
                },
                "payload": { "input": {} }
            })
        );
    }

    #[test]
    fn parses_task_started() {
        let raw = r#"{"header":{"task_id":"x","event":"task-started"},"payload":{}}"#;
        assert_eq!(parse_event(raw).unwrap(), Some(ServerEvent::Started));
    }

    #[test]
    fn parses_partial_sentence() {
        let raw = r#"{
            "header": { "event": "result-generated" },
            "payload": { "output": { "sentence": {
                "begin_time": 170,
                "end_time": null,
                "text": "你好小",
                "sentence_end": false
            }}}
        }"#;
        assert_eq!(
            parse_event(raw).unwrap(),
            Some(ServerEvent::Sentence {
                text: "你好小".to_string(),
                begin_time: 170,
                is_final: false,
            })
        );
    }

    #[test]
    fn parses_final_sentence() {
        let raw = r#"{
            "header": { "event": "result-generated" },
            "payload": { "output": { "sentence": {
                "begin_time": 170,
                "end_time": 920,
                "text": "你好小财，打开投影仪",
                "sentence_end": true
            }}}
        }"#;
        assert_eq!(
            parse_event(raw).unwrap(),
            Some(ServerEvent::Sentence {
                text: "你好小财，打开投影仪".to_string(),
                begin_time: 170,
                is_final: true,
            })
        );
    }

    #[test]
    fn missing_sentence_end_is_treated_as_partial() {
        let raw = r#"{
            "header": { "event": "result-generated" },
            "payload": { "output": { "sentence": { "begin_time": 0, "text": "在" }}}
        }"#;
        assert_eq!(
            parse_event(raw).unwrap(),
            Some(ServerEvent::Sentence {
                text: "在".to_string(),
                begin_time: 0,
                is_final: false,
            })
        );
    }

    #[test]
    fn result_without_sentence_is_ignored() {
        // 只带计费信息、不带识别结果的帧
        let raw = r#"{
            "header": { "event": "result-generated" },
            "payload": { "usage": { "duration": 3 } }
        }"#;
        assert_eq!(parse_event(raw).unwrap(), None);
    }

    #[test]
    fn parses_task_finished() {
        let raw = r#"{"header":{"event":"task-finished"},"payload":{}}"#;
        assert_eq!(parse_event(raw).unwrap(), Some(ServerEvent::Finished));
    }

    #[test]
    fn task_failed_carries_code_and_message() {
        let raw = r#"{"header":{
            "event":"task-failed",
            "error_code":"InvalidParameter",
            "error_message":"sample_rate is not supported"
        }}"#;
        let Some(ServerEvent::Failed { message }) = parse_event(raw).unwrap() else {
            panic!("应当解析为 Failed");
        };
        assert!(message.contains("InvalidParameter"));
        assert!(message.contains("sample_rate is not supported"));
    }

    #[test]
    fn task_failed_without_message_still_reports_something() {
        let raw = r#"{"header":{"event":"task-failed"}}"#;
        let Some(ServerEvent::Failed { message }) = parse_event(raw).unwrap() else {
            panic!("应当解析为 Failed");
        };
        assert!(!message.is_empty());
    }

    #[test]
    fn unknown_event_is_ignored_rather_than_fatal() {
        let raw = r#"{"header":{"event":"some-future-event"}}"#;
        assert_eq!(parse_event(raw).unwrap(), None);
    }

    #[test]
    fn frame_without_event_is_ignored() {
        assert_eq!(parse_event(r#"{"header":{}}"#).unwrap(), None);
    }

    #[test]
    fn malformed_json_is_an_error() {
        assert!(parse_event("not json").is_err());
    }

    #[test]
    fn indexer_keeps_one_index_per_sentence() {
        let mut indexer = SentenceIndexer::new();
        // 同一句的多次 partial 共享序号
        assert_eq!(indexer.index_for(170), 0);
        assert_eq!(indexer.index_for(170), 0);
        assert_eq!(indexer.index_for(170), 0);
        // 新句子递增
        assert_eq!(indexer.index_for(1200), 1);
        assert_eq!(indexer.index_for(1200), 1);
        assert_eq!(indexer.index_for(2500), 2);
    }

    #[test]
    fn indexer_starts_at_zero_even_for_nonzero_begin_time() {
        let mut indexer = SentenceIndexer::new();
        assert_eq!(indexer.index_for(9999), 0);
    }
}
