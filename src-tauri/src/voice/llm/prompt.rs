//! 提示词组装与响应解析。纯函数，不发请求。

use serde::Serialize;
use serde_json::{Map, Value};

use super::ChatRequest;

/// 模型无法识别，或响应解析失败时的意图。
pub const UNKNOWN_INTENT: &str = "unknown";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VoiceCommand {
    pub intent: String,
    pub params: Map<String, Value>,
    /// 给用户的简短口播回复。
    pub reply: String,
}

impl VoiceCommand {
    /// 兜底命令。解析失败时也要给前端一个能播报的结果，而不是静默丢弃。
    pub fn unknown() -> Self {
        Self {
            intent: UNKNOWN_INTENT.to_string(),
            params: Map::new(),
            reply: "我没太听明白，可以再说一次吗".to_string(),
        }
    }
}

/// schema 写在 system 提示里而不是用 json_schema 参数，因为百炼兼容模式对
/// structured outputs 的支持不稳定，见设计文档。
const SYSTEM_PROMPT: &str = "\
你是教室机器人的命令解析器。用户的话已由语音识别转成文本，可能有错别字或口语化表达。
请把它解析成一条控制命令，只输出一个 JSON 对象，不要有任何解释文字或代码围栏。

字段：
- intent：命令意图的英文蛇形标识，例如 open_projector、turn_off_light、set_volume。
- params：意图的参数对象，没有参数时给空对象 {}。
- reply：一句简短的中文回复，会被朗读给用户听，控制在 20 字以内。

无法判断用户想做什么时，intent 填 \"unknown\"，params 给空对象，reply 说明没听懂。";

pub fn build_request(utterance: &str) -> ChatRequest {
    ChatRequest {
        system: SYSTEM_PROMPT.to_string(),
        user: utterance.to_string(),
        json_mode: true,
    }
}

/// 把模型输出解析成命令。任何解析失败都退化成 `VoiceCommand::unknown()`，
/// 由调用方把原始字符串放进事件里供排查。
pub fn parse_command(raw: &str) -> VoiceCommand {
    let Some(object) = extract_json_object(raw) else {
        return VoiceCommand::unknown();
    };

    let fallback = VoiceCommand::unknown();
    VoiceCommand {
        intent: object
            .get("intent")
            .and_then(Value::as_str)
            .filter(|intent| !intent.is_empty())
            .unwrap_or(UNKNOWN_INTENT)
            .to_string(),
        // 参数类型不对就当没给，不要因为一个字段毁掉整条命令
        params: object
            .get("params")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default(),
        reply: object
            .get("reply")
            .and_then(Value::as_str)
            .filter(|reply| !reply.is_empty())
            .map(str::to_string)
            .unwrap_or(fallback.reply),
    }
}

/// 取出响应里的 JSON 对象。模型常在 JSON 外面裹代码围栏或客套话，
/// 因此从第一个 `{` 找到最后一个 `}` 再解析，而不是直接反序列化整个响应。
fn extract_json_object(raw: &str) -> Option<Map<String, Value>> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end < start {
        return None;
    }
    match serde_json::from_str(&raw[start..=end]) {
        Ok(Value::Object(object)) => Some(object),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_carries_the_utterance_verbatim() {
        let request = build_request("打开投影仪");
        assert_eq!(request.user, "打开投影仪");
    }

    #[test]
    fn request_asks_for_json_output() {
        assert!(build_request("打开投影仪").json_mode);
    }

    #[test]
    fn system_prompt_describes_the_output_schema() {
        let system = build_request("打开投影仪").system;
        for field in ["intent", "params", "reply"] {
            assert!(system.contains(field), "system 提示应说明字段 {field}");
        }
    }

    #[test]
    fn system_prompt_defines_the_unknown_fallback() {
        assert!(build_request("随便").system.contains(UNKNOWN_INTENT));
    }

    #[test]
    fn parses_a_clean_json_object() {
        let command = parse_command(
            r#"{"intent":"open_projector","params":{"room":"A301"},"reply":"好的，正在打开投影仪"}"#,
        );
        assert_eq!(command.intent, "open_projector");
        assert_eq!(command.params["room"], Value::String("A301".to_string()));
        assert_eq!(command.reply, "好的，正在打开投影仪");
    }

    #[test]
    fn strips_markdown_fences() {
        let command = parse_command(
            "```json\n{\"intent\":\"turn_off_light\",\"params\":{},\"reply\":\"好的\"}\n```",
        );
        assert_eq!(command.intent, "turn_off_light");
        assert_eq!(command.reply, "好的");
    }

    #[test]
    fn strips_bare_fences() {
        let command = parse_command("```\n{\"intent\":\"a\",\"params\":{},\"reply\":\"b\"}\n```");
        assert_eq!(command.intent, "a");
    }

    #[test]
    fn ignores_prose_around_the_json() {
        let command =
            parse_command("好的，这是结果：{\"intent\":\"a\",\"params\":{},\"reply\":\"b\"} 完毕");
        assert_eq!(command.intent, "a");
    }

    #[test]
    fn non_json_falls_back_to_unknown() {
        let command = parse_command("我不知道你在说什么");
        assert_eq!(command.intent, UNKNOWN_INTENT);
        assert!(!command.reply.is_empty(), "兜底也要有话可播");
    }

    #[test]
    fn empty_response_falls_back_to_unknown() {
        assert_eq!(parse_command("").intent, UNKNOWN_INTENT);
    }

    #[test]
    fn truncated_json_falls_back_to_unknown() {
        assert_eq!(
            parse_command(r#"{"intent":"open_projector","par"#).intent,
            UNKNOWN_INTENT
        );
    }

    #[test]
    fn missing_intent_falls_back_to_unknown() {
        let command = parse_command(r#"{"params":{},"reply":"好的"}"#);
        assert_eq!(command.intent, UNKNOWN_INTENT);
        // 模型给了话术就用它的，不要覆盖成兜底文案
        assert_eq!(command.reply, "好的");
    }

    #[test]
    fn missing_params_becomes_empty_object() {
        let command = parse_command(r#"{"intent":"turn_off_light","reply":"好的"}"#);
        assert_eq!(command.intent, "turn_off_light");
        assert!(command.params.is_empty());
    }

    #[test]
    fn params_of_wrong_type_becomes_empty_object() {
        let command = parse_command(r#"{"intent":"a","params":"not an object","reply":"b"}"#);
        assert!(command.params.is_empty());
    }

    #[test]
    fn missing_reply_gets_a_default() {
        let command = parse_command(r#"{"intent":"turn_off_light","params":{}}"#);
        assert_eq!(command.intent, "turn_off_light");
        assert!(!command.reply.is_empty());
    }

    #[test]
    fn json_array_falls_back_to_unknown() {
        assert_eq!(parse_command("[1,2,3]").intent, UNKNOWN_INTENT);
    }

    #[test]
    fn nested_braces_in_params_survive() {
        let command = parse_command(
            r#"{"intent":"set_scene","params":{"light":{"level":3}},"reply":"好的"}"#,
        );
        assert_eq!(command.intent, "set_scene");
        assert_eq!(command.params["light"]["level"], Value::from(3));
    }
}
