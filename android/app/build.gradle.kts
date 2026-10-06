plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
// package.json is the release-version authority for both web and Android.
val packageVersionFile = rootProject.projectDir.parentFile.resolve("package.json")
val releaseVersion = groovy.json.JsonSlurper().parse(packageVersionFile)
    .let { (it as Map<*, *>)["version"] as String }
require(Regex("\\d+\\.\\d+\\.\\d+").matches(releaseVersion)) { "Expected a semantic package version" }
val versionParts = releaseVersion.split('.').map(String::toInt)
android {
    namespace = "in.aiprotect.companion"
    compileSdk = 35
    defaultConfig {
        applicationId = "in.aiprotect.companion"
        minSdk = 29
        targetSdk = 35
        versionCode = versionParts[0] * 1000000 + versionParts[1] * 1000 + versionParts[2]
        versionName = releaseVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    flavorDimensions += "distribution"
    productFlavors {
        create("play") { dimension = "distribution" }
        create("hackathon") {
            dimension = "distribution"
            applicationIdSuffix = ".mvp"
            // Keep only the ABIs for which both Vosk and JNA supply libraries.
            ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86", "x86_64") }
            versionNameSuffix = "-hackathon"
            // External PCM input to the on-device recognizer requires API 33.
            minSdk = 33
        }
    }
    // Extract compressed native libraries using the standard installer path.
    packaging { jniLibs { useLegacyPackaging = true } }
    signingConfigs.getByName("debug") {
        enableV1Signing = true
        enableV2Signing = true
        enableV3Signing = true
        System.getenv("AIPROTECT_DEBUG_KEYSTORE")?.let { storeFile = file(it) }
    }
    sourceSets.getByName("hackathon").assets.srcDir(layout.buildDirectory.dir("generated/speechAssets"))
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all { it.systemProperty("robolectric.dependency.repo.url", "https://repo.maven.apache.org/maven2") }
    }
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/reviewAssets"))
}
// Copy the working web/core at build time. No duplicate risk-engine implementation.
val syncReviewAssets by tasks.registering(Sync::class) {
    inputs.file(packageVersionFile)
    inputs.property("releaseVersion", releaseVersion)
    from(rootProject.projectDir.parentFile) {
        include("core/*.mjs", "core/model.json", "web/*.mjs", "web/*.css", "web/*.html", "web/*.svg", "web/*.png", "web/manifest.json", "web/vendor/**", "simulator/*.mjs", "evaluation/results.json")
        exclude("core/version.mjs")
    }
    into(layout.buildDirectory.dir("generated/reviewAssets"))
    doLast {
        // Android builds do not require Node or a pre-generated web version file.
        val versionAsset = layout.buildDirectory.file("generated/reviewAssets/core/version.mjs").get().asFile
        versionAsset.parentFile.mkdirs()
        versionAsset.writeText("// Generated from package.json by Android asset sync.\nexport const VERSION = '$releaseVersion';\n")
    }
}
tasks.named("preBuild").configure { dependsOn(syncReviewAssets) }
val prepareOfflineSpeechModels by tasks.registering(Exec::class) {
    inputs.file(rootProject.file("prepare_speech_models.py"))
    outputs.dir(layout.buildDirectory.dir("generated/speechAssets"))
    commandLine(System.getenv("AIPROTECT_PYTHON") ?: if (System.getProperty("os.name").startsWith("Windows")) "python" else "python3",
        rootProject.file("prepare_speech_models.py"), layout.buildDirectory.dir("generated/speechAssets").get().asFile)
}
tasks.matching { it.name == "preHackathonDebugBuild" || it.name == "preHackathonReleaseBuild" }.configureEach { dependsOn(prepareOfflineSpeechModels) }
dependencies {
    "hackathonImplementation"("com.alphacephei:vosk-android:0.3.75@aar")
    "hackathonImplementation"("net.java.dev.jna:jna:5.18.1@aar")
    implementation("androidx.webkit:webkit:1.12.1")
    "hackathonImplementation"("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("org.mockito:mockito-core:5.15.2")
}
