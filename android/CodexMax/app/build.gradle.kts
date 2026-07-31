import java.util.Properties

plugins {
    id("com.android.application")
}

providers.environmentVariable("CODEX_MAX_ANDROID_BUILD_DIR").orNull?.let {
    layout.buildDirectory.set(file(it))
}

android {
    namespace = "com.nhzhongguo.codexmax"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nhzhongguo.codexmax"
        minSdk = 23
        targetSdk = 35
        versionCode = 10
        versionName = "1.2.6"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    val releaseSigningFile = rootProject.file("release-signing.properties")
    val releaseSigning = Properties().apply {
        if (releaseSigningFile.exists()) {
            releaseSigningFile.inputStream().use(::load)
        }
    }
    val hasReleaseSigning = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
        .all { !releaseSigning.getProperty(it).isNullOrBlank() }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(releaseSigning.getProperty("storeFile"))
                storePassword = releaseSigning.getProperty("storePassword")
                keyAlias = releaseSigning.getProperty("keyAlias")
                keyPassword = releaseSigning.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.10.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")

    testImplementation("junit:junit:4.13.2")
}
