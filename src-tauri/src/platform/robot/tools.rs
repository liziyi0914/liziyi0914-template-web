//! `catalog::ROBOT_OPS` 与 LLM 工具清单之间的翻译。
//!
//! 反向映射用查表而不是字符串替换：`app.open_url` 的工具名是 `app_open_url`，
//! 把 `_` 换回 `.` 会得到 `app.open.url`。查表顺便就是白名单——
//! 模型幻觉出来的工具名落不到任何 op 上。

use serde_json::json;
use teaching_platform::ws::catalog;

use crate::llm::ToolSpec;

/// op → 工具名。OpenAI 的函数名不允许 `.`。
pub fn tool_name(op: &str) -> String {
    op.replace('.', "_")
}

/// 工具名 → op。不在清单里返回 `None`。
pub fn op_of(tool: &str) -> Option<&'static str> {
    catalog::ROBOT_OPS
        .iter()
        .map(|spec| spec.op)
        .find(|op| tool_name(op) == tool)
}

/// 全部 22 个工具的声明，每轮请求都带上。
pub fn specs() -> Vec<ToolSpec> {
    catalog::ROBOT_OPS
        .iter()
        .map(|spec| ToolSpec {
            name: tool_name(spec.op),
            description: spec.summary.to_string(),
            parameters: serde_json::from_str(spec.params_schema).unwrap_or_else(|e| {
                log::error!("{} 的参数 schema 无法解析：{e}", spec.op);
                json!({ "type": "object", "properties": {}, "additionalProperties": false })
            }),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn 每个_op_都能声明成一个工具() {
        assert_eq!(specs().len(), catalog::ROBOT_OPS.len());
    }

    #[test]
    fn 工具名把点换成下划线() {
        assert_eq!(tool_name("ppt.goto"), "ppt_goto");
        assert_eq!(tool_name("app.open_url"), "app_open_url");
    }

    #[test]
    fn 每个_op_都能原样往返() {
        for spec in catalog::ROBOT_OPS {
            let name = tool_name(spec.op);
            assert_eq!(
                op_of(&name),
                Some(spec.op),
                "{} 的工具名 {name} 反解不回来",
                spec.op
            );
        }
    }

    #[test]
    fn 带下划线的_op_不会被反解成多段() {
        assert_eq!(op_of("app_open_url"), Some("app.open_url"));
        assert_eq!(op_of("screen_switch_view"), Some("screen.switch_view"));
    }

    #[test]
    fn 白名单外的工具名一律拒绝() {
        for name in ["ppt_burn", "ppt.goto", "", "PPT_GOTO"] {
            assert_eq!(op_of(name), None, "{name} 不该被接受");
        }
    }

    #[test]
    fn 工具名只含_openai_允许的字符且不超长() {
        for spec in specs() {
            assert!(
                spec.name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'),
                "{} 含非法字符",
                spec.name
            );
            assert!(spec.name.len() <= 64, "{} 超过 64 字符", spec.name);
        }
    }

    #[test]
    fn 每个工具都带描述与_object_参数() {
        for spec in specs() {
            assert!(!spec.description.trim().is_empty(), "{} 缺描述", spec.name);
            assert_eq!(
                spec.parameters["type"], "object",
                "{} 的参数不是 object",
                spec.name
            );
            assert!(
                spec.parameters.get("properties").is_some_and(Value::is_object),
                "{} 的参数缺 properties",
                spec.name
            );
        }
    }

    #[test]
    fn 参数就是_catalog_里那份_schema() {
        let goto = specs()
            .into_iter()
            .find(|spec| spec.name == "ppt_goto")
            .expect("应有 ppt_goto");
        let expected: Value =
            serde_json::from_str(catalog::find("ppt.goto").unwrap().params_schema).unwrap();
        assert_eq!(goto.parameters, expected);
    }
}
