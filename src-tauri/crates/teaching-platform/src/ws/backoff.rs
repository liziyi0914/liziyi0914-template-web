use std::time::{Duration, SystemTime, UNIX_EPOCH};

const BASE_MS: u64 = 1_000;
const MAX_MS: u64 = 30_000;
const JITTER: f64 = 0.2;

/// 纯函数形式的退避计算，`jitter_ratio` 取 [-1, 1]。
pub fn delay_for(attempt: u32, jitter_ratio: f64) -> Duration {
    let steps = attempt.min(20);
    let base = BASE_MS.saturating_mul(1u64 << steps).min(MAX_MS);
    let scaled = base as f64 * (1.0 + JITTER * jitter_ratio.clamp(-1.0, 1.0));
    Duration::from_millis(scaled.round() as u64)
}

/// 不引入 rand 依赖，用系统时钟的纳秒位当熵源。
/// 抖动的目的只是把同一栋楼里几十台大屏错开，不需要密码学强度。
fn jitter_ratio() -> f64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or_default();
    (nanos % 2_000_001) as f64 / 1_000_000.0 - 1.0
}

#[derive(Debug, Default)]
pub struct Backoff {
    attempt: u32,
}

impl Backoff {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn attempt(&self) -> u32 {
        self.attempt
    }

    pub fn next_delay(&mut self) -> Duration {
        let delay = delay_for(self.attempt, jitter_ratio());
        self.attempt = self.attempt.saturating_add(1);
        delay
    }

    /// 连接成功后调用，否则短暂抖动过后仍然按上一轮的长间隔重连
    pub fn reset(&mut self) {
        self.attempt = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 无抖动时按_2_的幂次递增() {
        assert_eq!(delay_for(0, 0.0).as_millis(), 1_000);
        assert_eq!(delay_for(1, 0.0).as_millis(), 2_000);
        assert_eq!(delay_for(2, 0.0).as_millis(), 4_000);
        assert_eq!(delay_for(3, 0.0).as_millis(), 8_000);
    }

    #[test]
    fn 上限是_30_秒() {
        assert_eq!(delay_for(5, 0.0).as_millis(), 30_000);
        assert_eq!(delay_for(50, 0.0).as_millis(), 30_000);
        // 极端 attempt 不能让 2 的幂次溢出 panic
        assert_eq!(delay_for(u32::MAX, 0.0).as_millis(), 30_000);
    }

    #[test]
    fn 抖动上下各_20_个百分点() {
        assert_eq!(delay_for(0, 1.0).as_millis(), 1_200);
        assert_eq!(delay_for(0, -1.0).as_millis(), 800);
    }

    #[test]
    fn 连续取值单调递增直到封顶() {
        let mut backoff = Backoff::new();
        let mut previous = 0u128;
        for _ in 0..5 {
            let current = backoff.next_delay().as_millis();
            assert!(current > previous, "{current} 应大于 {previous}");
            previous = current;
        }
    }

    #[test]
    fn 实际抖动落在正负_20_个百分点内() {
        for _ in 0..200 {
            let mut backoff = Backoff::new();
            let millis = backoff.next_delay().as_millis();
            assert!((800..=1_200).contains(&millis), "首次退避 {millis}ms 越界");
        }
    }

    #[test]
    fn reset_后回到首次退避() {
        let mut backoff = Backoff::new();
        for _ in 0..6 {
            backoff.next_delay();
        }
        backoff.reset();
        assert!((800..=1_200).contains(&backoff.next_delay().as_millis()));
    }
}
