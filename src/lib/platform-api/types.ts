/** 与 src-tauri/src/platform/events.rs 与 config.rs 一一对应，改动需同步两侧 */

export type ConnectionState =
  | 'idle'
  | 'authorizing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface ConnectionInfo {
  state: ConnectionState;
  classroomId: number | null;
  lessonId: number | null;
  lessonTitle: string | null;
  courseName: string | null;
  connectedAt: number | null;
  reconnectCount: number;
  lastError: string | null;
  /** 顶号后为 true，此时 Rust 侧已停止自动重连 */
  kicked: boolean;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';
export type LogSource = 'connection' | 'command' | 'agent' | 'browser';

export interface LogEntry {
  id: string;
  at: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  detail?: string;
}

/** 机器人 Device Flow 的待授权信息，与 events.rs 的 DeviceFlowInfo 对应 */
export interface DeviceFlowInfo {
  userCode: string;
  verificationUri: string;
  /** 已带上 user_code 的完整地址，二维码编码的就是这个 */
  verificationUriComplete: string;
  /** 毫秒时间戳 */
  expiresAt: number;
}

export interface BaseConfig {
  host: string;
  port: number;
  /** 为真时用 https / wss */
  secure: boolean;
}

/** 桌面端（大屏 APP 端） */
export interface ScreenAppConfig extends BaseConfig {
  appKey: string;
  appSecret: string;
  chromePath: string | null;
  kiosk: boolean;
}

/** 安卓端（机器人） */
export interface RobotConfig extends BaseConfig {
  deviceNo: string;
  deviceSecret: string;
}

export type RoleConfig = ScreenAppConfig | RobotConfig;

export function isScreenAppConfig(
  config: RoleConfig,
): config is ScreenAppConfig {
  return 'appKey' in config;
}

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  idle: '未配置',
  authorizing: '等待授权',
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  disconnected: '已断开',
  error: '连接异常',
};

export const EMPTY_SCREEN_APP_CONFIG: ScreenAppConfig = {
  host: '',
  port: 8084,
  secure: false,
  appKey: '',
  appSecret: '',
  chromePath: null,
  kiosk: false,
};

export const EMPTY_ROBOT_CONFIG: RobotConfig = {
  host: '',
  port: 8084,
  secure: false,
  deviceNo: '',
  deviceSecret: '',
};

export const INITIAL_CONNECTION_INFO: ConnectionInfo = {
  state: 'idle',
  classroomId: null,
  lessonId: null,
  lessonTitle: null,
  courseName: null,
  connectedAt: null,
  reconnectCount: 0,
  lastError: null,
  kicked: false,
};

export function serverUrl(config: BaseConfig): string {
  return `${config.secure ? 'https' : 'http'}://${config.host}:${config.port}`;
}

export type ConfigValidationErrors = Partial<
  Record<keyof ScreenAppConfig | keyof RobotConfig, string>
>;

export function validateConfig(config: RoleConfig): ConfigValidationErrors {
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

  if (isScreenAppConfig(config)) {
    if (!config.appKey.trim()) errors.appKey = '请填写 AppKey';
    if (!config.appSecret.trim()) errors.appSecret = '请填写 AppSecret';
  } else {
    if (!config.deviceNo.trim()) errors.deviceNo = '请填写设备编号';
    if (!config.deviceSecret.trim()) errors.deviceSecret = '请填写设备密钥';
  }

  return errors;
}

export function isConfigComplete(config: RoleConfig): boolean {
  return Object.keys(validateConfig(config)).length === 0;
}
