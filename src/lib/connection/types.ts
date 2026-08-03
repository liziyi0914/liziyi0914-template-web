export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface ServerConfig {
  host: string;
  port: number;
  /** 为真时使用 wss://，否则 ws:// */
  secure: boolean;
  clientId: string;
  clientSecret: string;
}

/** 安卓端（运行于机器人）与服务器之间的连接状态，由服务器下发 */
export interface RobotStatus {
  online: boolean;
  deviceName: string | null;
  appVersion: string | null;
  lastSeenAt: number | null;
}

export interface ConnectionInfo {
  state: ConnectionState;
  classroomId: string | null;
  classroomName: string | null;
  robot: RobotStatus;
  sessionId: string | null;
  latencyMs: number | null;
  /** 本次连接建立的时间戳，在线时长由此推算，避免逐秒写入状态 */
  connectedAt: number | null;
  lastHeartbeatAt: number | null;
  reconnectCount: number;
  serverVersion: string | null;
  lastError: string | null;
}

export const OFFLINE_ROBOT: RobotStatus = {
  online: false,
  deviceName: null,
  appVersion: null,
  lastSeenAt: null,
};

export const INITIAL_CONNECTION_INFO: ConnectionInfo = {
  state: 'idle',
  classroomId: null,
  classroomName: null,
  robot: OFFLINE_ROBOT,
  sessionId: null,
  latencyMs: null,
  connectedAt: null,
  lastHeartbeatAt: null,
  reconnectCount: 0,
  serverVersion: null,
  lastError: null,
};

export const EMPTY_SERVER_CONFIG: ServerConfig = {
  host: '',
  port: 8080,
  secure: false,
  clientId: '',
  clientSecret: '',
};

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  idle: '未配置',
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  disconnected: '已断开',
  error: '连接异常',
};

export function serverUrl(config: ServerConfig): string {
  return `${config.secure ? 'wss' : 'ws'}://${config.host}:${config.port}`;
}

export type ConfigValidationErrors = Partial<
  Record<keyof ServerConfig, string>
>;

export function validateServerConfig(
  config: ServerConfig,
): ConfigValidationErrors {
  const errors: ConfigValidationErrors = {};

  if (!config.host.trim()) {
    errors.host = '请填写服务器地址';
  }
  if (
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  ) {
    errors.port = '端口需为 1 - 65535 之间的整数';
  }
  if (!config.clientId.trim()) {
    errors.clientId = '请填写 ClientId';
  }
  if (!config.clientSecret.trim()) {
    errors.clientSecret = '请填写 ClientSecret';
  }

  return errors;
}

export function isConfigComplete(config: ServerConfig): boolean {
  return Object.keys(validateServerConfig(config)).length === 0;
}
