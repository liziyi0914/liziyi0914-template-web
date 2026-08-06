plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    // 必须与 Rust 侧 register_android_plugin 传入的 identifier 一致，
    // 它会被拼成 cn/edu/gdufe/classroom/mic/MicPlugin 去反射加载
    namespace = "cn.edu.gdufe.classroom.mic"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        // 插件类是反射加载的，release 混淆会把它裁掉，规则要传给宿主 app
        consumerProguardFiles("proguard-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation(project(":tauri-android"))
}
