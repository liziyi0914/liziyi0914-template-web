import type { ConnectionInfo, ServerConfig } from './types';

export type ConnectionListener = (info: ConnectionInfo) => void;

/**
 * 连接层的唯一抽象。当前由 MockConnectionClient 实现，接入真实服务器时
 * 换成 WebSocket 实现即可，UI 与托盘均不感知。
 */
export interface ConnectionClient {
  getSnapshot(): ConnectionInfo;
  subscribe(listener: ConnectionListener): () => void;
  /** 使用新配置建立连接；已连接时先断开 */
  connect(config: ServerConfig): void;
  disconnect(): void;
  /** 保持当前配置重连，累加重连计数 */
  reconnect(): void;
  /** 注入一次故障，仅用于开发期验证状态流转 */
  simulateFailure(message?: string): void;
  dispose(): void;
}
