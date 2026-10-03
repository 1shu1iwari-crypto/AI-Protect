plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "in.aiprotect.companion"
    compileSdk = 35
    defaultConfig {
        applicationId = "in.aiprotect.companion"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.3.0-poc"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all { it.systemProperty("robolectric.dependency.repo.url", "https://repo.maven.apache.org/maven2") }
    }
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/reviewAssets"))
}
// Copy the working web/core at build time. No duplicate risk-engine implementation.
val syncReviewAssets by tasks.registering(Sync::class) {
    from(rootProject.projectDir.parentFile) {
        include("core/*.mjs", "core/model.json", "web/*.mjs", "web/*.css", "web/*.html", "web/*.svg", "web/*.png", "web/manifest.json", "web/vendor/**", "simulator/*.mjs", "evaluation/results.json")
    }
    into(layout.buildDirectory.dir("generated/reviewAssets"))
}
tasks.named("preBuild").configure { dependsOn(syncReviewAssets) }
dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("org.mockito:mockito-core:5.15.2")
}
