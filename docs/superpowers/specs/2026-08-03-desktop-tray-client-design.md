# 桌面端托盘客户端（Mock 阶段）设计

日期：2026-08-03
状态：已确认，待实现

## 背景

GDUFE Classroom 由两个客户端组成：运行在机器人上的安卓端，以及运行在 Windows / macOS 上的桌面端。服务器侧把一个安卓端实例和一个桌面端实例关联进同一个「课室」。

本阶段只实现桌面端，且不接入真实服务器：所有连接状态由前端 mock 产生。目标是把 UI、托盘交互、状态流转全部跑通，让后续接入真实 WebSocket 时只需替换一个实现类。

## 范围

在范围内：

- 系统托盘（Windows / macOS），右键菜单可打开主窗口、查看服务器连接状态、触发重连、退出
- 主窗口：配置服务器 IP、端口、ClientId、ClientSecret
- 主窗口：展示连接信息，含课室 ID 与机器人状态
- 配置持久化到本地文件
- 关闭主窗口时隐藏到托盘

不在范围内：

- 真实的 WebSocket 连接、鉴权、心跳协议
- 安卓端
- 自启动、自动更新、多语言

## 架构

前端持有连接状态，Rust 侧只提供原生能力。

```
┌─────────────────────── WebView (React) ───────────────────────┐
│  MockConnectionClient ──emit──> useConnection ──> UI 组件      │
│         ▲                            │                         │
│         │                            └── emit('connection://changed')
│    reconnect()                                    │            │
└─────────┼─────────────────────────────────────────┼────────────┘
          │ listen('tray://reconnect')              ▼
┌─────────┴──────────────────── Rust ───────────────────────────┐
│  tray.rs：重建菜单文本 / tooltip / 图标                        │
│  菜单点击 → show_window() 或 emit('tray://reconnect')          │
│  窗口 CloseRequested → prevent_close + hide                    │
└────────────────────────────────────────────────────────────────┘
```

Rust 不产生任何业务状态，只渲染前端广播过来的状态。这样 mock 与真实实现的切换完全发生在前端。

## 数据模型

```ts
type ConnectionState =
  | 'idle'          // 尚未配置服务器
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

interface ServerConfig {
  host: string;
  port: number;
  secure: boolean;      // 决定 ws:// 还是 wss://
  clientId: string;
  clientSecret: string;
}

interface RobotStatus {
  online: boolean;         // 安卓端与服务器的连接状态
  deviceName: string | null;
  appVersion: string | null;
  lastSeenAt: number | null;
}

interface ConnectionInfo {
  state: ConnectionState;
  classroomId: string | null;
  classroomName: string | null;
  robot: RobotStatus;
  sessionId: string | null;
  latencyMs: number | null;
  connectedAt: number | null;      // 在线时长由此推算，避免每秒写状态
  lastHeartbeatAt: number | null;
  reconnectCount: number;
  serverVersion: string | null;
  lastError: string | null;
}
```

课室 ID 与机器人状态由服务器在握手和心跳中下发，因此属于 `ConnectionInfo` 而非 `ServerConfig`。用户可配置的只有四项加一个 `secure` 开关。

## 组件划分

| 单元 | 职责 | 依赖 |
| --- | --- | --- |
| `lib/connection/types.ts` | 类型定义 | 无 |
| `lib/connection/client.ts` | `ConnectionClient` 接口：`connect(config)` / `disconnect()` / `reconnect()` / `subscribe(fn)` / `getSnapshot()` | types |
| `lib/connection/mock-client.ts` | mock 状态机，定时器驱动 | client 接口 |
| `lib/config/store.ts` | 读写 `ServerConfig`，Tauri 环境用 store 插件，否则降级 localStorage | types |
| `hooks/use-server-config.ts` | 配置的读取、校验、保存 | config store |
| `hooks/use-connection.ts` | 订阅 client，并把状态广播给 Rust | client、config |
| `components/connection-status-card.tsx` | 状态总览与重连入口 | types |
| `components/connection-details.tsx` | 连接明细列表 | types |
| `components/server-config-form.tsx` | 配置表单 | types |
| `src-tauri/src/tray.rs` | 托盘构建与刷新 | 无业务依赖 |

`ConnectionClient` 是唯一的替换点。真实实现只需满足同一接口。

## 交互

### 托盘菜单

```
GDUFE Classroom          (禁用)
● 已连接 · 课室 A302      (禁用)
机器人：在线              (禁用)
─────────────
打开主窗口
重新连接
─────────────
退出
```

状态行的圆点与托盘图标同步反映连接状态。tooltip 显示同样的摘要文本。

### 主窗口

单页布局，尺寸 920×680：

- 顶部状态总览卡：状态徽章、课室 ID、机器人在线状态、重新连接按钮
- 左下连接详情卡：延迟、在线时长、重连次数、最后心跳、会话 ID、服务端版本、最近错误
- 右下服务器配置卡：Host、Port、ClientId、ClientSecret（密码框带显隐切换）、wss 开关、保存按钮

### 事件

| 事件名 | 方向 | 载荷 |
| --- | --- | --- |
| `connection://changed` | 前端 → Rust | `ConnectionInfo` 的托盘摘要投影 |
| `tray://reconnect` | Rust → 前端 | 无 |

「打开主窗口」不经过前端，Rust 直接 `show` + `set_focus`，避免 WebView 未就绪时失效。

## Mock 行为

- 保存配置后自动发起连接：`connecting` 持续约 1.2s 后转 `connected`
- `connected` 期间每 3s 更新一次心跳时间，延迟在 20–80ms 之间抖动
- 机器人在线状态每 12–20s 有概率翻转，用于验证托盘与 UI 联动
- 点击「重新连接」：立即转 `reconnecting`，约 1.2s 后回到 `connected`，`reconnectCount` 加一
- 仅开发模式提供「模拟断线」按钮，把状态打到 `error`，用于验证托盘图标切换

课室 ID、课室名、设备名、服务端版本由 `clientId` 派生出稳定的假值，保证同一配置每次得到相同结果。

## 错误处理

- 配置校验在保存前执行：host 非空、port 在 1–65535、clientId 与 clientSecret 非空。校验失败在对应 `Field` 上标 `data-invalid`，不发起连接。
- 配置读取失败（文件损坏或权限问题）时回落到空配置，状态为 `idle`，不阻塞窗口渲染。
- `error` 状态在详情卡中展示 `lastError` 文本。
- Rust 侧托盘创建失败仅记录日志，不阻止应用启动。

## 测试

本阶段以手动验证为主，检查项：

1. 首次启动无配置时，UI 显示 `idle`，托盘显示「未配置」
2. 填写配置保存后，状态经 `connecting` 到 `connected`，托盘文本与图标同步
3. 关闭窗口后应用仍在托盘，双击托盘或菜单可重新唤起
4. 托盘「重新连接」能触发前端状态流转
5. 重启应用后配置仍在，并自动重连
6. 托盘「退出」真正结束进程

## 后续

真实接入时的改动限于：新增 `lib/connection/ws-client.ts` 实现同一接口，在 client 工厂处切换。若后续需要窗口隐藏时仍保持连接的强保证，再把连接迁至 Rust 侧，届时 `ConnectionClient` 变为 Tauri command 的薄封装，UI 层不受影响。
