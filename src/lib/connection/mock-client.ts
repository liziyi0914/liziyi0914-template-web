import type { ConnectionClient, ConnectionListener } from './client';
import {
  type ConnectionInfo,
  INITIAL_CONNECTION_INFO,
  OFFLINE_ROBOT,
  type RobotStatus,
  type ServerConfig,
} from './types';

const HANDSHAKE_MS = 1200;
const HEARTBEAT_INTERVAL_MS = 3000;
const ROBOT_FLIP_MIN_MS = 12000;
const ROBOT_FLIP_MAX_MS = 20000;
const LATENCY_MIN_MS = 20;
const LATENCY_MAX_MS = 80;

const CLASSROOM_BUILDINGS = ['A', 'B', 'C', 'D'];
const ROBOT_MODELS = ['GD-R1', 'GD-R2 Pro', 'GD-R3 Lite'];

function hash(input: string): number {
  let acc = 2166136261;
  for (let i = 0; i < input.length; i++) {
    acc ^= input.charCodeAt(i);
    acc = Math.imul(acc, 16777619);
  }
  return acc >>> 0;
}

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

/** 同一个 ClientId 每次都得到相同的假数据，便于反复验证 */
function deriveIdentity(clientId: string) {
  const seed = hash(clientId);
  const building = CLASSROOM_BUILDINGS[seed % CLASSROOM_BUILDINGS.length];
  const room = 101 + ((seed >>> 4) % 20);
  const floor = 1 + ((seed >>> 9) % 5);
  const classroomId = `${building}${floor}${String(room).slice(-2)}`;

  return {
    classroomId,
    classroomName: `${building} 座 ${floor} 楼 ${classroomId} 智慧教室`,
    sessionId: seed.toString(16).padStart(8, '0'),
    serverVersion: `1.${(seed >>> 3) % 9}.${(seed >>> 7) % 20}`,
    deviceName: `${ROBOT_MODELS[seed % ROBOT_MODELS.length]}-${classroomId}`,
    appVersion: `0.${(seed >>> 5) % 9}.${(seed >>> 11) % 30}`,
  };
}

export class MockConnectionClient implements ConnectionClient {
  #info: ConnectionInfo = INITIAL_CONNECTION_INFO;
  #listeners = new Set<ConnectionListener>();
  #config: ServerConfig | null = null;
  #handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  #robotTimer: ReturnType<typeof setTimeout> | null = null;

  getSnapshot(): ConnectionInfo {
    return this.#info;
  }

  subscribe(listener: ConnectionListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  connect(config: ServerConfig): void {
    this.#clearTimers();
    this.#config = config;
    this.#patch({
      state: 'connecting',
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
    });
    this.#scheduleHandshake();
  }

  reconnect(): void {
    if (!this.#config) return;

    this.#clearTimers();
    this.#patch({
      state: 'reconnecting',
      latencyMs: null,
      connectedAt: null,
      reconnectCount: this.#info.reconnectCount + 1,
      lastError: null,
    });
    this.#scheduleHandshake();
  }

  disconnect(): void {
    this.#clearTimers();
    this.#patch({
      state: this.#config ? 'disconnected' : 'idle',
      robot: OFFLINE_ROBOT,
      latencyMs: null,
      connectedAt: null,
    });
  }

  simulateFailure(message = '与服务器的连接被重置'): void {
    this.#clearTimers();
    this.#patch({
      state: 'error',
      robot: OFFLINE_ROBOT,
      latencyMs: null,
      connectedAt: null,
      lastError: message,
    });
  }

  dispose(): void {
    this.#clearTimers();
    this.#listeners.clear();
  }

  #scheduleHandshake(): void {
    this.#handshakeTimer = setTimeout(() => {
      this.#handshakeTimer = null;
      this.#establish();
    }, HANDSHAKE_MS);
  }

  #establish(): void {
    const config = this.#config;
    if (!config) return;

    const identity = deriveIdentity(config.clientId);
    const now = Date.now();

    this.#patch({
      state: 'connected',
      classroomId: identity.classroomId,
      classroomName: identity.classroomName,
      sessionId: identity.sessionId,
      serverVersion: identity.serverVersion,
      connectedAt: now,
      lastHeartbeatAt: now,
      latencyMs: randomBetween(LATENCY_MIN_MS, LATENCY_MAX_MS),
      lastError: null,
      robot: {
        online: true,
        deviceName: identity.deviceName,
        appVersion: identity.appVersion,
        lastSeenAt: now,
      },
    });

    this.#heartbeatTimer = setInterval(() => {
      const at = Date.now();
      this.#patch({
        lastHeartbeatAt: at,
        latencyMs: randomBetween(LATENCY_MIN_MS, LATENCY_MAX_MS),
        robot: this.#info.robot.online
          ? { ...this.#info.robot, lastSeenAt: at }
          : this.#info.robot,
      });
    }, HEARTBEAT_INTERVAL_MS);

    this.#scheduleRobotFlip();
  }

  #scheduleRobotFlip(): void {
    this.#robotTimer = setTimeout(
      () => {
        this.#robotTimer = null;
        if (this.#info.state === 'connected') {
          const online = !this.#info.robot.online;
          const identity = this.#config
            ? deriveIdentity(this.#config.clientId)
            : null;
          const robot: RobotStatus = online
            ? {
                online: true,
                deviceName: identity?.deviceName ?? null,
                appVersion: identity?.appVersion ?? null,
                lastSeenAt: Date.now(),
              }
            : { ...this.#info.robot, online: false };
          this.#patch({ robot });
          this.#scheduleRobotFlip();
        }
      },
      randomBetween(ROBOT_FLIP_MIN_MS, ROBOT_FLIP_MAX_MS),
    );
  }

  #clearTimers(): void {
    if (this.#handshakeTimer !== null) {
      clearTimeout(this.#handshakeTimer);
      this.#handshakeTimer = null;
    }
    if (this.#heartbeatTimer !== null) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
    if (this.#robotTimer !== null) {
      clearTimeout(this.#robotTimer);
      this.#robotTimer = null;
    }
  }

  #patch(partial: Partial<ConnectionInfo>): void {
    this.#info = { ...this.#info, ...partial };
    for (const listener of this.#listeners) {
      listener(this.#info);
    }
  }
}

let singleton: ConnectionClient | null = null;

/** 单例，避免 StrictMode 下重复挂载导致多套定时器 */
export function getConnectionClient(): ConnectionClient {
  if (!singleton) {
    singleton = new MockConnectionClient();
  }
  return singleton;
}
