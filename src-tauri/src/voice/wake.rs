//! 唤醒词状态机。纯逻辑、无 IO，时间由调用方注入以便测试。

use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WakeOutcome {
    /// 本句与唤醒无关。
    None,
    /// 命中唤醒词但同句没有命令内容，转入等待下一句。
    Awakened,
    /// 拿到一条完整命令。
    Command(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Idle,
    Armed { since: Instant },
}

/// 归一化后的文本。`chars` 用来匹配唤醒词，`offsets` 把匹配位置映射回原文，
/// 这样命令文本能保留标点和空格原样交给 LLM。
struct Normalized {
    chars: Vec<char>,
    offsets: Vec<usize>,
}

impl Normalized {
    /// 只保留字母数字（含汉字），空白、中英文标点、百分号等一律丢弃。
    /// ASR 给出的标点位置并不稳定，「你好，小财」和「你好小财」必须都能命中。
    fn of(text: &str) -> Self {
        let mut chars = Vec::new();
        let mut offsets = Vec::new();
        for (offset, ch) in text.char_indices() {
            if ch.is_alphanumeric() {
                chars.push(ch);
                offsets.push(offset);
            }
        }
        Self { chars, offsets }
    }

    /// 原文中从第 `index` 个有效字符开始的部分。越界时为空串。
    fn slice_from<'a>(&self, text: &'a str, index: usize) -> &'a str {
        match self.offsets.get(index) {
            Some(&offset) => &text[offset..],
            None => "",
        }
    }
}

/// 取最后一次匹配的位置。用户说错重来时会连说两次唤醒词，此时命令在后一次之后。
fn rfind_subslice(haystack: &[char], needle: &[char]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    (0..=haystack.len() - needle.len())
        .rev()
        .find(|&start| &haystack[start..start + needle.len()] == needle)
}

pub struct WakeDetector {
    state: State,
    wake_word: Vec<char>,
    timeout: Duration,
}

impl WakeDetector {
    pub fn new(wake_word: &str, timeout: Duration) -> Self {
        Self {
            state: State::Idle,
            wake_word: Normalized::of(wake_word).chars,
            timeout,
        }
    }

    /// 只喂整句（`sentence_end` 为真的结果）。partial 结果里的唤醒词会随着
    /// 后续识别被改写，据此触发会导致同一句话重复命中。
    pub fn on_final(&mut self, text: &str, now: Instant) -> WakeOutcome {
        let normalized = Normalized::of(text);
        if normalized.chars.is_empty() {
            // 纯标点或空白，既不是命令也不该消耗掉唤醒状态
            return WakeOutcome::None;
        }

        if let Some(start) = rfind_subslice(&normalized.chars, &self.wake_word) {
            let after = start + self.wake_word.len();
            let remainder = normalized.slice_from(text, after);
            self.state = if remainder.is_empty() {
                State::Armed { since: now }
            } else {
                State::Idle
            };
            return if remainder.is_empty() {
                WakeOutcome::Awakened
            } else {
                WakeOutcome::Command(remainder.to_string())
            };
        }

        match self.state {
            State::Armed { since } if now.duration_since(since) < self.timeout => {
                self.state = State::Idle;
                WakeOutcome::Command(normalized.slice_from(text, 0).to_string())
            }
            State::Armed { .. } => {
                self.state = State::Idle;
                WakeOutcome::None
            }
            State::Idle => WakeOutcome::None,
        }
    }

    /// 会话重启时清空唤醒状态，避免上一轮的 Armed 泄漏到新会话。
    pub fn reset(&mut self) {
        self.state = State::Idle;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TIMEOUT: Duration = Duration::from_secs(10);

    fn detector() -> WakeDetector {
        WakeDetector::new("你好小财", TIMEOUT)
    }

    fn cmd(s: &str) -> WakeOutcome {
        WakeOutcome::Command(s.to_string())
    }

    #[test]
    fn unrelated_sentence_is_ignored() {
        let mut d = detector();
        assert_eq!(
            d.on_final("今天天气不错", Instant::now()),
            WakeOutcome::None
        );
    }

    #[test]
    fn wake_word_with_remainder_yields_command_immediately() {
        let mut d = detector();
        assert_eq!(
            d.on_final("你好小财打开投影仪", Instant::now()),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn punctuation_between_wake_word_and_command_is_stripped() {
        let mut d = detector();
        assert_eq!(
            d.on_final("你好小财，打开投影仪。", Instant::now()),
            cmd("打开投影仪。")
        );
    }

    #[test]
    fn punctuation_inside_wake_word_still_matches() {
        // ASR 偶尔会在唤醒词中间插标点，归一化后仍应命中
        let mut d = detector();
        assert_eq!(
            d.on_final("你好，小财，打开投影仪", Instant::now()),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn wake_word_alone_arms_the_detector() {
        let mut d = detector();
        assert_eq!(
            d.on_final("你好小财", Instant::now()),
            WakeOutcome::Awakened
        );
    }

    #[test]
    fn armed_detector_takes_next_sentence_as_command() {
        let mut d = detector();
        let t0 = Instant::now();
        assert_eq!(d.on_final("你好小财。", t0), WakeOutcome::Awakened);
        assert_eq!(
            d.on_final("打开投影仪", t0 + Duration::from_secs(5)),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn command_returns_detector_to_idle() {
        let mut d = detector();
        let t0 = Instant::now();
        d.on_final("你好小财", t0);
        d.on_final("打开投影仪", t0 + Duration::from_secs(1));
        // 已回到 Idle，后续无关句子不应再被当成命令
        assert_eq!(
            d.on_final("随便说点什么", t0 + Duration::from_secs(2)),
            WakeOutcome::None
        );
    }

    #[test]
    fn armed_state_expires_after_timeout() {
        let mut d = detector();
        let t0 = Instant::now();
        assert_eq!(d.on_final("你好小财", t0), WakeOutcome::Awakened);
        assert_eq!(
            d.on_final("打开投影仪", t0 + Duration::from_secs(11)),
            WakeOutcome::None
        );
    }

    #[test]
    fn expired_armed_state_still_matches_wake_word_in_the_same_sentence() {
        let mut d = detector();
        let t0 = Instant::now();
        d.on_final("你好小财", t0);
        // 超时后本句要按 Idle 规则重新处理，而不是直接丢掉
        assert_eq!(
            d.on_final("你好小财打开投影仪", t0 + Duration::from_secs(11)),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn repeated_wake_word_uses_the_last_occurrence() {
        // 用户说错重来一遍，命令应取最后一次唤醒词之后的内容
        let mut d = detector();
        assert_eq!(
            d.on_final("你好小财关灯你好小财打开投影仪", Instant::now()),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn repeated_wake_word_ending_with_wake_word_arms() {
        let mut d = detector();
        assert_eq!(
            d.on_final("你好小财关灯你好小财", Instant::now()),
            WakeOutcome::Awakened
        );
    }

    #[test]
    fn wake_word_in_armed_sentence_is_stripped_from_command() {
        let mut d = detector();
        let t0 = Instant::now();
        d.on_final("你好小财", t0);
        assert_eq!(
            d.on_final("你好小财打开投影仪", t0 + Duration::from_secs(2)),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn blank_sentence_does_not_disarm() {
        let mut d = detector();
        let t0 = Instant::now();
        d.on_final("你好小财", t0);
        assert_eq!(
            d.on_final("  ，。 ", t0 + Duration::from_secs(1)),
            WakeOutcome::None
        );
        // 空白句不该消耗掉唤醒状态
        assert_eq!(
            d.on_final("打开投影仪", t0 + Duration::from_secs(2)),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn whitespace_inside_wake_word_still_matches() {
        let mut d = detector();
        assert_eq!(
            d.on_final("你好 小财 打开投影仪", Instant::now()),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn reset_clears_pending_wake() {
        let mut d = detector();
        let t0 = Instant::now();
        d.on_final("你好小财", t0);
        d.reset();
        assert_eq!(
            d.on_final("打开投影仪", t0 + Duration::from_secs(1)),
            WakeOutcome::None
        );
    }

    #[test]
    fn leading_punctuation_is_stripped_from_next_sentence_command() {
        let mut d = detector();
        let t0 = Instant::now();
        d.on_final("你好小财", t0);
        assert_eq!(
            d.on_final("，打开投影仪", t0 + Duration::from_secs(1)),
            cmd("打开投影仪")
        );
    }

    #[test]
    fn command_text_keeps_its_internal_spacing() {
        // 归一化只用于定位唤醒词，命令原文要原样交给 LLM
        let mut d = detector();
        assert_eq!(
            d.on_final("你好小财，把音量调到 80%", Instant::now()),
            cmd("把音量调到 80%")
        );
    }
}
