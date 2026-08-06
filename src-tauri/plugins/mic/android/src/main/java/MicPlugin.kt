package cn.edu.gdufe.classroom.mic

import android.Manifest
import android.app.Activity
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import app.tauri.Logger
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

private const val MICROPHONE = "microphone"

@InvokeArg
class StartArgs {
    lateinit var onFrame: Channel
    var sampleRate: Int = 16000
    var frameBytes: Int = 6400
}

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = MICROPHONE)
    ]
)
class MicPlugin(private val activity: Activity) : Plugin(activity) {
    private val lock = Any()
    private var recorder: AudioRecord? = null
    private var worker: Thread? = null

    @Volatile
    private var running = false

    @Command
    fun startRecording(invoke: Invoke) {
        val args = invoke.parseArgs(StartArgs::class.java)

        if (getPermissionState(MICROPHONE) != PermissionState.GRANTED) {
            invoke.reject("麦克风权限未授予")
            return
        }
        if (args.frameBytes <= 0 || args.frameBytes % 2 != 0) {
            invoke.reject("帧长必须是正偶数，当前为 ${args.frameBytes}")
            return
        }

        synchronized(lock) {
            if (running) {
                invoke.reject("录音已在进行中")
                return
            }

            val record = try {
                openRecorder(args.sampleRate, args.frameBytes)
            } catch (e: SecurityException) {
                invoke.reject("创建录音器被系统拒绝：${e.message}")
                return
            } catch (e: IllegalArgumentException) {
                invoke.reject("录音参数不被设备支持：${e.message}")
                return
            }

            if (record == null) {
                invoke.reject("设备不支持 ${args.sampleRate}Hz 单声道 PCM16 采集")
                return
            }

            try {
                record.startRecording()
            } catch (e: IllegalStateException) {
                record.release()
                invoke.reject("启动录音失败：${e.message}")
                return
            }

            recorder = record
            running = true
            worker = Thread { pump(record, args.onFrame, args.frameBytes) }
                .apply {
                    name = "mic-pump"
                    start()
                }
        }

        invoke.resolve()
    }

    @Command
    fun stopRecording(invoke: Invoke) {
        val pending: Thread?
        synchronized(lock) {
            running = false
            pending = worker
            // stop() 会让阻塞中的 read() 立刻返回，否则采集线程要等下一帧才退出
            try {
                recorder?.stop()
            } catch (e: IllegalStateException) {
                Logger.warn("停止录音器时状态异常：${e.message}")
            }
        }

        pending?.join(1_000)

        synchronized(lock) {
            recorder?.release()
            recorder = null
            worker = null
        }

        invoke.resolve()
    }

    /**
     * VOICE_RECOGNITION 音源会启用系统的降噪与回声消除，比 MIC 更适合识别场景。
     */
    private fun openRecorder(sampleRate: Int, frameBytes: Int): AudioRecord? {
        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuffer == AudioRecord.ERROR || minBuffer == AudioRecord.ERROR_BAD_VALUE) {
            return null
        }

        // 留出两帧余量，避免上层处理稍慢就丢采样
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuffer, frameBytes * 2)
        )

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return null
        }
        return record
    }

    /**
     * 攒够一整帧再推给 Rust。每次 send 都要过一轮 JSON 序列化，
     * 按 200 ms 分帧是为了把跨语言调用压到每秒 5 次。
     */
    private fun pump(record: AudioRecord, channel: Channel, frameBytes: Int) {
        val frame = ByteArray(frameBytes)
        var filled = 0

        while (running) {
            val read = record.read(frame, filled, frameBytes - filled)
            if (read <= 0) {
                if (read == 0) continue
                if (running) {
                    // 录音中途死掉不会有任何声音再上来，必须留下痕迹
                    Logger.error("录音读取失败，错误码 $read，采集线程退出")
                    channel.send(JSObject().put("error", "录音读取失败，错误码 $read"))
                }
                return
            }

            filled += read
            if (filled < frameBytes) continue

            channel.send(JSObject().put("pcm", Base64.encodeToString(frame, Base64.NO_WRAP)))
            filled = 0
        }
    }
}
